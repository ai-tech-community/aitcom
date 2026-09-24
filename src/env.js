import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  /**
   * Specify your server-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars.
   */
  server: {
    BETTER_AUTH_SECRET: z.string(),
    BETTER_AUTH_URL: z.string().url().optional(),
    BETTER_AUTH_BASE_URL: z.string().url().optional(),
    BETTER_AUTH_GITHUB_CLIENT_ID: z.string(),
    BETTER_AUTH_GITHUB_CLIENT_SECRET: z.string(),
    BETTER_AUTH_LINKEDIN_CLIENT_ID: z.string().optional(),
    BETTER_AUTH_LINKEDIN_CLIENT_SECRET: z.string().optional(),
    // Comma/space-separated extra origins. Preview hosts come from VERCEL_URL.
    BETTER_AUTH_TRUSTED_ORIGINS: z.string().optional(),
    DATABASE_URL: z.string(),
    // Local-only: host:port of the wsproxy container used to reach a Dockerised
    // Postgres (e.g. "wsproxy:80"). Unset in production. See ADR-0020.
    NEON_LOCAL_PROXY: z.string().optional(),
    PAYLOAD_SECRET: z.string().optional(),
    RESEND_API_KEY: z.string().optional(),
    MOLLIE_API_KEY: z.string().optional(),
    LUMA_ENCRYPTION_KEY: z.string().length(64).optional(),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),
    S3_BUCKET: z.string().optional(),
    S3_REGION: z.string().optional(),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    UPSTASH_REDIS_REST_URL: z.string().url().optional(),
    UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
  },

  /**
   * Specify your client-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars. To expose them to the client, prefix them with
   * `NEXT_PUBLIC_`.
   */
  client: {
    NEXT_PUBLIC_APP_URL: z.string().url().optional(),
    NEXT_PUBLIC_FEATURE_CHAT: z.enum(["true", "false"]).default("false"),
    NEXT_PUBLIC_FEATURE_CHAT_UI: z.enum(["true", "false"]).default("false"),
    NEXT_PUBLIC_CHAT_SANDBOX_URL: z.string().url().optional(),
  },

  /**
   * You can't destruct `process.env` as a regular object in the Next.js edge runtimes (e.g.
   * middlewares) or client-side so we need to destruct manually.
   */
  runtimeEnv: {
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
    BETTER_AUTH_BASE_URL: process.env.BETTER_AUTH_BASE_URL,
    BETTER_AUTH_GITHUB_CLIENT_ID: process.env.BETTER_AUTH_GITHUB_CLIENT_ID,
    BETTER_AUTH_GITHUB_CLIENT_SECRET:
      process.env.BETTER_AUTH_GITHUB_CLIENT_SECRET,
    // Computed keys: Next.js may inline `process.env.BETTER_AUTH_LINKEDIN_*`
    // as undefined at build time if the optional secrets were runtime-only.
    BETTER_AUTH_LINKEDIN_CLIENT_ID:
      process.env["BETTER_AUTH_LINKEDIN_CLIENT_ID"],
    BETTER_AUTH_LINKEDIN_CLIENT_SECRET:
      process.env["BETTER_AUTH_LINKEDIN_CLIENT_SECRET"],
    BETTER_AUTH_TRUSTED_ORIGINS: process.env.BETTER_AUTH_TRUSTED_ORIGINS,
    DATABASE_URL: process.env.DATABASE_URL,
    NEON_LOCAL_PROXY: process.env.NEON_LOCAL_PROXY,
    PAYLOAD_SECRET: process.env.PAYLOAD_SECRET,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    MOLLIE_API_KEY: process.env.MOLLIE_API_KEY,
    LUMA_ENCRYPTION_KEY: process.env.LUMA_ENCRYPTION_KEY,
    S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID,
    S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY,
    S3_BUCKET: process.env.S3_BUCKET,
    S3_REGION: process.env.S3_REGION,
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
    NEXT_PUBLIC_FEATURE_CHAT: process.env.NEXT_PUBLIC_FEATURE_CHAT,
    NEXT_PUBLIC_FEATURE_CHAT_UI: process.env.NEXT_PUBLIC_FEATURE_CHAT_UI,
    NEXT_PUBLIC_CHAT_SANDBOX_URL: process.env.NEXT_PUBLIC_CHAT_SANDBOX_URL,
  },
  /**
   * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially
   * useful for Docker builds.
   */
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  /**
   * Makes it so that empty strings are treated as undefined. `SOME_VAR: z.string()` and
   * `SOME_VAR=''` will throw an error.
   */
  emptyStringAsUndefined: true,
});
