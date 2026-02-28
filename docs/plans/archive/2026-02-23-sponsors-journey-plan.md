# Sponsors Journey Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a full sponsor funnel: public sponsors page with tiers, sponsor showcase, 3-step application form with Payload CMS pipeline tracking, job board, and homepage integration.

**Architecture:** Three new Payload CMS collections (Sponsors, SponsorApplications, Jobs) provide the data layer. A tRPC `sponsors` router handles the application submission + public queries. Two new pages (`/sponsors`, `/jobs`) use Server Components with Payload queries. A Payload afterChange hook on SponsorApplications auto-creates Sponsor entries on approval and sends emails via Resend.

**Tech Stack:** Next.js 15, Payload CMS 3, tRPC 11, Drizzle/Neon Postgres, Resend, next-intl, Tailwind CSS 4, Radix UI

---

## Task 1: Create Sponsors Payload Collection

**Files:**
- Create: `src/collections/Sponsors.ts`
- Modify: `src/payload.config.ts`

**Step 1: Create the Sponsors collection**

```typescript
// src/collections/Sponsors.ts
import type { CollectionConfig } from "payload";

export const Sponsors: CollectionConfig = {
  slug: "sponsors",
  admin: {
    useAsTitle: "name",
    defaultColumns: ["name", "tier", "status"],
  },
  fields: [
    { name: "name", type: "text", required: true },
    {
      name: "slug",
      type: "text",
      required: true,
      unique: true,
      admin: { position: "sidebar" },
    },
    { name: "logo", type: "upload", relationTo: "media", required: true },
    { name: "website", type: "text" },
    {
      name: "tier",
      type: "select",
      required: true,
      options: [
        { label: "Gold", value: "gold" },
        { label: "Silver", value: "silver" },
        { label: "Bronze", value: "bronze" },
      ],
      admin: { position: "sidebar" },
    },
    { name: "tagline", type: "text", localized: true },
    {
      name: "featured",
      type: "checkbox",
      defaultValue: false,
      admin: {
        position: "sidebar",
        description: "Show on homepage sponsor strip",
      },
    },
    {
      name: "status",
      type: "select",
      required: true,
      defaultValue: "active",
      options: [
        { label: "Active", value: "active" },
        { label: "Inactive", value: "inactive" },
      ],
      admin: { position: "sidebar" },
    },
  ],
};
```

**Step 2: Register in Payload config**

In `src/payload.config.ts`, add:
- Import: `import { Sponsors } from "./collections/Sponsors";`
- Add `Sponsors` to the `collections` array (after `Pages`)

**Step 3: Run Payload migration**

Run: `pnpm payload migrate:create`
Run: `pnpm payload migrate`

**Step 4: Verify**

Run: `pnpm build` (or `pnpm dev` and check `/admin/collections/sponsors` exists)

**Step 5: Commit**

```bash
git add src/collections/Sponsors.ts src/payload.config.ts src/migrations/
git commit -m "feat(sponsors): add Sponsors Payload collection"
```

---

## Task 2: Create SponsorApplications Payload Collection

**Files:**
- Create: `src/collections/SponsorApplications.ts`
- Modify: `src/payload.config.ts`

**Step 1: Create the SponsorApplications collection**

```typescript
// src/collections/SponsorApplications.ts
import type { CollectionConfig } from "payload";

export const SponsorApplications: CollectionConfig = {
  slug: "sponsor-applications",
  admin: {
    useAsTitle: "companyName",
    defaultColumns: ["companyName", "tier", "status", "appliedAt"],
  },
  fields: [
    { name: "companyName", type: "text", required: true },
    { name: "website", type: "text" },
    { name: "contactName", type: "text", required: true },
    { name: "contactEmail", type: "email", required: true },
    {
      name: "tier",
      type: "select",
      required: true,
      options: [
        { label: "Gold", value: "gold" },
        { label: "Silver", value: "silver" },
        { label: "Bronze", value: "bronze" },
      ],
    },
    { name: "message", type: "textarea" },
    {
      name: "status",
      type: "select",
      required: true,
      defaultValue: "pending",
      options: [
        { label: "Pending", value: "pending" },
        { label: "In Review", value: "in_review" },
        { label: "Approved", value: "approved" },
        { label: "Rejected", value: "rejected" },
      ],
      admin: { position: "sidebar" },
    },
    {
      name: "notes",
      type: "textarea",
      admin: { description: "Internal notes (not visible to applicant)" },
    },
    {
      name: "appliedAt",
      type: "date",
      admin: { position: "sidebar", readOnly: true },
    },
  ],
  hooks: {
    beforeChange: [
      ({ data, operation }) => {
        if (operation === "create" && data) {
          data.appliedAt = new Date().toISOString();
        }
        return data;
      },
    ],
  },
};
```

