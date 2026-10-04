import type { RowOut, RowQuery, StreamMeta } from "../types/api";
import { streamRows } from "./rowStream";

export type StreamStatus = "idle" | "loading" | "done" | "stopped" | "error";

export interface StreamSnapshot {
  status: StreamStatus;
  meta: StreamMeta | null;
  loaded: number; // rows received so far (published at most every PUBLISH_INTERVAL_MS)
  error: string | null;
}

const IDLE: StreamSnapshot = {
  status: "idle",
  meta: null,
  loaded: 0,
  error: null,
};

export const PUBLISH_INTERVAL_MS = 150;

export class RowStreamStore {
  private rows: RowOut[] = [];
  private snapshot: StreamSnapshot = IDLE;
  private readonly listeners = new Set<() => void>();
  private controller: AbortController | null = null;
  private run = 0;
  private lastPublish = 0;

  // The stream function is injected so tests can drive it step by step.
  constructor(private readonly stream: typeof streamRows = streamRows) {}

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): StreamSnapshot => this.snapshot;

  getRow = (index: number): RowOut | undefined => this.rows[index];

  private publish(next: StreamSnapshot): void {
    this.snapshot = next;
    this.listeners.forEach((listener) => listener());
  }

  start(importId: string, query: RowQuery): void {
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    // Each run has a number: late callbacks of an aborted run must not touch the store.
    const run = ++this.run;
    const isCurrent = () => run === this.run;

    this.rows = [];
    this.lastPublish = 0;
    this.publish({ ...IDLE, status: "loading" });

    this.stream(
      importId,
      query,
      {
        onMeta: (meta) => {
          if (isCurrent()) this.publish({ ...this.snapshot, meta });
        },
        onRows: (batch) => {
          if (!isCurrent()) return;
          for (const row of batch) this.rows.push(row);
          const now = Date.now();
          if (now - this.lastPublish >= PUBLISH_INTERVAL_MS) {
            this.lastPublish = now;
            this.publish({ ...this.snapshot, loaded: this.rows.length });
          }
        },
      },
      controller.signal,
    ).then(
      () => {
        if (isCurrent())
          this.publish({
            ...this.snapshot,
            status: "done",
            loaded: this.rows.length,
          });
      },
      (error: unknown) => {
        // An abort is deliberate (stop() or a new request): nothing to report.
        if (!isCurrent() || controller.signal.aborted) return;
        this.publish({
          ...this.snapshot,
          status: "error",
          loaded: this.rows.length,
          error: error instanceof Error ? error.message : "Erreur inconnue",
        });
      },
    );
  }

  /** The user pressed "Stop": keep the rows received so far. */
  stop = (): void => {
    if (this.snapshot.status !== "loading") return;
    this.controller?.abort();
    this.publish({
      ...this.snapshot,
      status: "stopped",
      loaded: this.rows.length,
    });
  };

  /** The request changed or the component unmounted: abort and free the memory. */
  dispose(): void {
    this.run++; // invalidates every pending callback
    this.controller?.abort();
    this.controller = null;
    this.rows = [];
    this.publish(IDLE);
  }
}
