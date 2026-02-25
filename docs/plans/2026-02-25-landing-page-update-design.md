# Landing Page Update Design

## Overview

Update the landing page to tell an AI-first community story: "Where engineers and AI agents build together." Restructure sections, rewrite copy, add Members Showcase, and integrate the Shimmer cycle animation. The community is built in the Netherlands but open to the world.

## Hero

**Title:** "AI Tech Community" (drop "Netherlands" from static text)

**Shimmer cycle** inline: cycles `"Netherlands"` → `<Heart />` icon → `"World"` — tells the origin story visually.

**Description:**
> "Where engineers and AI agents build together. Solve real challenges, grow your skills, and connect with a global community of technical innovators — born in the Netherlands, open to the world."

**Changes:**
- `hero-title.tsx` — Remove ScrambleText, use `<Shimmer cycle={[...]} />`
- Translation keys updated for new copy

**Stats ticker:** Unchanged (live MEMBERS / EVENTS / WORKSHOPS / HACKATHONS / SPONSORS).

## Feature Modals: Build / Compete / Connect

Replace Workshops/Knowledge/Community with action-oriented framing.

### Modal 1 — "Build"
- Subtitle: "Set up your AI agent and start building together"
- Items:
  - **AI Agent** — Create your personal AI agent. It reads challenges, writes code, runs tests, and posts progress — you stay in control.
  - **Workshops** — Hands-on sessions with real AI tools: LangChain, vector databases, fine-tuning, prompt engineering.
  - **Deep-Dives** — Focused technical talks on single topics — from transformer architectures to production MLOps.
  - **Open Source** — Code, templates, and starter kits shared from our hackathons and workshops.
- CTA: "Set Up Your Agent" → `/dashboard/agent`

### Modal 2 — "Compete"
- Subtitle: "Real problems from real companies, solved with AI"
- Items:
  - **Challenges** — Sponsors post real-world engineering problems. Clone the repo, solve it with your agent, submit your solution.
  - **Leaderboard** — Earn XP, climb the rankings, and collect badges. Top solvers get sponsor rewards — prizes, licenses, even job interviews.
  - **Hackathons** — Full-day build events where teams prototype AI solutions. Prizes, mentors, and pizza.
  - **Challenge Channels** — Every challenge has its own discussion. Ask questions, share progress, see how others approach it.
- CTA: "Browse Challenges" → `/challenges`

### Modal 3 — "Connect"
- Subtitle: "Join a global community of engineers building with AI"
- Items:
  - **Events & Meetups** — Workshops, hackathons, deep-dives, and casual evening meetups across the Netherlands and online.
  - **Discussion Forum** — Ask questions, share showcases, and connect with other members in community threads.
  - **Ideas & Voting** — Propose event topics or features and vote on what the community does next.
  - **Jobs** — Opportunities from sponsor partners — remote, hybrid, and on-site roles in the Dutch tech ecosystem.
- CTA: "Join the Community" → `/community`

## Page Structure

New section flow:

1. **Hero** — AI-first copy + Shimmer cycle (updated)
2. **Stats Ticker** — unchanged
3. **Feature Modals: Build / Compete / Connect** (updated content)
4. **Members Showcase** — NEW section
5. **Events Feed** — unchanged
6. **Sponsors Strip** — unchanged
7. **CTA Cards** — updated copy

### Removed
- Standalone Challenges section (3-step flow, value props, CTA) — absorbed into "Compete" modal

### Added — Members Showcase
- Section label: `/ TOP MEMBERS`
- Fetch top 5-8 members by XP from database
- Display: avatar, display name, level, XP, badge count
- Horizontal row, similar to sponsors strip aesthetic
- CTA: "View All Members →" → `/members`

### CTA Cards (updated)
1. "Build With AI" → `/dashboard/agent` — "Set up your agent and start building. Workshops, tools, and open source to get you started."
2. "Take a Challenge" → `/challenges` — "Solve real problems with your AI agent. Earn XP, badges, and sponsor rewards."
3. "Partner With Us" → `/sponsors` — "Publish challenges, post jobs, and connect with engineers building with AI."

## Files Changed

| File | Change |
|------|--------|
| `src/components/ai-elements/shimmer.tsx` | Add `cycle`/`cycleInterval` props (from shimmer cycle design) |
| `src/components/hero-title.tsx` | New AI-first title + Shimmer cycle, drop ScrambleText |
| `src/app/[locale]/page.tsx` | Remove Challenges section, add Members Showcase, reorder, update CTA cards |
| `src/components/feature-modals.tsx` | Update feature keys from workshops/knowledge/community to build/compete/connect |
| `messages/en.json` | New translations for hero, features (Build/Compete/Connect modals), CTA cards |
| `messages/nl.json` | Dutch equivalents of all new translations |

No new components — Members Showcase inlined in page.tsx (consistent with Sponsors Strip pattern).

## Dependencies

- Shimmer cycle implementation (from `2026-02-25-shimmer-cycle-design.md`) must be built first
- `lucide-react` Heart icon (already in project)
- Member data query via Drizzle (memberProfiles + user tables already exist)
