/**
 * The assistant's answers use a little Markdown (bold, lists, headings).
 * This reads that subset into plain data that React renders as text nodes,
 * so nothing the model writes can become HTML (BUG-27).
 */
import { recordCode } from "./format";

export type Inline = { type: "text" | "strong" | "code"; text: string };
export type Block =
  | { type: "heading"; content: Inline[] }
  | { type: "paragraph"; lines: Inline[][] }
  | { type: "list"; ordered: boolean; items: Inline[][] };

/** REC-16, rec 16 → REC-0016; RPT-5 → RPT-0005: one way of writing references. */
export function normalizeRefs(text: string): string {
  return text.replace(/(?<![A-Za-z])(REC|RPT)[-\s]?(\d+)\b/gi, (_, prefix: string, digits: string) =>
    recordCode(Number(digits), prefix.toUpperCase())
  );
}

function inline(text: string): Inline[] {
  const parts: Inline[] = [];
  const pattern = /\*\*(.+?)\*\*|__(.+?)__|`([^`]+)`/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > last) parts.push({ type: "text", text: text.slice(last, match.index) });
    if (match[3] !== undefined) parts.push({ type: "code", text: match[3] });
    else parts.push({ type: "strong", text: match[1] ?? match[2] });
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push({ type: "text", text: text.slice(last) });
  return parts;
}

export function parseAssistantText(raw: string): Block[] {
  const blocks: Block[] = [];
  const push = (line: string, kind: "paragraph" | "ol" | "ul") => {
    const prev = blocks[blocks.length - 1];
    if (kind === "paragraph") {
      if (prev?.type === "paragraph") prev.lines.push(inline(line));
      else blocks.push({ type: "paragraph", lines: [inline(line)] });
      return;
    }
    const ordered = kind === "ol";
    if (prev?.type === "list" && prev.ordered === ordered) prev.items.push(inline(line));
    else blocks.push({ type: "list", ordered, items: [inline(line)] });
  };
  let gap = false;
  for (const rawLine of normalizeRefs(raw).replace(/\r\n?/g, "\n").split("\n")) {
    const line = rawLine.trim();
    if (!line) {
      gap = true;
      continue;
    }
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    const ordered = /^\d+[.)]\s+(.*)$/.exec(line);
    const bullet = /^[-*•]\s+(.*)$/.exec(line);
    if (heading) blocks.push({ type: "heading", content: inline(heading[1]) });
    else if (ordered) push(ordered[1], "ol");
    else if (bullet) push(bullet[1], "ul");
    else {
      // A blank line starts a new paragraph; otherwise lines stay together.
      if (gap && blocks[blocks.length - 1]?.type === "paragraph") blocks.push({ type: "paragraph", lines: [] });
      push(line, "paragraph");
    }
    gap = false;
  }
  return blocks.filter((block) => block.type !== "paragraph" || block.lines.length);
}
