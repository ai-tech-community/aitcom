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

LinkedIn is **not** a sign-in method in the UI. Members connect it from
`/dashboard/settings` via Better Auth `linkSocial`. A pasted LinkedIn URL
alone is not verified.

LinkedIn OAuth is optional and gated on env vars. Without credentials the
connect button is hidden and Settings explains that the server is not
configured.

### Env vars

| Variable | Required | Purpose |
| --- | --- | --- |
| `BETTER_AUTH_LINKEDIN_CLIENT_ID` | No | LinkedIn app client ID |
| `BETTER_AUTH_LINKEDIN_CLIENT_SECRET` | No | LinkedIn app secret |

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

- Settings: `/[locale]/dashboard/settings`
- Connect uses `authClient.linkSocial` (OAuth redirect)
- Disconnect uses `members.disconnectSocial`
- GitHub cannot be disconnected if it is the only remaining sign-in method
  (add a password first)
- LinkedIn is verification-only, so it can always be disconnected

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
   - Settings: Connect LinkedIn → OAuth → verified badge.
   - Public profile and leaderboard show a verified LinkedIn mark.
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
