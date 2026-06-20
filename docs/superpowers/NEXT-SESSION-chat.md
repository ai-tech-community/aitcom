# Next-session prompt — continue agent-native realtime chat

Paste the block below to resume.

---

Continue the agent-native realtime chat work on branch `feat/realtime-chat` (see its PR).

**Frame:** We extended the **existing** inbox/DM system (NOT a parallel chat), honoring
**ADR-0025** (SSE + Upstash Redis — never WebSockets/Ably). Slice 1 = realtime + MCP-Apps
interactive messages on the existing DM/agent surface; channels/group-DMs/multi-agent are
**Slice 1b (deferred)**. Memory: `inbox-realtime-adr0025`.

**Done + verified:**
- **SSE realtime** (publish-on-write → `/api/inbox/stream` → client hook). **Live E2E PASSED** —
  auth-gated route streams; the open browser tab receives. Upstash creds are in `.env`
  (**rotate the token — it came over chat**). `NEXT_PUBLIC_FEATURE_CHAT=true`.
- **Dedicated 3-pane `/messages` page** (list | conversation | profile), coexists with the
  floating inbox pill.
- **MCP-Apps interactive messages**: `messages.ui_resource`/`ui_producer_trust` cols + migration,
  trust→CSP (`src/lib/chat/trust.ts`, TDD), `/api/inbox/ui-csp`, `inbox.callUiTool` bridge,
  vendored `public/sandbox_proxy.html`, `src/components/inbox/ui-message.tsx` (`AppRenderer` v7).
  **ALL behind `NEXT_PUBLIC_FEATURE_CHAT_UI` (OFF).**

**Do next (priority order):**
1. **Sandbox host.** Stand up a **separate-origin** host for `NEXT_PUBLIC_CHAT_SANDBOX_URL`
   (cheapest: a tiny separate Vercel project serving only `sandbox_proxy.html`). Then turn on
   `FEATURE_CHAT_UI` and run the MCP-UI E2E: agent `agentSendMessage` with a `uiResource` →
   renders in the sandboxed iframe → a button posts back via `onMessage`/`onCallTool`. See plan
   **Phase 5**.
2. **MUST-FIX before MCP-UI ships:** redefine "verified agent" — `inbox.ts` `agentSendMessage`
   currently hardcodes `agentIsVerified = false` (secure default). Wire a real
   `isVerified`/manifest signal or keep agents at the strict CSP tier. See plan Phase 5 note.
3. **Live browser QA of `/messages`** (impeccable): `pnpm dev` + sign in
   `dev@aitcommunity.local` / `devpassword123`, screenshot, tune. Known minors: docked profile
   uses Tailwind `xl` (1280) vs brief's ~1100; no human "last seen" field; no arrow-key row nav.
4. When Tier-1 ships, update **ADR-0025** status (deferred → implemented).
5. (Later) **Slice 1b**: channels + group DMs + third-party agents as members (widen
   `conversations.type`, add `communityId`/visibility, nullable `userId`/`agentId` participants,
   `senderAgentId`, agent trigger policies).

**Key refs:** plan `docs/superpowers/plans/2026-06-20-realtime-chat.md` · spec
`docs/superpowers/specs/2026-06-20-realtime-chat-design.md` · roadmap
`docs/superpowers/specs/2026-06-20-circle-gap-roadmap.md` · ledger
`.superpowers/sdd/progress.md` (gitignored).

**Start by** reading the plan + ledger, confirm the dev server + Upstash still work, then do (1).

---
