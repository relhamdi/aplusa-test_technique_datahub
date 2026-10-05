import { useCallback, useState } from "react";

import { EMPTY_SELECTION, type Selection } from "../utils/selection";

/**
 * Selection tied to a reset key (import, filters, replace counter):
 * when the key changes the selection is dropped,
 * so it can never apply to a different result set.
 */
export function useSelection(resetKey: string) {
  const [held, setHeld] = useState({
    key: resetKey,
    selection: EMPTY_SELECTION,
  });

  // Adjusting state while rendering: the stale selection is never rendered, 
  // and going back to a previous key does not bring the old selection back.
  if (held.key !== resetKey)
    setHeld({ key: resetKey, selection: EMPTY_SELECTION });
  const selection = held.key === resetKey ? held.selection : EMPTY_SELECTION;

  const setSelection = useCallback(
    (next: Selection) => setHeld({ key: resetKey, selection: next }),
    [resetKey],
  );
  return { selection, setSelection };
}
