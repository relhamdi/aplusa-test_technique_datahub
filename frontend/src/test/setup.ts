// Adds DOM matchers such as toBeInTheDocument() to Vitest's expect.
import "@testing-library/jest-dom/vitest";

// jsdom has no layout: every element measures 0px, so a virtualized list would render no row at all.
// Give elements a viewport-like size (600px tall).
Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
  configurable: true,
  value: 600,
});
Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
  configurable: true,
  value: 1000,
});

// jsdom has no ResizeObserver either; the virtualizer only needs it to exist.
if (!("ResizeObserver" in globalThis)) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}
