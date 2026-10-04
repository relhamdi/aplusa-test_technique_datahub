import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../test/utils";
import type { ImportSummary } from "../types/api";
import { HomePage } from "./HomePage";

const sample: ImportSummary = {
  id: "1",
  name: "Ventes",
  description: "",
  order: 0,
  columns: [],
  row_count: 12,
  last_import: null,
  created_at: "",
  updated_at: "",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

// The network boundary is mocked, not the service:
// each test goes through the real service and HTTP layer.
function stubFetch(response: Response) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
}

afterEach(() => vi.unstubAllGlobals());

describe("HomePage", () => {
  it("shows the empty state when there is no import", async () => {
    stubFetch(json([]));
    renderWithProviders(<HomePage />);
    expect(
      await screen.findByText("Aucun import pour le moment."),
    ).toBeInTheDocument();
  });

  it("lists the imports returned by the API", async () => {
    stubFetch(json([sample]));
    renderWithProviders(<HomePage />);
    expect(await screen.findByText(/Ventes/)).toBeInTheDocument();
  });

  it("shows the error message sent by the API", async () => {
    stubFetch(json({ detail: "Database unavailable" }, 500));
    renderWithProviders(<HomePage />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Database unavailable",
    );
  });
});
