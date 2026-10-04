import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { json, stubApi } from "../test/api";
import { renderWithProviders } from "../test/utils";
import type { ImportSummary, RowOut } from "../types/api";
import { DataTab } from "./DataTab";

const empty: ImportSummary = {
  id: "1",
  name: "Ventes",
  description: "",
  order: 0,
  columns: [],
  row_count: 0,
  last_import: null,
  created_at: "",
  updated_at: "",
};
const populated: ImportSummary = {
  ...empty,
  columns: [
    { key: "c0", name: "id", type: "integer" },
    { key: "c1", name: "label", type: "string" },
    { key: "c2", name: "flag", type: "boolean" },
  ],
  row_count: 45,
};

const ROWS = "POST /api/imports/1/rows/query";
const DETECT = "POST /api/imports/detect-types";
const INGEST = "POST /api/imports/1/data";

const sampleRows: RowOut[] = [
  { id: "r1", values: { c0: 1, c1: "alpha", c2: true } },
  { id: "r2", values: { c0: 2, c1: null, c2: false } },
];

const csv = () =>
  new File(["id,label\n1,a\n"], "data.csv", { type: "text/csv" });
const report = (extra = {}) => ({
  mode: "replace",
  filename: "data.csv",
  rows_inserted: 2,
  row_count: 2,
  rejected: [],
  ...extra,
});

type Body = {
  filters: unknown[];
  sort: unknown;
  page: number;
  page_size: number;
};

// Stubs the rows endpoint and records every request body it receives.
function stubRows(extra: Parameters<typeof stubApi>[0] = {}, total = 45) {
  const bodies: Body[] = [];
  const api = stubApi({
    [ROWS]: (init) => {
      const body = JSON.parse(init.body as string) as Body;
      bodies.push(body);
      return json({
        rows: sampleRows,
        total,
        page: body.page,
        page_size: body.page_size,
        indexing: [],
      });
    },
    ...extra,
  });
  return { ...api, bodies, last: () => bodies[bodies.length - 1] };
}

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

async function openDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Importer un fichier" }));
}

