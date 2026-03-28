# Landing Page Update Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform the landing page from a generic community site to an AI-first community platform with the Shimmer cycle animation and Build/Compete/Connect feature modals.

**Architecture:** Extend the Shimmer component with cycling support, update hero-title to use it, restructure page.tsx sections (remove standalone Challenges, add Members Showcase), update feature-modals to Build/Compete/Connect, and update translations in both en.json and nl.json.

**Tech Stack:** React 19, motion/react (framer-motion v12), lucide-react, Next.js, next-intl, Drizzle ORM, Tailwind CSS

---

### Task 1: Extend Shimmer component with cycle support

**Files:**
- Modify: `src/components/ai-elements/shimmer.tsx`

**Step 1: Update imports and props**

Replace the imports and interface at the top of the file:

```tsx
import type { MotionProps } from "motion/react";
import type { CSSProperties, ElementType, JSX, ReactNode } from "react";

import { cn } from "@/lib/utils";
import { motion } from "motion/react";
import { memo, useEffect, useMemo, useState } from "react";
```

Replace the `TextShimmerProps` interface:

```tsx
export interface TextShimmerProps {
  children?: string;
  cycle?: Array<string | ReactNode>;
  cycleInterval?: number;
  as?: ElementType;
  className?: string;
  duration?: number;
  spread?: number;
}
```

**Step 2: Add cycling logic and update dynamicSpread**

Inside `ShimmerComponent`, after destructuring props but before the `MotionComponent` line, add the `cycle` and `cycleInterval` destructuring. Then after the `MotionComponent` line, add:

```tsx
const [cycleIndex, setCycleIndex] = useState(0);

useEffect(() => {
  if (!cycle || cycle.length <= 1) return;
  const interval = setInterval(() => {
    setCycleIndex((prev) => (prev + 1) % cycle.length);
  }, (cycleInterval ?? 4) * 1000);
  return () => clearInterval(interval);
}, [cycle, cycleInterval]);

const currentItem = cycle ? cycle[cycleIndex] : children;
const isTextItem = typeof currentItem === "string";
```

Replace the existing `dynamicSpread` useMemo:

```tsx
const dynamicSpread = useMemo(() => {
  if (cycle) {
    const maxLen = Math.max(
      ...cycle.map((item) => (typeof item === "string" ? item.length : 3))
    );
    return maxLen * spread;
  }
  return (children?.length ?? 0) * spread;
}, [children, cycle, spread]);
```

**Step 3: Update the render return**

Replace the entire `return (...)` block:

```tsx
return (
  <MotionComponent
    animate={{ backgroundPosition: "0% center" }}
    className={cn(
      "relative inline-block bg-[length:250%_100%] bg-clip-text",
      "[--bg:linear-gradient(90deg,#0000_calc(50%-var(--spread)),var(--color-background),#0000_calc(50%+var(--spread)))] [background-repeat:no-repeat,padding-box]",
      isTextItem && "text-transparent",
      className
    )}
    initial={{ backgroundPosition: "100% center" }}
    style={
      {
        "--spread": `${dynamicSpread}px`,
        ...(isTextItem
          ? {
              backgroundImage:
                "var(--bg), linear-gradient(var(--color-muted-foreground), var(--color-muted-foreground))",
            }
          : {}),
      } as CSSProperties
    }
    transition={{
      duration,
      ease: "linear",
      repeat: Number.POSITIVE_INFINITY,
    }}
  >
    {cycle && (
      <span className="invisible block h-0 overflow-hidden" aria-hidden="true">
        {cycle.reduce<string>((longest, item) => {
          if (typeof item === "string" && item.length > longest.length) return item;
          return longest;
        }, "")}
      </span>
    )}
    {cycle ? (
      <span
        key={cycleIndex}
        className="inline-flex items-center transition-opacity duration-300"
      >
        {currentItem}
      </span>
    ) : (
      children
    )}
  </MotionComponent>
);
```

Key changes from original:
- `text-transparent` only applied for string items (icons need visible color)
- `backgroundImage` only set for string items
- Hidden placeholder of longest text for layout stability
- Cycle items wrapped in keyed `<span>` for fade transition

**Step 4: Verify**

Run: `npx next lint`
Expected: PASS

**Step 5: Commit**

```bash
git add src/components/ai-elements/shimmer.tsx
git commit -m "feat(shimmer): add cycle and cycleInterval props for looping content"
```

