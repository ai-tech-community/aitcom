# Phase 1: Design Kit + Landing Page + Auth — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the design kit in Pencil, set up i18n infrastructure, install shadcn/ui, implement the landing page and auth pages (signin/signup) for the AIT Community platform.

**Architecture:** Monolithic Next.js 15 App Router with tRPC, Better Auth, Drizzle ORM. URL-based i18n (`/en/...`, `/nl/...`) using `next-intl`. Monochromatic design with warm orange/amber accent, powered by shadcn/ui components.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind CSS 4, shadcn/ui, next-intl, Framer Motion, Better Auth, tRPC, Drizzle ORM, SQLite.

**Reference:** See `docs/plans/2026-02-22-ait-community-design.md` for full design document.

---

## Task 1: Install Dependencies

**Files:**
- Modify: `package.json`

**Step 1: Install shadcn/ui and its dependencies**

Run: `cd /c/projects/customers/aitcom && pnpm dlx shadcn@latest init`

When prompted:
- Style: Default
- Base color: Zinc
- CSS variables: Yes

This will create:
- `components.json`
- `src/lib/utils.ts`
- Update `src/styles/globals.css` with CSS variables
- May create `tailwind.config.ts` (Tailwind v4 may handle differently)

**Step 2: Install next-intl**

Run: `pnpm add next-intl`

**Step 3: Install Framer Motion**

Run: `pnpm add framer-motion`

**Step 4: Install additional shadcn/ui components we need**

Run: `pnpm dlx shadcn@latest add button card input label separator avatar badge sheet navigation-menu dialog toast textarea`

**Step 5: Verify the build**

Run: `pnpm build`
Expected: Build succeeds with no errors

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: install shadcn/ui, next-intl, and framer-motion"
```

---

## Task 2: Set Up i18n Infrastructure

**Files:**
- Create: `src/i18n/request.ts`
- Create: `src/i18n/routing.ts`
- Create: `src/i18n/navigation.ts`
- Create: `messages/en.json`
- Create: `messages/nl.json`
- Create: `src/middleware.ts`
- Modify: `next.config.js`
- Modify: `src/app/layout.tsx`

**Step 1: Create the routing configuration**

Create `src/i18n/routing.ts`:
```typescript
import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["en", "nl"],
  defaultLocale: "en",
});
```

**Step 2: Create the request configuration**

Create `src/i18n/request.ts`:
```typescript
import { getRequestConfig } from "next-intl/server";
import { routing } from "./routing";

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale;

  if (!locale || !routing.locales.includes(locale as "en" | "nl")) {
    locale = routing.defaultLocale;
  }

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default as Record<string, string>,
  };
});
```

**Step 3: Create the navigation helpers**

Create `src/i18n/navigation.ts`:
```typescript
import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
```

**Step 4: Create the middleware**

Create `src/middleware.ts`:
```typescript
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

export default createMiddleware(routing);