describe("DataTab: import dialog", () => {
  it("invites to import when the import has no data, and offers no append mode", async () => {
    const user = userEvent.setup();
    renderWithProviders(<DataTab item={empty} />);
    expect(screen.getByText(/Aucune donnée/)).toBeInTheDocument();
    await openDialog(user);
    expect(
      screen.queryByLabelText("Ajouter à la suite"),
    ).not.toBeInTheDocument();
  });

  it("summarizes an import that already has data", async () => {
    stubRows();
    renderWithProviders(<DataTab item={populated} />);
    expect(screen.getByText(/45 lignes, 3 colonnes/)).toBeInTheDocument();
    await screen.findByText("alpha");
  });

  it("replace: detects types, lets the user correct them, then imports", async () => {
    const user = userEvent.setup();
    let ingestForm!: FormData;
    stubApi({
      [DETECT]: () =>
        json([
          { name: "id", type: "integer" },
          { name: "label", type: "string" },
        ]),
      [INGEST]: (init) => {
        ingestForm = init.body as FormData;
        return json(report());
      },
    });

    renderWithProviders(<DataTab item={empty} />);
    await openDialog(user);
    await user.upload(screen.getByLabelText(/Fichier/), csv());
    await user.click(
      screen.getByRole("button", { name: "Analyser le fichier" }),
    );

    const labelType = await screen.findByLabelText("Type de label");
    expect(labelType).toHaveValue("string");
    await user.selectOptions(screen.getByLabelText("Type de id"), "string");
    await user.click(screen.getByRole("button", { name: "Importer" }));

    expect(
      await screen.findByRole("heading", { name: "Import terminé" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Lignes importées : 2")).toBeInTheDocument();
    expect(
      screen.getByText("Toutes les valeurs ont été converties."),
    ).toBeInTheDocument();

    expect(ingestForm.get("mode")).toBe("replace");
    expect((ingestForm.get("file") as File).name).toBe("data.csv");
    // The corrected types are what gets sent, not the detected ones.
    expect(JSON.parse(ingestForm.get("types") as string)).toEqual([
      { name: "id", type: "string" },
      { name: "label", type: "string" },
    ]);
  });

  it("replace: warns that existing data will be replaced", async () => {
    const user = userEvent.setup();
    stubRows();
    renderWithProviders(<DataTab item={populated} />);
    await openDialog(user);
    expect(screen.getByText(/seront remplacées/)).toBeInTheDocument();
  });

  it("append: imports directly, without detection and without types", async () => {
    const user = userEvent.setup();
    let form!: FormData;
    const { calls } = stubRows({
      [INGEST]: (init) => {
        form = init.body as FormData;
        return json(
          report({ mode: "append", rows_inserted: 1, row_count: 46 }),
        );
      },
    });

    renderWithProviders(<DataTab item={populated} />);
    await openDialog(user);
    await user.click(screen.getByLabelText("Ajouter à la suite"));
    await user.upload(screen.getByLabelText(/Fichier/), csv());
    await user.click(screen.getByRole("button", { name: "Importer" }));

    expect(
      await screen.findByRole("heading", { name: "Import terminé" }),
    ).toBeInTheDocument();
    expect(calls).toContain(INGEST);
    expect(calls).not.toContain(DETECT); // no detection on append
    expect(form.get("mode")).toBe("append");
    expect(form.get("types")).toBeNull(); // types are frozen by the import
  });

  it("append: shows the column mismatch and stays on the file step", async () => {
    const user = userEvent.setup();
    stubRows({
      [INGEST]: () =>
        json(
          {
            detail:
              "Columns do not match the import. Missing: ['label']; unexpected: ['zzz']",
          },
          409,
        ),
    });

    renderWithProviders(<DataTab item={populated} />);
    await openDialog(user);
    await user.click(screen.getByLabelText("Ajouter à la suite"));
    await user.upload(screen.getByLabelText(/Fichier/), csv());
    await user.click(screen.getByRole("button", { name: "Importer" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Columns do not match",
    );
    expect(
      screen.getByRole("heading", { name: "Importer un fichier" }),
    ).toBeInTheDocument();
  });

  it("lists the rejected values of the report", async () => {
    const user = userEvent.setup();
    stubApi({
      [DETECT]: () => json([{ name: "id", type: "integer" }]),
      [INGEST]: () =>
        json(report({ rejected: [{ column: "price", count: 3 }] })),
    });

    renderWithProviders(<DataTab item={empty} />);
    await openDialog(user);
    await user.upload(screen.getByLabelText(/Fichier/), csv());
    await user.click(
      screen.getByRole("button", { name: "Analyser le fichier" }),
    );
    await user.click(await screen.findByRole("button", { name: "Importer" }));

    expect(await screen.findByText("price : 3 valeur(s)")).toBeInTheDocument();
  });

  it("shows a detection error and keeps the file step", async () => {
    const user = userEvent.setup();
    stubApi({ [DETECT]: () => json({ detail: "Cannot parse CSV" }, 400) });

    renderWithProviders(<DataTab item={empty} />);
    await openDialog(user);
    await user.upload(screen.getByLabelText(/Fichier/), csv());
    await user.click(
      screen.getByRole("button", { name: "Analyser le fichier" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Cannot parse CSV",
    );
  });

  it("goes back from the types step to the file step", async () => {
    const user = userEvent.setup();
    stubApi({ [DETECT]: () => json([{ name: "id", type: "integer" }]) });

    renderWithProviders(<DataTab item={empty} />);
    await openDialog(user);
    await user.upload(screen.getByLabelText(/Fichier/), csv());
    await user.click(
      screen.getByRole("button", { name: "Analyser le fichier" }),
    );
    await user.click(await screen.findByRole("button", { name: "Retour" }));

    expect(
      screen.getByRole("heading", { name: "Importer un fichier" }),
    ).toBeInTheDocument();
  });

  it("cannot analyse before a file is chosen", async () => {
    const user = userEvent.setup();
    renderWithProviders(<DataTab item={empty} />);
    await openDialog(user);
    expect(
      screen.getByRole("button", { name: "Analyser le fichier" }),
    ).toBeDisabled();
  });
});

const STREAM = "POST /api/imports/1/rows/stream";
const ndjson = (...lines: object[]) =>
  new Response(lines.map((l) => JSON.stringify(l)).join("\n") + "\n", {
    headers: { "content-type": "application/x-ndjson" },
  });
const META = {
  total: 2,
  returned: 2,
  page: 1,
  page_size: 1_000_000,
  indexing: [],
};

describe("DataTab: table", () => {
  it("builds the columns from the headers and formats the cells", async () => {
    stubRows();
    renderWithProviders(<DataTab item={populated} />);
    expect(await screen.findByText("alpha")).toBeInTheDocument();
    for (const name of ["id", "label", "flag"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
    const body = within(screen.getByRole("rowgroup", { name: "Lignes" }));
    const cells = body.getAllByRole("cell").map((cell) => cell.textContent);
    expect(cells).toContain("Oui");
    expect(cells).toContain("Non");
    expect(cells.filter((text) => text === "(vide)")).toHaveLength(1); // the null cell
  });

  it("sends the default query on first load", async () => {
    const { last } = stubRows();
    renderWithProviders(<DataTab item={populated} />);
    await screen.findByText("alpha");
    expect(last()).toEqual({ filters: [], sort: null, page: 1, page_size: 20 });
  });

  it("cycles the sort asc -> desc -> none, one request each", async () => {
    const user = userEvent.setup();
    const { last } = stubRows();
    renderWithProviders(<DataTab item={populated} />);
    await screen.findByText("alpha");

    const header = screen.getByRole("button", { name: "id" });
    await user.click(header);
    await waitFor(() =>
      expect(last().sort).toEqual({ column: "c0", direction: "asc" }),
    );
    expect(screen.getByRole("columnheader", { name: /id/ })).toHaveAttribute(
      "aria-sort",
      "ascending",
    );

    await user.click(header);
    await waitFor(() =>
      expect(last().sort).toEqual({ column: "c0", direction: "desc" }),
    );

    await user.click(header);
    await waitFor(() => expect(last().sort).toBeNull());
  });

  it("filters after the debounce and goes back to page 1", async () => {
    const user = userEvent.setup();
    const { last } = stubRows();
    renderWithProviders(<DataTab item={populated} />, { route: "/?page=2" });
    await screen.findByText("alpha");
    expect(last().page).toBe(2); // restored from the URL

    await user.type(screen.getByLabelText("Valeur label"), "alp");
    await waitFor(() =>
      expect(last()).toMatchObject({
        page: 1,
        filters: [{ column: "c1", op: "contains", value: "alp" }],
      }),
    );
  });

  it("paginates through the server", async () => {
    const user = userEvent.setup();
    const { last } = stubRows();
    renderWithProviders(<DataTab item={populated} />);
    await screen.findByText("alpha");

    expect(screen.getByText("Page 1 sur 3")).toBeInTheDocument();
    expect(screen.getByText("1–20 sur 45")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Page précédente" }),
    ).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Page suivante" }));
    await waitFor(() => expect(last().page).toBe(2));
    expect(await screen.findByText("Page 2 sur 3")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Dernière page" }));
    await waitFor(() => expect(last().page).toBe(3));
  });

  it("changes the page size and goes back to page 1", async () => {
    const user = userEvent.setup();
    const { last } = stubRows();
    renderWithProviders(<DataTab item={populated} />, { route: "/?page=2" });
    await screen.findByText("alpha");

    await user.selectOptions(screen.getByLabelText("Lignes par page"), "50");
    await waitFor(() =>
      expect(last()).toMatchObject({ page: 1, page_size: 50 }),
    );
  });

  it("restores sort and page from the URL", async () => {
    const { bodies } = stubRows();
    renderWithProviders(<DataTab item={populated} />, {
      route: "/?page=3&sort=c0:desc&size=10",
    });
    await screen.findByText("alpha");
    expect(bodies[0]).toEqual({
      filters: [],
      sort: { column: "c0", direction: "desc" },
      page: 3,
      page_size: 10,
    });
  });

  it("restores the state saved for this import when the URL is empty", async () => {
    const { bodies } = stubRows();
    // Same signature as the columns of `populated`.
    const signature = populated.columns
      .map((c) => `${c.key}:${c.name}:${c.type}`)
      .join("|");
    localStorage.setItem(
      "datahub:table:1",
      JSON.stringify({
        signature,
        state: { page: 2, pageSize: 50, sort: null, filters: [] },
      }),
    );
    renderWithProviders(<DataTab item={populated} />);
    await screen.findByText("alpha");
    expect(bodies[0]).toMatchObject({ page: 2, page_size: 50 });
  });

  it("shows a dedicated message and a way out when no row matches the filters", async () => {
    const user = userEvent.setup();
    const { last } = stubRows({}, 0);
    // The filter must really be in the URL: a sort alone is not a "filtered" view.
    const filters = encodeURIComponent(
      JSON.stringify([{ column: "c0", op: "gt", value: "100" }]),
    );
    renderWithProviders(<DataTab item={populated} />, {
      route: `/?sort=c0:asc&filters=${filters}`,
    });

    expect(
      await screen.findByText("Aucune ligne ne correspond aux filtres."),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Réinitialiser filtres et tri" }),
    );
    await waitFor(() =>
      expect(last()).toMatchObject({ filters: [], sort: null }),
    );
  });

  it("says the import is empty when there is no filter", async () => {
    stubRows({}, 0);
    renderWithProviders(<DataTab item={populated} />);
    expect(
      await screen.findByText("Cet import ne contient aucune ligne."),
    ).toBeInTheDocument();
  });

  it("shows the API error without crashing", async () => {
    stubApi({ [ROWS]: () => json({ detail: "Unknown column" }, 422) });
    renderWithProviders(<DataTab item={populated} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unknown column",
    );
  });

  it("replace resets the table state, append keeps it", async () => {
    const user = userEvent.setup();
    const route = "/?page=3&sort=c0:desc";

    // Append: the schema is unchanged, the user's view stays.
    const append = stubRows({
      [INGEST]: () => json(report({ mode: "append", row_count: 46 })),
    });
    const first = renderWithProviders(<DataTab item={populated} />, { route });
    await screen.findByText("alpha");
    await openDialog(user);
    await user.click(screen.getByLabelText("Ajouter à la suite"));
    await user.upload(screen.getByLabelText(/Fichier/), csv());
    await user.click(screen.getByRole("button", { name: "Importer" }));
    await screen.findByRole("heading", { name: "Import terminé" });
    expect(append.last()).toMatchObject({
      page: 3,
      sort: { column: "c0", direction: "desc" },
    });
    first.unmount();
    vi.unstubAllGlobals();

    // Replace: every column may have changed, back to the default view.
    const replace = stubRows({
      [DETECT]: () =>
        json([
          { name: "id", type: "integer" },
          { name: "label", type: "string" },
          { name: "flag", type: "boolean" },
        ]),
      [INGEST]: () => json(report({ mode: "replace" })),
    });
    renderWithProviders(<DataTab item={populated} />, { route });
    await screen.findByText("alpha");
    await openDialog(user);
    await user.upload(screen.getByLabelText(/Fichier/), csv());
    await user.click(
      screen.getByRole("button", { name: "Analyser le fichier" }),
    );
    await user.click(await screen.findByRole("button", { name: "Importer" }));
    await screen.findByRole("heading", { name: "Import terminé" });
    await waitFor(() =>
      expect(replace.last()).toMatchObject({ page: 1, sort: null }),
    );
  });

  it("renders only the visible rows of a large page", async () => {
    const rows = Array.from({ length: 500 }, (_, i) => ({
      id: `r${i}`,
      values: { c0: i, c1: `row-${i}`, c2: true },
    }));
    stubApi({
      [ROWS]: () =>
        json({ rows, total: 500, page: 1, page_size: 1000, indexing: [] }),
    });
    renderWithProviders(<DataTab item={populated} />, { route: "/?size=1000" });

    expect(await screen.findByText("row-0")).toBeInTheDocument();
    expect(screen.queryByText("row-400")).not.toBeInTheDocument();
    const rendered = within(
      screen.getByRole("rowgroup", { name: "Lignes" }),
    ).getAllByRole("row");
    expect(rendered.length).toBeLessThan(60); // 500 rows in the data, a few dozen in the DOM
  });

  it("streams a page larger than 10 000 rows instead of using the paginated endpoint", async () => {
    let body: Body | undefined;
    const { calls } = stubApi({
      [STREAM]: (init) => {
        body = JSON.parse(init.body as string) as Body;
        return ndjson({ meta: META }, ...sampleRows, { done: 2 });
      },
    });
    renderWithProviders(<DataTab item={populated} />, {
      route: "/?size=1000000",
    });

    expect(await screen.findByText("alpha")).toBeInTheDocument();
    expect(calls).toEqual([STREAM]); // the paginated endpoint is never called
    expect(body).toMatchObject({ page: 1, page_size: 1_000_000 });
    expect(await screen.findByText("1–2 sur 2")).toBeInTheDocument();
  });

  it("shows a streaming failure and keeps the rows received before it", async () => {
    stubApi({
      [STREAM]: () =>
        ndjson({ meta: META }, sampleRows[0], { error: "stream interrupted" }),
    });
    renderWithProviders(<DataTab item={populated} />, {
      route: "/?size=1000000",
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "interrompu par le serveur",
    );
    expect(screen.getByText("alpha")).toBeInTheDocument();
  });

  it("flags a stream that ends without its done marker", async () => {
    stubApi({ [STREAM]: () => ndjson({ meta: META }, sampleRows[0]) });
    renderWithProviders(<DataTab item={populated} />, {
      route: "/?size=1000000",
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("incomplète");
  });

  it("shows validation errors of the stream endpoint as real errors", async () => {
    stubApi({ [STREAM]: () => json({ detail: "Unknown column 'zz'" }, 422) });
    renderWithProviders(<DataTab item={populated} />, {
      route: "/?size=1000000",
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unknown column 'zz'",
    );
  });

  it("lets the user stop a long stream and keeps what was received", async () => {
    const user = userEvent.setup();
    const encoder = new TextEncoder();
    stubApi({
      // 5 rows announced, 1 sent, and the body never closes: a stream in progress.
      [STREAM]: () =>
        new Response(
          new ReadableStream({
            start(controller) {
              const meta = { ...META, total: 5, returned: 5 };
              controller.enqueue(
                encoder.encode(
                  JSON.stringify({ meta }) +
                    "\n" +
                    JSON.stringify(sampleRows[0]) +
                    "\n",
                ),
              );
            },
          }),
        ),
    });
    renderWithProviders(<DataTab item={populated} />, {
      route: "/?size=1000000",
    });

    expect(await screen.findByText("alpha")).toBeInTheDocument();
    expect(screen.getByText(/1 \/ 5 lignes/)).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Arrêter le chargement" }),
    );
    expect(
      await screen.findByText(/Chargement interrompu : 1 lignes reçues sur 5/),
    ).toBeInTheDocument();
    expect(screen.getByText("alpha")).toBeInTheDocument();
  });

  it("restarts the stream when the sort changes", async () => {
    const user = userEvent.setup();
    const bodies: Body[] = [];
    stubApi({
      [STREAM]: (init) => {
        bodies.push(JSON.parse(init.body as string) as Body);
        return ndjson({ meta: META }, ...sampleRows, { done: 2 });
      },
    });
    renderWithProviders(<DataTab item={populated} />, {
      route: "/?size=1000000",
    });
    await screen.findByText("alpha");

    await user.click(screen.getByRole("button", { name: "id" }));
    await waitFor(() => expect(bodies).toHaveLength(2));
    expect(bodies[1].sort).toEqual({ column: "c0", direction: "asc" });
  });
});