---

### Task 2: Update hero-title to use Shimmer cycle

**Files:**
- Modify: `src/components/hero-title.tsx`

**Step 1: Replace the entire file**

The current file imports `ScrambleText` and splits the title to put the last word in a scramble. Replace with:

```tsx
"use client";

import { Heart } from "lucide-react";
import { Shimmer } from "./ai-elements/shimmer";

interface HeroTitleProps {
  greeting: string;
  title: string;
}

export function HeroTitle({ greeting, title }: HeroTitleProps) {
  return (
    <h1 className="text-[32px] leading-[0.95] tracking-tighter sm:text-8xl lg:text-[96px]">
      <span className="block font-light">{greeting}</span>
      <span className="block font-extrabold">
        {title}{" "}
        <Shimmer
          as="span"
          cycle={[
            "Netherlands",
            <Heart
              key="heart"
              className="inline h-[0.75em] w-[0.75em] fill-current"
            />,
            "World",
          ]}
          cycleInterval={4}
          duration={2}
          className="text-primary inline-block"
        />
      </span>
    </h1>
  );
}
```

Key changes:
- `title` is now rendered as a whole (no splitting off last word)
- Shimmer cycle appended after the title text
- `fill-current` on Heart for a solid filled heart
- `h-[0.75em]` sizes the heart proportionally to the text

**Step 2: Verify**

Run: `npx next lint`
Expected: PASS

**Step 3: Commit**

```bash
git add src/components/hero-title.tsx
git commit -m "feat(hero): use shimmer cycle for Netherlands → heart → World animation"
```

---

### Task 3: Update English translations

**Files:**
- Modify: `messages/en.json`

**Step 1: Update hero translations**

Replace the `"hero"` object:

```json
"hero": {
  "title": "AI Tech Community",
  "subtitle": "Where engineers and AI agents build together.",
  "description": "Solve real challenges, grow your skills, and connect with a global community of technical innovators — born in the Netherlands, open to the world.",
  "cta": "Join the Community",
  "learnMore": "Learn More"
}
```

**Step 2: Update features translations**

Replace the entire `"features"` object:

```json
"features": {
  "title": "What We Do",
  "build": {
    "title": "Build",
    "description": "Set up your AI agent and start building together. Workshops, tools, and open source to get you started."
  },
  "compete": {
    "title": "Compete",
    "description": "Real problems from real companies, solved with AI. Earn XP, badges, and sponsor rewards."
  },
  "connect": {
    "title": "Connect",
    "description": "Join a global community of engineers building with AI. Events, discussions, and job opportunities."
  },
  "network": {
    "title": "Professional Network",
    "description": "Connect with talented professionals across the Dutch tech ecosystem. Find collaborators, mentors, and opportunities."
  },
  "modal": {
    "build": {
      "subtitle": "Set up your AI agent and start building together.",
      "items": [
        { "label": "AI Agent", "text": "Create your personal AI agent. It reads challenges, writes code, runs tests, and posts progress — you stay in control." },
        { "label": "Workshops", "text": "Hands-on sessions with real AI tools: LangChain, vector databases, fine-tuning, and prompt engineering." },
        { "label": "Deep-Dives", "text": "Focused technical talks on a single topic — from transformer architectures to production MLOps." },
        { "label": "Open Source", "text": "Code, templates, and starter kits shared from our hackathons and workshops." }
      ],
      "cta": "Set Up Your Agent"
    },
    "compete": {
      "subtitle": "Real problems from real companies, solved with AI.",
      "items": [
        { "label": "Challenges", "text": "Sponsors post real-world engineering problems. Clone the repo, solve it with your agent, submit your solution." },
        { "label": "Leaderboard", "text": "Earn XP, climb the rankings, and collect badges. Top solvers get sponsor rewards — prizes, licenses, even job interviews." },
        { "label": "Hackathons", "text": "Full-day build events where teams prototype AI solutions. Prizes, mentors, and pizza." },
        { "label": "Challenge Channels", "text": "Every challenge has its own discussion. Ask questions, share progress, see how others approach it." }
      ],
      "cta": "Browse Challenges"
    },
    "connect": {
      "subtitle": "Join a global community of engineers building with AI.",
      "items": [
        { "label": "Events & Meetups", "text": "Workshops, hackathons, deep-dives, and casual evening meetups across the Netherlands and online." },
        { "label": "Discussion Forum", "text": "Ask questions, share showcases, and connect with other members in community threads." },
        { "label": "Ideas & Voting", "text": "Propose event topics or features and vote on what the community does next." },
        { "label": "Jobs", "text": "Opportunities from sponsor partners — remote, hybrid, and on-site roles in the Dutch tech ecosystem." }
      ],
      "cta": "Join the Community"
    }
  }
}
```