export const config = {
  matcher: [
    // Match all pathnames except for
    // - /api (API routes)
    // - /_next (Next.js internals)
    // - /favicon.ico, /sitemap.xml, etc.
    "/((?!api|_next|.*\\..*).*)",
  ],
};
```

**Step 5: Create initial message files**

Create `messages/en.json`:
```json
{
  "nav": {
    "home": "Home",
    "events": "Events",
    "blog": "Blog",
    "community": "Community",
    "members": "Members",
    "signIn": "Sign In",
    "joinUs": "Join the Community"
  },
  "hero": {
    "title": "AI Tech Community Netherlands",
    "subtitle": "Connecting engineers. Sharing knowledge. Building the future.",
    "description": "A community for technical innovators in the Netherlands. We foster collaboration through workshops, deep-dives, and hackathons focused on AI and automation.",
    "cta": "Join the Community",
    "learnMore": "Learn More"
  },
  "features": {
    "title": "What We Offer",
    "workshops": {
      "title": "Workshops & Hackathons",
      "description": "Hands-on sessions where you build, learn, and collaborate with fellow engineers on real AI projects."
    },
    "knowledge": {
      "title": "Knowledge Exchange",
      "description": "Deep-dives into cutting-edge AI topics, led by practitioners who are building the future of technology."
    },
    "community": {
      "title": "Community Driven",
      "description": "Independent and practical. Built by engineers, for engineers. Supporting young talent in the Netherlands."
    },
    "network": {
      "title": "Professional Network",
      "description": "Connect with talented professionals across the Dutch tech ecosystem. Find collaborators, mentors, and opportunities."
    }
  },
  "events": {
    "title": "Upcoming Events",
    "viewAll": "View All Events",
    "register": "Register",
    "spotsLeft": "{count} spots left",
    "online": "Online",
    "noEvents": "No upcoming events. Check back soon!"
  },
  "join": {
    "title": "Ready to Join?",
    "subtitle": "Become part of the AI Tech community",
    "attend": {
      "title": "Attend Events",
      "description": "Join our workshops, hackathons, and deep-dives. Free and open to all."
    },
    "speak": {
      "title": "Become a Speaker",
      "description": "Share your expertise with the community. We welcome talks on AI, automation, and innovation."
    },
    "partner": {
      "title": "Partner With Us",
      "description": "Support the community and connect with top Dutch tech talent."
    }
  },
  "footer": {
    "description": "A community for technical innovators in the Netherlands.",
    "navigation": "Navigation",
    "connect": "Connect",
    "legal": "Legal",
    "privacy": "Privacy Policy",
    "terms": "Terms of Service",
    "newsletter": "Subscribe to our newsletter",
    "emailPlaceholder": "your@email.com",
    "subscribe": "Subscribe",
    "copyright": "© {year} AI Tech Community Netherlands. All rights reserved."
  },
  "auth": {
    "signIn": "Sign In",
    "signUp": "Sign Up",
    "email": "Email",
    "password": "Password",
    "name": "Full Name",
    "confirmPassword": "Confirm Password",
    "forgotPassword": "Forgot Password?",
    "noAccount": "Don't have an account?",
    "hasAccount": "Already have an account?",
    "orContinueWith": "Or continue with",
    "github": "GitHub",
    "signingIn": "Signing in...",
    "signingUp": "Signing up..."
  },
  "language": {
    "en": "English",
    "nl": "Nederlands"
  }
}
```

Create `messages/nl.json`:
```json
{
  "nav": {
    "home": "Home",
    "events": "Evenementen",
    "blog": "Blog",
    "community": "Community",
    "members": "Leden",
    "signIn": "Inloggen",
    "joinUs": "Word Lid"
  },
  "hero": {
    "title": "AI Tech Community Nederland",
    "subtitle": "Engineers verbinden. Kennis delen. De toekomst bouwen.",
    "description": "Een community voor technische innovators in Nederland. We stimuleren samenwerking door workshops, deep-dives en hackathons gericht op AI en automatisering.",
    "cta": "Word Lid",
    "learnMore": "Meer Informatie"
  },
  "features": {
    "title": "Wat We Bieden",
    "workshops": {
      "title": "Workshops & Hackathons",
      "description": "Praktische sessies waar je bouwt, leert en samenwerkt met mede-engineers aan echte AI-projecten."
    },
    "knowledge": {
      "title": "Kennisuitwisseling",
      "description": "Deep-dives in de nieuwste AI-onderwerpen, geleid door practitioners die de toekomst van technologie bouwen."
    },
    "community": {
      "title": "Community Gedreven",
      "description": "Onafhankelijk en praktisch. Gebouwd door engineers, voor engineers. Jong talent in Nederland ondersteunen."
    },
    "network": {
      "title": "Professioneel Netwerk",
      "description": "Maak verbinding met getalenteerde professionals in het Nederlandse tech-ecosysteem. Vind samenwerkingspartners, mentoren en kansen."
    }
  },
  "events": {
    "title": "Aankomende Evenementen",
    "viewAll": "Alle Evenementen",
    "register": "Registreren",
    "spotsLeft": "{count} plekken beschikbaar",
    "online": "Online",
    "noEvents": "Geen aankomende evenementen. Kijk binnenkort nog eens!"
  },
  "join": {
    "title": "Klaar om mee te doen?",
    "subtitle": "Word onderdeel van de AI Tech community",
    "attend": {
      "title": "Bezoek Evenementen",
      "description": "Doe mee aan onze workshops, hackathons en deep-dives. Gratis en open voor iedereen."
    },
    "speak": {
      "title": "Word Spreker",
      "description": "Deel je expertise met de community. We verwelkomen talks over AI, automatisering en innovatie."
    },
    "partner": {
      "title": "Word Partner",
      "description": "Steun de community en maak verbinding met top Nederlands tech-talent."
    }
  },
  "footer": {
    "description": "Een community voor technische innovators in Nederland.",
    "navigation": "Navigatie",
    "connect": "Verbinden",
    "legal": "Juridisch",
    "privacy": "Privacybeleid",
    "terms": "Algemene Voorwaarden",
    "newsletter": "Abonneer op onze nieuwsbrief",
    "emailPlaceholder": "jouw@email.com",
    "subscribe": "Abonneren",
    "copyright": "© {year} AI Tech Community Nederland. Alle rechten voorbehouden."
  },
  "auth": {
    "signIn": "Inloggen",
    "signUp": "Registreren",
    "email": "E-mail",
    "password": "Wachtwoord",
    "name": "Volledige Naam",
    "confirmPassword": "Bevestig Wachtwoord",
    "forgotPassword": "Wachtwoord vergeten?",
    "noAccount": "Nog geen account?",
    "hasAccount": "Heb je al een account?",
    "orContinueWith": "Of ga verder met",
    "github": "GitHub",
    "signingIn": "Bezig met inloggen...",
    "signingUp": "Bezig met registreren..."
  },
  "language": {
    "en": "English",
    "nl": "Nederlands"
  }
}
```

**Step 6: Update next.config.js for next-intl**

Modify `next.config.js`:
```javascript
import "./src/env.js";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/** @type {import("next").NextConfig} */
const config = {};

