import { type Config } from "drizzle-kit";

import { env } from "@/env";

// Drizzle-managed tables live in the "app" schema; Payload CMS uses "public".
// schemaFilter ensures drizzle-kit only manages the "app" schema and never
// touches Payload's tables or enums.
export default {
  schema: "./src/server/db/schema.ts",
  dialect: "postgresql",
  casing: "snake_case",
  dbCredentials: {
    url: env.DATABASE_URL,
  },
  schemaFilter: ["app"],
} satisfies Config;