**Step 3: Update join/CTA translations**

Replace the `"join"` object:

```json
"join": {
  "title": "Ready to Join?",
  "subtitle": "Become part of the AI Tech community",
  "attend": {
    "title": "Build With AI",
    "description": "Set up your agent and start building. Workshops, tools, and open source to get you started."
  },
  "challenge": {
    "title": "Take a Challenge",
    "description": "Solve real problems with your AI agent. Earn XP, badges, and sponsor rewards."
  },
  "partner": {
    "title": "Partner With Us",
    "description": "Publish challenges, post jobs, and connect with engineers building with AI."
  }
}
```

**Step 4: Add members section translations**

Add a new `"topMembers"` key at the top level (e.g. after `"join"`):

```json
"topMembers": {
  "title": "Top Members",
  "viewAll": "View All Members"
}
```

**Step 5: Verify JSON is valid**

Run: `node -e "JSON.parse(require('fs').readFileSync('messages/en.json','utf8')); console.log('OK')"`
Expected: `OK`

**Step 6: Commit**

```bash
git add messages/en.json
git commit -m "feat(i18n): update English translations for AI-first landing page"
```

---

### Task 4: Update Dutch translations

**Files:**
- Modify: `messages/nl.json`

**Step 1: Update hero translations**

Replace the `"hero"` object:

```json
"hero": {
  "title": "AI Tech Community",
  "subtitle": "Waar engineers en AI-agents samen bouwen.",
  "description": "Los echte uitdagingen op, groei je vaardigheden en verbind met een wereldwijde community van technische innovators — geboren in Nederland, open voor de wereld.",
  "cta": "Word Lid",
  "learnMore": "Meer Informatie"
}
```

**Step 2: Update features translations**

Replace the entire `"features"` object:

```json
"features": {
  "title": "Wat We Doen",
  "build": {
    "title": "Bouw",
    "description": "Stel je AI-agent in en begin samen te bouwen. Workshops, tools en open source om je op weg te helpen."
  },
  "compete": {
    "title": "Competeer",
    "description": "Echte problemen van echte bedrijven, opgelost met AI. Verdien XP, badges en sponsorbeloningen."
  },
  "connect": {
    "title": "Verbind",
    "description": "Sluit je aan bij een wereldwijde community van engineers die bouwen met AI. Evenementen, discussies en vacatures."
  },
  "network": {
    "title": "Professioneel Netwerk",
    "description": "Maak verbinding met getalenteerde professionals in het Nederlandse tech-ecosysteem. Vind samenwerkingspartners, mentoren en kansen."
  },
  "modal": {
    "build": {
      "subtitle": "Stel je AI-agent in en begin samen te bouwen.",
      "items": [
        { "label": "AI Agent", "text": "Maak je persoonlijke AI-agent. Hij leest challenges, schrijft code, draait tests en post voortgang — jij houdt de controle." },
        { "label": "Workshops", "text": "Praktische sessies met echte AI-tools: LangChain, vector databases, fine-tuning en prompt engineering." },
        { "label": "Deep-Dives", "text": "Gerichte technische talks over één onderwerp — van transformer-architecturen tot productie MLOps." },
        { "label": "Open Source", "text": "Code, templates en starter kits gedeeld vanuit onze hackathons en workshops." }
      ],
      "cta": "Stel Je Agent In"
    },
    "compete": {
      "subtitle": "Echte problemen van echte bedrijven, opgelost met AI.",
      "items": [
        { "label": "Challenges", "text": "Sponsors plaatsen echte engineering-problemen. Clone de repo, los het op met je agent, dien je oplossing in." },
        { "label": "Ranglijst", "text": "Verdien XP, klim in de ranglijst en verzamel badges. Topoplossers krijgen sponsorbeloningen — prijzen, licenties, zelfs sollicitatiegesprekken." },
        { "label": "Hackathons", "text": "Hele dag bouwen in teams aan AI-oplossingen. Prijzen, mentoren en pizza." },
        { "label": "Challenge Kanalen", "text": "Elke challenge heeft een eigen discussie. Stel vragen, deel voortgang en bekijk hoe anderen het aanpakken." }
      ],
      "cta": "Bekijk Challenges"
    },
    "connect": {
      "subtitle": "Sluit je aan bij een wereldwijde community van engineers die bouwen met AI.",
      "items": [
        { "label": "Evenementen & Meetups", "text": "Workshops, hackathons, deep-dives en informele avondbijeenkomsten door heel Nederland en online." },
        { "label": "Discussieforum", "text": "Stel vragen, deel showcases en maak contact met andere leden in community threads." },
        { "label": "Ideeën & Stemmen", "text": "Stel evenementonderwerpen of features voor en stem op wat de community vervolgens doet." },
        { "label": "Vacatures", "text": "Kansen van sponsorpartners — remote, hybride en on-site rollen in het Nederlandse tech-ecosysteem." }
      ],
      "cta": "Word lid van de Community"
    }
  }
}
```

