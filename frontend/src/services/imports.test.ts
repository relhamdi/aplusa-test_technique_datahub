import { afterEach, expect, it, vi } from "vitest";

import { importsService } from "./imports";

afterEach(() => vi.unstubAllGlobals());

function stub() {
  const fn = vi.fn().mockResolvedValue(new Response("[]", { status: 200 }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

it("reorders with the full ordered list of ids", async () => {
  const fetchMock = stub();
  await importsService.reorder(["b", "a"]);
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  expect(url).toBe("/api/imports/reorder");
  expect(init.method).toBe("PUT");
  expect(init.body).toBe('{"ids":["b","a"]}');
});

it("patches only the fields it is given", async () => {
  const fetchMock = stub();
  await importsService.update("42", { name: "New" });
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  expect(url).toBe("/api/imports/42");
  expect(init.method).toBe("PATCH");
  expect(init.body).toBe('{"name":"New"}');
});
