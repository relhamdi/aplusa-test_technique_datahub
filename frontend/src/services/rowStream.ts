import type { RowOut, RowQuery, StreamMeta } from "../types/api";
import { BASE_URL, toApiError } from "./http";

export class StreamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StreamError";
  }
}

export interface StreamHandlers {
  onMeta: (meta: StreamMeta) => void;
  onRows: (rows: RowOut[]) => void; // one call per network chunk, never per row
}

type Line =
  | { meta: StreamMeta }
  | { error: string }
  | { done: number }
  | RowOut;

function parse(raw: string): Line {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new StreamError("Ligne illisible dans le flux.");
  }
  if (typeof parsed !== "object" || parsed === null)
    throw new StreamError("Ligne inattendue dans le flux.");
  return parsed as Line;
}

/**
 * Reads the NDJSON stream line by line: meta, rows, then a "done" marker.
 *
 * The HTTP status is sent before the first row, so a failure midway can only be seen in the body.
 * A stream is complete only if it ends with {"done": n} and n matches the rows received:
 * anything else is reported as an error.
 * Resolves with the number of rows received.
 */
export async function streamRows(
  importId: string,
  query: RowQuery,
  handlers: StreamHandlers,
  signal?: AbortSignal,
): Promise<number> {
  const response = await fetch(`${BASE_URL}/imports/${importId}/rows/stream`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(query),
    signal,
  });
  if (!response.ok) throw await toApiError(response); // validation errors are real HTTP errors
  if (!response.body)
    throw new StreamError("Le navigateur ne permet pas la lecture en flux.");

  const reader = response.body.getReader();
  // Aborting must stop the read loop even if the body does not react by itself.
  const onAbort = () => void reader.cancel().catch(() => undefined);
  signal?.addEventListener("abort", onAbort);

  const progress = { received: 0, done: null as number | null };

  const consume = (lines: string[]): void => {
    const batch: RowOut[] = [];
    const flush = () => {
      if (batch.length > 0) {
        progress.received += batch.length;
        handlers.onRows(batch.splice(0));
      }
    };
    for (const raw of lines) {
      if (!raw) continue;
      const line = parse(raw);
      if ("meta" in line) handlers.onMeta(line.meta);
      else if ("error" in line) {
        flush(); // keep the rows received before the failure
        throw new StreamError("Le flux a été interrompu par le serveur.");
      } else if ("done" in line) progress.done = line.done;
      else batch.push(line);
    }
    flush();
  };

  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      // stream: true keeps a multi-byte character split between two chunks intact.
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? ""; // the last piece is an unfinished line (or '')
      consume(lines);
    }
    buffer += decoder.decode();
    if (buffer) consume([buffer]);
  } finally {
    signal?.removeEventListener("abort", onAbort);
  }

  if (signal?.aborted)
    throw new DOMException("The operation was aborted.", "AbortError");
  if (progress.done === null) {
    throw new StreamError(
      "Réponse incomplète : le flux s'est terminé prématurément.",
    );
  }
  if (progress.done !== progress.received) {
    throw new StreamError(
      `Réponse incomplète : ${progress.received} lignes reçues sur ${progress.done}.`,
    );
  }
  return progress.received;
}
