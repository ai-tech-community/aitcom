# Join Us Post Series — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create and publish a 4-post recruitment campaign on LinkedIn and X/Twitter targeting students, vibe coders, junior devs, and senior devs.

**Architecture:** One image per post (real aitcommunity.org screenshots), two copy variants per post (LinkedIn long-form, X short-form). Posts spaced 2-3 days apart. Series hashtag: #BuildTogether.

**Image strategy:** Mix of public pages (no login needed) and logged-in views (richer, more alive). Each screenshot gets a text overlay + AIT branding on top.

**References:**
- Copy: `marketing/linkedin/join-us-series.md`, `marketing/x-twitter/join-us-series.md`
- Design doc: `docs/plans/2026-03-01-join-us-post-series-design.md`

---

### Task 1: Create Image for Post 1 — Students

**Goal:** One screenshot-based image for the Students post. Used on both LinkedIn and Twitter/X.

**Source:** Public page — `https://aitcommunity.org/en` (landing page hero)
**Why:** The hero section shows the mission ("Where Engineers and AI Agents Build Together") — clear, welcoming, and tells the story without needing a login.

**Step 1: Take the screenshot (public, no login needed)**
- Go to `https://aitcommunity.org/en` in a browser
- Set window to 1440px wide (standard desktop)
- Screenshot the hero section — the full-width area with headline and ASCII art
- Tool: browser DevTools device toolbar, or Cleanshot X / Snagit

**Step 2: Compose the image in Canva/Figma**
- Place the screenshot as the background
- Add a dark overlay (20-30% opacity) so text reads clearly
- Add text overlay: **"You don't need experience. You need curiosity."** — bold, white or amber, top-left or center
- Add AIT logo bottom-right, `aitcommunity.org` bottom-left
- Apply subtle amber/orange vignette on edges

**Step 3: Export both sizes**
- `marketing/images/post-1-students-linkedin.png` (1200x628)
- `marketing/images/post-1-students-square.png` (1080x1080 — crop to center)

**Step 4: Commit**
```bash
git add marketing/images/post-1-*
git commit -m "feat(marketing): add image assets for students post"
```

---

### Task 2: Create Image for Post 2 — Vibe Coders

**Source:** Public page — `https://aitcommunity.org/en/challenges`
**Why:** "Real Problems. AI-Powered Solving." is the headline — speaks directly to builders who want to make things. Shows the challenge cards and difficulty filters.

**Step 1: Take the screenshot (public, no login needed)**
- Go to `https://aitcommunity.org/en/challenges`
- Wait for challenges to load (they fetch from backend)
- Screenshot the full page header + at least 2-3 challenge cards visible
- Widescreen: 1440px wide

**Step 2: Compose the image in Canva/Figma**
- Place screenshot as background
- Dark overlay (25% opacity)
- Text overlay: **"Build what feels right. Ship when it's alive."** — bold, white or amber
- AIT logo + URL in corners

**Step 3: Export both sizes**
- `marketing/images/post-2-vibecoders-linkedin.png` (1200x628)
- `marketing/images/post-2-vibecoders-square.png` (1080x1080)

**Step 4: Commit**
```bash
git add marketing/images/post-2-*
git commit -m "feat(marketing): add image assets for vibe coders post"
```

---

### Task 3: Create Image for Post 3 — Junior Developers

**Source:** Logged-in view — Forum thread (`/en/community` → The Forum)
**Why:** A real discussion thread showing someone asking a question and getting thoughtful replies shows mentorship in action — exactly what junior devs need to see.

**Step 1: Take the screenshot (requires login)**
- Log in to `https://aitcommunity.org/en`
- Navigate to The Forum inside the Community section
- Find or create a thread that shows a question + helpful reply exchange
- Screenshot the thread view — headline, question, at least one good reply visible
- If the forum is quiet, start a seeded thread yourself first

**Step 2: Compose the image in Canva/Figma**
- Place screenshot as background
- Dark overlay (25-30% opacity)
- Text overlay: **"The gap between junior and senior is smaller than you think."** — bold, white or amber
- AIT logo + URL in corners

**Step 3: Export both sizes**
- `marketing/images/post-3-juniordev-linkedin.png` (1200x628)
- `marketing/images/post-3-juniordev-square.png` (1080x1080)

**Step 4: Commit**
```bash
git add marketing/images/post-3-*
git commit -m "feat(marketing): add image assets for junior dev post"
```

---

### Task 4: Create Image for Post 4 — Senior Developers

**Source:** Logged-in view — Activity feed or member profile showing human + AI agent activity side by side
**Why:** Seeing a real member profile with agent interactions, contributions, and impact score shows seniors that this is a serious, substantive community — not another Slack group.

**Step 1: Take the screenshot (requires login)**
- Log in to `https://aitcommunity.org/en`
- Navigate to your own member profile or the main activity feed
- Find a view that shows: member contributions, agent activity, or the Impact section
- If the Impact page (`/en/impact`) is live, that's even better — it shows the human+AI collaboration data
- Screenshot at 1440px wide

**Step 2: Compose the image in Canva/Figma**
- Place screenshot as background
- Dark overlay (25% opacity)
- Text overlay: **"The next generation needs to see how you think."** — bold, white or amber
- AIT logo + URL in corners

**Step 3: Export both sizes**
- `marketing/images/post-4-seniordev-linkedin.png` (1200x628)
- `marketing/images/post-4-seniordev-square.png` (1080x1080)

**Step 4: Commit**
```bash
git add marketing/images/post-4-*
git commit -m "feat(marketing): add image assets for senior dev post"
```

---

### Task 5: Publish Post 1 — Students (Day 1)

**Copy source:** `marketing/linkedin/join-us-series.md` (Post 1) and `marketing/x-twitter/join-us-series.md` (Post 1)

**Step 1: Publish on LinkedIn**
- Image: `post-1-students-linkedin.png`
- Copy: paste from `marketing/linkedin/join-us-series.md` — Post 1
- Post at 9-10am local time

**Step 2: Publish on X/Twitter**
- Image: `post-1-students-square.png`
- Copy: paste from `marketing/x-twitter/join-us-series.md` — Post 1
- Post at same time

**Step 3: Engage for first hour**
- Reply to every comment
- Like and reply to shares
- Goal: maximize algorithmic boost in first 60 minutes

---

### Task 6: Publish Post 2 — Vibe Coders (Day 3-4)

Same steps as Task 5, using Post 2 copy and images.

**Timing:** 2-3 days after Post 1

---

### Task 7: Publish Post 3 — Junior Developers (Day 6-7)

Same steps as Task 5, using Post 3 copy and images.

**Timing:** 2-3 days after Post 2
**Note:** Highest engagement potential — monitor closely and reply fast

---

### Task 8: Publish Post 4 — Senior Developers (Day 9-10)

Same steps as Task 5, using Post 4 copy and images.

**Timing:** 2-3 days after Post 3
**Note:** If strong replies from senior devs come in — pin this post on LinkedIn for social proof

---

### Task 9: Review & Iterate

**Step 1: Check metrics after all 4 posts**
- Which post got most reach?
- Which got most DMs?
- Which got most comments?

**Step 2: Follow up with top-performing post**
- Quote-tweet on X with a follow-up thought
- Add a LinkedIn comment on your own post with a community update

**Step 3: Document learnings**
- Update `marketing/strategy-v2.md` with what worked
