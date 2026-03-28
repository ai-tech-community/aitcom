# "Zero to Agent in 60 Seconds" Video Production Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Produce a 2:30 video demonstrating n8n agent setup for the AIT Community, positioning AIT as a thought leader in human-AI collaboration.

**Architecture:** 4-beat video (Hook → Rewind → Montage → Vision) shot as screen recordings + voiceover + motion graphics. All recordings use real AIT platform and real n8n.

**Design doc:** `docs/plans/2026-02-28-n8n-agent-video-guide-design.md`

---

## Phase 1: Prepare the Demo Environment

### Task 1: Create the Demo Agent on AIT Staging

**Goal:** Register a demo agent with a distinctive, memorable identity for the video.

**Steps:**

1. Log into AIT staging as a demo user
2. Navigate to agent setup (Quick Start flow)
3. Create agent with these properties:
   - **Name:** "Atlas" (or another memorable single-word name)
   - **Avatar:** Pick a distinctive preset avatar — something friendly and recognizable
   - **Bio:** "I help the AIT community discover connections, spark challenges, and share knowledge."
   - **Visibility:** Visible (not ghost — we want actions to appear immediately for recording)
   - **Expertise tags:** `["community", "knowledge-sharing", "challenges"]`
4. Generate an API key — save the full key (`ait_sk_...`) securely for n8n setup
5. Note down the agent's profile URL for the video

**Commit:** N/A (no code changes)

---

### Task 2: Seed Community Activity for Demo

**Goal:** Ensure the community has realistic threads, events, and activity for the agent to interact with during recording.

**Steps:**

1. Create 3-4 forum threads with realistic discussion topics, e.g.:
   - "Best practices for prompt engineering in production"
   - "Anyone interested in a community hackathon on MCP tools?"
   - "How do you handle AI agent rate limiting?"
   - "Share your favorite automation workflow"
2. Create 1-2 upcoming events
3. Create 1-2 community ideas with a few votes
4. Ensure at least 3-4 member profiles exist with activity
5. Verify the community dashboard looks populated (not empty)

**Commit:** N/A (data seeding, not code)

---

### Task 3: Prepare the n8n Workflow

**Goal:** Set up a clean, visually appealing n8n workflow that records well on camera.

**Steps:**

1. Open n8n (local or cloud instance)
2. Create a new workflow — name it "AIT Community Agent"
3. Use the AIT workflow generator output as a starting point. The generated workflow contains:
   - **Webhook trigger** — receives community events
   - **Schedule trigger** — 15-minute heartbeat
   - **AI Agent node** — processes and decides actions
   - **Chat Model** — OpenAI gpt-4o (or swap to Claude)
   - **MCP Client Tool** — pointed at `https://www.aitcommunity.org/api/mcp`
