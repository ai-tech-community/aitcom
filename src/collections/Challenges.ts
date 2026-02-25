import type { CollectionConfig } from "payload";

export const Challenges: CollectionConfig = {
  slug: "challenges",
  admin: {
    useAsTitle: "title",
    defaultColumns: ["title", "type", "status", "difficulty", "startsAt"],
    description:
      "Unified challenges: platform-action, repo-based, or mixed. Supports sponsor publishing, test verification, and agent collaboration.",
  },
  fields: [
    { name: "title", type: "text", required: true },
    {
      name: "slug",
      type: "text",
      required: true,
      unique: true,
      admin: { position: "sidebar" },
    },
    { name: "description", type: "richText", required: true },
    {
      name: "type",
      type: "select",
      required: true,
      options: [
        { label: "Weekly", value: "weekly" },
        { label: "Monthly", value: "monthly" },
        { label: "Open-Ended", value: "open-ended" },
      ],
      admin: { position: "sidebar" },
    },
    {
      name: "status",
      type: "select",
      required: true,
      defaultValue: "draft",
      options: [
        { label: "Draft", value: "draft" },
        { label: "Active", value: "active" },
        { label: "Completed", value: "completed" },
        { label: "Archived", value: "archived" },
      ],
      admin: { position: "sidebar" },
    },
    {
      name: "difficulty",
      type: "select",
      required: true,
      defaultValue: "beginner",
      options: [
        { label: "Beginner", value: "beginner" },
        { label: "Intermediate", value: "intermediate" },
        { label: "Advanced", value: "advanced" },
        { label: "Expert", value: "expert" },
      ],
      admin: { position: "sidebar" },
    },
    {
      name: "startsAt",
      type: "date",
      admin: {
        position: "sidebar",
        description: "Optional for open-ended challenges.",
      },
    },
    {
      name: "endsAt",
      type: "date",
      admin: {
        position: "sidebar",
        description: "Optional for open-ended challenges.",
      },
    },
    {
      name: "publishedBy",
      type: "select",
      required: true,
      defaultValue: "member",
      options: [
        { label: "Member", value: "member" },
        { label: "Sponsor", value: "sponsor" },
      ],
      admin: { position: "sidebar" },
    },
    {
      name: "creatorId",
      type: "text",
      required: true,
      admin: {
        position: "sidebar",
        description: "User ID or Sponsor ID of the challenge creator.",
      },
    },
    {
      name: "repo",
      type: "group",
      admin: {
        description: "GitHub repo configuration for repo-based challenges.",
      },
      fields: [
        {
          name: "templateUrl",
          type: "text",
          admin: {
            description:
              "GitHub template repo URL (e.g., https://github.com/org/repo).",
          },
        },
        {
          name: "configFile",
          type: "checkbox",
          defaultValue: false,
          admin: {
            description:
              "Whether .aitchallenge.yml is expected in participant repos.",
          },
        },
        {
          name: "testCommand",
          type: "text",
          admin: {
            description:
              'Shell command to run tests (e.g., "npm test", "pytest").',
          },
        },
      ],
    },
    {
      name: "objectives",
      type: "array",
      required: true,
      minRows: 1,
      maxRows: 10,
      fields: [
        {
          name: "description",
          type: "text",
          required: true,
        },
        {
          name: "verification",
          type: "select",
          required: true,
          defaultValue: "self-report",
          options: [
            { label: "Platform Action", value: "platform-action" },
            { label: "Test", value: "test" },
            { label: "Self-Report", value: "self-report" },
            { label: "Peer Review", value: "peer-review" },
          ],
        },
        {
          name: "action",
          type: "select",
          options: [
            { label: "Reply to thread", value: "thread.reply" },
            { label: "Create thread", value: "thread.create" },
            { label: "Share knowledge", value: "knowledge.share" },
            { label: "Submit idea", value: "idea.submitted" },
            { label: "Vote on idea", value: "idea.voted" },
          ],
          admin: {
            description: "Only for platform-action verification.",
            condition: (_, siblingData) =>
              siblingData?.verification === "platform-action",
          },
        },
        {
          name: "testPattern",
          type: "text",
          admin: {
            description:
              "Regex matching test names/files for test verification.",
            condition: (_, siblingData) =>
              siblingData?.verification === "test",
          },
        },
        {
          name: "targetCount",
          type: "number",
          required: true,
          min: 1,
          defaultValue: 1,
          admin: {
            description:
              "How many times this must be completed. For tests, usually 1.",
          },
        },
        {
          name: "filter",
          type: "json",
          admin: {
            description:
              'Optional scope filter for platform-action, e.g. { "category": "question" }.',
          },
        },
      ],
    },
    {
      name: "rewards",
      type: "group",
      fields: [
        {
          name: "xpReward",
          type: "number",
          required: true,
          min: 0,
          defaultValue: 0,
          admin: { description: "XP awarded on completion." },
        },
        {
          name: "badgeReward",
          type: "text",
          admin: {
            description: "Badge slug to award on completion (optional).",
          },
        },
        {
          name: "sponsorReward",
          type: "text",
          admin: {
            description:
              "Sponsor-provided reward description (prizes, interviews, licenses).",
          },
        },
      ],
    },
    {
      name: "maxParticipants",
      type: "number",
      defaultValue: 0,
      admin: {
        position: "sidebar",
        description: "0 = unlimited.",
      },
    },
    {
      name: "tags",
      type: "json",
      admin: {
        description:
          'Array of tags for discovery, e.g. ["mcp", "typescript", "automation"].',
      },
    },
    {
      name: "rankingMode",
      type: "select",
      defaultValue: "speed",
      options: [
        { label: "Speed", value: "speed" },
        { label: "Thoroughness", value: "thoroughness" },
        { label: "Collaboration", value: "collaboration" },
      ],
      admin: {
        position: "sidebar",
        description: "How the leaderboard is sorted.",
      },
    },
    {
      name: "proposedBy",
      type: "text",
      admin: {
        position: "sidebar",
        description: "User ID if community-proposed.",
      },
    },
    { name: "image", type: "upload", relationTo: "media" },
  ],
  timestamps: true,
};
