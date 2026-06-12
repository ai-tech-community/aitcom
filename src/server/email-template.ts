/**
 * Payload-managed email templates with {{variable}} substitution (#168).
 *
 * Tracer bullet: only the event registration confirmation uses this so far.
 * The contract is fail-safe by design — every function here either returns a
 * rendered email or null, and never throws, so a missing/broken template can
 * never block a send (callers fall back to their hardcoded content on null).
 *
 * Substitution rules:
 * - `{{name}}` placeholders (whitespace inside braces is tolerated) are
 *   replaced with the matching variable value.
 * - Unknown variables and null/undefined values render as an empty string.
 * - Values injected into the BODY are HTML-escaped (template HTML is
 *   admin-authored and trusted; variable values come from user data).
 * - Values injected into the SUBJECT are not escaped (subjects are plain
 *   text, not HTML).
 */
export const REGISTRATION_CONFIRMATION_TEMPLATE_KEY =
  "event-registration-confirmation";

export interface EmailTemplateContent {
  subject: string;
  body: string;
}

export type TemplateVars = Record<string, string | null | undefined>;

export interface RenderedEmail {
  subject: string;
  html: string;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const PLACEHOLDER_RE = /\{\{\s*([\w.-]+)\s*\}\}/g;

function substitute(
  text: unknown,
  vars: TemplateVars | null | undefined,
  escapeValues: boolean,
): string {
  if (typeof text !== "string" || text.length === 0) return "";
  return text.replace(PLACEHOLDER_RE, (_match, name: string) => {
    const value = vars?.[name];
    if (value === null || value === undefined) return "";
    const str = String(value);
    return escapeValues ? escapeHtml(str) : str;
  });
}

/**
 * Render a template's subject and body with variable substitution.
 * Pure and total: never throws, regardless of input shape.
 */
export function renderTemplate(
  template: EmailTemplateContent | null | undefined,
  vars: TemplateVars | null | undefined,
): RenderedEmail {
  return {
    subject: substitute(template?.subject, vars, false),
    html: substitute(template?.body, vars, true),
  };
}

/**
 * Load the enabled template for `key` from Payload and render it with `vars`.
 *
 * Returns null — signalling "use the hardcoded fallback" — when the template
 * is missing, disabled, blank, or when anything at all goes wrong while
 * loading it. Never throws.
 */
export async function renderEmailFromTemplate(
  key: string,
  vars: TemplateVars,
): Promise<RenderedEmail | null> {
  try {
    // Lazy import: loading @/server/payload eagerly would drag the whole
    // Payload config into every module that imports @/server/email.
    const { getPayloadClient } = await import("@/server/payload");
    const payload = await getPayloadClient();
    const result = await payload.find({
      collection: "email-templates",
      where: {
        and: [
          { key: { equals: key } },
          // not_equals so rows with a null `enabled` (e.g. seeded via SQL
          // before the checkbox default applied) still count as enabled.
          { enabled: { not_equals: false } },
        ],
      },
      limit: 1,
    });
    const doc = result.docs[0];
    if (!doc) return null;
    const subject = typeof doc.subject === "string" ? doc.subject : "";
    const body = typeof doc.body === "string" ? doc.body : "";
    if (subject.trim() === "" || body.trim() === "") {
      console.warn(
        `[email-template] Template "${key}" found but has a blank subject or body; falling back to built-in email`,
      );
      return null;
    }
    const rendered = renderTemplate({ subject, body }, vars);
    // A template made only of unknown placeholders renders to nothing —
    // treat that as invalid and use the built-in email instead.
    if (rendered.subject.trim() === "" || rendered.html.trim() === "") {
      console.warn(
        `[email-template] Template "${key}" rendered to blank output; falling back to built-in email`,
      );
      return null;
    }
    return rendered;
  } catch (error) {
    console.error(
      `[email-template] Failed to load template "${key}"; falling back to built-in email:`,
      error,
    );
    return null;
  }
}
