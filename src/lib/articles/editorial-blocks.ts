/**
 * Editorial blocks stored in article rich text: a pull quote, a captioned
 * photo, a gallery, and a side-by-side spread. Agents send them as markdown
 * fences or as structured blocks. Alt text is required on every photo.
 */

export class EditorialSyntaxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EditorialSyntaxError";
  }
}

export type EditorialImage = {
  src: string;
  alt: string;
  caption?: string;
};

export type EditorialBlock =
  | { type: "pullQuote"; quote: string; attribution?: string }
  | { type: "captionedImage"; image: EditorialImage }
  | { type: "gallery"; images: EditorialImage[] }
  | { type: "spread"; left: EditorialImage; right: EditorialImage };

type BlockFields = {
  id: string;
  blockType: string;
  blockName: string;
  [key: string]: unknown;
};

export type EditorialLexicalBlock = {
  type: "block";
  version: 1;
  fields: BlockFields;
};

const IMAGE_LINE =
  /^!\[([^\]]*)\]\(\s*(https?:\/\/[^\s)]+)\s*(?:"([^"]*)")?\s*\)$/;

function blockId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

function imageFields(image: EditorialImage, prefix = "") {
  const cap = prefix ? `${prefix}Caption` : "caption";
  const src = prefix ? `${prefix}Src` : "src";
  const alt = prefix ? `${prefix}Alt` : "alt";
  return {
    [src]: image.src,
    [alt]: image.alt,
    ...(image.caption ? { [cap]: image.caption } : {}),
  };
}

export function editorialBlockNode(
  block: EditorialBlock,
): EditorialLexicalBlock {
  const id = blockId();
  switch (block.type) {
    case "pullQuote":
      return {
        type: "block",
        version: 1,
        fields: {
          id,
          blockType: "PullQuote",
          blockName: "",
          quote: block.quote,
          ...(block.attribution ? { attribution: block.attribution } : {}),
        },
      };
    case "captionedImage":
      return {
        type: "block",
        version: 1,
        fields: {
          id,
          blockType: "CaptionedImage",
          blockName: "",
          ...imageFields(block.image),
        },
      };
    case "gallery":
      return {
        type: "block",
        version: 1,
        fields: {
          id,
          blockType: "Gallery",
          blockName: "",
          images: block.images.map((image) => ({
            id: blockId(),
            src: image.src,
            alt: image.alt,
            ...(image.caption ? { caption: image.caption } : {}),
          })),
        },
      };
    case "spread":
      return {
        type: "block",
        version: 1,
        fields: {
          id,
          blockType: "Spread",
          blockName: "",
          ...imageFields(block.left, "left"),
          ...imageFields(block.right, "right"),
        },
      };
    default: {
      const unreachable: never = block;
      return unreachable;
    }
  }
}

function requireImage(
  alt: string,
  src: string,
  caption: string | undefined,
): EditorialImage {
  const trimmedAlt = alt.trim();
  if (!trimmedAlt) {
    throw new EditorialSyntaxError("Alt text is required for every photo.");
  }
  if (trimmedAlt.length > 200) {
    throw new EditorialSyntaxError("Alt text can be at most 200 characters.");
  }
  const image: EditorialImage = { src, alt: trimmedAlt };
  const trimmedCaption = caption?.trim();
  if (trimmedCaption) image.caption = trimmedCaption.slice(0, 300);
  return image;
}

function imageFromLine(line: string): EditorialImage {
  const match = IMAGE_LINE.exec(line.trim());
  if (!match) {
    throw new EditorialSyntaxError(
      'A photo line looks like ![alt text](https://… "caption").',
    );
  }
  return requireImage(match[1] ?? "", match[2] ?? "", match[3]);
}

function pullQuoteFrom(lines: string[]): EditorialBlock {
  const body = lines
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (body.length === 0) {
    throw new EditorialSyntaxError("A pull quote needs words.");
  }
  const last = body[body.length - 1] ?? "";
  const attribution = /^[—–-]\s+(\S.*)$/.exec(last);
  if (attribution?.[1] && body.length > 1) {
    return {
      type: "pullQuote",
      quote: body.slice(0, -1).join(" "),
      attribution: attribution[1].slice(0, 160),
    };
  }
  return { type: "pullQuote", quote: body.join(" ").slice(0, 600) };
}

function galleryFrom(lines: string[]): EditorialBlock {
  const images = lines
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map(imageFromLine);
  if (images.length < 2) {
    throw new EditorialSyntaxError("A gallery needs at least two photos.");
  }
  if (images.length > 8) {
    throw new EditorialSyntaxError("A gallery can have at most eight photos.");
  }
  return { type: "gallery", images };
}

function spreadFrom(lines: string[]): EditorialBlock {
  const images = lines
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map(imageFromLine);
  if (images.length !== 2) {
    throw new EditorialSyntaxError(
      "A spread needs two photos, one on each side.",
    );
  }
  const [left, right] = images;
  if (!left || !right) {
    throw new EditorialSyntaxError(
      "A spread needs two photos, one on each side.",
    );
  }
  return { type: "spread", left, right };
}

export type EditorialSegment =
  | { kind: "prose"; text: string }
  | { kind: "block"; block: EditorialBlock };

/**
 * Turn editorial fences and captioned image lines into blocks, in the order
 * they were written. Other lines stay prose so the article parser can keep
 * headings and paragraphs. A fence that never closes is an error, and so is
 * a photo without alt text.
 */
export function segmentEditorialBody(body: string): EditorialSegment[] {
  const segments: EditorialSegment[] = [];
  type Fence = "pullquote" | "gallery" | "spread";
  let fence: Fence | null = null;
  let buffer: string[] = [];

  const close = () => {
    if (fence === "pullquote") {
      segments.push({ kind: "block", block: pullQuoteFrom(buffer) });
    }
    if (fence === "gallery") {
      segments.push({ kind: "block", block: galleryFrom(buffer) });
    }
    if (fence === "spread") {
      segments.push({ kind: "block", block: spreadFrom(buffer) });
    }
    fence = null;
    buffer = [];
  };

  for (const line of body.split("\n")) {
    const trimmed = line.trim();
    const opening = /^:::(pullquote|gallery|spread)\s*$/.exec(trimmed);
    if (fence === null && opening?.[1]) {
      fence = opening[1] as Fence;
      buffer = [];
      continue;
    }
    if (fence !== null && trimmed === ":::") {
      close();
      continue;
    }
    if (fence !== null) {
      buffer.push(line);
      continue;
    }
    if (IMAGE_LINE.test(trimmed)) {
      const image = imageFromLine(trimmed);
      // A captioned line is an editorial figure. An uncaptioned photo stays
      // prose so the article parser can store an https image block, and an
      // http address stays text. Empty alt still fails in imageFromLine.
      if (image.caption) {
        segments.push({
          kind: "block",
          block: { type: "captionedImage", image },
        });
        continue;
      }
    }
    segments.push({ kind: "prose", text: line });
  }
  if (fence !== null) {
    throw new EditorialSyntaxError("Close the editorial block with :::.");
  }
  return segments;
}
