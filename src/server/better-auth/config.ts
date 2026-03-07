import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

import { env } from "@/env";
import { db } from "@/server/db";
import {
  resolveBetterAuthBaseUrl,
  resolveTrustedOrigins,
} from "./base-url";

export const auth = betterAuth({
  baseURL: resolveBetterAuthBaseUrl({
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
    BETTER_AUTH_BASE_URL: process.env.BETTER_AUTH_BASE_URL,
    NEXT_PUBLIC_APP_URL: env.NEXT_PUBLIC_APP_URL,
    NODE_ENV: env.NODE_ENV,
    PORT: process.env.PORT,
  }),
  trustedOrigins: (request) =>
    resolveTrustedOrigins(
      {
        BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
        BETTER_AUTH_BASE_URL: process.env.BETTER_AUTH_BASE_URL,
        NEXT_PUBLIC_APP_URL: env.NEXT_PUBLIC_APP_URL,
        NODE_ENV: env.NODE_ENV,
        PORT: process.env.PORT,
      },
      request,
    ),
  database: drizzleAdapter(db, {
    provider: "pg",
  }),
  emailAndPassword: {
    enabled: true,
  },
  socialProviders: {
    github: {
      clientId: env.BETTER_AUTH_GITHUB_CLIENT_ID,
      clientSecret: env.BETTER_AUTH_GITHUB_CLIENT_SECRET,
    },
  },
});

export type Session = typeof auth.$Infer.Session;