**Step 3: Update join/CTA translations**

Replace the `"join"` object:

```json
"join": {
  "title": "Klaar om mee te doen?",
  "subtitle": "Word onderdeel van de AI Tech community",
  "attend": {
    "title": "Bouw Met AI",
    "description": "Stel je agent in en begin met bouwen. Workshops, tools en open source om je op weg te helpen."
  },
  "challenge": {
    "title": "Doe een Challenge",
    "description": "Los echte problemen op met je AI-agent. Verdien XP, badges en sponsorbeloningen."
  },
  "partner": {
    "title": "Word Partner",
    "description": "Publiceer challenges, plaats vacatures en verbind met engineers die bouwen met AI."
  }
}
```

**Step 4: Add members section translations**

Add a new `"topMembers"` key:

```json
"topMembers": {
  "title": "Top Leden",
  "viewAll": "Alle Leden Bekijken"
}
```

**Step 5: Verify JSON is valid**

Run: `node -e "JSON.parse(require('fs').readFileSync('messages/nl.json','utf8')); console.log('OK')"`
Expected: `OK`

**Step 6: Commit**

```bash
git add messages/nl.json
git commit -m "feat(i18n): update Dutch translations for AI-first landing page"
```

---

### Task 5: Update feature-modals component

**Files:**
- Modify: `src/components/feature-modals.tsx`

**Step 1: Update the ModalKey type and FEATURES array**

Replace lines 12-22:

```tsx
type ModalKey = "build" | "compete" | "connect";

const FEATURES: {
  key: ModalKey;
  fig: number;
  href: "/dashboard/agent" | "/challenges" | "/community";
}[] = [
  { key: "build", fig: 1, href: "/dashboard/agent" },
  { key: "compete", fig: 2, href: "/challenges" },
  { key: "connect", fig: 3, href: "/community" },
];
```

**Step 2: Update the FeatureModal href type**

In the `FeatureModal` function props (line 96), update the `href` type:

```tsx
href: "/dashboard/agent" | "/challenges" | "/community";
```

**Step 3: Verify**

Run: `npx next lint`
Expected: PASS

**Step 4: Commit**

```bash
git add src/components/feature-modals.tsx
git commit -m "feat(features): update modals to Build/Compete/Connect"
```

---

### Task 6: Update page.tsx — remove Challenges section, add Members Showcase, update CTAs

**Files:**
- Modify: `src/app/[locale]/page.tsx`

**Step 1: Update imports**

Add the necessary imports at the top. Add to existing imports:

```tsx
import { memberProfiles } from "@/server/db/schema";
import { desc } from "drizzle-orm";
```

Remove these imports that are no longer needed (they were used by the Challenges section):

```tsx
// REMOVE these:
import { GitFork, Bot, Trophy } from "lucide-react";
```

Keep `ArrowUpRight` from lucide-react (still used by CTA cards).

**Step 2: Add members query in the Home function**

After the existing `workshopCount` query (around line 115), add:

```tsx
const topMembers = await db
  .select({
    userId: memberProfiles.userId,
    displayName: memberProfiles.displayName,
    xp: memberProfiles.xp,
    level: memberProfiles.level,
  })
  .from(memberProfiles)
  .where(sql`${memberProfiles.isPublic} = true`)
  .orderBy(desc(memberProfiles.xp))
  .limit(6);
```

