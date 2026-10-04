import { afterEach, describe, expect, it, vi } from "vitest";

import type { RowOut, RowQuery, StreamMeta } from "../types/api";
import { ApiError } from "./http";
import { StreamError, streamRows } from "./rowStream";

const encoder = new TextEncoder();
const text = (value: string) => encoder.encode(value);
const line = (value: unknown) => JSON.stringify(value) + "\n";

const query: RowQuery = {
  filters: [],
  sort: null,
  page: 1,
  page_size: 1_000_000,
};
const META: StreamMeta = {
  total: 2,
  returned: 2,
  page: 1,
  page_size: 1_000_000,
  indexing: [],
};
const row = (id: string, value: unknown = id): RowOut => ({
  id,
  values: { c0: value },
});

function bodyOf(chunks: Uint8Array[]): Response {
  return new Response(
    new ReadableStream({
      start(controller) {
        chunks.forEach((chunk) => controller.enqueue(chunk));
        controller.close();
      },
    }),
  );
}

function stubFetch(response: Response) {
  const fn = vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", fn);
  return fn;
}

function collector() {
  const metas: StreamMeta[] = [];
  const rows: RowOut[] = [];
  const batches: number[] = [];
  return {
    metas,
    rows,
    batches,
    handlers: {
      onMeta: (meta: StreamMeta) => metas.push(meta),
      onRows: (batch: RowOut[]) => {
        batches.push(batch.length);
        rows.push(...batch);
      },
    },
  };
}

const FULL =
  line({ meta: META }) + line(row("a")) + line(row("b")) + line({ done: 2 });

afterEach(() => vi.unstubAllGlobals());

describe("streamRows", () => {
  it("delivers meta and rows, and resolves with the row count", async () => {
    stubFetch(bodyOf([text(FULL)]));
    const got = collector();
    await expect(streamRows("7", query, got.handlers)).resolves.toBe(2);
    expect(got.metas).toEqual([META]);
    expect(got.rows.map((r) => r.id)).toEqual(["a", "b"]);
    expect(got.batches).toEqual([2]); // one call per chunk, not per row
  });

  it("reassembles lines split across chunks", async () => {
    const bytes = text(FULL);
    const chunks: Uint8Array[] = [];
    for (let i = 0; i < bytes.length; i += 7)
      chunks.push(bytes.slice(i, i + 7));
    stubFetch(bodyOf(chunks));
    const got = collector();
    await streamRows("7", query, got.handlers);
    expect(got.rows.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("keeps multi-byte characters intact when a chunk cuts them", async () => {
    const bytes = text(
      line({ meta: { ...META, total: 1, returned: 1 } }) +
        line(row("a", "Genève 😀")) +
        line({ done: 1 }),
    );
    stubFetch(bodyOf(Array.from(bytes, (byte) => Uint8Array.of(byte)))); // one byte per chunk
    const got = collector();
    await streamRows("7", query, got.handlers);
    expect(got.rows[0].values.c0).toBe("Genève 😀");
  });

  it("handles a final line without a trailing newline", async () => {
    stubFetch(bodyOf([text(FULL.trimEnd())]));
    await expect(streamRows("7", query, collector().handlers)).resolves.toBe(2);
  });

  it("reports an error line, after delivering the rows received before it", async () => {
    stubFetch(
      bodyOf([
        text(
          line({ meta: META }) +
            line(row("a")) +
            line({ error: "stream interrupted" }),
        ),
      ]),
    );
    const got = collector();
    await expect(streamRows("7", query, got.handlers)).rejects.toThrow(
      "interrompu par le serveur",
    );
    expect(got.rows.map((r) => r.id)).toEqual(["a"]);
  });

  it("rejects a stream that ends without the done marker", async () => {
    stubFetch(bodyOf([text(line({ meta: META }) + line(row("a")))]));
    await expect(streamRows("7", query, collector().handlers)).rejects.toThrow(
      "incomplète",
    );
  });

  it("rejects when the done marker disagrees with the rows received", async () => {
    stubFetch(
      bodyOf([text(line({ meta: META }) + line(row("a")) + line({ done: 2 }))]),
    );
    await expect(streamRows("7", query, collector().handlers)).rejects.toThrow(
      "1 lignes reçues sur 2",
    );
  });

  it("rejects unreadable lines", async () => {
    stubFetch(bodyOf([text("not json\n")]));
    await expect(
      streamRows("7", query, collector().handlers),
    ).rejects.toBeInstanceOf(StreamError);
  });

  it("turns an HTTP error into an ApiError carrying the API message", async () => {
    stubFetch(
      new Response(JSON.stringify({ detail: "Unknown column 'zz'" }), {
        status: 422,
        headers: { "content-type": "application/json" },
      }),
    );
    await expect(
      streamRows("7", query, collector().handlers),
    ).rejects.toMatchObject({
      name: "ApiError",
      status: 422,
      message: "Unknown column 'zz'",
    });
    expect(ApiError).toBeDefined();
  });

  it("posts the query as JSON and forwards the abort signal", async () => {
    const fetchMock = stubFetch(bodyOf([text(FULL)]));
    const controller = new AbortController();
    await streamRows("7", query, collector().handlers, controller.signal);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/imports/7/rows/stream");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual(query);
    expect(init.signal).toBe(controller.signal);
  });

  it("stops reading and throws an AbortError when aborted midway", async () => {
    const controller = new AbortController();
    // Only the abort can end the read loop.
    stubFetch(
      new Response(
        new ReadableStream({
          start(c) {
            c.enqueue(text(line({ meta: META }) + line(row("a"))));
          },
        }),
      ),
    );
    const promise = streamRows(
      "7",
      query,
      { onMeta: vi.fn(), onRows: () => controller.abort() },
      controller.signal,
    );
    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
  });
});
