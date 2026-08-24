import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";

import { env } from "@/env";
import { readLinkedinOAuthCredentials } from "@/lib/linkedin-oauth-env";
import { db } from "@/server/db";
import {
  enrollAfterVerification,
  enrollForCreatedUser,
  enrollOnSessionCreated,
} from "@/server/db/enroll-on-auth";
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
import {
  resolveBetterAuthBaseUrl,
  resolveSessionCookieDomain,
  resolveTrustedOrigins,
} from "./base-url";
import {
  isEmailVerificationRequired,
  sendVerificationEmail,
} from "./send-verification-email";

const linkedinCredentials = readLinkedinOAuthCredentials();

const authUrlEnv = {
  BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
  BETTER_AUTH_BASE_URL: process.env.BETTER_AUTH_BASE_URL,
  NEXT_PUBLIC_APP_URL: env.NEXT_PUBLIC_APP_URL,
  NODE_ENV: env.NODE_ENV,
  PORT: process.env.PORT,
  VERCEL_ENV: process.env.VERCEL_ENV,
  VERCEL_URL: process.env.VERCEL_URL,
  VERCEL_BRANCH_URL: process.env.VERCEL_BRANCH_URL,
  BETTER_AUTH_TRUSTED_ORIGINS: process.env.BETTER_AUTH_TRUSTED_ORIGINS,
};

const sessionCookieDomain = resolveSessionCookieDomain(authUrlEnv);

export const auth = betterAuth({
  baseURL: resolveBetterAuthBaseUrl(authUrlEnv),
  trustedOrigins: (request) => resolveTrustedOrigins(authUrlEnv, request),
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
    session: {
      create: {
        after: async (session) => {
          // User row is committed by first sign-in. Retries Hub enrolment
          // if user.create.after missed it (email+password / Neon FK).
          await enrollOnSessionCreated(session).catch(() => {
            /* non-blocking: getMyCommunities also self-heals */
          });
        },
      },
    },
    user: {
      create: {
        after: async (user) => {
          const displayName = user.name || user.email.split("@")[0]!;
          try {
            await db.insert(memberProfiles).values({
              userId: user.id,
              displayName,
            });
          } catch {
            /* don't skip Hub enrolment if the profile insert races */
          }
          // Universal Hub enrolment (ADR-0019). No community.joined event —
          // that would pollute discovery liveness for the root row.
          // Isolated so a failed insert (uncommitted user row on a second
          // Neon connection) cannot skip welcome / badge / activity.
          await enrollForCreatedUser(user).catch(() => {
            /* retried on verify, first session, and getMyCommunities */
          });
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
    requireEmailVerification: isEmailVerificationRequired(env.RESEND_API_KEY),
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
    // Better Auth only enables POST /send-verification-email (and signup /
    // sign-in dispatch) when this callback lives here — not under
    // emailAndPassword. Missing it returns VERIFICATION_EMAIL_ISNT_ENABLED.
    sendOnSignUp: true,
    sendOnSignIn: true,
    // requireEmailVerification blocks signup from creating a session. Without
    // this, /api/auth/verify-email confirms the address, redirects to
    // callbackURL, and never sets better-auth.session_token /
    // __Secure-better-auth.session_token — the leftover signed-out landing.
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({
      user,
      url,
    }: {
      user: { email: string; name?: string | null };
      url: string;
    }) => {
      await sendVerificationEmail({ user, url });
    },
    afterEmailVerification: async (user: { id: string; email: string }) => {
      await enrollAfterVerification(user).catch(() => {
        /* non-blocking: session.create / getMyCommunities also retry */
      });
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
  advanced: sessionCookieDomain
    ? {
        crossSubDomainCookies: {
          enabled: true,
          domain: sessionCookieDomain,
        },
      }
    : {},
  // Last plugin: Next.js cookies() for auth.api / Server Actions.
  // The verify-email GET goes through toNextJsHandler and sets the
  // session cookie itself once autoSignInAfterVerification is on.
  plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
