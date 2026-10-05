import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { json, stubApi } from "../test/api";
import { renderWithProviders } from "../test/utils";
import type { ImportSummary, StatsOut, StatsRequest } from "../types/api";
import { StatsTab } from "./StatsTab";

const item: ImportSummary = {
  id: "1",
  name: "Ventes",
  description: "",
  order: 0,
  row_count: 5,
  last_import: null,
  created_at: "",
  updated_at: "",
  columns: [
    { key: "c0", name: "n", type: "integer" },
    { key: "c1", name: "label", type: "string" },
    { key: "c2", name: "flag", type: "boolean" },
  ],
};

const STATS = "POST /api/imports/1/stats";

const stringStats: StatsOut = {
  column: "c1",
  type: "string",
  count: 5,
  empty_count: 1,
  boolean: null,
  numeric: null,
  table: {
    rows: [
      { value: "a", count: 3 },
      { value: "b", count: 1 },
    ],
    total: 45,
    page: 1,
    page_size: 20,
  },
  indexing: [],
};
const numericStats: StatsOut = {
  column: "c0",
  type: "integer",
  count: 4,
  empty_count: 1,
  boolean: null,
  numeric: { min: 1.5, max: 4, avg: 2.625 },
  table: { rows: [{ value: 2, count: 2 }], total: 3, page: 1, page_size: 20 },
  indexing: [],
};
const booleanStats: StatsOut = {
  column: "c2",
  type: "boolean",
  count: 4,
  empty_count: 1,
  boolean: {
    true_count: 2,
    false_count: 2,
    true_percent: 50,
    false_percent: 50,
  },
  numeric: null,
  table: null,
  indexing: [],
};

type Respond = StatsOut | ((body: StatsRequest) => Response | StatsOut);

/** Stubs the stats endpoint and records every request body it receives. */
function stubStats(respond: Respond = stringStats) {
  const bodies: StatsRequest[] = [];
  const api = stubApi({
    [STATS]: (init) => {
      const body = JSON.parse(init.body as string) as StatsRequest;
      bodies.push(body);
      const out = typeof respond === "function" ? respond(body) : respond;
      return out instanceof Response ? out : json(out);
    },
  });
  return { ...api, bodies, last: () => bodies[bodies.length - 1] };
}

const urlFilters = (filters: object[]) =>
  encodeURIComponent(JSON.stringify(filters));
