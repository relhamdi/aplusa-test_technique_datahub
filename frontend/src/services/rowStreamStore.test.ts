import { afterEach, describe, expect, it, vi } from "vitest";

import type { RowOut, RowQuery, StreamMeta } from "../types/api";
import type { streamRows } from "./rowStream";
import { RowStreamStore } from "./rowStreamStore";

type Handlers = Parameters<typeof streamRows>[2];

interface FakeRun {
  handlers: Handlers;
  signal: AbortSignal;
  finish: () => void;
  fail: (error: unknown) => void;
}

function fakeStream() {
  const runs: FakeRun[] = [];
  const stream = vi.fn(
    (_id: string, _query: RowQuery, handlers: Handlers, signal?: AbortSignal) =>
      new Promise<number>((resolve, reject) => {
        runs.push({
          handlers,
          signal: signal!,
          finish: () => resolve(0),
          fail: reject,
        });
      }),
  );
  return { stream: stream as unknown as typeof streamRows, runs };
}

const QUERY: RowQuery = {
  filters: [],
  sort: null,
  page: 1,
  page_size: 1_000_000,
};
const META: StreamMeta = {
  total: 3,
  returned: 3,
  page: 1,
  page_size: 1_000_000,
  indexing: [],
};
const row = (id: string): RowOut => ({ id, values: {} });
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => vi.restoreAllMocks());

describe("RowStreamStore", () => {
  it("goes from loading to done, exposing rows as they arrive", async () => {
    const { stream, runs } = fakeStream();
    const store = new RowStreamStore(stream);
    store.start("7", QUERY);
    expect(store.getSnapshot().status).toBe("loading");

    runs[0].handlers.onMeta(META);
    runs[0].handlers.onRows([row("a"), row("b")]);
    expect(store.getSnapshot()).toMatchObject({ meta: META, loaded: 2 });
    expect(store.getRow(1)?.id).toBe("b");
    expect(store.getRow(2)).toBeUndefined(); // not received yet

    runs[0].finish();
    await settle();
    expect(store.getSnapshot().status).toBe("done");
  });

  it("publishes progress in bursts but never loses a row", async () => {
    vi.spyOn(Date, "now").mockReturnValueOnce(1_000).mockReturnValueOnce(1_010);
    const { stream, runs } = fakeStream();
    const store = new RowStreamStore(stream);
    store.start("7", QUERY);

    runs[0].handlers.onRows([row("a")]);
    runs[0].handlers.onRows([row("b")]); // 10 ms later: below the publish interval
    expect(store.getSnapshot().loaded).toBe(1);
    expect(store.getRow(1)?.id).toBe("b"); // stored all the same

    runs[0].finish();
    await settle();
    expect(store.getSnapshot()).toMatchObject({ status: "done", loaded: 2 }); // exact at the end
  });

  it("reports a failure and keeps the rows received before it", async () => {
    const { stream, runs } = fakeStream();
    const store = new RowStreamStore(stream);
    store.start("7", QUERY);
    runs[0].handlers.onRows([row("a")]);
    runs[0].fail(new Error("Le flux a été interrompu par le serveur."));
    await settle();
    expect(store.getSnapshot()).toMatchObject({
      status: "error",
      loaded: 1,
      error: "Le flux a été interrompu par le serveur.",
    });
    expect(store.getRow(0)?.id).toBe("a");
  });

  it("stop keeps the rows received and ignores the abort that follows", async () => {
    const { stream, runs } = fakeStream();
    const store = new RowStreamStore(stream);
    store.start("7", QUERY);
    runs[0].handlers.onRows([row("a")]);

    store.stop();
    expect(runs[0].signal.aborted).toBe(true);
    expect(store.getSnapshot()).toMatchObject({ status: "stopped", loaded: 1 });

    runs[0].fail(new DOMException("aborted", "AbortError"));
    await settle();
    expect(store.getSnapshot().status).toBe("stopped"); // not turned into an error
  });

  it("stop does nothing once the stream is finished", async () => {
    const { stream, runs } = fakeStream();
    const store = new RowStreamStore(stream);
    store.start("7", QUERY);
    runs[0].finish();
    await settle();
    store.stop();
    expect(store.getSnapshot().status).toBe("done");
  });

  it("a new request aborts the previous one and ignores its late rows", async () => {
    const { stream, runs } = fakeStream();
    const store = new RowStreamStore(stream);
    store.start("7", QUERY);
    runs[0].handlers.onRows([row("old")]);

    store.start("7", { ...QUERY, page: 2 });
    expect(runs[0].signal.aborted).toBe(true);
    expect(store.getRow(0)).toBeUndefined(); // old rows discarded at once

    runs[0].handlers.onRows([row("late")]); // arrives after the switch
    runs[0].handlers.onMeta({ ...META, total: 99 });
    runs[0].fail(new Error("boom"));
    runs[1].handlers.onRows([row("new")]);
    await settle();

    expect(store.getRow(0)?.id).toBe("new");
    expect(store.getSnapshot()).toMatchObject({
      status: "loading",
      meta: null,
      error: null,
    });
  });

  it("dispose aborts, frees the rows and goes back to idle", () => {
    const { stream, runs } = fakeStream();
    const store = new RowStreamStore(stream);
    store.start("7", QUERY);
    runs[0].handlers.onRows([row("a")]);

    store.dispose();
    expect(runs[0].signal.aborted).toBe(true);
    expect(store.getRow(0)).toBeUndefined();
    expect(store.getSnapshot().status).toBe("idle");
  });

  it("notifies subscribers until they unsubscribe", () => {
    const { stream, runs } = fakeStream();
    const store = new RowStreamStore(stream);
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    store.start("7", QUERY);
    expect(listener).toHaveBeenCalled();

    unsubscribe();
    listener.mockClear();
    runs[0].handlers.onMeta(META);
    expect(listener).not.toHaveBeenCalled();
  });
});