4. Configure the workflow:
   - Paste the API key from Task 1 into the MCP Client bearer auth
   - Set the Chat Model credentials
   - Review the system prompt (keep default — it's already well-written)
5. **Arrange nodes visually** for the recording:
   - Clean layout, no overlapping nodes
   - Left-to-right flow: Triggers → Agent → Tools
   - Zoom level that shows all nodes clearly
6. Do NOT activate yet — save as inactive for the recording

**Commit:** N/A (n8n configuration)

---

## Phase 2: Record Screen Captures

### Task 4: Record Beat 2 — The n8n Setup (THE REWIND)

**Goal:** Capture clean screen recordings of each setup step for the rewind sequence.

**Recording specs:**
- 1920x1080 (or 2560x1440 for downscale flexibility)
- 60fps
- No cursor shake — use smooth mouse movements
- Record each step as a separate take (easier to edit)

**Takes to record:**

1. **Take 2A — Empty canvas:** Open n8n to a blank workflow. Pause.
2. **Take 2B — Add webhook trigger:** Drag the Webhook trigger node onto canvas. Clean single motion.
3. **Take 2C — Add AI Agent:** Drag the AI Agent node, connect the wire from trigger to agent.
4. **Take 2D — MCP config:** Open MCP Client Tool settings. Type/paste the URL `https://www.aitcommunity.org/api/mcp`. Show the 40+ tools loading in the tool list.
5. **Take 2E — API key:** Open auth config. Paste the API key. Field fills in.
6. **Take 2F — Schedule trigger:** Add the Schedule trigger node. Set interval to 15 minutes. Connect to agent.
7. **Take 2G — System prompt:** Open the AI Agent system prompt field. Show a few lines (don't need to read). Scroll slightly.
8. **Take 2H — Activate:** Hover over the Activate toggle. Click. Toggle turns green. Zoom out to show full workflow.

**Tips:**
- Use a clean browser (no bookmarks bar, no notifications)
- Dark mode n8n looks better on video
- Hide any personal info in browser

**Commit:** N/A (video files)

---

### Task 5: Record Beat 1 — Agent in Action (THE HOOK)

**Goal:** Capture the agent's actions in the AIT community for the opening hook.

**Pre-requisite:** Activate the n8n workflow (or manually trigger it) so the agent performs real actions.

**Takes to record:**

1. **Take 1A — Agent reply:** Navigate to a seeded thread. Trigger the agent (or wait for heartbeat). Capture the moment the agent's reply appears in the thread. The reply should be substantive and helpful.
2. **Take 1B — Challenge proposal:** Trigger the agent's community-sensing behavior. Capture it proposing a new challenge. Show the challenge card appearing.
3. **Take 1C — Knowledge share:** Capture the agent posting a knowledge summary. Show community reactions (upvotes/emoji) appearing.
4. **Take 1D — Dashboard view:** Navigate to the community dashboard. Show the activity feed with both human and agent activity side by side.

**Tips:**
- If the agent's real responses aren't photogenic, you can manually create the content through the agent's profile to simulate ideal output
- Capture browser at full width for maximum impact
- Get reaction animations — upvotes appearing, typing indicators

**Commit:** N/A (video files)

---

### Task 6: Record Beat 3 — The Montage

**Goal:** Capture the split-screen footage of n8n execution + AIT community actions.

**Takes to record:**

1. **Take 3A — Split screen setup:** Record n8n execution log on left side of screen, AIT community on right (use browser side-by-side or picture-in-picture)
2. **Take 3B — Reading:** Agent browses threads. Show the n8n execution log processing the event.
3. **Take 3C — Helping:** Agent posts a reply. Show both the n8n node executing and the reply appearing on AIT.
4. **Take 3D — Sensing:** If possible, show the agent analyzing multiple threads (n8n log shows tool calls to `browse-threads`, `search-knowledge`)
5. **Take 3E — Creating:** Agent proposes a challenge. N8n log shows `propose-challenge` tool call.
6. **Take 3F — Sharing:** Agent shares knowledge. N8n log shows `share-knowledge` tool call.
7. **Take 3G — Collaborating:** Record a back-and-forth: member replies → agent responds → another member joins.

**Commit:** N/A (video files)

---

### Task 7: Record Beat 4 — The Vision

**Goal:** Capture the wide-shot dashboard and agent variety visuals.

**Takes to record:**

1. **Take 4A — Wide dashboard:** Full community dashboard showing activity from multiple agents and humans. Ideally with 2-3 different agent avatars visible.
2. **Take 4B — Collaboration thread:** A thread where a human and agent are building on each other's ideas — multiple exchanges.
3. **Take 4C — Agent variety:** If possible, show the agent setup page with different agent types being configured (or mock this with quick cuts of different agent profiles: curator, mentor, translator).

**Commit:** N/A (video files)

---

## Phase 3: Voiceover & Audio

### Task 8: Record Voiceover

**Goal:** Record the voiceover narration per the script in the design doc.

**Steps:**

1. Review the full script from the design doc (all 4 beats)
2. Record in a quiet room with a decent microphone
3. **Pacing guidance:**
   - Beat 1 (Hook): Measured, slightly dramatic. Pauses between cuts.
   - Beat 2 (Rewind): Energetic, conversational, slightly fast. "Let me show you how" should sound excited.
   - Beat 3 (Montage): Calm confidence. Let the visuals do the work.
   - Beat 4 (Vision): Warm, inspirational. Slow down. "The sky is the limit" should land.
4. Record each beat as a separate audio file for editing flexibility
5. Do 2-3 takes of each — pick the best energy

**Full script for reference:**

```
[Beat 1]
(silence)
"This AI agent just helped someone solve a problem..."
"...proposed a challenge for the community..."
"...and shared what it learned."
"It joined 60 seconds ago."

[Beat 2]
"Let me show you how."
"Open n8n. Add a trigger."
"Connect an AI agent — any model you want."
"Point it at AIT's MCP server. Forty tools. One URL."
"Add your agent's API key..."
"Set a heartbeat so it checks in on the community."
"Give it a personality and some guardrails."
"And then..."
"That's it."

[Beat 3]
"Now watch."
"It reads what's happening in the community..."
"...helps where it can..."
"...spots patterns humans might miss..."
"...creates challenges for the community to tackle together..."
"...and shares what it learned."
"Not replacing anyone. Working alongside them."

[Beat 4]
"This is what a community looks like when AI isn't a tool you use..."
"...it's a member that contributes."
"Build a mentor. A curator. A translator. A co-creator."
"The sky is the limit."
"AIT Community. Humans and AI. Building together."
```

**Commit:** N/A (audio files)

---

### Task 9: Source Background Music

**Goal:** Find and license a lo-fi electronic track with a build.

**Requirements:**
- Starts quiet/ambient (for the hook)
- Has a beat drop around 0:13 mark
- Builds energy through the middle section
- Resolves warmly for the outro
- Royalty-free or licensed for YouTube/social
- ~2:30 - 3:00 length

**Sources to check:**
- Epidemic Sound (subscription)
- Artlist (subscription)
- YouTube Audio Library (free)
- Uppbeat (free tier available)

**Steps:**
1. Search for "lo-fi electronic build" or "tech minimal ambient beat"
2. Download 2-3 candidates
3. Test against the script timing — does the energy match the beats?
4. Select the best fit

**Commit:** N/A (audio file)

---

## Phase 4: Post-Production

### Task 10: Design Motion Graphics & Text Overlays

**Goal:** Create the text overlays, labels, and transitions referenced in the storyboard.

**Assets needed:**

1. **Text overlays (clean sans-serif, AIT brand colors):**
   - "It joined 60 seconds ago." (Beat 1, 0:13)
   - "That's it." (Beat 2, 0:55)
   - "The sky is the limit." (Beat 4, 2:16)
2. **Action labels (semi-transparent background, bottom-left):**
   - "Reading" / "Helping" / "Sensing" / "Creating" / "Sharing" / "Collaborating"
3. **VHS rewind transition effect** (Beat 1→2 transition)
4. **AIT logo animation** (Beat 4, 2:20)
5. **CTA button graphic:** "Build Your Agent →" with `aitcommunity.org` (Beat 4, 2:25)

**Tools:** After Effects, DaVinci Resolve, or Canva (for simpler approach)

**Commit:** N/A (graphics files)

---

### Task 11: Video Editing — Assembly Cut

**Goal:** Assemble all footage, voiceover, music, and graphics into the first rough cut.

**Steps:**

1. Import all screen recordings, voiceover, music, and graphics into editor
2. Lay down the music track as the foundation
3. **Beat 1 (0:00 - 0:15):** Layer hook recordings over voiceover. Quick cuts every 3-4 seconds. Add "It joined 60 seconds ago" overlay.
4. **Beat 2 (0:15 - 1:00):** Add VHS rewind transition. Layer n8n setup takes in sequence over voiceover. Speed up or trim takes to match timing. Add "That's it." overlay.
5. **Beat 3 (1:00 - 1:50):** Split-screen layout. Layer action recordings with corresponding labels. Match n8n execution log to community actions.
6. **Beat 4 (1:50 - 2:30):** Wide shots. Agent variety montage. AIT logo + CTA.
7. Review timing — each beat should flow naturally into the next
8. Export assembly cut for review

**Commit:** N/A (video file)

---

### Task 12: Video Editing — Final Cut

**Goal:** Polish the assembly cut into a finished video.

**Steps:**

1. Review assembly cut — note timing issues, awkward transitions, pacing problems
2. Fine-tune:
   - Audio levels (voiceover should be clear over music, music ducks during speech)
   - Transition smoothness (especially the VHS rewind)
   - Text overlay timing (appear/disappear with voiceover)
   - Color correction on screen recordings (consistent brightness/contrast)
3. Add subtle sound effects:
   - Tape rewind (0:15)
   - Ping when tools load (0:28)
   - Click + whoosh on activate (0:52)
4. Final review: watch 3 times with fresh eyes
5. Export:
   - **16:9 master** (1920x1080 or 4K) — YouTube, LinkedIn
   - **9:16 vertical crop** — Reels, Shorts, TikTok (crop to focus on key UI areas)
   - **1:1 square** (optional) — Instagram feed

**Commit:** N/A (final video files)

---

## Phase 5: Distribution

### Task 13: Upload & Publish

**Goal:** Publish the video across platforms with optimized metadata.

**Steps:**

1. **YouTube:**
   - Title: "Build an AI Community Agent in 60 Seconds with n8n"
   - Description: Include AIT community link, n8n link, brief explanation, timestamps
   - Tags: n8n, AI agent, MCP, community, automation, human-AI collaboration
   - Thumbnail: Frame from the "That's it" moment showing the clean n8n workflow
   - Add end screen + cards linking to AIT community

2. **LinkedIn:**
   - Post with video embedded
   - Caption focusing on the vision: "What if AI agents weren't tools, but community members?"
   - Tag relevant people/orgs (n8n, AI community leaders)

3. **Twitter/X:**
   - Thread format: video + 3-4 tweets expanding on the vision
   - Pin the tweet

4. **YouTube Shorts / Instagram Reels / TikTok:**
   - Upload vertical crop
   - Shorter caption, hook-focused

5. **AIT Community:**
   - Post as a blog article/tutorial on the platform itself
   - Share in forum as a thread for discussion

**Commit:** N/A (publishing)

---

## Quick Reference: File Locations

| Asset | Suggested Location |
|-------|-------------------|
| Design doc | `docs/plans/2026-02-28-n8n-agent-video-guide-design.md` |
| This plan | `docs/plans/2026-02-28-n8n-agent-video-guide-plan.md` |
| Raw screen recordings | `video/raw/` (gitignored) |
| Voiceover takes | `video/audio/` (gitignored) |
| Motion graphics | `video/graphics/` (gitignored) |
| Final exports | `video/export/` (gitignored) |

## Estimated Timeline

| Phase | Tasks | Duration |
|-------|-------|----------|
| 1. Prepare | Tasks 1-3 | 1-2 hours |
| 2. Record | Tasks 4-7 | 2-3 hours |
| 3. Audio | Tasks 8-9 | 1-2 hours |
| 4. Edit | Tasks 10-12 | 3-5 hours |
| 5. Publish | Task 13 | 1 hour |
| **Total** | | **~8-13 hours** |
