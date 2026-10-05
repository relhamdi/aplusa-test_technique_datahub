import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { json, stubApi } from "../test/api";
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

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});
describe("HomePage", () => {
  it("shows the empty state when there is no import", async () => {
    stubApi({ "GET /api/imports": () => json([]) });
    renderWithProviders(<HomePage />);
    expect(
      await screen.findByText("Aucun import pour le moment."),
    ).toBeInTheDocument();
  });

  it("lists the imports with a link to open each one", async () => {
    stubApi({ "GET /api/imports": () => json([sample]) });
    renderWithProviders(<HomePage />);
    expect(await screen.findByRole("link", { name: "Ventes" })).toHaveAttribute(
      "href",
      "/imports/1",
    );
  });

  it("shows the error message sent by the API", async () => {
    stubApi({
      "GET /api/imports": () => json({ detail: "Database unavailable" }, 500),
    });
    renderWithProviders(<HomePage />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Database unavailable",
    );
  });

  it("creates an import then refreshes the list", async () => {
    const user = userEvent.setup();
    let items: ImportSummary[] = [];
    let body: unknown;
    const { calls } = stubApi({
      "GET /api/imports": () => json(items),
      "POST /api/imports": (init) => {
        body = JSON.parse(init.body as string);
        items = [{ ...sample, id: "9", name: "Budget" }];
        return json(items[0], 201);
      },
    });

    renderWithProviders(<HomePage />);
    await screen.findByText("Aucun import pour le moment.");
    await user.click(screen.getByRole("button", { name: "Nouvel import" }));
    await user.type(screen.getByLabelText("Nom"), "  Budget ");
    await user.click(screen.getByRole("button", { name: "Créer" }));

    expect(
      await screen.findByRole("link", { name: "Budget" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(body).toEqual({ name: "Budget", description: "" }); // name is trimmed
    expect(calls.filter((c) => c === "GET /api/imports")).toHaveLength(2); // refetched
  });

  it("does not allow submitting an empty name", async () => {
    const user = userEvent.setup();
    stubApi({ "GET /api/imports": () => json([]) });
    renderWithProviders(<HomePage />);
    await user.click(
      await screen.findByRole("button", { name: "Nouvel import" }),
    );
    expect(screen.getByRole("button", { name: "Créer" })).toBeDisabled();
  });

  it("shows the API error inside the dialog and keeps it open", async () => {
    const user = userEvent.setup();
    stubApi({
      "GET /api/imports": () => json([]),
      "POST /api/imports": () => json({ detail: "Name already used" }, 422),
    });
    renderWithProviders(<HomePage />);
    await user.click(
      await screen.findByRole("button", { name: "Nouvel import" }),
    );
    await user.type(screen.getByLabelText("Nom"), "X");
    await user.click(screen.getByRole("button", { name: "Créer" }));

    const dialog = screen.getByRole("dialog");
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Name already used",
    );
  });

  it("edits an import with prefilled values", async () => {
    const user = userEvent.setup();
    let items = [sample];
    let body: unknown;
    stubApi({
      "GET /api/imports": () => json(items),
      "PATCH /api/imports/1": (init) => {
        body = JSON.parse(init.body as string);
        items = [{ ...sample, name: "Ventes 2" }];
        return json(items[0]);
      },
    });

    renderWithProviders(<HomePage />);
    await user.click(
      await screen.findByRole("button", { name: "Modifier Ventes" }),
    );
    const name = screen.getByLabelText("Nom");
    expect(name).toHaveValue("Ventes");
    await user.clear(name);
    await user.type(name, "Ventes 2");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    expect(
      await screen.findByRole("link", { name: "Ventes 2" }),
    ).toBeInTheDocument();
    expect(body).toEqual({ name: "Ventes 2", description: "" });
  });

  it("asks for confirmation before deleting, and forgets the saved table state", async () => {
    const user = userEvent.setup();
    let items = [sample];
    const { calls } = stubApi({
      "GET /api/imports": () => json(items),
      "DELETE /api/imports/1": () => {
        items = [];
        return new Response(null, { status: 204 });
      },
    });
    localStorage.setItem("datahub:table:1", "saved-state"); // state saved for import "1"

    renderWithProviders(<HomePage />);
    await user.click(
      await screen.findByRole("button", { name: "Supprimer Ventes" }),
    );
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Annuler",
      }),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(calls).not.toContain("DELETE /api/imports/1"); // cancel deletes nothing
    expect(localStorage.getItem("datahub:table:1")).toBe("saved-state"); // nor the saved state

    await user.click(screen.getByRole("button", { name: "Supprimer Ventes" }));
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Supprimer",
      }),
    );
    expect(
      await screen.findByText("Aucun import pour le moment."),
    ).toBeInTheDocument();
    expect(localStorage.getItem("datahub:table:1")).toBeNull();
  });

  it("closes a dialog with Escape", async () => {
    const user = userEvent.setup();
    stubApi({ "GET /api/imports": () => json([]) });
    renderWithProviders(<HomePage />);
    await user.click(
      await screen.findByRole("button", { name: "Nouvel import" }),
    );
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
