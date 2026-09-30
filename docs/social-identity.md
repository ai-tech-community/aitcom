# Verified social identity

Member profiles already have optional pasted `linkedinUrl` / `githubUrl` /
`websiteUrl` fields. Those stay as unverified links. This feature binds
**verified** GitHub and LinkedIn identities from OAuth and shows them on the
public profile and the `/members` leaderboard.

Agents are a claimed entity owned by a human. An agent page may show the
owner's verified GitHub. It never presents a verified human LinkedIn.

## GitHub

If the member signed in with GitHub OAuth (or later connects GitHub from
Settings), Better Auth already stores an `app.account` row with
`provider_id = 'github'`. We treat that as verified and resolve the handle
from the GitHub API (`GET /user` with the stored token, falling back to
`GET /user/{id}`).

Do not ask them to paste a GitHub URL for verification.

## LinkedIn

When `BETTER_AUTH_LINKEDIN_CLIENT_ID` and
`BETTER_AUTH_LINKEDIN_CLIENT_SECRET` are both set, LinkedIn appears on
sign-in, sign-up, and Settings. Detection reads `process.env[name]` at
request time so a Vercel runtime secret enables the button without a
rebuild that inlines `undefined`.

A pasted LinkedIn URL alone is not verified.

### Env vars

| Variable                             | Required | Purpose                |
| ------------------------------------ | -------- | ---------------------- |
| `BETTER_AUTH_LINKEDIN_CLIENT_ID`     | No       | LinkedIn app client ID |
| `BETTER_AUTH_LINKEDIN_CLIENT_SECRET` | No       | LinkedIn app secret    |

