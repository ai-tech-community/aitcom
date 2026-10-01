"use client";

import { Fragment } from "react";

import { parsePostText, type Line } from "@/lib/post-format";
import { cn } from "@/lib/utils";

import { LinkifiedText, type ShownMention } from "./linkified-text";

function Inlines({
  line,
  mentions,
}: {
  line: Line;
  mentions: readonly ShownMention[];
}) {
  return (
    <>
      {line.map((part, index) => {
        const text = <LinkifiedText text={part.text} mentions={mentions} />;
        if (part.bold && part.italic) {
          return (
            <strong key={index}>
              <em>{text}</em>
            </strong>
          );
        }
        if (part.bold) return <strong key={index}>{text}</strong>;
        if (part.italic) return <em key={index}>{text}</em>;
        return <Fragment key={index}>{text}</Fragment>;
      })}
    </>
  );
}

/**
 * A post's text with its light formatting (bold, italic, lists), its links
 * made clickable and its @mentions shown as members. Everything is built
 * as elements from parsed data, so no member markup ever reaches the DOM.
 */
export function FormattedPostText({
  text,
  mentions = [],
  className,
}: {
  text: string;
  /** Whom the post mentions, as the server checked it. */
  mentions?: readonly ShownMention[];
  className?: string;
}) {
  return (
    <div className={cn("space-y-2 text-sm leading-relaxed", className)}>
      {parsePostText(text).map((block, index) => {
        if (block.kind === "bullets") {
          return (
            <ul key={index} className="list-disc space-y-0.5 pl-5">
              {block.items.map((item, i) => (
                <li key={i}>
                  <Inlines line={item} mentions={mentions} />
                </li>
              ))}
            </ul>
          );
        }
        if (block.kind === "numbers") {
          return (
            <ol
              key={index}
              start={block.start}
              className="list-decimal space-y-0.5 pl-5"
            >
              {block.items.map((item, i) => (
                <li key={i}>
                  <Inlines line={item} mentions={mentions} />
                </li>
              ))}
            </ol>
          );
        }
        return (
          <p key={index} className="whitespace-pre-wrap">
            {block.lines.map((line, i) => (
              <Fragment key={i}>
                {i > 0 ? "\n" : null}
                <Inlines line={line} mentions={mentions} />
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
