import type { ReactNode } from "react";

import { EditorialImage } from "./editorial-image";

type ImageFields = {
  src?: unknown;
  alt?: unknown;
  caption?: unknown;
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function photo({
  src,
  alt,
  caption,
  sizes,
}: {
  src: string;
  alt: string;
  caption: string;
  sizes: string;
}) {
  if (!src || !alt) return null;
  return (
    <figure className="flex flex-col gap-2">
      <EditorialImage
        src={src}
        alt={alt}
        sizes={sizes}
        className="h-auto w-full"
      />
      {caption ? (
        <figcaption className="text-muted-foreground font-magazine-sans text-sm leading-snug">
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
}

function imageOf(fields: ImageFields | null | undefined) {
  if (!fields) return null;
  return photo({
    src: text(fields.src),
    alt: text(fields.alt),
    caption: text(fields.caption),
    sizes: "(max-width: 768px) 100vw, 720px",
  });
}

/** Pull quote, captioned photo, gallery, or spread. Null for any other block. */
export function renderEditorialBlock(
  fields: Record<string, unknown>,
): ReactNode | null {
  const blockType = fields.blockType;
  if (blockType === "PullQuote") {
    const quote = text(fields.quote);
    if (!quote) return null;
    const attribution = text(fields.attribution);
    return (
      <blockquote className="editorial-span my-10 border-y border-[color:var(--magazine-accent-ink)] py-8 text-center">
        <p className="font-magazine-serif text-2xl leading-snug font-medium text-balance italic sm:text-3xl">
          {quote}
        </p>
        {attribution ? (
          <footer className="text-muted-foreground mt-4 font-mono text-xs tracking-wide">
            — {attribution}
          </footer>
        ) : null}
      </blockquote>
    );
  }
  if (blockType === "CaptionedImage") {
    const figure = imageOf(fields);
    return figure ? <div className="editorial-span my-8">{figure}</div> : null;
  }
  if (blockType === "Gallery" && Array.isArray(fields.images)) {
    const figures = fields.images.flatMap((image, index) => {
      const figure = imageOf(image as ImageFields);
      return figure ? [<li key={index}>{figure}</li>] : [];
    });
    if (figures.length === 0) return null;
    return (
      <ul className="editorial-span my-8 grid list-none grid-cols-1 gap-6 p-0 sm:grid-cols-2">
        {figures}
      </ul>
    );
  }
  if (blockType === "Spread") {
    const left = photo({
      src: text(fields.leftSrc),
      alt: text(fields.leftAlt),
      caption: text(fields.leftCaption),
      sizes: "(max-width: 768px) 100vw, 50vw",
    });
    const right = photo({
      src: text(fields.rightSrc),
      alt: text(fields.rightAlt),
      caption: text(fields.rightCaption),
      sizes: "(max-width: 768px) 100vw, 50vw",
    });
    if (!left || !right) return null;
    return (
      <div className="editorial-span my-8 grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
        {left}
        {right}
      </div>
    );
  }
  return null;
}
