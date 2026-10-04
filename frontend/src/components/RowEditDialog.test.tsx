import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { json, stubApi } from "../test/api";
import { renderWithProviders } from "../test/utils";
import type { Column, RowOut } from "../types/api";
import { RowEditDialog } from "./RowEditDialog";

const columns: Column[] = [
  { key: "c0", name: "id", type: "integer" },
  { key: "c1", name: "label", type: "string" },
  { key: "c2", name: "flag", type: "boolean" },
];
const row: RowOut = { id: "r1", values: { c0: 1, c1: "alpha", c2: true } };
const PATCH = "PATCH /api/imports/1/rows/r1";

function setup(routes: Parameters<typeof stubApi>[0] = {}) {
  const onClose = vi.fn();
  const onSaved = vi.fn();
  let body: unknown;
  const api = stubApi({
    [PATCH]: (init) => {
      body = JSON.parse(init.body as string);
      return json({ id: "r1", values: row.values });
    },
    ...routes,
  });
  renderWithProviders(
    <RowEditDialog
      importId="1"
      columns={columns}
      row={row}
      rowNumber={21}
      onClose={onClose}
      onSaved={onSaved}
    />,
  );
  return {
    ...api,
    onClose,
    onSaved,
    body: () => body,
    user: userEvent.setup(),
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("RowEditDialog", () => {
  it("shows the current values and cannot save without a change", () => {
    setup();
    expect(
      screen.getByRole("heading", { name: "Éditer la ligne 21" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("id")).toHaveValue("1");
    expect(screen.getByLabelText("label")).toHaveValue("alpha");
    expect(screen.getByLabelText("flag")).toHaveValue("true");
    expect(screen.getByRole("button", { name: "Enregistrer" })).toBeDisabled();
    expect(screen.getByText("Aucune modification.")).toBeInTheDocument();
  });

  it("flags an invalid number and blocks the save", async () => {
    const { user } = setup();
    await user.clear(screen.getByLabelText("id"));
    await user.type(screen.getByLabelText("id"), "abc");
    expect(screen.getByText("Entier attendu (ex. 42).")).toBeInTheDocument();
    expect(screen.getByLabelText("id")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("button", { name: "Enregistrer" })).toBeDisabled();
  });

  it("asks for confirmation, listing before and after, and sends nothing yet", async () => {
    const { user, calls } = setup();
    await user.clear(screen.getByLabelText("label"));
    await user.type(screen.getByLabelText("label"), "beta");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    expect(
      screen.getByRole("heading", { name: "Confirmer les modifications" }),
    ).toBeInTheDocument();
    expect(screen.getByText("label : alpha → beta")).toBeInTheDocument();
    expect(calls).toEqual([]); // nothing is sent before the confirmation
  });

  it("sends only the changed fields once confirmed", async () => {
    const { user, body, onSaved } = setup();
    await user.clear(screen.getByLabelText("label"));
    await user.type(screen.getByLabelText("label"), "beta");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));
    await user.click(screen.getByRole("button", { name: "Confirmer" }));

    await vi.waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(body()).toEqual({ values: { c1: "beta" } }); // id and flag are not sent
  });

  it("turns a cleared field into an empty value", async () => {
    const { user, body, onSaved } = setup();
    await user.clear(screen.getByLabelText("label"));
    await user.selectOptions(screen.getByLabelText("flag"), "");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));
    expect(screen.getByText("label : alpha → (vide)")).toBeInTheDocument();
    expect(screen.getByText("flag : Oui → (vide)")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Confirmer" }));
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(body()).toEqual({ values: { c1: null, c2: null } });
  });

  it("cancels from the confirmation step without saving", async () => {
    const { user, calls, onClose } = setup();
    await user.type(screen.getByLabelText("label"), "x");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));
    await user.click(screen.getByRole("button", { name: "Annuler" }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(calls).toEqual([]);
  });

  it("goes back to the form with the typed values kept", async () => {
    const { user } = setup();
    await user.type(screen.getByLabelText("label"), "!");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));
    await user.click(screen.getByRole("button", { name: "Retour" }));

    expect(
      screen.getByRole("heading", { name: "Éditer la ligne 21" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("label")).toHaveValue("alpha!");
  });

  it("shows the API error and does not report a save", async () => {
    const { user, onSaved } = setup({
      [PATCH]: () =>
        json({ detail: "Invalid integer value for column id" }, 422),
    });
    await user.clear(screen.getByLabelText("id"));
    await user.type(screen.getByLabelText("id"), "99999999999999999999");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));
    await user.click(screen.getByRole("button", { name: "Confirmer" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Invalid integer value",
    );
    expect(onSaved).not.toHaveBeenCalled();
  });
});
