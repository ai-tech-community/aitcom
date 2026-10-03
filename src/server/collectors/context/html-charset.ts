/**
 * Which text encoding an HTML page is in, decided the way a browser does it,
 * in a simplified form: a byte order mark, else the `charset` in the
 * Content-Type header, else a `<meta charset>` or `<meta http-equiv>`
 * declaration in the first 1024 bytes, else UTF-8. Labels are WHATWG
 * encoding labels (`TextDecoder`); an unknown label counts as undeclared.
 */

/** How far into the body a `<meta>` declaration is looked for. */
const META_SCAN_BYTES = 1_024;

const DEFAULT_ENCODING = "utf-8";

const BYTE_ORDER_MARKS: readonly { bytes: number[]; encoding: string }[] = [
  { bytes: [0xef, 0xbb, 0xbf], encoding: "utf-8" },
  { bytes: [0xfe, 0xff], encoding: "utf-16be" },
  { bytes: [0xff, 0xfe], encoding: "utf-16le" },
];

const HEADER_CHARSET = /;\s*charset\s*=\s*"?([^";\s]+)/i;
// Both `<meta charset="x">` and `<meta http-equiv="Content-Type"
// content="text/html; charset=x">` carry `charset=` inside the tag.
const META_CHARSET = /<meta\b[^>]*?charset\s*=\s*["']?\s*([^"'\s/>;]+)/i;

/** The WHATWG name for `label`, or null when it names no known encoding. */
function encodingFor(label: string | undefined): string | null {
  if (label === undefined) return null;
  try {
    return new TextDecoder(label.trim()).encoding;
  } catch {
    return null;
  }
}

function byteOrderMark(body: Uint8Array): string | null {
  const mark = BYTE_ORDER_MARKS.find(({ bytes }) =>
    bytes.every((byte, index) => body[index] === byte),
  );
  return mark?.encoding ?? null;
}

function metaEncoding(body: Uint8Array): string | null {
  const head = Buffer.from(
    body.buffer,
    body.byteOffset,
    Math.min(body.byteLength, META_SCAN_BYTES),
  ).toString("latin1");
  const encoding = encodingFor(META_CHARSET.exec(head)?.[1]);
  // A page that says it is UTF-16 in its own (ASCII) markup cannot be, so
  // browsers read it as UTF-8.
  return encoding?.startsWith("utf-16") ? DEFAULT_ENCODING : encoding;
}

/** The encoding to decode `body` with, as a WHATWG encoding name. */
export function htmlEncoding(
  body: Uint8Array,
  contentType: string | null,
): string {
  return (
    byteOrderMark(body) ??
    encodingFor(
      contentType ? HEADER_CHARSET.exec(contentType)?.[1] : undefined,
    ) ??
    metaEncoding(body) ??
    DEFAULT_ENCODING
  );
}

/** The page's text, decoded by its declared encoding (see `htmlEncoding`). */
export function decodeHtml(
  body: Uint8Array,
  contentType: string | null,
): string {
  return new TextDecoder(htmlEncoding(body, contentType)).decode(body);
}
