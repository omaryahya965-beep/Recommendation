import { expect, type Page } from "@playwright/test";

/**
 * Nothing on the page is wider than the screen, and nothing is cut off at its
 * edge.
 *
 * Two traps make the obvious check (`scrollWidth - innerWidth`) pass on a
 * broken page:
 * - On a mobile viewport, content wider than the screen grows the layout
 *   viewport itself, so innerWidth follows it and the page is zoomed out.
 *   The width is measured against the viewport the test asked for.
 * - <html> and <body> use `overflow-x: clip`, so the page never scrolls
 *   sideways: anything too wide is silently cut off instead. Elements that
 *   reach past the screen edge, outside any scrolling or clipping container
 *   of their own, are reported.
 */
export async function expectNoHorizontalScroll(page: Page) {
  const requested = page.viewportSize()?.width ?? 0;
  const { widest, cutOff } = await page.evaluate(() => {
    const vw = window.innerWidth;
    const insideOwnClip = (el: Element) => {
      for (let p = el.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
        const style = getComputedStyle(p);
        if (style.overflowX !== "visible" || style.position === "fixed") return true;
      }
      return false;
    };
    const cut: string[] = [];
    for (const el of Array.from(document.querySelectorAll("body *"))) {
      const box = el.getBoundingClientRect();
      if (box.width < 2 || box.height < 2 || (box.left >= -1 && box.right <= vw + 1)) continue;
      const style = getComputedStyle(el);
      if (style.visibility === "hidden" || style.position === "fixed") continue;
      if (el.closest("[aria-hidden=true], .sr-only") || insideOwnClip(el)) continue;
      cut.push(`${el.tagName.toLowerCase()} "${(el.textContent ?? "").trim().slice(0, 40)}"`);
    }
    return { widest: Math.max(document.documentElement.scrollWidth, vw), cutOff: cut.slice(0, 5) };
  });
  expect(widest - requested, "page is wider than the screen").toBeLessThanOrEqual(1);
  expect(cutOff, "content cut off at the screen edge").toEqual([]);
}
