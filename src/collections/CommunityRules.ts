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
      name: "content",
      type: "richText",
      label: "Rules Content",
      required: true,
    },
  ],
};