**Step 2: Register in Payload config**

In `src/payload.config.ts`, add:
- Import: `import { SponsorApplications } from "./collections/SponsorApplications";`
- Add `SponsorApplications` to the `collections` array

**Step 3: Run migration**

Run: `pnpm payload migrate:create`
Run: `pnpm payload migrate`

**Step 4: Commit**

```bash
git add src/collections/SponsorApplications.ts src/payload.config.ts src/migrations/
git commit -m "feat(sponsors): add SponsorApplications Payload collection"
```

---

## Task 3: Create Jobs Payload Collection

**Files:**
- Create: `src/collections/Jobs.ts`
- Modify: `src/payload.config.ts`

**Step 1: Create the Jobs collection**

```typescript
// src/collections/Jobs.ts
import type { CollectionConfig } from "payload";

export const Jobs: CollectionConfig = {
  slug: "jobs",
  admin: {
    useAsTitle: "title",
    defaultColumns: ["title", "sponsor", "type", "status"],
  },
  fields: [
    { name: "title", type: "text", required: true },
    {
      name: "sponsor",
      type: "relationship",
      relationTo: "sponsors",
      required: true,
    },
    { name: "description", type: "richText", required: true },
    { name: "location", type: "text", required: true },
    {
      name: "type",
      type: "select",
      required: true,
      options: [
        { label: "Remote", value: "remote" },
        { label: "Hybrid", value: "hybrid" },
        { label: "On-site", value: "onsite" },
      ],
    },
    { name: "url", type: "text", required: true, admin: { description: "External apply link" } },
    {
      name: "tags",
      type: "array",
      fields: [{ name: "tag", type: "text", required: true }],
    },
    {
      name: "status",
      type: "select",
      required: true,
      defaultValue: "active",
      options: [
        { label: "Active", value: "active" },
        { label: "Expired", value: "expired" },
      ],
      admin: { position: "sidebar" },
    },
    {
      name: "postedAt",
      type: "date",
      admin: { position: "sidebar" },
    },
    {
      name: "expiresAt",
      type: "date",
      admin: { position: "sidebar" },
    },
  ],
  hooks: {
    beforeChange: [
      ({ data, operation }) => {
        if (operation === "create" && data && !data.postedAt) {
          data.postedAt = new Date().toISOString();
        }
        return data;
      },
    ],
  },
};
```

**Step 2: Register in Payload config**

In `src/payload.config.ts`, add:
- Import: `import { Jobs } from "./collections/Jobs";`
- Add `Jobs` to the `collections` array

**Step 3: Run migration**

Run: `pnpm payload migrate:create`
Run: `pnpm payload migrate`

**Step 4: Commit**

```bash
git add src/collections/Jobs.ts src/payload.config.ts src/migrations/
git commit -m "feat(sponsors): add Jobs Payload collection"
```

---

## Task 4: Add Sponsor Email Functions

**Files:**
- Modify: `src/server/email.ts`

**Step 1: Add sponsor email functions**

Append to `src/server/email.ts`:

