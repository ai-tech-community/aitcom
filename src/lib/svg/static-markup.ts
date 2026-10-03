/**
 * SVG markup from a React element tree, without react-dom/server (which
 * Next.js does not allow in route handlers). For drawing a component such
 * as `BadgeEmblem` into an image (the Open Graph renderer only takes static
 * SVG). Components in the tree must be pure: function and forwardRef
 * components are called directly, so a hook in one throws.
 */
import { Fragment, isValidElement, type ReactNode } from "react";

const FORWARD_REF = Symbol.for("react.forward_ref");
const MEMO = Symbol.for("react.memo");

/** SVG attributes that keep their camelCase name in markup. */
const CAMEL_CASE_ATTRIBUTES = new Set([
  "viewBox",
  "pathLength",
  "preserveAspectRatio",
  "gradientUnits",
  "gradientTransform",
  "patternUnits",
  "patternTransform",
  "clipPathUnits",
  "maskUnits",
  "maskContentUnits",
  "markerWidth",
  "markerHeight",
  "refX",
  "refY",
]);

const SKIPPED_PROPS = new Set(["children", "key", "ref"]);

/** Attributes React writes as "false" rather than leaving out. */
function keepsFalse(prop: string): boolean {
  return prop === "focusable" || prop.startsWith("aria-");
}

function escape(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function kebab(name: string): string {
  return name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

function attributeName(prop: string): string {
  if (prop === "className") return "class";
  if (prop === "xlinkHref") return "xlink:href";
  if (CAMEL_CASE_ATTRIBUTES.has(prop) || prop.includes("-")) return prop;
  return kebab(prop);
}

function styleText(style: Record<string, unknown>): string {
  return Object.entries(style)
    .filter(
      ([, value]) => value !== undefined && value !== null && value !== "",
    )
    .map(
      ([key, value]) =>
        `${key.startsWith("--") ? key : kebab(key)}:${String(value)}`,
    )
    .join(";");
}

function attributes(props: Record<string, unknown>): string {
  let out = "";
  for (const [prop, value] of Object.entries(props)) {
    if (SKIPPED_PROPS.has(prop)) continue;
    if (value === undefined || value === null) continue;
    if (value === false && !keepsFalse(prop)) continue;
    if (typeof value === "function") continue;
    let text: string;
    if (typeof value === "object") {
      // Only a style object has a markup form; anything else is skipped.
      if (prop !== "style") continue;
      text = styleText(value as Record<string, unknown>);
    } else {
      text = String(value as string | number | boolean | bigint | symbol);
    }
    if (prop === "style" && text === "") continue;
    out += ` ${attributeName(prop)}="${escape(text)}"`;
  }
  return out;
}

function render(node: ReactNode, root: boolean): string {
  if (node === null || node === undefined || typeof node === "boolean") {
    return "";
  }
  if (typeof node === "string" || typeof node === "number") {
    return escape(String(node));
  }
  if (Array.isArray(node)) {
    return node.map((child: ReactNode) => render(child, root)).join("");
  }
  if (!isValidElement(node)) return "";

  const props = (node.props ?? {}) as Record<string, unknown> & {
    children?: ReactNode;
  };
  const type = node.type as unknown;
  if (type === Fragment) return render(props.children, root);
  if (typeof type === "function") {
    return render((type as (p: unknown) => ReactNode)(props), root);
  }
  if (typeof type === "object" && type !== null) {
    const exotic = type as {
      $$typeof?: symbol;
      render?: (p: unknown, ref: unknown) => ReactNode;
      type?: unknown;
    };
    if (exotic.$$typeof === FORWARD_REF && exotic.render) {
      return render(exotic.render(props, null), root);
    }
    if (exotic.$$typeof === MEMO) {
      return render({ ...node, type: exotic.type } as ReactNode, root);
    }
    throw new Error("staticSvgMarkup: unsupported element type");
  }
  if (typeof type !== "string") {
    throw new Error("staticSvgMarkup: unsupported element type");
  }

  const ownProps =
    root && type === "svg" && !("xmlns" in props)
      ? { xmlns: "http://www.w3.org/2000/svg", ...props }
      : props;
  return `<${type}${attributes(ownProps)}>${render(props.children, false)}</${type}>`;
}

/** The SVG markup of a hook-free element tree whose root is an `<svg>`. */
export function staticSvgMarkup(element: ReactNode): string {
  return render(element, true);
}

/** The same markup as a `data:` URL, for an `<img src>`. */
export function svgDataUrl(markup: string): string {
  return `data:image/svg+xml;base64,${Buffer.from(markup, "utf-8").toString("base64")}`;
}
