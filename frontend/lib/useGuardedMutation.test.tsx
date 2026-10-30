import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useGuardedMutation } from "./useGuardedMutation";

function Form({ fn }: { fn: () => Promise<unknown> }) {
  const save = useGuardedMutation({ mutationFn: fn });
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <input aria-label="title" />
      <button type="submit" disabled={save.isPending}>
        save
      </button>
    </form>
  );
}

function renderForm(fn: () => Promise<unknown>) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Form fn={fn} />
    </QueryClientProvider>
  );
}

describe("useGuardedMutation (BUG-02)", () => {
  it("sends once for a double click within the same frame", async () => {
    let resolve: () => void = () => {};
    const fn = vi.fn(() => new Promise<void>((r) => (resolve = r)));
    renderForm(fn);
    const button = screen.getByRole("button", { name: "save" });
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(fn).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
    expect(fn).toHaveBeenCalledTimes(1);
    resolve();
    await waitFor(() => expect(button).not.toBeDisabled());
  });

  it("sends once for Enter pressed twice", async () => {
    const fn = vi.fn(() => new Promise<void>(() => {}));
    renderForm(fn);
    const form = screen.getByRole("button", { name: "save" }).closest("form")!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    await waitFor(() => expect(fn).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("allows a new submission after the first one settles, including after an error", async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce("ok");
    renderForm(fn);
    const button = screen.getByRole("button", { name: "save" });
    fireEvent.click(button);
    await waitFor(() => expect(button).not.toBeDisabled());
    fireEvent.click(button);
    await waitFor(() => expect(fn).toHaveBeenCalledTimes(2));
  });
});
