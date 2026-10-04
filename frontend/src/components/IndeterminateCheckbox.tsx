import { useEffect, useRef } from "react";

import type { PageState } from "../utils/selection";

interface IndeterminateCheckboxProps {
  state: PageState;
  label: string;
  disabled?: boolean;
  title?: string;
  onChange: () => void;
}

export function IndeterminateCheckbox({
  state,
  label,
  disabled,
  title,
  onChange,
}: IndeterminateCheckboxProps) {
  const ref = useRef<HTMLInputElement>(null);
  // "indeterminate" is a DOM property, not an HTML attribute: it cannot be set in JSX.
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === "some";
  }, [state]);

  return (
    <input
      ref={ref}
      type="checkbox"
      aria-label={label}
      checked={state === "all"}
      disabled={disabled}
      title={title}
      onChange={onChange}
    />
  );
}
