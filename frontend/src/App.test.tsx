import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";
import { json, stubApi } from "./test/api";
import { renderWithProviders } from "./test/utils";
import type { ImportSummary } from "./types/api";
import userEvent from "@testing-library/user-event";

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

const withColumns: ImportSummary = {
  ...sample,
  row_count: 3,
  columns: [{ key: "c0", name: "id", type: "integer" }],
};
const ROWS = "POST /api/imports/1/rows/query";
// Total of 100 rows: page 2 exists, so the table does not fall back to page 1.
const rowsPage = () =>
  json({ rows: [], total: 100, page: 2, page_size: 20, indexing: [] });

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("App routing", () => {
  it("opens an import on /imports/:id with its two tabs", async () => {
    stubApi({ "GET /api/imports/1": () => json(sample) });
    renderWithProviders(<App />, { route: "/imports/1" });
    expect(
      await screen.findByRole("heading", { name: "Ventes" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Données" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(
      screen.getByRole("tab", { name: "Statistiques" }),
    ).toBeInTheDocument();
  });

  it("shows a clear message for an unknown import", async () => {
    stubApi({
      "GET /api/imports/zz": () => json({ detail: "Import not found" }, 404),
    });
    renderWithProviders(<App />, { route: "/imports/zz" });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Import introuvable.",
    );
  });

  it("redirects unknown paths to the home page", async () => {
    stubApi({ "GET /api/imports": () => json([]) });
    renderWithProviders(<App />, { route: "/nimporte-quoi" });
    expect(
      await screen.findByText("Aucun import pour le moment."),
    ).toBeInTheDocument();
  });

  it("opens the tab named in the URL", async () => {
    stubApi({ "GET /api/imports/1": () => json(withColumns) });
    renderWithProviders(<App />, { route: "/imports/1?tab=stats" });

    expect(
      await screen.findByRole("tab", { name: "Statistiques" }),
    ).toHaveAttribute("aria-selected", "true");
    expect(
      screen.getByText(
        "Choisissez une colonne pour calculer ses statistiques.",
      ),
    ).toBeInTheDocument();
  });

  it("switches tabs and keeps the table state of the Data tab", async () => {
    const user = userEvent.setup();
    stubApi({
      "GET /api/imports/1": () => json(withColumns),
      [ROWS]: rowsPage,
    });
    renderWithProviders(<App />, { route: "/imports/1?page=2" });
    expect(await screen.findByText("Page 2 sur 5")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Statistiques" }));
    expect(screen.getByRole("tab", { name: "Statistiques" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await user.click(screen.getByRole("tab", { name: "Données" }));
    expect(await screen.findByText("Page 2 sur 5")).toBeInTheDocument();
  });
});