```typescript
interface SponsorApplicationEmailData {
  companyName: string;
  tier: string;
  contactName: string;
  contactEmail: string;
}

/**
 * Send confirmation to applicant after submitting sponsor application.
 */
export async function sendSponsorApplicationConfirmation(
  to: string,
  contactName: string,
  data: SponsorApplicationEmailData,
) {
  const resend = getResend();
  if (!resend) return;

  await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: `Application received — ${data.tier} sponsorship`,
    html: `
      <div style="font-family: monospace; max-width: 600px; margin: 0 auto;">
        <h2 style="font-size: 18px;">Thanks for your interest!</h2>
        <p>Hi ${contactName},</p>
        <p>We've received your <strong>${data.tier}</strong> sponsorship application for <strong>${data.companyName}</strong>.</p>
        <p>Our team will review it and get back to you shortly.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
        <p style="font-size: 12px; color: #999;">AIT Community Netherlands</p>
      </div>
    `,
  });
}

/**
 * Notify AIT team of new sponsor application.
 */
export async function sendSponsorApplicationNotification(
  data: SponsorApplicationEmailData,
) {
  const resend = getResend();
  if (!resend) return;

  await resend.emails.send({
    from: FROM_EMAIL,
    to: "team@aitcommunity.org",
    subject: `New sponsor application: ${data.companyName} (${data.tier})`,
    html: `
      <div style="font-family: monospace; max-width: 600px; margin: 0 auto;">
        <h2 style="font-size: 18px;">New Sponsor Application</h2>
        <table style="margin: 16px 0; font-size: 14px;">
          <tr><td style="padding: 4px 12px 4px 0; color: #666;">Company</td><td>${data.companyName}</td></tr>
          <tr><td style="padding: 4px 12px 4px 0; color: #666;">Tier</td><td>${data.tier}</td></tr>
          <tr><td style="padding: 4px 12px 4px 0; color: #666;">Contact</td><td>${data.contactName} (${data.contactEmail})</td></tr>
        </table>
        <p><a href="https://aitcommunity.org/admin/collections/sponsor-applications" style="color: #000; font-weight: bold;">Review in admin →</a></p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
        <p style="font-size: 12px; color: #999;">AIT Community Netherlands</p>
      </div>
    `,
  });
}

/**
 * Welcome email sent to sponsor on application approval.
 */
export async function sendSponsorWelcome(
  to: string,
  contactName: string,
  data: SponsorApplicationEmailData,
) {
  const resend = getResend();
  if (!resend) return;

  await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: `Welcome aboard, ${data.companyName}!`,
    html: `
      <div style="font-family: monospace; max-width: 600px; margin: 0 auto;">
        <h2 style="font-size: 18px;">You're an official AIT sponsor!</h2>
        <p>Hi ${contactName},</p>
        <p>Great news — your <strong>${data.tier}</strong> sponsorship application for <strong>${data.companyName}</strong> has been approved.</p>
        <p>Welcome to the AIT Community Netherlands as an official sponsor. Our team will be in touch with next steps.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
        <p style="font-size: 12px; color: #999;">AIT Community Netherlands</p>
      </div>
    `,
  });
}
```

**Step 2: Commit**

```bash
git add src/server/email.ts
git commit -m "feat(sponsors): add sponsor email templates"
```

---

## Task 5: Add Payload Hook for Application Approval

**Files:**
- Modify: `src/collections/SponsorApplications.ts`

**Step 1: Add afterChange hook**

Add an `afterChange` hook to `SponsorApplications` that fires when status changes to `approved`:

```typescript
// Add to the hooks object in SponsorApplications:
afterChange: [
  async ({ doc, previousDoc, req }) => {
    // Only fire when status changes to approved
    if (doc.status !== "approved" || previousDoc?.status === "approved") return;

    const { sendSponsorWelcome } = await import("@/server/email");

    // Send welcome email
    void sendSponsorWelcome(doc.contactEmail, doc.contactName, {
      companyName: doc.companyName,
      tier: doc.tier,
      contactName: doc.contactName,
      contactEmail: doc.contactEmail,
    });
  },
],
```

**Step 2: Commit**

```bash
git add src/collections/SponsorApplications.ts
git commit -m "feat(sponsors): add approval hook with welcome email"
```

---

## Task 6: Create tRPC Sponsors Router

**Files:**
- Create: `src/server/api/routers/sponsors.ts`
- Modify: `src/server/api/root.ts`

**Step 1: Create the sponsors router**

```typescript
// src/server/api/routers/sponsors.ts
import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import { getPayloadClient } from "@/server/payload";
import {
  sendSponsorApplicationConfirmation,
  sendSponsorApplicationNotification,
} from "@/server/email";

export const sponsorsRouter = createTRPCRouter({
  /** Get all active sponsors, ordered by tier (gold first). */
  list: publicProcedure.query(async () => {
    const payload = await getPayloadClient();
    const { docs } = await payload.find({
      collection: "sponsors",
      where: { status: { equals: "active" } },
      sort: "tier",
      limit: 100,
    });
    return docs;
  }),

  /** Get featured sponsors for homepage strip. */
  featured: publicProcedure.query(async () => {
    const payload = await getPayloadClient();
    const { docs } = await payload.find({
      collection: "sponsors",
      where: {
        status: { equals: "active" },
        featured: { equals: true },
      },
      limit: 20,
    });
    return docs;
  }),

  /** Submit a sponsor application (public, no auth required). */
  apply: publicProcedure
    .input(
      z.object({
        companyName: z.string().min(1).max(200),
        website: z.string().url().optional().or(z.literal("")),
        contactName: z.string().min(1).max(200),
        contactEmail: z.string().email(),
        tier: z.enum(["gold", "silver", "bronze"]),
        message: z.string().max(2000).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const payload = await getPayloadClient();

      const application = await payload.create({
        collection: "sponsor-applications",
        data: {
          companyName: input.companyName,
          website: input.website ?? "",
          contactName: input.contactName,
          contactEmail: input.contactEmail,
          tier: input.tier,
          message: input.message ?? "",
          status: "pending",
        },
      });

      const emailData = {
        companyName: input.companyName,
        tier: input.tier,
        contactName: input.contactName,
        contactEmail: input.contactEmail,
      };

      // Fire emails async (don't block response)
      void sendSponsorApplicationConfirmation(
        input.contactEmail,
        input.contactName,
        emailData,
      );
      void sendSponsorApplicationNotification(emailData);

      return { success: true, applicationId: application.id };
    }),

  /** Get active jobs with optional filters. */
  jobs: publicProcedure
    .input(
      z.object({
        type: z.enum(["remote", "hybrid", "onsite"]).optional(),
        limit: z.number().default(20),
      }).optional(),
    )
    .query(async ({ input }) => {
      const payload = await getPayloadClient();

      const where: Record<string, unknown> = {
        status: { equals: "active" },
      };
      if (input?.type) {
        where.type = { equals: input.type };
      }

      const { docs } = await payload.find({
        collection: "jobs",
        where,
        sort: "-postedAt",
        limit: input?.limit ?? 20,
        depth: 1, // populate sponsor relationship
      });
      return docs;
    }),
});
```

