import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";
import { json, stubApi } from "./test/api";
import { renderWithProviders } from "./test/utils";
import type { ImportSummary } from "./types/api";

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

afterEach(() => vi.unstubAllGlobals());

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
});
