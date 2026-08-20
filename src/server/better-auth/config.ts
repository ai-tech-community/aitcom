import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

import { env } from "@/env";
import { readLinkedinOAuthCredentials } from "@/lib/linkedin-oauth-env";
import { db } from "@/server/db";
import { enrollInHub } from "@/server/db/enroll-in-hub";
import { memberProfiles } from "@/server/db/schema";
import { checkEarlyAdopterBadge } from "@/lib/gamification";
import { logActivity } from "@/server/agent/activity";
import { sendMemberWelcome } from "@/server/email";
import { getResend } from "@/server/email";
import {
  redeemForCreatedUser,
  redeemAfterVerification,
} from "@/server/hackathon/redeem-on-auth";
import {
  onAuthAccountCreated,
  onAuthAccountDeleted,
} from "@/server/social/sync";
import { resolveBetterAuthBaseUrl, resolveTrustedOrigins } from "./base-url";

const linkedinCredentials = readLinkedinOAuthCredentials();

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
  account: {
    accountLinking: {
      enabled: true,
      // LinkedIn email is optional and may differ from the member email.
      allowDifferentEmails: true,
      trustedProviders: ["github", "linkedin"],
    },
  },
  databaseHooks: {
    account: {
      create: {
        after: async (created) => {
          await onAuthAccountCreated(created);
        },
      },
      delete: {
        after: async (deleted) => {
          await onAuthAccountDeleted(deleted);
        },
      },
    },
    user: {
      create: {
        after: async (user) => {
          const displayName = user.name || user.email.split("@")[0]!;
          await db.insert(memberProfiles).values({
            userId: user.id,
            displayName,
          });
          // Universal Hub enrolment (ADR-0019). No community.joined event —
          // that would pollute discovery liveness for the root row.
          await enrollInHub(db, user.id);
          await checkEarlyAdopterBadge(db, user.id);
          await logActivity(db, {
            actorId: user.id,
            actorType: "member",
            action: "member.joined",
            targetType: "member_profile",
            targetId: user.id,
            metadata: { displayName },
          });
          sendMemberWelcome(user.email, displayName).catch(() => {
            /* non-blocking */
          });
          redeemForCreatedUser(user).catch(() => {
            /* non-blocking: a failed redemption must never fail signup */
          });
        },
      },
    },
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    sendVerificationEmail: async ({
      user,
      url,
    }: {
      user: { email: string; name?: string | null };
      url: string;
    }) => {
      const resend = getResend();
      if (!resend) return;
      await resend.emails.send({
        from: "AIT Community <noreply@mailer.aitcommunity.org>",
        to: user.email,
        subject: "Verify your email — AIT Community",
        html: `<p>Hi ${user.name ?? "there"},</p><p>Please verify your email by clicking <a href="${url}">this link</a>.</p>`,
      });
    },
    sendResetPassword: async ({
      user,
      url,
    }: {
      user: { email: string; name?: string | null };
      url: string;
    }) => {
      const resend = getResend();
      if (!resend) return;
      void resend.emails.send({
        from: "AIT Community <noreply@mailer.aitcommunity.org>",
        to: user.email,
        subject: "Reset your password — AIT Community",
        html: `<p>Hi ${user.name ?? "there"},</p><p>You requested a password reset. Click <a href="${url}">this link</a> to set a new password.</p><p>If you didn't request this, you can safely ignore this email.</p>`,
      });
    },
  },
  emailVerification: {
    afterEmailVerification: async (user: { id: string; email: string }) => {
      await redeemAfterVerification(user).catch(() => {
        /* non-blocking */
      });
    },
  },
  socialProviders: {
    github: {
      clientId: env.BETTER_AUTH_GITHUB_CLIENT_ID,
      clientSecret: env.BETTER_AUTH_GITHUB_CLIENT_SECRET,
    },
    ...(linkedinCredentials
      ? {
          linkedin: {
            clientId: linkedinCredentials.clientId,
            clientSecret: linkedinCredentials.clientSecret,
          },
        }
      : {}),
  },
});

export type Session = typeof auth.$Infer.Session;
