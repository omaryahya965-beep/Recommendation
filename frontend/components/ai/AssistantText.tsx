import { Fragment } from "react";

import { parseAssistantText, type Inline } from "@/lib/assistantText";

function Line({ parts }: { parts: Inline[] }) {
  return (
    <>
      {parts.map((part, index) =>
        part.type === "strong" ? (
          <strong key={index} className="font-bold text-ink">
            <bdi>{part.text}</bdi>
          </strong>
        ) : part.type === "code" ? (
          <code key={index} className="rounded bg-subtle px-1 font-mono text-[0.9em]" dir="auto">
            {part.text}
          </code>
        ) : (
          <Fragment key={index}>{part.text}</Fragment>
        )
      )}
    </>
  );
}

/** An assistant answer with its light Markdown shown as structure (BUG-27). */
export function AssistantText({ text }: { text: string }) {
  return (
    <div className="space-y-2 font-medium break-words">
      {parseAssistantText(text).map((block, index) => {
        if (block.type === "heading") {
          return (
            <p key={index} className="font-bold text-ink">
              <Line parts={block.content} />
            </p>
          );
        }
        if (block.type === "list") {
          const List = block.ordered ? "ol" : "ul";
          return (
            <List key={index} className={block.ordered ? "list-decimal space-y-1 ps-5" : "list-disc space-y-1 ps-5"}>
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>
                  <Line parts={item} />
                </li>
              ))}
            </List>
          );
        }
        return (
          <p key={index}>
            {block.lines.map((line, lineIndex) => (
              <Fragment key={lineIndex}>
                {lineIndex ? <br /> : null}
                <Line parts={line} />
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
