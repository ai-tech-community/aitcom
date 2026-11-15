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
 *
 * Every line and list takes its direction from its own words
 * (`dir="auto"`), so Hebrew or Arabic reads right to left in any locale.
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
    <div
      className={cn(
        // anywhere, not break-word: a token with no spaces (a pasted URL,
        // a hash) must be able to break, or its min-content width widens
        // the page on a phone.
        "space-y-2 text-sm leading-relaxed [overflow-wrap:anywhere]",
        className,
      )}
    >
      {parsePostText(text).map((block, index) => {
        if (block.kind === "bullets") {
          return (
            <ul key={index} dir="auto" className="list-disc space-y-0.5 ps-5">
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
              dir="auto"
              start={block.start}
              className="list-decimal space-y-0.5 ps-5"
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
          <p key={index} dir="auto" className="whitespace-pre-wrap">
            {block.lines.map((line, i) => (
              // Each line reads in its own direction, the way Unicode
              // treats a line break: a Hebrew paragraph and an English one
              // in the same post each read their way. An empty line keeps
              // its height with a <br>.
              <span key={i} dir="auto" className="block">
                {line.some((part) => part.text !== "") ? (
                  <Inlines line={line} mentions={mentions} />
                ) : (
                  <br />
                )}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}