**Step 3: Update the hero title usage**

Replace the HeroTitle usage (around line 135-142). Change the greeting logic:

```tsx
<HeroTitle
  greeting="Welcome to"
  title={t("hero.title")}
/>
```

The `greeting` is now always "Welcome to" since the title is "AI Tech Community" (no longer needs to split off "AI Tech").

**Step 4: Remove the entire AI Challenges section**

Delete the entire `{/* AI Challenges */}` section (from `<section className="px-6 py-12 sm:px-12">` with `<SectionLabel>/ {t("challengesLanding.title")...` through its closing `</section>`). This is approximately lines 168-230.

**Step 5: Add Members Showcase section**

After the Events Feed section's closing `</section>` and before the Sponsors Strip section, add:

```tsx
{/* Top Members */}
{topMembers.length > 0 && (
  <section className="px-6 py-12 sm:px-12">
    <SectionLabel>/ {t("topMembers.title").toUpperCase()}</SectionLabel>
    <div className="mt-6 flex flex-wrap items-center justify-center gap-6">
      {topMembers.map((member) => (
        <Link
          key={member.userId}
          href={`/members/${member.userId}`}
          className="group flex flex-col items-center gap-2 rounded-lg p-3 transition-colors hover:bg-secondary/50"
        >
          <div className="bg-muted text-muted-foreground flex h-10 w-10 items-center justify-center rounded-full font-mono text-sm font-bold">
            {member.displayName.charAt(0).toUpperCase()}
          </div>
          <span className="text-sm font-medium">{member.displayName}</span>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground font-mono text-[10px] tracking-wider">
              LVL {member.level}
            </span>
            <span className="text-primary font-mono text-[10px] font-bold tracking-wider">
              {member.xp} XP
            </span>
          </div>
        </Link>
      ))}
    </div>
    <div className="mt-4 text-right">
      <Link
        href="/members"
        className="text-muted-foreground hover:text-foreground font-mono text-xs tracking-wider transition-colors"
      >
        {t("topMembers.viewAll")} →
      </Link>
    </div>
  </section>
)}
```

**Step 6: Update CTA cards**

Replace the CTA cards array (around the `{/* CTA Cards */}` section) with updated content:

```tsx
{[
  {
    title: t("join.attend.title"),
    desc: t("join.attend.description"),
    href: "/dashboard/agent" as const,
  },
  {
    title: t("join.challenge.title"),
    desc: t("join.challenge.description"),
    href: "/challenges" as const,
  },
  {
    title: t("join.partner.title"),
    desc: t("join.partner.description"),
    href: "/sponsors" as const,
  },
]}
```

Note: The first CTA now links to `/dashboard/agent` instead of `/events`.

**Step 7: Verify**

Run: `npx next lint && npx next build`
Expected: PASS

**Step 8: Commit**

```bash
git add src/app/[locale]/page.tsx
git commit -m "feat(landing): restructure page with Members Showcase, remove standalone Challenges"
```

---

### Task 7: Visual verification and final check

**Step 1: Run the dev server**

Run: `npm run dev`

**Step 2: Verify on homepage**

Navigate to `http://localhost:3000`. Check:

- Hero displays "AI Tech Community" with Shimmer cycling Netherlands → Heart → World
- Stats ticker shows live counts
- 3 feature cards show Build / Compete / Connect
- Clicking each card opens modal with correct 4 items and CTA
- Members Showcase shows top members by XP (if any exist in DB)
- Events feed still shows upcoming events
- Sponsors strip unchanged
- CTA cards show "Build With AI" / "Take a Challenge" / "Partner With Us"
- Switch to Dutch (nl) and verify all translations render correctly

**Step 3: Verify backward compatibility**

Check that existing Shimmer consumers still work:
- `src/components/ai-elements/reasoning.tsx` — uses `<Shimmer>Thinking...</Shimmer>`
- `src/components/ai-elements/terminal.tsx` — uses `<Shimmer>` with children
- `src/components/ai-elements/plan.tsx` — uses `<Shimmer>` with children

**Step 4: Full build**

Run: `npx next build`
Expected: PASS with no errors

**Step 5: Final commit if any adjustments needed**

```bash
git add -A
git commit -m "chore: final adjustments after visual verification"
```
