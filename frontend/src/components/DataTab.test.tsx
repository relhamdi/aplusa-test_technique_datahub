import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { json, stubApi } from "../test/api";
import { renderWithProviders } from "../test/utils";
import type { ImportSummary } from "../types/api";
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
    { key: "c1", name: "price", type: "float" },
  ],
  row_count: 3,
};

const csv = () =>
  new File(["id,price\n1,2.5\n"], "data.csv", { type: "text/csv" });

const DETECT = "POST /api/imports/detect-types";
const INGEST = "POST /api/imports/1/data";
const report = (extra = {}) => ({
  mode: "replace",
  filename: "data.csv",
  rows_inserted: 2,
  row_count: 2,
  rejected: [],
  ...extra,
});

afterEach(() => vi.unstubAllGlobals());

async function openDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Importer un fichier" }));
}

describe("DataTab", () => {
  it("invites to import when the import has no data, and offers no append mode", async () => {
    const user = userEvent.setup();
    renderWithProviders(<DataTab item={empty} />);
    expect(screen.getByText(/Aucune donnée/)).toBeInTheDocument();
    await openDialog(user);
    expect(
      screen.queryByLabelText("Ajouter à la suite"),
    ).not.toBeInTheDocument();
  });

  it("summarises an import that already has data", () => {
    renderWithProviders(<DataTab item={populated} />);
    expect(screen.getByText(/3 lignes, 2 colonnes/)).toBeInTheDocument();
  });

  it("replace: detects types, lets the user correct them, then imports", async () => {
    const user = userEvent.setup();
    let ingestForm!: FormData;
    stubApi({
      [DETECT]: () =>
        json([
          { name: "id", type: "integer" },
          { name: "price", type: "float" },
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

    // Types step: detected values are preselected and editable.
    const priceType = await screen.findByLabelText("Type de price");
    expect(priceType).toHaveValue("float");
    await user.selectOptions(priceType, "string");
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
      { name: "id", type: "integer" },
      { name: "price", type: "string" },
    ]);
  });

  it("replace: warns that existing data will be replaced", async () => {
    const user = userEvent.setup();
    renderWithProviders(<DataTab item={populated} />);
    await openDialog(user);
    expect(screen.getByText(/seront remplacées/)).toBeInTheDocument();
  });

  it("append: imports directly, without detection and without types", async () => {
    const user = userEvent.setup();
    let form!: FormData;
    const { calls } = stubApi({
      [INGEST]: (init) => {
        form = init.body as FormData;
        return json(report({ mode: "append", rows_inserted: 1, row_count: 4 }));
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
    expect(calls).toEqual([INGEST]); // no detect-types call
    expect(form.get("mode")).toBe("append");
    expect(form.get("types")).toBeNull(); // types are frozen by the import
  });

  it("append: shows the column mismatch and stays on the file step", async () => {
    const user = userEvent.setup();
    stubApi({
      [INGEST]: () =>
        json(
          {
            detail:
              "Columns do not match the import. Missing: ['price']; unexpected: ['zzz']",
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

  it("shows a detection error and keeps the chosen file step", async () => {
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