const dataFilter = { column: "c0", op: "gt", value: "2" };
const signature = item.columns
  .map((c) => `${c.key}:${c.name}:${c.type}`)
  .join("|");

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("StatsTab", () => {
  it("asks for a column and calls nothing until one is chosen", () => {
    const { calls } = stubStats();
    renderWithProviders(<StatsTab item={item} />);
    expect(
      screen.getByText(
        "Choisissez une colonne pour calculer ses statistiques.",
      ),
    ).toBeInTheDocument();
    expect(calls).toEqual([]);
  });

  it("says so when the import has no data yet", () => {
    renderWithProviders(<StatsTab item={{ ...item, columns: [] }} />);
    expect(screen.getByText(/Importez d'abord un fichier/)).toBeInTheDocument();
  });

  it("computes the statistics as soon as a column is chosen, with the default sort", async () => {
    const user = userEvent.setup();
    const { last } = stubStats();
    renderWithProviders(<StatsTab item={item} />);

    await user.selectOptions(screen.getByLabelText("Colonne"), "c1");
    expect(await screen.findByText("a")).toBeInTheDocument();
    expect(last()).toEqual({
      column: "c1",
      apply_data_filters: false,
      data_filters: [],
      value_filters: [],
      apply_value_filters: false,
      sort: { target: "count", direction: "desc" },
      page: 1,
      page_size: 20,
    });
    expect(
      screen.getByText("Valeurs (hors vides)").parentElement,
    ).toHaveTextContent("5");
    expect(screen.getByText("Valeurs vides").parentElement).toHaveTextContent(
      "1",
    );
  });

  it("shows the boolean split and no value table", async () => {
    stubStats(booleanStats);
    renderWithProviders(<StatsTab item={item} />, { route: "/?st_col=c2" });

    expect(await screen.findByText("Vrai")).toBeInTheDocument();
    expect(screen.getByText("Vrai").parentElement).toHaveTextContent(
      "2 (50,00 %)",
    );
    expect(screen.getByText("Faux").parentElement).toHaveTextContent(
      "2 (50,00 %)",
    );
    expect(
      screen.getByRole("img", { name: "Vrai 50,00 %, faux 50,00 %" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("checkbox", { name: /Appliquer aussi/ }),
    ).not.toBeInTheDocument();
  });

  it("shows min, max and average for a numeric column, with its table", async () => {
    stubStats(numericStats);
    renderWithProviders(<StatsTab item={item} />, { route: "/?st_col=c0" });

    expect(await screen.findByText("Minimum")).toBeInTheDocument();
    expect(screen.getByText("Minimum").parentElement).toHaveTextContent("1,5");
    expect(screen.getByText("Maximum").parentElement).toHaveTextContent("4");
    expect(screen.getByText("Moyenne").parentElement).toHaveTextContent(
      "2,625",
    );
    expect(
      screen.getByRole("table", { name: "Valeurs et occurrences" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("checkbox", { name: /Appliquer aussi/ }),
    ).not.toBeInTheDocument();
  });

  it("shows a dash for min, max and average of a column without any value", async () => {
    stubStats({
      ...numericStats,
      count: 0,
      numeric: { min: null, max: null, avg: null },
    });
    renderWithProviders(<StatsTab item={item} />, { route: "/?st_col=c0" });
    expect(
      (await screen.findByText("Moyenne")).parentElement,
    ).toHaveTextContent("—");
  });

  describe("checkbox 1: filters of the Data tab", () => {
    it("does not send them until it is ticked, then sends them", async () => {
      const user = userEvent.setup();
      const { last } = stubStats();
      renderWithProviders(<StatsTab item={item} />, {
        route: `/?st_col=c1&filters=${urlFilters([dataFilter])}`,
      });
      await screen.findByText("a");
      expect(screen.getByText("1 filtre(s) actif(s)")).toBeInTheDocument();
      expect(last()).toMatchObject({
        apply_data_filters: false,
        data_filters: [],
      });

      await user.click(
        screen.getByRole("checkbox", {
          name: "Appliquer les filtres de l'onglet Données",
        }),
      );
      await waitFor(() =>
        expect(last()).toMatchObject({
          apply_data_filters: true,
          data_filters: [dataFilter],
        }),
      );
    });

    it("reads the filters saved for this import when the URL carries none", async () => {
      localStorage.setItem(
        "datahub:table:1",
        JSON.stringify({
          signature,
          state: { page: 1, pageSize: 20, sort: null, filters: [dataFilter] },
        }),
      );
      const { last } = stubStats();
      renderWithProviders(<StatsTab item={item} />, {
        route: "/?st_col=c1&st_data=1",
      });

      await screen.findByText("a");
      expect(last().data_filters).toEqual([dataFilter]);
    });

    it("says when there is no filter to apply", async () => {
      stubStats();
      renderWithProviders(<StatsTab item={item} />, { route: "/?st_col=c1" });
      await screen.findByText("a");
      expect(screen.getByText("aucun filtre actif")).toBeInTheDocument();
    });
  });

  describe("checkbox 2: filters of the value/occurrence table", () => {
    it("is offered for a string column and sent when ticked, back on page 1", async () => {
      const user = userEvent.setup();
      const { last } = stubStats();
      renderWithProviders(<StatsTab item={item} />, {
        route: "/?st_col=c1&st_page=2",
      });
      await screen.findByText("a");

      await user.click(
        screen.getByRole("checkbox", {
          name: /Appliquer aussi les filtres du tableau/,
        }),
      );
      await waitFor(() =>
        expect(last()).toMatchObject({ apply_value_filters: true, page: 1 }),
      );
    });

    it("explains that the total only covers the filtered values", async () => {
      const filters = urlFilters([{ target: "count", op: "gt", value: "1" }]);
      stubStats();
      renderWithProviders(<StatsTab item={item} />, {
        route: `/?st_col=c1&st_values=1&st_vf=${filters}`,
      });
      expect(
        await screen.findByText(
          /ne compte que les valeurs correspondant aux filtres/,
        ),
      ).toBeInTheDocument();
    });
  });

  describe("value/occurrence table", () => {
    it("sorts by occurrences then by value, one request each", async () => {
      const user = userEvent.setup();
      const { last } = stubStats();
      renderWithProviders(<StatsTab item={item} />, { route: "/?st_col=c1" });
      await screen.findByText("a");
      expect(
        screen.getByRole("columnheader", { name: /Occurrences/ }),
      ).toHaveAttribute("aria-sort", "descending");

      await user.click(screen.getByRole("button", { name: "Occurrences" }));
      await waitFor(() =>
        expect(last().sort).toEqual({ target: "count", direction: "asc" }),
      );

      await user.click(screen.getByRole("button", { name: "label" }));
      await waitFor(() =>
        expect(last().sort).toEqual({ target: "value", direction: "asc" }),
      );
    });

    it("filters the value column after the debounce, back on page 1", async () => {
      const user = userEvent.setup();
      const { last } = stubStats();
      renderWithProviders(<StatsTab item={item} />, {
        route: "/?st_col=c1&st_page=2",
      });
      await screen.findByText("a");

      await user.type(screen.getByLabelText("Valeur label"), "al");
      await waitFor(() =>
        expect(last()).toMatchObject({
          page: 1,
          value_filters: [{ target: "value", op: "contains", value: "al" }],
        }),
      );
    });

    it("filters the occurrences column", async () => {
      const user = userEvent.setup();
      const { last } = stubStats();
      renderWithProviders(<StatsTab item={item} />, { route: "/?st_col=c1" });
      await screen.findByText("a");

      await user.selectOptions(
        screen.getByLabelText("Opérateur Occurrences"),
        "gt",
      );
      await user.type(screen.getByLabelText("Valeur Occurrences"), "30");
      await waitFor(() =>
        expect(last().value_filters).toEqual([
          { target: "count", op: "gt", value: "30" },
        ]),
      );
    });

    it('never offers the "is empty" operators: empty cells are not in this table', async () => {
      stubStats();
      renderWithProviders(<StatsTab item={item} />, { route: "/?st_col=c1" });
      await screen.findByText("a");
      for (const name of ["Opérateur label", "Opérateur Occurrences"]) {
        const options = within(screen.getByLabelText(name)).getAllByRole(
          "option",
        );
        expect(options.map((o) => o.textContent)).not.toContain("est vide");
      }
    });

    it("paginates through the server", async () => {
      const user = userEvent.setup();
      const { last } = stubStats();
      renderWithProviders(<StatsTab item={item} />, { route: "/?st_col=c1" });
      await screen.findByText("a");

      expect(screen.getByText("Page 1 sur 3")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Page suivante" }));
      await waitFor(() => expect(last().page).toBe(2));
    });

    it("offers the page sizes of the stats endpoint only", async () => {
      stubStats();
      renderWithProviders(<StatsTab item={item} />, { route: "/?st_col=c1" });
      await screen.findByText("a");
      const sizes = within(
        screen.getByLabelText("Lignes par page"),
      ).getAllByRole("option");
      expect(sizes.map((o) => o.getAttribute("value"))).toEqual([
        "10",
        "20",
        "50",
        "100",
      ]);
    });

    it("says no value matches, and the reset button clears the filters", async () => {
      const user = userEvent.setup();
      const filters = urlFilters([{ target: "count", op: "gt", value: "999" }]);
      const { last } = stubStats((body) => ({
        ...stringStats,
        table: {
          rows: [],
          total: body.value_filters.length > 0 ? 0 : 2,
          page: 1,
          page_size: 20,
        },
      }));
      renderWithProviders(<StatsTab item={item} />, {
        route: `/?st_col=c1&st_vf=${filters}`,
      });

      expect(
        await screen.findByText("Aucune valeur ne correspond aux filtres."),
      ).toBeInTheDocument();
      await user.click(
        screen.getByRole("button", { name: "Réinitialiser les filtres" }),
      );
      await waitFor(() => expect(last().value_filters).toEqual([]));
    });

    it("falls back to the last page when the requested one no longer exists", async () => {
      const { last } = stubStats((body) => ({
        ...stringStats,
        table: {
          rows: [],
          total: 3,
          page: body.page,
          page_size: 20,
        },
      }));
      renderWithProviders(<StatsTab item={item} />, {
        route: "/?st_col=c1&st_page=9",
      });
      await waitFor(() => expect(last().page).toBe(1));
    });
  });

  it("starts from a clean table when the column changes", async () => {
    const user = userEvent.setup();
    const filters = urlFilters([{ target: "count", op: "gt", value: "1" }]);
    const { last } = stubStats((body) =>
      body.column === "c0" ? numericStats : stringStats,
    );
    renderWithProviders(<StatsTab item={item} />, {
      route: `/?st_col=c1&st_page=2&st_values=1&st_sort=value:asc&st_vf=${filters}`,
    });
    await screen.findByText("a");

    await user.selectOptions(screen.getByLabelText("Colonne"), "c0");
    await waitFor(() =>
      expect(last()).toEqual({
        column: "c0",
        apply_data_filters: false,
        data_filters: [],
        value_filters: [],
        apply_value_filters: false,
        sort: { target: "count", direction: "desc" },
        page: 1,
        page_size: 20,
      }),
    );
  });

  it("does not show the figures of the previous column while the new one loads", async () => {
    const user = userEvent.setup();
    stubApi({ [STATS]: () => json(stringStats) });
    renderWithProviders(<StatsTab item={item} />, { route: "/?st_col=c1" });
    await screen.findByText("a");

    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => undefined)),
    );
    await user.selectOptions(screen.getByLabelText("Colonne"), "c0");

    expect(await screen.findByText("Calcul en cours…")).toBeInTheDocument();
    expect(screen.queryByText("a")).not.toBeInTheDocument();
  });

  it("shows the API error", async () => {
    stubStats(() => json({ detail: "Unknown column" }, 422));
    renderWithProviders(<StatsTab item={item} />, { route: "/?st_col=c1" });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unknown column",
    );
  });

  it("signals an index being built", async () => {
    stubStats({ ...stringStats, indexing: ["c1"] });
    renderWithProviders(<StatsTab item={item} />, { route: "/?st_col=c1" });
    expect(
      await screen.findByText(/Index en cours de création/),
    ).toBeInTheDocument();
  });
});
