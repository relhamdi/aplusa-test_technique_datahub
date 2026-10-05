import { useEffect, useState, useSyncExternalStore } from "react";

import { RowStreamStore } from "../services/rowStreamStore";
import type { RowQuery } from "../types/api";

export function useRowStream(
  importId: string,
  query: RowQuery,
  enabled: boolean,
  reloadKey: string,
) {
  const [store] = useState(() => new RowStreamStore());
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const queryJson = JSON.stringify(query);

  useEffect(() => {
    if (!enabled) return;
    store.start(importId, JSON.parse(queryJson) as RowQuery);
    // Cleanup also runs when leaving streaming mode.
    return () => store.dispose();
  }, [store, importId, queryJson, enabled, reloadKey]);

  return { snapshot, getRow: store.getRow, stop: store.stop };
}