**Step 2: Register in root router**

In `src/server/api/root.ts`, add:
- Import: `import { sponsorsRouter } from "@/server/api/routers/sponsors";`
- Add `sponsors: sponsorsRouter` to the `createTRPCRouter` call

**Step 3: Verify types**

Run: `pnpm build` to check for type errors

**Step 4: Commit**

```bash
git add src/server/api/routers/sponsors.ts src/server/api/root.ts
git commit -m "feat(sponsors): add tRPC sponsors router with apply, list, jobs"
```

---

## Task 7: Add i18n Translation Keys

**Files:**
- Modify: `messages/en.json`
- Modify: `messages/nl.json`

**Step 1: Add sponsors namespace to en.json**

Add these keys to `messages/en.json`:

```json
"sponsors": {
  "title": "Sponsors",
  "heroTitle": "Power the AI Community",
  "heroDescription": "Partner with AIT Community Netherlands and connect your brand with the leading AI and tech talent in the Netherlands.",
  "tiersTitle": "Sponsorship Tiers",
  "tierGold": "Gold",
  "tierSilver": "Silver",
  "tierBronze": "Bronze",
  "benefitLogo": "Logo on sponsors page",
  "benefitHomepage": "Logo on homepage",
  "benefitJobs": "Job postings",
  "benefitEvents": "Event presence",
  "benefitNewsletter": "Newsletter mentions",
  "jobsUnlimited": "Unlimited",
  "yes": "Yes",
  "no": "—",
  "larger": "Yes (larger)",
  "coHost": "Yes + co-host",
  "quarterly": "Quarterly",
  "monthly": "Monthly",
  "monthlySocial": "Monthly + social",
  "currentSponsors": "Our Sponsors",
  "noSponsors": "Be our first sponsor!",
  "becomeSponsor": "Become a Sponsor",
  "applyTitle": "Apply to Sponsor AIT",
  "stepCompany": "Company Info",
  "stepTier": "Select Tier",
  "stepMessage": "Your Message",
  "companyName": "Company Name",
  "website": "Website",
  "contactName": "Contact Name",
  "contactEmail": "Contact Email",
  "message": "Why do you want to sponsor AIT?",
  "messagePlaceholder": "Tell us about your goals and how you'd like to partner with the community...",
  "next": "Next",
  "back": "Back",
  "submit": "Submit Application",
  "submitting": "Submitting...",
  "successTitle": "Application Received!",
  "successMessage": "Thanks for your interest in sponsoring AIT. We'll review your application and get back to you shortly.",
  "close": "Close"
},
"jobs": {
  "title": "Jobs",
  "subtitle": "Opportunities from our sponsor partners.",
  "noJobs": "No open positions right now. Check back soon!",
  "allTypes": "All",
  "remote": "Remote",
  "hybrid": "Hybrid",
  "onsite": "On-site",
  "apply": "Apply",
  "postedBy": "Posted by",
  "viewAll": "View All Jobs"
}
```

**Step 2: Add the same keys in Dutch to nl.json**

Translate all keys to Dutch and add them to `messages/nl.json`.

**Step 3: Commit**

```bash
git add messages/en.json messages/nl.json
git commit -m "feat(sponsors): add i18n translation keys for sponsors and jobs"
```

---

## Task 8: Add Navbar Links

