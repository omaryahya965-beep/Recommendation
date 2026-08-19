import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Button } from "./Base";

describe("Button", () => {
  it("renders its label as a button", () => {
    render(<Button>حفظ</Button>);
    expect(screen.getByRole("button", { name: "حفظ" })).toBeInTheDocument();
  });

  it("calls onClick when enabled", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick}>اعتماد</Button>);
    await user.click(screen.getByRole("button", { name: "اعتماد" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does not call onClick when disabled", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        حفظ
      </Button>
    );
    await user.click(screen.getByRole("button", { name: "حفظ" }));
    expect(onClick).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "حفظ" })).toBeDisabled();
  });

  it("applies the danger variant classes used by destructive actions", () => {
    render(<Button variant="danger">حذف</Button>);
    expect(screen.getByRole("button", { name: "حذف" })).toHaveClass("bg-danger-dark");
  });

  it("forwards type so form submit buttons stay submit", () => {
    render(<Button type="submit">إرسال</Button>);
    expect(screen.getByRole("button", { name: "إرسال" })).toHaveAttribute("type", "submit");
  });
});
