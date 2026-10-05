import { expect, it } from "vitest";

import { createQueryClient } from "./queryClient";

it("does not refetch on window focus, to keep tables stable", () => {
  expect(
    createQueryClient().getDefaultOptions().queries?.refetchOnWindowFocus,
  ).toBe(false);
});