**Files:**
- Modify: `src/components/navbar.tsx`

**Step 1: Add sponsors and jobs to navLinks array**

In `src/components/navbar.tsx`, update the `navLinks` array:

```typescript
const navLinks = [
  { href: "/events", key: "events", shortcut: "E" },
  { href: "/members", key: "members", shortcut: "M" },
  { href: "/blog", key: "blog", shortcut: "B" },
  { href: "/community", key: "community", shortcut: "C" },
  { href: "/sponsors", key: "sponsors", shortcut: "S" },
  { href: "/jobs", key: "jobs", shortcut: "W" },
] as const;
```

**Step 2: Add nav keys to i18n**

In `messages/en.json` nav section, add:
```json
"sponsors": "Sponsors",
"jobs": "Jobs"
```

In `messages/nl.json` nav section, add:
```json
"sponsors": "Sponsors",
"jobs": "Vacatures"
```

**Step 3: Verify**

Run: `pnpm dev` and check navbar renders with new links

**Step 4: Commit**

```bash
git add src/components/navbar.tsx messages/en.json messages/nl.json
git commit -m "feat(sponsors): add Sponsors and Jobs to navbar"
```

---

## Task 9: Build the Sponsors Page

**Files:**
- Create: `src/app/[locale]/sponsors/page.tsx`

**Step 1: Create the sponsors page**

This is a Server Component that fetches sponsors from Payload and renders:
1. Hero section with value proposition
2. Tier comparison table
3. Sponsor logo showcase grid
4. "Become a Sponsor" CTA that links to the application modal (client component, Task 10)

```typescript
// src/app/[locale]/sponsors/page.tsx
import { getLocale, getTranslations } from "next-intl/server";
import { getPayloadClient } from "@/server/payload";
import { SponsorApplicationModal } from "@/components/sponsor-application-modal";
import Image from "next/image";

const tierOrder = { gold: 0, silver: 1, bronze: 2 } as const;

const benefits = [
  { key: "benefitLogo", bronze: "yes", silver: "yes", gold: "yes" },
  { key: "benefitHomepage", bronze: "no", silver: "yes", gold: "larger" },
  { key: "benefitJobs", bronze: "1", silver: "3", gold: "jobsUnlimited" },
  { key: "benefitEvents", bronze: "no", silver: "yes", gold: "coHost" },
  { key: "benefitNewsletter", bronze: "quarterly", silver: "monthly", gold: "monthlySocial" },
] as const;

export default async function SponsorsPage() {
  const locale = await getLocale();
  const t = await getTranslations("sponsors");

  const payload = await getPayloadClient();
  const { docs: sponsors } = await payload.find({
    collection: "sponsors",
    where: { status: { equals: "active" } },
    limit: 100,
    depth: 1,
  });

  const sortedSponsors = sponsors.sort(
    (a, b) =>
      (tierOrder[a.tier as keyof typeof tierOrder] ?? 2) -
      (tierOrder[b.tier as keyof typeof tierOrder] ?? 2),
  );

  return (
    <div className="px-6 py-16 sm:px-12">
      {/* Hero */}
      <div className="border-border border-b pb-4">
        <span className="text-muted-foreground font-mono text-xs font-medium tracking-wider">
          / {t("title").toUpperCase()}
        </span>
      </div>
      <div className="mt-8 max-w-2xl space-y-4">
        <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
          {t("heroTitle")}
        </h1>
        <p className="text-muted-foreground text-lg leading-relaxed">
          {t("heroDescription")}
        </p>
      </div>

      {/* Tier Comparison Table */}
      <section className="mt-16">
        <div className="border-border border-b pb-4">
          <span className="text-muted-foreground font-mono text-xs font-medium tracking-wider">
            / {t("tiersTitle").toUpperCase()}
          </span>
        </div>
        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-border border-b">
                <th className="text-muted-foreground py-3 pr-4 text-left font-mono text-xs font-medium tracking-wider">
                  BENEFIT
                </th>
                {(["bronze", "silver", "gold"] as const).map((tier) => (
                  <th
                    key={tier}
                    className="text-muted-foreground py-3 px-4 text-center font-mono text-xs font-medium tracking-wider"
                  >
                    {t(`tier${tier.charAt(0).toUpperCase() + tier.slice(1)}` as "tierGold" | "tierSilver" | "tierBronze").toUpperCase()}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {benefits.map((row) => (
                <tr key={row.key} className="border-border border-b">
                  <td className="py-3 pr-4 font-mono text-xs">
                    {t(row.key)}
                  </td>
                  {(["bronze", "silver", "gold"] as const).map((tier) => {
                    const val = row[tier];
                    // If val is a number string, display it directly; otherwise translate
                    const display = /^\d+$/.test(val) ? val : t(val as any);
                    return (
                      <td key={tier} className="py-3 px-4 text-center font-mono text-xs">
                        {display}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Current Sponsors */}
      <section className="mt-16">
        <div className="border-border border-b pb-4">
          <span className="text-muted-foreground font-mono text-xs font-medium tracking-wider">
            / {t("currentSponsors").toUpperCase()}
          </span>
        </div>
        {sortedSponsors.length === 0 ? (
          <p className="text-muted-foreground mt-8 text-center font-mono text-xs tracking-wider">
            {t("noSponsors")}
          </p>
        ) : (
          <div className="mt-8 grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4">
            {sortedSponsors.map((sponsor) => {
              const logo = typeof sponsor.logo === "object" ? sponsor.logo : null;
              return (
                <a
                  key={sponsor.id}
                  href={sponsor.website ?? "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="border-border hover:border-foreground/30 flex flex-col items-center gap-3 rounded-lg border p-6 transition-colors"
                >
                  {logo?.url && (
                    <Image
                      src={logo.url}
                      alt={sponsor.name}
                      width={120}
                      height={60}
                      className="h-12 w-auto object-contain"
                    />
                  )}
                  <span className="text-sm font-medium">{sponsor.name}</span>
                  <span className="border-border text-muted-foreground rounded border px-2 py-0.5 font-mono text-[10px] font-medium tracking-wider uppercase">
                    {sponsor.tier}
                  </span>
                </a>
              );
            })}
          </div>
        )}
      </section>

      {/* CTA */}
      <section className="mt-16 flex justify-center">
        <SponsorApplicationModal />
      </section>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/app/\[locale\]/sponsors/page.tsx
git commit -m "feat(sponsors): add sponsors page with hero, tiers, and showcase"
```

