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

## Connect / disconnect

- Sign-in / sign-up: Continue with LinkedIn (same callback
  `{BETTER_AUTH_URL}/api/auth/callback/linkedin`)
- Settings: `/[locale]/dashboard/settings` — connect via `linkSocial`
- Disconnect uses `members.disconnectSocial`
- Neither GitHub nor LinkedIn can be disconnected if it is the only
  remaining sign-in method

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
   - Settings shows Connect LinkedIn (not the “not configured” copy).
   - Completing OAuth verifies the identity on the public profile.
   - Pasting a LinkedIn URL in the profile form without connecting does
     **not** show a verified badge.

5. **LinkedIn (credentials unset)**
   - Settings shows the “not configured” copy. App still boots.

6. **Agent**
   - Owner connects GitHub + LinkedIn.
   - Agent public page (`/members/{id}/agent`) may show GitHub.
   - Agent page must not show LinkedIn.

7. **Existing pasted URLs**
   - Greg-style profiles still show website / unverified icons when OAuth
     is missing. Verified OAuth identity wins when both exist.
