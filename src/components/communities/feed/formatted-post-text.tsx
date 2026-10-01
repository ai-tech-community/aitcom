"use client";

import { Fragment } from "react";

import { parsePostText, type Line } from "@/lib/post-format";
import { cn } from "@/lib/utils";

import { LinkifiedText } from "./linkified-text";

function Inlines({ line }: { line: Line }) {
  return (
    <>
      {line.map((part, index) => {
        const text = <LinkifiedText text={part.text} />;
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
 * A post's text with its light formatting (bold, italic, lists) and its
 * links made clickable. Everything is built as elements from parsed data,
 * so no member markup ever reaches the DOM.
 */
export function FormattedPostText({
  text,
  className,
}: {
  text: string;
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
                  <Inlines line={item} />
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
                  <Inlines line={item} />
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
                <Inlines line={line} />
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