---

## Task 10: Build the Sponsor Application Modal

**Files:**
- Create: `src/components/sponsor-application-modal.tsx`

**Step 1: Create the 3-step application modal**

This is a client component using Dialog from Radix UI (already in the project as shadcn). It uses the tRPC `sponsors.apply` mutation.

```typescript
// src/components/sponsor-application-modal.tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { api } from "@/trpc/react";

type Tier = "gold" | "silver" | "bronze";

export function SponsorApplicationModal() {
  const t = useTranslations("sponsors");
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [success, setSuccess] = useState(false);

  // Form state
  const [companyName, setCompanyName] = useState("");
  const [website, setWebsite] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [tier, setTier] = useState<Tier>("silver");
  const [message, setMessage] = useState("");

  const applyMutation = api.sponsors.apply.useMutation({
    onSuccess: () => setSuccess(true),
  });

  function reset() {
    setStep(1);
    setSuccess(false);
    setCompanyName("");
    setWebsite("");
    setContactName("");
    setContactEmail("");
    setTier("silver");
    setMessage("");
  }

  function handleSubmit() {
    applyMutation.mutate({
      companyName,
      website: website || undefined,
      contactName,
      contactEmail,
      tier,
      message: message || undefined,
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        <button className="bg-foreground text-background rounded px-6 py-3 font-mono text-sm font-semibold transition-opacity hover:opacity-80">
          {t("becomeSponsor")}
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-mono text-sm tracking-wider">
            {success ? t("successTitle") : t("applyTitle")}
          </DialogTitle>
        </DialogHeader>

        {success ? (
          <div className="space-y-4 py-4">
            <p className="text-muted-foreground text-sm">{t("successMessage")}</p>
            <button
              onClick={() => setOpen(false)}
              className="bg-foreground text-background rounded px-4 py-2 font-mono text-xs font-semibold"
            >
              {t("close")}
            </button>
          </div>
        ) : (
          <div className="space-y-6 py-4">
            {/* Step indicators */}
            <div className="flex gap-2">
              {[1, 2, 3].map((s) => (
                <div
                  key={s}
                  className={`h-1 flex-1 rounded ${s <= step ? "bg-foreground" : "bg-border"}`}
                />
              ))}
            </div>

            {/* Step 1: Company Info */}
            {step === 1 && (
              <div className="space-y-4">
                <p className="text-muted-foreground font-mono text-xs tracking-wider">
                  {t("stepCompany")}
                </p>
                <div className="space-y-3">
                  <label className="block">
                    <span className="font-mono text-xs">{t("companyName")}</span>
                    <input
                      type="text"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      className="border-border bg-background mt-1 block w-full rounded border px-3 py-2 font-mono text-sm"
                      required
                    />
                  </label>
                  <label className="block">
                    <span className="font-mono text-xs">{t("website")}</span>
                    <input
                      type="url"
                      value={website}
                      onChange={(e) => setWebsite(e.target.value)}
                      className="border-border bg-background mt-1 block w-full rounded border px-3 py-2 font-mono text-sm"
                    />
                  </label>
                  <label className="block">
                    <span className="font-mono text-xs">{t("contactName")}</span>
                    <input
                      type="text"
                      value={contactName}
                      onChange={(e) => setContactName(e.target.value)}
                      className="border-border bg-background mt-1 block w-full rounded border px-3 py-2 font-mono text-sm"
                      required
                    />
                  </label>
                  <label className="block">
                    <span className="font-mono text-xs">{t("contactEmail")}</span>
                    <input
                      type="email"
                      value={contactEmail}
                      onChange={(e) => setContactEmail(e.target.value)}
                      className="border-border bg-background mt-1 block w-full rounded border px-3 py-2 font-mono text-sm"
                      required
                    />
                  </label>
                </div>
                <div className="flex justify-end">
                  <button
                    onClick={() => setStep(2)}
                    disabled={!companyName || !contactName || !contactEmail}
                    className="bg-foreground text-background rounded px-4 py-2 font-mono text-xs font-semibold disabled:opacity-40"
                  >
                    {t("next")}
                  </button>
                </div>
              </div>
            )}

            {/* Step 2: Tier Selection */}
            {step === 2 && (
              <div className="space-y-4">
                <p className="text-muted-foreground font-mono text-xs tracking-wider">
                  {t("stepTier")}
                </p>
                <div className="grid gap-3">
                  {(["gold", "silver", "bronze"] as const).map((t_tier) => (
                    <button
                      key={t_tier}
                      onClick={() => setTier(t_tier)}
                      className={`rounded border p-4 text-left font-mono text-sm transition-colors ${
                        tier === t_tier
                          ? "border-foreground bg-foreground/5"
                          : "border-border hover:border-foreground/30"
                      }`}
                    >
                      {t(`tier${t_tier.charAt(0).toUpperCase() + t_tier.slice(1)}` as "tierGold" | "tierSilver" | "tierBronze").toUpperCase()}
                    </button>
                  ))}
                </div>
                <div className="flex justify-between">
                  <button
                    onClick={() => setStep(1)}
                    className="text-muted-foreground font-mono text-xs hover:underline"
                  >
                    {t("back")}
                  </button>
                  <button
                    onClick={() => setStep(3)}
                    className="bg-foreground text-background rounded px-4 py-2 font-mono text-xs font-semibold"
                  >
                    {t("next")}
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: Message */}
            {step === 3 && (
              <div className="space-y-4">
                <p className="text-muted-foreground font-mono text-xs tracking-wider">
                  {t("stepMessage")}
                </p>
                <label className="block">
                  <span className="font-mono text-xs">{t("message")}</span>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={4}
                    className="border-border bg-background mt-1 block w-full rounded border px-3 py-2 font-mono text-sm"
                    placeholder={t("messagePlaceholder")}
                  />
                </label>
                <div className="flex justify-between">
                  <button
                    onClick={() => setStep(2)}
                    className="text-muted-foreground font-mono text-xs hover:underline"
                  >
                    {t("back")}
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={applyMutation.isPending}
                    className="bg-foreground text-background rounded px-4 py-2 font-mono text-xs font-semibold disabled:opacity-40"
                  >
                    {applyMutation.isPending ? t("submitting") : t("submit")}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/sponsor-application-modal.tsx
git commit -m "feat(sponsors): add 3-step sponsor application modal"
```

