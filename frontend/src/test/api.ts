import { vi } from "vitest";

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

type Handler = (init: RequestInit) => Response;

/**
 * Routes are keyed "METHOD /api/path".
 * An unexpected request fails loudly,
 * so a test can never silently depend on a call it did not declare.
 * Handlers build a fresh Response per call: a body can only be read once.
 */
export function stubApi(routes: Record<string, Handler>) {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const key = `${init.method ?? "GET"} ${url}`;
      calls.push(key);
      const handler = routes[key];
      if (!handler) throw new Error(`Unexpected request: ${key}`);
      return handler(init);
    }),
  );
  return { calls };
}
