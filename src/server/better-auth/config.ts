import { betterAuth } from "better-auth";
import { eq } from "drizzle-orm";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";

import { env } from "@/env";
import { readOAuthCredentials } from "@/lib/oauth-providers";
import { db } from "@/server/db";
import {
  enrollAfterVerification,
  enrollForCreatedUser,
  enrollOnSessionCreated,
} from "@/server/db/enroll-on-auth";
import { account as accountTable, memberProfiles } from "@/server/db/schema";
import { defaultDisplayName } from "@/server/members/default-display-name";
import { checkEarlyAdopterBadge } from "@/lib/gamification";
import { logActivity } from "@/server/agent/activity";
import { sendMemberWelcome } from "@/server/email";
import { getResend } from "@/server/email";
import {
  redeemForCreatedUser,
  redeemAfterVerification,
  redeemOnSessionCreated,
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
import {
  createProviderVerificationGuard,
  releaseUnprovenPassword,
  revertProviderVerification,
} from "./release-unproven-password";
import { createSignInOnReplayedVerification } from "./sign-in-on-replayed-verify";
import { createUnlinkGuard } from "./unlink-guard";

const githubCredentials = readOAuthCredentials("github");
const linkedinCredentials = readOAuthCredentials("linkedin");
const googleCredentials = readOAuthCredentials("google");

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

// Pre-account-takeover guard: an OAuth sign-in that proves the email of an
// account still waiting for confirmation drops that account's password.
const providerVerificationGuard = createProviderVerificationGuard({
  emailVerificationRequired: isEmailVerificationRequired(env.RESEND_API_KEY),
  release: (userId) => releaseUnprovenPassword(db, userId),
  revert: (userId) => revertProviderVerification(db, userId),
});

export const auth = betterAuth({
  baseURL: resolveBetterAuthBaseUrl(authUrlEnv),
  trustedOrigins: (request) => resolveTrustedOrigins(authUrlEnv, request),
  database: drizzleAdapter(db, {
    provider: "pg",
  }),
  user: {
    additionalFields: {
      // First/last name for event organizers (ADR-0038). Not settable through
      // the auth API (input: false): members set them through events.register
      // and members.upsertProfile, which validate them.
      firstName: { type: "string", required: false, input: false },
      lastName: { type: "string", required: false, input: false },
    },
  },
  account: {
    accountLinking: {
      enabled: true,
      // Settings may link a provider whose email differs from the member's.
      allowDifferentEmails: true,
      // No trustedProviders: "trusted" would join an existing account by
      // email even when the provider has not verified that email — anyone
      // could then sign in as a member by registering the member's address
      // with the provider. A join requires the provider's verified email.
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
          // Same self-heal for staff invites: an OAuth join can verify an
          // email without afterEmailVerification running.
          await redeemOnSessionCreated(session).catch(() => {
            /* non-blocking */
          });
        },
      },
    },
    user: {
      update: {
        before: async (data, ctx) => {
          providerVerificationGuard.before(data, ctx);
        },
        after: async (updated, ctx) => {
          await providerVerificationGuard.after(updated, ctx);
        },
      },
      create: {
        after: async (user) => {
          const displayName = defaultDisplayName(user);
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
    ...(githubCredentials ? { github: githubCredentials } : {}),
    ...(linkedinCredentials ? { linkedin: linkedinCredentials } : {}),
    ...(googleCredentials
      ? {
          google: {
            ...googleCredentials,
            // Members with several Google accounts pick one instead of being
            // signed in silently with whichever is active in the browser.
            prompt: "select_account" as const,
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
  // Prefetch burns the first verify GET. Better Auth then redirects the
  // human click without a session; this hook mints one and rebuilds the
  // 302 with Set-Cookie the same way first-verify does.
  hooks: {
    before: createUnlinkGuard((userId) =>
      db
        .select({ providerId: accountTable.providerId })
        .from(accountTable)
        .where(eq(accountTable.userId, userId)),
    ),
    after: createSignInOnReplayedVerification({
      enroll: enrollOnSessionCreated,
    }),
  },
  // Last plugin: Next.js cookies() for auth.api / Server Actions.
  // The verify-email GET goes through toNextJsHandler and sets the
  // session cookie itself once autoSignInAfterVerification is on.
  plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
