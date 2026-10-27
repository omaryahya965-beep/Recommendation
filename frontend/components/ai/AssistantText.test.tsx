import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AssistantText } from "./AssistantText";

describe("AssistantText (BUG-27)", () => {
  it("shows structure instead of Markdown symbols and one reference format", () => {
    const { container } = render(
      <AssistantText text={"**العنوان**: نص\n\n1. **Recommendation REC-16** late\n2. second\n- item"} />
    );
    expect(container.textContent).not.toContain("**");
    expect(container.querySelector("strong")?.textContent).toBe("العنوان");
    expect(container.querySelectorAll("ol > li")).toHaveLength(2);
    expect(container.querySelectorAll("ul > li")).toHaveLength(1);
    expect(container.textContent).toContain("REC-0016");
    expect(container.textContent).not.toMatch(/REC-16\b/);
  });

  it("never turns model text into HTML", () => {
    const { container } = render(<AssistantText text={'<img src=x onerror="alert(1)"> <b>x</b>'} />);
    expect(container.querySelector("img, b")).toBeNull();
    expect(container.textContent).toContain('<img src=x onerror="alert(1)">');
  });
});
