import { load } from "cheerio";
import { assertDepthWithin } from "./extract-list";
import {
  ExtractError,
  MAX_CELL_CHARS,
  MAX_ROWS_PER_PAGE,
  MAX_OUTPUT_CHARS_PER_PAGE,
  type ExtractResult,
  type ExtractEventsSpec,
} from "./protocol";

const MAX_JSON_DEPTH = 64;
const MAX_JSON_NODES = 100_000;
type ObjectValue = Record<string, unknown>;
const object = (value: unknown): value is ObjectValue =>
  !!value && typeof value === "object" && !Array.isArray(value);
const list = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : value == null ? [] : [value];
function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/\s+/g, " ");
  return trimmed ? Array.from(trimmed).slice(0, MAX_CELL_CHARS).join("") : null;
}
function hasType(value: ObjectValue, type: string): boolean {
  return list(value["@type"]).some(
    (v) =>
      v === type ||
      v === `https://schema.org/${type}` ||
      v === `http://schema.org/${type}`,
  );
}
function safeUrl(value: unknown, baseUrl: string): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value, baseUrl);
    return /^https?:$/.test(url.protocol) &&
      !url.username &&
      !url.password &&
      url.href.length <= MAX_CELL_CHARS
      ? url.href
      : null;
  } catch {
    return null;
  }
}
/** JSON-LD is data only. No contexts/scripts/URLs are fetched or executed. */
export function extractEvents(
  html: string,
  spec: ExtractEventsSpec,
): ExtractResult {
  if (html.length > 5 * 1024 * 1024) throw new ExtractError("page_too_complex");
  const $ = load(html);
  assertDepthWithin($.root()[0]!, 512);
  $("template,noscript").remove();
  const nodes: ObjectValue[] = [];
  let malformedScripts = 0;
  let visited = 0;
  $("script").each((_index, element) => {
    if (
      ($(element).attr("type") ?? "").split(";")[0]!.trim().toLowerCase() !==
      "application/ld+json"
    )
      return;
    let raw: unknown;
    try {
      raw = JSON.parse($(element).text()) as unknown;
    } catch {
      malformedScripts++;
      return;
    }
    const stack: { value: unknown; depth: number }[] = [
      { value: raw, depth: 0 },
    ];
    while (stack.length) {
      const { value, depth } = stack.pop()!;
      if (++visited > MAX_JSON_NODES)
        throw new ExtractError("page_too_complex");
      if (depth > MAX_JSON_DEPTH) throw new ExtractError("page_too_deep");
      if (object(value)) {
        nodes.push(value);
        for (const child of Object.values(value)) {
          if (child && typeof child === "object")
            stack.push({ value: child, depth: depth + 1 });
        }
      } else if (Array.isArray(value)) {
        for (let i = value.length - 1; i >= 0; i--)
          stack.push({ value: value[i], depth: depth + 1 });
      }
    }
  });
  const byId = new Map<string, ObjectValue>();
  for (const node of nodes)
    if (typeof node["@id"] === "string" && Object.keys(node).length > 1)
      byId.set(node["@id"], node);
  const resolve = (value: unknown): unknown =>
    object(value) && typeof value["@id"] === "string"
      ? { ...byId.get(value["@id"]), ...value }
      : value;
  const rows: ExtractResult["rows"] = [];
  const seen = new Set<string>();
  let size = 0;
  let truncated = false;
  let invalidEvents = 0;
  for (const node of nodes) {
    if (!hasType(node, "Event")) continue;
    const name = text(node.name);
    if (!name) {
      invalidEvents++;
      continue;
    }
    const locations = list(node.location).map(resolve);
    const physical = locations.find(
      (v) => object(v) && !hasType(v, "VirtualLocation"),
    );
    const place = object(physical) ? physical : null;
    const address = place ? resolve(place.address) : null;
    const modes = list(node.eventAttendanceMode);
    const online =
      modes.some(
        (v) =>
          typeof v === "string" &&
          /^(?:https?:\/\/schema\.org\/)?(?:Online|Mixed)EventAttendanceMode$/.test(
            v,
          ),
      ) || locations.some((v) => object(v) && hasType(v, "VirtualLocation"));
    const offline =
      modes.some(
        (v) =>
          typeof v === "string" &&
          /^(?:https?:\/\/schema\.org\/)?OfflineEventAttendanceMode$/.test(v),
      ) || place !== null;
    const organizers = list(node.organizer).map(resolve);
    const row = {
      name,
      startDate: text(node.startDate),
      endDate: text(node.endDate),
      url: safeUrl(node.url ?? node["@id"], spec.baseUrl) ?? spec.baseUrl,
      venue: text(place?.name) ?? text(physical),
      city: object(address) ? text(address.addressLocality) : null,
      online: online ? "true" : offline ? "false" : null,
      organizer:
        organizers
          .map((v) => text(object(v) ? v.name : v))
          .filter(Boolean)
          .join("; ") || null,
    };
    const key = JSON.stringify([row.name, row.startDate, row.url]);
    if (seen.has(key)) continue;
    seen.add(key);
    const length = Object.values(row).reduce(
      (sum, value) => sum + (value?.length ?? 0),
      0,
    );
    if (
      rows.length >= MAX_ROWS_PER_PAGE ||
      size + length > MAX_OUTPUT_CHARS_PER_PAGE
    ) {
      truncated = true;
      break;
    }
    rows.push(row);
    size += length;
  }
  return {
    rows,
    nextUrl: null,
    nextUrlTooLong: false,
    truncated,
    eventIssues: { malformedScripts, invalidEvents },
  };
}
