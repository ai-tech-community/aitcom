import type { GlobalConfig } from "payload";

export const CommunityRules: GlobalConfig = {
  slug: "community-rules",
  label: "Community Rules",
  admin: {
    description:
      "The community code of conduct displayed on the Community board.",
  },
  fields: [
    {
      name: "version",
      type: "number",
      label: "Version",
      required: true,
      defaultValue: 1,
      admin: {
        description:
          "Increment when rules change to require re-acceptance from users.",
      },
    },
    {
      name: "effectiveDate",
      type: "date",
      label: "Effective Date",
      required: true,
      admin: {
        description: "When this version of the rules takes effect.",
        date: {
          pickerAppearance: "dayOnly",
          displayFormat: "d MMM yyyy",
        },
      },
    },
    {
      name: "sections",
      type: "array",
      label: "Sections",
      required: true,
      minRows: 1,
      admin: {
        description: "Structured rule sections with table-of-contents support.",
      },
      fields: [
        {
          name: "title",
          type: "text",
          label: "Title",
          required: true,
          localized: true,
        },
        {
          name: "slug",
          type: "text",
          label: "Slug",
          required: true,
          admin: {
            description: "URL-friendly identifier for anchor links (e.g. 'respect-others').",
          },
        },
        {
          name: "icon",
          type: "select",
          label: "Icon",
          options: [
            { label: "Shield", value: "shield" },
            { label: "Users", value: "users" },
            { label: "Flag", value: "flag" },
            { label: "Scale", value: "scale" },
            { label: "Brain", value: "brain" },
            { label: "Gavel", value: "gavel" },
          ],
        },
        {
          name: "content",
          type: "richText",
          label: "Content",
          required: true,
          localized: true,
        },
      ],
    },
  ],
};
