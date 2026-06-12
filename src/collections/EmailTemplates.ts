import type { CollectionConfig, FieldHook, TypeWithID } from "payload";

/** Trim surrounding whitespace from the key so lookups match exactly. */
const trimKey: FieldHook<TypeWithID, unknown> = ({ value }) =>
  typeof value === "string" ? value.trim() : value;

/**
 * Organizer-editable email templates (#168, tracer bullet).
 *
 * Each template is looked up by `key` at send time. The send path renders the
 * template with `{{variable}}` substitution and falls back to the hardcoded
 * email when the template is missing, disabled, or empty — sending is never
 * blocked by template content.
 *
 * Versions/drafts are intentionally disabled to keep the schema to a single
 * table while the pattern proves out.
 */
export const EmailTemplates: CollectionConfig = {
  slug: "email-templates",
  admin: {
    useAsTitle: "key",
    defaultColumns: ["key", "subject", "enabled"],
    description:
      "Editable email templates. Use {{variable}} placeholders; unknown " +
      "variables render as empty text. Variables for " +
      '"event-registration-confirmation": {{name}}, {{eventTitle}}, ' +
      "{{eventDate}}, {{eventTime}}, {{eventLocation}}, {{eventSlug}}, " +
      "{{eventUrl}}. Note: {{eventTime}} may be empty when the event has no " +
      "start time set.",
  },
  fields: [
    {
      name: "key",
      type: "text",
      required: true,
      unique: true,
      index: true,
      hooks: {
        beforeValidate: [trimKey],
      },
      validate: (value: string | null | undefined) => {
        if (typeof value !== "string" || !/^[\w-]+$/.test(value)) {
          return "Key may only contain letters, numbers, underscores, and hyphens (e.g. \"event-registration-confirmation\").";
        }
        return true;
      },
      admin: {
        description:
          'Template identifier used by the send path, e.g. "event-registration-confirmation".',
      },
    },
    {
      name: "subject",
      type: "text",
      required: true,
      admin: {
        description:
          "Email subject line. Supports {{variable}} placeholders (plain text, not HTML).",
      },
    },
    {
      name: "body",
      type: "textarea",
      required: true,
      admin: {
        description:
          "Email body HTML. Supports {{variable}} placeholders; variable " +
          "values are HTML-escaped when inserted.",
        rows: 20,
      },
    },
    {
      name: "enabled",
      type: "checkbox",
      defaultValue: true,
      admin: {
        description:
          "Untick to ignore this template and fall back to the built-in email.",
      },
    },
  ],
  timestamps: true,
};
