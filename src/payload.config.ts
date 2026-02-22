import path from "path";
import { buildConfig } from "payload";
import { postgresAdapter } from "@payloadcms/db-postgres";
import { lexicalEditor } from "@payloadcms/richtext-lexical";

import { Events } from "./collections/Events";
import { Speakers } from "./collections/Speakers";
import { Articles } from "./collections/Articles";
import { Pages } from "./collections/Pages";
import { Media } from "./collections/Media";

export default buildConfig({
  admin: {
    user: "users",
    meta: {
      titleSuffix: " — AIT Admin",
    },
  },
  collections: [Events, Speakers, Articles, Pages, Media, {
    slug: "users",
    auth: true,
    admin: { useAsTitle: "email" },
    fields: [
      { name: "name", type: "text" },
      { name: "role", type: "select", options: ["admin", "editor"], defaultValue: "editor" },
    ],
  }],
  editor: lexicalEditor(),
  db: postgresAdapter({
    pool: { connectionString: process.env.DATABASE_URL! },
  }),
  localization: {
    locales: [
      { label: "English", code: "en" },
      { label: "Nederlands", code: "nl" },
    ],
    defaultLocale: "en",
    fallback: true,
  },
  typescript: {
    outputFile: path.resolve(__dirname, "payload-types.ts"),
  },
  secret: process.env.PAYLOAD_SECRET ?? process.env.BETTER_AUTH_SECRET ?? "dev-secret-change-me",
});