---

## Task 11: Build the Jobs Page

**Files:**
- Create: `src/app/[locale]/jobs/page.tsx`

**Step 1: Create the jobs page**

Server Component that fetches jobs from Payload with a client-side type filter.

```typescript
// src/app/[locale]/jobs/page.tsx
import { getTranslations } from "next-intl/server";
import { getPayloadClient } from "@/server/payload";
import Image from "next/image";

const typeLabels: Record<string, string> = {
  remote: "REMOTE",
  hybrid: "HYBRID",
  onsite: "ON-SITE",
};

export default async function JobsPage() {
  const t = await getTranslations("jobs");

  const payload = await getPayloadClient();
  const { docs: jobs } = await payload.find({
    collection: "jobs",
    where: { status: { equals: "active" } },
    sort: "-postedAt",
    limit: 50,
    depth: 1, // populate sponsor
  });

  return (
    <div className="px-6 py-16 sm:px-12">
      {/* Section Header */}
      <div className="border-border border-b pb-4">
        <span className="text-muted-foreground font-mono text-xs font-medium tracking-wider">
          / {t("title").toUpperCase()}
        </span>
      </div>
      <p className="text-muted-foreground mt-4 text-sm">{t("subtitle")}</p>

      {jobs.length === 0 ? (
        <p className="text-muted-foreground mt-12 text-center font-mono text-xs tracking-wider">
          {t("noJobs")}
        </p>
      ) : (
        <div className="mt-8 space-y-3">
          {jobs.map((job) => {
            const sponsor =
              typeof job.sponsor === "object" ? job.sponsor : null;
            const logo =
              sponsor && typeof sponsor.logo === "object"
                ? sponsor.logo
                : null;
            return (
              <a
                key={job.id}
                href={job.url}
                target="_blank"
                rel="noopener noreferrer"
                className="border-border hover:border-foreground/30 flex items-center gap-4 rounded-lg border px-4 py-4 transition-colors"
              >
                {logo?.url && (
                  <Image
                    src={logo.url}
                    alt={sponsor?.name ?? ""}
                    width={40}
                    height={40}
                    className="h-10 w-10 rounded object-contain"
                  />
                )}
                <div className="flex-1">
                  <span className="text-sm font-medium">{job.title}</span>
                  {sponsor && (
                    <span className="text-muted-foreground ml-2 text-xs">
                      {sponsor.name}
                    </span>
                  )}
                  <div className="text-muted-foreground mt-1 flex gap-2 font-mono text-[10px] tracking-wider">
                    <span>{job.location}</span>
                    <span className="border-border rounded border px-1.5 py-0.5">
                      {typeLabels[job.type] ?? job.type}
                    </span>
                  </div>
                </div>
                <span className="text-muted-foreground font-mono text-xs font-light">
                  +
                </span>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/app/\[locale\]/jobs/page.tsx
git commit -m "feat(sponsors): add jobs page with sponsor job listings"
```