export default withNextIntl(config);
```

**Step 7: Restructure app directory for i18n**

Move the app layout to `src/app/[locale]/layout.tsx` and page to `src/app/[locale]/page.tsx`:

- Move: `src/app/layout.tsx` → `src/app/[locale]/layout.tsx`
- Move: `src/app/page.tsx` → `src/app/[locale]/page.tsx`
- Move: `src/app/_components/` → `src/app/[locale]/_components/`
- Keep: `src/app/api/` stays at root (API routes don't need i18n)

Update `src/app/[locale]/layout.tsx`:
```typescript
import "@/styles/globals.css";

import { type Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { notFound } from "next/navigation";

import { TRPCReactProvider } from "@/trpc/react";
import { routing } from "@/i18n/routing";

export const metadata: Metadata = {
  title: "AIT Community — AI Tech Community Netherlands",
  description:
    "A community for technical innovators in the Netherlands. Workshops, hackathons, and deep-dives on AI and automation.",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  const messages = (await import(`../../../messages/${locale}.json`)).default as Record<string, unknown>;

  return (
    <html lang={locale} className={`${geist.variable} ${geistMono.variable}`}>
      <body className="bg-background text-foreground antialiased">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <TRPCReactProvider>{children}</TRPCReactProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
```

**Step 8: Verify the build**

Run: `pnpm build`
Expected: Build succeeds. Visiting `/` should redirect to `/en`.

**Step 9: Commit**

```bash
git add -A
git commit -m "feat: set up next-intl i18n with EN/NL support and URL-based routing"
```

---

## Task 3: Build Design Kit in Pencil

> This task is done entirely in Pencil (design-kit.pen). No code changes.

**Files:**
- Modify: `design-kit.pen`

**Step 1: Get style guide inspiration**

Use `get_style_guide_tags()` and then `get_style_guide([tags])` with tags relevant to:
- Monochromatic, warm, community, tech, modern, website

**Step 2: Set up design variables**

Use `set_variables` to define the AIT Community design tokens:

Variables to create:
- `--background`: `#FFFFFF` (light) / `#09090B` (dark)
- `--foreground`: `#09090B` (light) / `#FAFAFA` (dark)
- `--card`: `#FFFFFF` / `#09090B`
- `--card-foreground`: `#09090B` / `#FAFAFA`
- `--primary`: `#F97316` (orange-500)
- `--primary-foreground`: `#FFFFFF`
- `--secondary`: `#F4F4F5` / `#27272A`
- `--secondary-foreground`: `#18181B` / `#FAFAFA`
- `--muted`: `#F4F4F5` / `#27272A`
- `--muted-foreground`: `#71717A`
- `--accent`: `#F4F4F5` / `#27272A`
- `--accent-foreground`: `#18181B` / `#FAFAFA`
- `--destructive`: `#EF4444`
- `--border`: `#E4E4E7` / `#27272A`
- `--ring`: `#F97316`
- `--font-primary`: `Geist`
- `--font-secondary`: `Geist`
- `--radius-m`: `8`
- `--radius-pill`: `9999`
- `--radius-none`: `0`

**Step 3: Create reusable components**

Build these components as reusable frames on the canvas. Each should follow shadcn/ui patterns:

1. **Button/Primary** — Orange bg, white text, rounded, padding [10, 16]
2. **Button/Secondary** — Gray bg, dark text
3. **Button/Outline** — Border only, transparent bg
4. **Button/Ghost** — No bg, no border, text only
5. **Input/Default** — Border, padding, placeholder text
6. **Badge/Default** — Small rounded pill, secondary bg
7. **Badge/Primary** — Orange bg, white text
8. **Card/Default** — White bg, border, rounded corners, header/content/actions slots
9. **Avatar/Default** — Circle with image or initials
10. **Nav Bar** — Full width, logo, links, language switcher, auth button
11. **Hero Section** — Large heading, subtitle, CTA, background
12. **Event Card** — Date badge, title, type, location, register button
13. **Section Header** — Title + description + optional action
14. **Footer** — Multi-column links, newsletter input, social icons

**Step 4: Take screenshots to verify each component**

Use `get_screenshot` on each component to verify visual quality.

**Step 5: Design the landing page layout**

Create a new top-level frame (1440px wide) with:
- Nav bar at top
- Hero section
- Features grid (4 cards)
- Upcoming Events section (3 event cards)
- Join section (3 option cards: Attend, Speak, Partner)
- Footer

**Step 6: Take screenshot of complete landing page**

Use `get_screenshot` to verify the full layout.

---

## Task 4: Implement Shared Layout Components

**Files:**
- Create: `src/components/ui/language-switcher.tsx`
- Create: `src/components/layout/navbar.tsx`
- Create: `src/components/layout/footer.tsx`

**Step 1: Create the language switcher component**

Create `src/components/ui/language-switcher.tsx`:
```typescript
"use client";

import { useLocale } from "next-intl";
import { useRouter, usePathname } from "@/i18n/navigation";

export function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  function switchLocale(newLocale: "en" | "nl") {
    router.replace(pathname, { locale: newLocale });
  }

  return (
    <div className="flex items-center gap-1 text-sm">
      <button
        onClick={() => switchLocale("en")}
        className={`px-2 py-1 rounded-md transition-colors ${
          locale === "en"
            ? "bg-primary text-primary-foreground font-medium"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        EN
      </button>
      <span className="text-muted-foreground">/</span>
      <button
        onClick={() => switchLocale("nl")}
        className={`px-2 py-1 rounded-md transition-colors ${
          locale === "nl"
            ? "bg-primary text-primary-foreground font-medium"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        NL
      </button>
    </div>
  );
}
```

**Step 2: Create the navbar component**

Create `src/components/layout/navbar.tsx`:
```typescript
"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { LanguageSwitcher } from "@/components/ui/language-switcher";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Menu } from "lucide-react";
import { useState } from "react";

export function Navbar() {
  const t = useTranslations("nav");
  const [open, setOpen] = useState(false);

  const navLinks = [
    { href: "/events", label: t("events") },
    { href: "/blog", label: t("blog") },
    { href: "/community", label: t("community") },
    { href: "/members", label: t("members") },
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-xl font-bold tracking-tight">
            AIT<span className="text-primary">.</span>
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-6 md:flex">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-4 md:flex">
          <LanguageSwitcher />
          <Link href="/auth/signin">
            <Button variant="ghost" size="sm">
              {t("signIn")}
            </Button>
          </Link>
          <Link href="/auth/signup">
            <Button size="sm">{t("joinUs")}</Button>
          </Link>
        </div>

        {/* Mobile nav */}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild className="md:hidden">
            <Button variant="ghost" size="icon">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-[300px]">
            <nav className="mt-8 flex flex-col gap-4">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-lg text-muted-foreground transition-colors hover:text-foreground"
                  onClick={() => setOpen(false)}
                >
                  {link.label}
                </Link>
              ))}
              <div className="my-4 border-t" />
              <LanguageSwitcher />
              <Link href="/auth/signin" onClick={() => setOpen(false)}>
                <Button variant="ghost" className="w-full justify-start">
                  {t("signIn")}
                </Button>
              </Link>
              <Link href="/auth/signup" onClick={() => setOpen(false)}>
                <Button className="w-full">{t("joinUs")}</Button>
              </Link>
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
```

**Step 3: Create the footer component**

Create `src/components/layout/footer.tsx`:
```typescript
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function Footer() {
  const t = useTranslations("footer");
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
          {/* Brand */}
          <div className="space-y-4">
            <span className="text-xl font-bold tracking-tight">
              AIT<span className="text-primary">.</span>
            </span>
            <p className="text-sm text-muted-foreground">
              {t("description")}
            </p>
          </div>

          {/* Navigation */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold">{t("navigation")}</h3>
            <nav className="flex flex-col gap-2">
              <Link href="/events" className="text-sm text-muted-foreground hover:text-foreground">
                Events
              </Link>
              <Link href="/blog" className="text-sm text-muted-foreground hover:text-foreground">
                Blog
              </Link>
              <Link href="/community" className="text-sm text-muted-foreground hover:text-foreground">
                Community
              </Link>
              <Link href="/members" className="text-sm text-muted-foreground hover:text-foreground">
                Members
              </Link>
            </nav>
          </div>

          {/* Legal */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold">{t("legal")}</h3>
            <nav className="flex flex-col gap-2">
              <Link href="/privacy" className="text-sm text-muted-foreground hover:text-foreground">
                {t("privacy")}
              </Link>
              <Link href="/terms" className="text-sm text-muted-foreground hover:text-foreground">
                {t("terms")}
              </Link>
            </nav>
          </div>

          {/* Newsletter */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold">{t("newsletter")}</h3>
            <form className="flex gap-2">
              <Input
                type="email"
                placeholder={t("emailPlaceholder")}
                className="flex-1"
              />
              <Button type="submit" size="sm">
                {t("subscribe")}
              </Button>
            </form>
          </div>
        </div>

        <div className="mt-12 border-t pt-8">
          <p className="text-center text-sm text-muted-foreground">
            {t("copyright", { year: currentYear })}
          </p>
        </div>
      </div>
    </footer>
  );
}
```

**Step 4: Verify the build**

Run: `pnpm build`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add src/components/
git commit -m "feat: add navbar, footer, and language switcher components"
```

---

## Task 5: Implement the Landing Page

**Files:**
- Modify: `src/app/[locale]/page.tsx`
- Create: `src/app/[locale]/_components/hero-section.tsx`
- Create: `src/app/[locale]/_components/features-section.tsx`
- Create: `src/app/[locale]/_components/events-preview-section.tsx`
- Create: `src/app/[locale]/_components/join-section.tsx`

**Step 1: Create the hero section**

Create `src/app/[locale]/_components/hero-section.tsx`:
```typescript
"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";

export function HeroSection() {
  const t = useTranslations("hero");

  return (
    <section className="relative overflow-hidden">
      <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6 sm:py-32 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mx-auto max-w-3xl text-center"
        >
          <h1 className="text-4xl font-bold tracking-tight sm:text-6xl lg:text-7xl">
            {t("title")}
          </h1>
          <p className="mt-4 text-lg font-medium text-primary sm:text-xl">
            {t("subtitle")}
          </p>
          <p className="mt-6 text-lg text-muted-foreground">
            {t("description")}
          </p>
          <div className="mt-10 flex items-center justify-center gap-4">
            <Link href="/auth/signup">
              <Button size="lg" className="gap-2">
                {t("cta")}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="#features">
              <Button variant="outline" size="lg">
                {t("learnMore")}
              </Button>
            </Link>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
```

**Step 2: Create the features section**

Create `src/app/[locale]/_components/features-section.tsx`:
```typescript
"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { motion } from "framer-motion";
import { Cpu, Users, Lightbulb, Network } from "lucide-react";

const featureIcons = [Cpu, Lightbulb, Users, Network] as const;
const featureKeys = ["workshops", "knowledge", "community", "network"] as const;

export function FeaturesSection() {
  const t = useTranslations("features");

  return (
    <section id="features" className="border-t border-border bg-muted/50">
      <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            {t("title")}
          </h2>
        </div>
        <div className="mt-16 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {featureKeys.map((key, i) => {
            const Icon = featureIcons[i];
            return (
              <motion.div
                key={key}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
                viewport={{ once: true }}
              >
                <Card className="h-full border-border/50 bg-background">
                  <CardContent className="pt-6">
                    <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                      <Icon className="h-6 w-6 text-primary" />
                    </div>
                    <h3 className="text-lg font-semibold">
                      {t(`${key}.title`)}
                    </h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {t(`${key}.description`)}
                    </p>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
```

**Step 3: Create the events preview section**

Create `src/app/[locale]/_components/events-preview-section.tsx`:
```typescript
"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/i18n/navigation";
import { motion } from "framer-motion";
import { Calendar, MapPin, ArrowRight } from "lucide-react";

// Placeholder events for the landing page. Will be replaced with real data in Phase 2.
const placeholderEvents = [
  {
    id: "1",
    title: "AI-Powered Code Review Workshop",
    type: "workshop",
    date: "2026-03-15",
    location: "Amsterdam",
    spotsLeft: 12,
  },
  {
    id: "2",
    title: "LLM Fine-Tuning Deep Dive",
    type: "deep_dive",
    date: "2026-03-22",
    location: "Online",
    spotsLeft: 30,
  },
  {
    id: "3",
    title: "Spring AI Hackathon",
    type: "hackathon",
    date: "2026-04-05",
    location: "Rotterdam",
    spotsLeft: 8,
  },
];

export function EventsPreviewSection() {
  const t = useTranslations("events");

  return (
    <section className="border-t border-border">
      <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            {t("title")}
          </h2>
          <Link href="/events">
            <Button variant="ghost" className="gap-2">
              {t("viewAll")}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
          {placeholderEvents.map((event, i) => (
            <motion.div
              key={event.id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              viewport={{ once: true }}
            >
              <Card className="h-full border-border/50 transition-shadow hover:shadow-md">
                <CardContent className="pt-6">
                  <Badge variant="secondary" className="mb-3">
                    {event.type.replace("_", " ")}
                  </Badge>
                  <h3 className="text-lg font-semibold">{event.title}</h3>
                  <div className="mt-4 flex flex-col gap-2 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      <span>
                        {new Date(event.date).toLocaleDateString("en-NL", {
                          month: "long",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4" />
                      <span>{event.location}</span>
                    </div>
                  </div>
                  <div className="mt-6 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      {t("spotsLeft", { count: event.spotsLeft })}
                    </span>
                    <Button size="sm">{t("register")}</Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
```

**Step 4: Create the join section**

Create `src/app/[locale]/_components/join-section.tsx`:
```typescript
"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { motion } from "framer-motion";
import { CalendarCheck, Mic, Handshake, ArrowRight } from "lucide-react";

const joinOptions = [
  { key: "attend", Icon: CalendarCheck, href: "/events" },
  { key: "speak", Icon: Mic, href: "/auth/signup" },
  { key: "partner", Icon: Handshake, href: "/auth/signup" },
] as const;

export function JoinSection() {
  const t = useTranslations("join");

  return (
    <section className="border-t border-border bg-foreground text-background">
      <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            {t("title")}
          </h2>
          <p className="mt-4 text-lg opacity-80">{t("subtitle")}</p>
        </div>

        <div className="mt-16 grid grid-cols-1 gap-6 md:grid-cols-3">
          {joinOptions.map(({ key, Icon, href }, i) => (
            <motion.div
              key={key}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              viewport={{ once: true }}
            >
              <Card className="h-full border-border/20 bg-background/5 backdrop-blur">
                <CardContent className="pt-6">
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/20">
                    <Icon className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold text-background">
                    {t(`${key}.title`)}
                  </h3>
                  <p className="mt-2 text-sm opacity-70">
                    {t(`${key}.description`)}
                  </p>
                  <Link href={href} className="mt-4 inline-block">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2 border-border/20 text-background hover:bg-background/10"
                    >
                      {t(`${key}.title`)}
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
```

**Step 5: Compose the landing page**

Update `src/app/[locale]/page.tsx`:
```typescript
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { HeroSection } from "./_components/hero-section";
import { FeaturesSection } from "./_components/features-section";
import { EventsPreviewSection } from "./_components/events-preview-section";
import { JoinSection } from "./_components/join-section";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-1">
        <HeroSection />
        <FeaturesSection />
        <EventsPreviewSection />
        <JoinSection />
      </main>
      <Footer />
    </div>
  );
}
```

**Step 6: Verify the build**

Run: `pnpm build`
Expected: Build succeeds

**Step 7: Visual verification**

Run: `pnpm dev`
Check: Visit `http://localhost:3000/en` and `http://localhost:3000/nl` — both should render the landing page in the correct language. Verify the language switcher works.

**Step 8: Commit**

```bash
git add src/app/
git commit -m "feat: implement landing page with hero, features, events preview, and join sections"
```

---

## Task 6: Implement Auth Pages

**Files:**
- Create: `src/app/[locale]/auth/signin/page.tsx`
- Create: `src/app/[locale]/auth/signup/page.tsx`
- Create: `src/app/[locale]/auth/_components/auth-form.tsx`

**Step 1: Create the shared auth form component**

Create `src/app/[locale]/auth/_components/auth-form.tsx`:
```typescript
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Link } from "@/i18n/navigation";
import { authClient } from "@/server/better-auth/client";
import { useRouter } from "@/i18n/navigation";
import { Github } from "lucide-react";

interface AuthFormProps {
  mode: "signin" | "signup";
}

export function AuthForm({ mode }: AuthFormProps) {
  const t = useTranslations("auth");
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    try {
      if (mode === "signup") {
        const name = formData.get("name") as string;
        await authClient.signUp.email({
          email,
          password,
          name,
        });
      } else {
        await authClient.signIn.email({
          email,
          password,
        });
      }
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function handleGithub() {
    await authClient.signIn.social({
      provider: "github",
      callbackURL: "/dashboard",
    });
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">
          {mode === "signin" ? t("signIn") : t("signUp")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "signup" && (
            <div className="space-y-2">
              <Label htmlFor="name">{t("name")}</Label>
              <Input id="name" name="name" required />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">{t("email")}</Label>
            <Input id="email" name="email" type="email" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">{t("password")}</Label>
            <Input id="password" name="password" type="password" required />
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading
              ? mode === "signin"
                ? t("signingIn")
                : t("signingUp")
              : mode === "signin"
                ? t("signIn")
                : t("signUp")}
          </Button>
        </form>

        <div className="my-6 flex items-center gap-4">
          <Separator className="flex-1" />
          <span className="text-xs text-muted-foreground">
            {t("orContinueWith")}
          </span>
          <Separator className="flex-1" />
        </div>

        <Button
          variant="outline"
          className="w-full gap-2"
          onClick={handleGithub}
        >
          <Github className="h-4 w-4" />
          {t("github")}
        </Button>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          {mode === "signin" ? t("noAccount") : t("hasAccount")}{" "}
          <Link
            href={mode === "signin" ? "/auth/signup" : "/auth/signin"}
            className="font-medium text-primary hover:underline"
          >
            {mode === "signin" ? t("signUp") : t("signIn")}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
```

**Step 2: Create the sign in page**

Create `src/app/[locale]/auth/signin/page.tsx`:
```typescript
import { Navbar } from "@/components/layout/navbar";
import { AuthForm } from "../_components/auth-form";

export default function SignInPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <AuthForm mode="signin" />
      </main>
    </div>
  );
}
```

**Step 3: Create the sign up page**

Create `src/app/[locale]/auth/signup/page.tsx`:
```typescript
import { Navbar } from "@/components/layout/navbar";
import { AuthForm } from "../_components/auth-form";

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <AuthForm mode="signup" />
      </main>
    </div>
  );
}
```

**Step 4: Verify the build**

Run: `pnpm build`
Expected: Build succeeds

**Step 5: Visual verification**

Run: `pnpm dev`
Check:
- `http://localhost:3000/en/auth/signin` — sign in form renders
- `http://localhost:3000/nl/auth/signin` — sign in form renders in Dutch
- `http://localhost:3000/en/auth/signup` — sign up form renders (with extra name field)
- Links between signin/signup work
- Language switcher works on auth pages

**Step 6: Commit**

```bash
git add src/app/
git commit -m "feat: implement auth pages with sign in and sign up forms"
```

---

## Task 7: Configure Tailwind Theme for Monochromatic + Orange

**Files:**
- Modify: `src/styles/globals.css`

**Step 1: Update globals.css with shadcn/ui zinc theme + orange accent**

Update `src/styles/globals.css` to include the proper CSS variables for the monochromatic + orange theme. The exact content will depend on what `shadcn init` generates, but override the `--primary` variable to use orange:

```css
@import "tailwindcss";

@theme {
  --font-sans: var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif;
  --font-mono: var(--font-geist-mono), ui-monospace, monospace;
}

/* Override shadcn's default primary with warm orange */
:root {
  --primary: 24.6 95% 53.1%;        /* orange-500 */
  --primary-foreground: 0 0% 100%;
  --ring: 24.6 95% 53.1%;
}

.dark {
  --primary: 20.5 90.2% 48.2%;      /* orange-600 for dark mode */
  --primary-foreground: 0 0% 100%;
  --ring: 20.5 90.2% 48.2%;
}
```

Note: The rest of the CSS variables (background, foreground, card, border, etc.) will be set by shadcn init with the Zinc base. Only override `--primary` and `--ring`.

**Step 2: Verify the build**

Run: `pnpm build`
Expected: Build succeeds, orange accent is visible on buttons and interactive elements.

**Step 3: Commit**

```bash
git add src/styles/globals.css
git commit -m "feat: configure monochromatic zinc theme with warm orange accent"
```

---

## Task 8: Final Integration and Verification

**Files:**
- No new files — this is integration testing

**Step 1: Run the full build**

Run: `pnpm build`
Expected: Clean build with no errors

**Step 2: Run linting**

Run: `pnpm lint`
Expected: No lint errors (warnings are acceptable)

**Step 3: Run type checking**

Run: `pnpm typecheck`
Expected: No type errors

**Step 4: Manual testing checklist**

Run `pnpm dev` and verify:

- [ ] `/` redirects to `/en`
- [ ] `/en` shows landing page with all sections
- [ ] `/nl` shows landing page in Dutch
- [ ] Language switcher toggles between EN and NL
- [ ] Navbar links are visible and styled
- [ ] Hero section has orange CTA button
- [ ] Features section shows 4 cards with icons
- [ ] Events preview shows 3 placeholder event cards
- [ ] Join section has dark background with 3 option cards
- [ ] Footer shows newsletter input and links
- [ ] `/en/auth/signin` shows sign in form
- [ ] `/en/auth/signup` shows sign up form with name field
- [ ] Auth forms are translated when switching to `/nl`
- [ ] Mobile responsive: hamburger menu appears on small screens
- [ ] Mobile nav sheet opens and closes properly

**Step 5: Final commit**

```bash
git add -A
git commit -m "feat: complete Phase 1 — design kit, landing page, auth, and i18n setup"
```

---

## Summary

| Task | Description | Estimated Steps |
|------|-------------|-----------------|
| 1 | Install dependencies (shadcn/ui, next-intl, framer-motion) | 6 |
| 2 | Set up i18n infrastructure | 9 |
| 3 | Build design kit in Pencil | 6 |
| 4 | Implement shared layout components (navbar, footer) | 5 |
| 5 | Implement landing page sections | 8 |
| 6 | Implement auth pages | 6 |
| 7 | Configure Tailwind theme | 3 |
| 8 | Final integration and verification | 5 |

**Total:** 8 tasks, ~48 steps

After Phase 1 is complete, Phase 2 (Events system) can begin using the same design kit and infrastructure.
