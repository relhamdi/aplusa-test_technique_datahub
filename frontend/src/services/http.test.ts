import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, request, toApiError } from "./http";

function mockFetch(response: Response) {
  const fn = vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", fn);
  return fn;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

afterEach(() => vi.unstubAllGlobals());

describe("request", () => {
  it("parses a JSON response and prefixes the base url", async () => {
    const fetchMock = mockFetch(json([{ id: "1" }]));
    await expect(request("/imports")).resolves.toEqual([{ id: "1" }]);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/imports");
  });

  it("serialises json payloads with the right header", async () => {
    const fetchMock = mockFetch(json({ ok: true }));
    await request("/imports", { method: "POST", json: { name: "A" } });
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(init.body).toBe('{"name":"A"}');
    expect(init.headers).toMatchObject({ "content-type": "application/json" });
  });

  it("returns undefined on 204", async () => {
    mockFetch(new Response(null, { status: 204 }));
    await expect(
      request("/imports/1", { method: "DELETE" }),
    ).resolves.toBeUndefined();
  });

  it("uses the string detail of an error response", async () => {
    mockFetch(json({ detail: "Import not found" }, 404));
    await expect(request("/imports/x")).rejects.toMatchObject({
      name: "ApiError",
      status: 404,
      message: "Import not found",
    });
  });

  it("joins validation messages when detail is a list", async () => {
    mockFetch(
      json({ detail: [{ msg: "too short" }, { msg: "required" }] }, 422),
    );
    const error = await request("/imports", { method: "POST", json: {} }).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).message).toBe("too short; required");
  });

  it("falls back to the status text when the body is not JSON", async () => {
    mockFetch(
      new Response("boom", {
        status: 500,
        statusText: "Internal Server Error",
      }),
    );
    await expect(request("/imports")).rejects.toMatchObject({
      status: 500,
      message: "Internal Server Error",
    });
  });

  it("builds an ApiError from a response, reading the FastAPI detail", async () => {
    const error = await toApiError(json({ detail: "nope" }, 409));
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 409, message: "nope" });
  });
});