---

## Task 12: Add Sponsor Strip to Homepage

**Files:**
- Modify: `src/app/[locale]/page.tsx`

**Step 1: Fetch featured sponsors and render strip**

In `src/app/[locale]/page.tsx`:

1. Add a Payload query for featured sponsors (alongside the existing events query):

```typescript
const { docs: featuredSponsors } = await payload.find({
  collection: "sponsors",
  where: {
    status: { equals: "active" },
    featured: { equals: true },
  },
  limit: 20,
  depth: 1,
});
```

2. Add a sponsors strip section before the CTA Cards section (around line 249), only if there are sponsors:

```tsx
{/* Sponsors Strip */}
{featuredSponsors.length > 0 && (
  <section className="px-6 py-12 sm:px-12">
    <SectionLabel>/ {t("sponsors.currentSponsors").toUpperCase()}</SectionLabel>
    <div className="mt-6 flex flex-wrap items-center justify-center gap-8">
      {featuredSponsors.map((sponsor) => {
        const logo = typeof sponsor.logo === "object" ? sponsor.logo : null;
        return logo?.url ? (
          <a
            key={sponsor.id}
            href={sponsor.website ?? "#"}
            target="_blank"
            rel="noopener noreferrer"
            className="opacity-60 transition-opacity hover:opacity-100"
          >
            <Image
              src={logo.url}
              alt={sponsor.name}
              width={120}
              height={48}
              className="h-8 w-auto object-contain sm:h-12"
            />
          </a>
        ) : null;
      })}
    </div>
  </section>
)}
```

3. Add `import Image from "next/image"` to the top of the file.

**Step 2: Commit**

```bash
git add src/app/\[locale\]/page.tsx
git commit -m "feat(sponsors): add featured sponsors strip to homepage"
```

---

## Task 13: Final Build Verification

**Step 1: Run the build**

Run: `pnpm build`

Expected: Build succeeds with no type errors.

**Step 2: Manual smoke test**

Run: `pnpm dev` and verify:
- `/sponsors` page renders with hero, tiers, empty sponsors grid, and CTA button
- Application modal opens and 3 steps work
- `/jobs` page renders with empty state
- Navbar shows Sponsors and Jobs links
- Homepage shows no sponsor strip (empty state, hidden by condition)
- `/admin/collections/sponsors` accessible in Payload admin
- `/admin/collections/sponsor-applications` accessible in Payload admin
- `/admin/collections/jobs` accessible in Payload admin

**Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix(sponsors): address build issues"
```
