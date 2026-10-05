import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { Column, FilterCondition } from "../types/api";
import { FilterCell } from "./FilterCell";

const label: Column = { key: "c1", name: "label", type: "string" };
const qty: Column = { key: "c0", name: "qty", type: "integer" };
const flag: Column = { key: "c2", name: "flag", type: "boolean" };

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function setup(column: Column, current?: FilterCondition) {
  const onChange = vi.fn();
  render(<FilterCell column={column} current={current} onChange={onChange} />);
  return { onChange, user: userEvent.setup() };
}

describe("FilterCell", () => {
  it("emits once, with the final value, after the debounce", async () => {
    const { onChange, user } = setup(label);
    await user.type(screen.getByLabelText("Valeur label"), "alpha");
    expect(onChange).not.toHaveBeenCalled(); // five keystrokes, nothing sent yet

    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    expect(onChange).toHaveBeenCalledWith("c1", {
      column: "c1",
      op: "contains",
      value: "alpha",
    });
  });

  it("does not emit when the draft matches the applied filter", async () => {
    const current: FilterCondition = {
      column: "c1",
      op: "contains",
      value: "x",
    };
    const { onChange } = setup(label, current);
    expect(screen.getByLabelText("Valeur label")).toHaveValue("x");
    await wait(450);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("emits null when the input is cleared", async () => {
    const current: FilterCondition = {
      column: "c1",
      op: "contains",
      value: "x",
    };
    const { onChange, user } = setup(label, current);
    await user.clear(screen.getByLabelText("Valeur label"));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith("c1", null));
  });

  it("offers only the operators valid for the column type", () => {
    setup(qty);
    const options = screen.getAllByRole("option").map((o) => o.textContent);
    expect(options).toContain("entre");
    expect(options).not.toContain("contient");
  });

  it('hides the value input for "is empty" and still emits the filter', async () => {
    const { onChange, user } = setup(label);
    await user.selectOptions(
      screen.getByLabelText("Opérateur label"),
      "is_empty",
    );
    expect(screen.queryByLabelText("Valeur label")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith("c1", {
        column: "c1",
        op: "is_empty",
      }),
    );
  });

  it('shows two inputs for "between" and waits for both bounds', async () => {
    const { onChange, user } = setup(qty);
    await user.selectOptions(screen.getByLabelText("Opérateur qty"), "between");
    await user.type(screen.getByLabelText("Valeur qty (min)"), "2");
    await wait(450);
    expect(onChange).not.toHaveBeenCalled(); // incomplete

    await user.type(screen.getByLabelText("Valeur qty (max)"), "9");
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith("c0", {
        column: "c0",
        op: "between",
        value: "2",
        value_to: "9",
      }),
    );
  });

  it("flags an invalid number and sends nothing", async () => {
    const { onChange, user } = setup(qty);
    await user.type(screen.getByLabelText("Valeur qty"), "abc");
    expect(screen.getByLabelText("Valeur qty")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    await wait(450);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("uses a Yes/No choice for booleans", async () => {
    const { onChange, user } = setup(flag);
    await user.selectOptions(screen.getByLabelText("Valeur flag"), "true");
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith("c2", {
        column: "c2",
        op: "equals",
        value: true,
      }),
    );
  });

  it("offers only the operators it is given instead of those of the type", () => {
    render(
      <FilterCell
        column={label}
        current={undefined}
        operators={["equals", "contains"]}
        onChange={vi.fn()}
      />,
    );
    const options = within(
      screen.getByLabelText("Opérateur label"),
    ).getAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual([
      "est égal à",
      "contient",
    ]);
  });
});