Both must be set to enable the flow. Create an app at
[LinkedIn Developers](https://www.linkedin.com/developers/apps), add the
**Sign In with LinkedIn using OpenID Connect** product, and set the redirect
URL to:

```
{BETTER_AUTH_URL}/api/auth/callback/linkedin
```

Existing GitHub vars are unchanged:

```
{BETTER_AUTH_URL}/api/auth/callback/github
```

No secrets belong in the repo. Follow `.env.example`.

OpenID Connect does not return a public vanity URL. After connect we store
the LinkedIn `sub` and display name, show a verified badge, and may reuse an
already-pasted `linkedin.com/in/...` URL as the href.

## Google

Google is a sign-in method only. It is **not** a verified identity: a
Gmail address is not a public profile, so nothing is written to
`app.social_identity` and no badge appears on the profile or `/members`.
Settings labels a linked Google account "Connected", not "Verified".
Google profile photos come from `lh3.googleusercontent.com`, which is in
`next.config.js` `images.remotePatterns`.

When `BETTER_AUTH_GOOGLE_CLIENT_ID` and `BETTER_AUTH_GOOGLE_CLIENT_SECRET`
are both set, "Continue with Google" appears first on sign-in and sign-up,
and Settings offers Connect Google. Detection is the same request-time read
as LinkedIn.

Create an OAuth client in Google Cloud Console (Google Auth Platform →
Clients → Web application) with redirect URI:

```
{BETTER_AUTH_URL}/api/auth/callback/google
```

Google accepts exact redirect URIs only, so Google sign-in works on
production and localhost but not on `*.vercel.app` previews.

Signing in with Google using the same email as an existing account joins
that account when Google reports the email as verified.

## Joining by email needs a verified provider email

No provider is in Better Auth's `trustedProviders`. A trusted provider joins
an existing account by email even when the provider has not verified that
email, so anyone could register a member's address with GitHub or LinkedIn
and sign in as that member. Without trust, an OAuth sign-in joins an existing
account (and Settings can link a provider) only when the provider reports
its email as verified. This also applies to Connect in Settings: a GitHub
or LinkedIn account whose email is unverified at the provider can no longer
be linked.

A failed OAuth sign-in or connect returns to the same page with
`?error=<code>`. The sign-in buttons and Settings show a plain message
(`oauthErrorMessageKey` in `src/lib/auth-errors.ts`): unconfirmed provider
email, account already used by another member, or a general failure. A
cancelled consent screen shows nothing.

## Joining a waiting account (takeover guard)

With email verification on, an email+password sign-up cannot sign in until
someone clicks the emailed link, and anyone can start such a sign-up for any
address. If the real owner later signs in with an OAuth provider using that
address, Better Auth joins the two and marks the email verified.

Better Auth marks the email verified during an OAuth callback only when the
provider's verified email equals the account's email. The
`databaseHooks.user.update` pair in `config.ts`
(`createProviderVerificationGuard` in
`src/server/better-auth/release-unproven-password.ts`) watches for exactly
that update: `before` sees an OAuth callback set `emailVerified: true`,
`after` deletes that user's password account and all sessions in one
transaction. The person who proved the email keeps the account; the
stranger's password is gone. Clicking the emailed link (`/verify-email`)
and linking from Settings never trigger it. `/sign-in/social` with a provider
ID token runs the same join, so it is covered too. If the release fails, the
guard sets `emailVerified` back to false before failing the sign-in, so the
next attempt makes the same update and the guard runs again. The guard is
off when email verification is not required (no `RESEND_API_KEY`).

Because such a join verifies the email without
`emailVerification.afterEmailVerification`, pending staff invites are also
redeemed on session creation (`redeemOnSessionCreated`, idempotent).

## Provider registry

`src/lib/oauth-providers.ts` lists every OAuth sign-in provider, its env
vars, and display order. Better Auth config, the auth-page buttons,
Settings, `members.getAuthProviders`, and `members.disconnectSocial` all
read it. Adding a provider is one registry entry plus its icon in
`src/components/auth/oauth-provider-icon.tsx` and its copy keys.

## Connect / disconnect

- Sign-in / sign-up: Continue with LinkedIn (same callback
  `{BETTER_AUTH_URL}/api/auth/callback/linkedin`)
- Sign-in / sign-up: Continue with Google (when configured)
- Settings: `/[locale]/dashboard/settings` — connect via `linkSocial`
- Disconnect uses `members.disconnectSocial`
- No OAuth provider (Google, GitHub, LinkedIn) can be disconnected if it
  is the only remaining working sign-in method (a password, or another
  linked provider that is still configured). Enforced on Better Auth's
  `POST /unlink-account` itself (`unlink-guard.ts`), not only in
  `members.disconnectSocial`, and it covers removing the password too

## Schema

`app.social_identity` (see `src/migrations/20260817a_social_identity.ts`):

- unique `(user_id, provider)`
- unique `(provider, provider_account_id)`

## Manual test plan

1. **GitHub sign-in user**
   - Sign up / sign in with GitHub.
   - Open Settings: GitHub shows as verified with `@handle`.
   - Open the public profile and `/members`: GitHub handle + verified mark.
   - Do not see a new empty GitHub URL field.

2. **Email+password user, no GitHub**
   - Settings: Connect GitHub → OAuth → returns to Settings verified.
   - Leaderboard shows the GitHub mark after connect.
   - Disconnect GitHub succeeds (password remains).

3. **GitHub-only user**
   - Disconnect GitHub is disabled with the password hint.

4. **LinkedIn (credentials set)**
   - Sign-in and sign-up show **Continue with LinkedIn** next to GitHub.
   - Settings shows Connect LinkedIn.
   - Completing OAuth verifies the identity on the public profile.
   - Pasting a LinkedIn URL in the profile form without connecting does
     **not** show a verified badge.

5. **LinkedIn (credentials unset)**
   - Settings hides LinkedIn unless the member already linked it. App
     still boots.

6. **Google (credentials set)**
   - Sign-in and sign-up show **Continue with Google** first.
   - New Google user lands signed in; Settings shows Google "Connected"
     with no handle; profile and `/members` show no Google mark.
   - Email+password user with the same address signs in with Google →
     same account (no duplicate).
   - Google-only user cannot disconnect Google (hint shown).
   - Sign up with email+password but do not confirm. Then sign in with
     Google using that address → signed in; the old password no longer
     works.

7. **Agent**
   - Owner connects GitHub + LinkedIn.
   - Agent public page (`/members/{id}/agent`) may show GitHub.
   - Agent page must not show LinkedIn.

8. **Existing pasted URLs**
   - Greg-style profiles still show website / unverified icons when OAuth
     is missing. Verified OAuth identity wins when both exist.
