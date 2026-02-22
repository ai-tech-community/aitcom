# Leaderboard Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the Members page with a competitive ranked leaderboard table and fix broken avatar images.

**Architecture:** Fix `d=404` → `d=identicon` in the avatar util so Gravatar URLs never 404. Rewrite `src/app/[locale]/members/page.tsx` to drop the horizontal leaderboard cards + member grid in favour of a single `<table>` sorted by XP descending. Remove the redundant `getLeaderboard` API call; use only `listMembers` with limit 50.

**Tech Stack:** Next.js 15 (App Router, server component), tRPC, next-intl, Tailwind CSS

---

### Task 1: Fix broken avatar images

**Files:**
- Modify: `src/lib/avatar.ts`

**Step 1: Open the file and change `d=404` to `d=identicon`**

In `src/lib/avatar.ts` line 18, change:
```ts
return `https://www.gravatar.com/avatar/${hash}?s=${size}&d=404`;
```
to:
```ts
return `https://www.gravatar.com/avatar/${hash}?s=${size}&d=identicon`;
```

This ensures Gravatar always returns a generated avatar instead of HTTP 404, so `<img>` tags never show a broken image icon.

**Step 2: Verify no other references to `d=404`**

Run: `grep -r "d=404" src/`
Expected: no output

**Step 3: Commit**

```bash
git add src/lib/avatar.ts
git commit -m "fix: use gravatar identicon fallback instead of 404"
```

---

### Task 2: Rewrite members page as leaderboard table

**Files:**
- Modify: `src/app/[locale]/members/page.tsx`

**Step 1: Replace file contents**

Replace the entire file with:

```tsx
import { getTranslations } from "next-intl/server";
import { api } from "@/trpc/server";
import { Link } from "@/i18n/navigation";
import { getAvatarUrl, getInitials } from "@/lib/avatar";
import { MemberSearch } from "@/components/member-search";

export default async function MembersPage() {
  const t = await getTranslations("members");

  const members = await api.members.listMembers({ limit: 50 });

  return (
    <div className="px-6 py-16 sm:px-12">
      {/* Page Header */}
      <div className="border-border border-b pb-4">
        <span className="text-muted-foreground font-mono text-xs font-medium tracking-wider">
          / {t("leaderboard").toUpperCase()}
        </span>
      </div>

      {/* Search */}
      <MemberSearch />

      {/* Leaderboard Table */}
      {members.items.length === 0 ? (
        <p className="text-muted-foreground mt-12 text-center font-mono text-xs tracking-wider">
          / {t("noMembers").toUpperCase()}
        </p>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full border-collapse font-mono text-xs">
            <thead>
              <tr className="border-border border-b">
                <th className="text-muted-foreground py-2 pr-4 text-left font-medium tracking-wider">
                  #
                </th>
                <th className="text-muted-foreground py-2 pr-6 text-left font-medium tracking-wider">
                  MEMBER
                </th>
                <th className="text-muted-foreground py-2 pr-6 text-left font-medium tracking-wider">
                  LVL
                </th>
                <th className="text-muted-foreground py-2 pr-6 text-left font-medium tracking-wider">
                  XP
                </th>
                <th className="text-muted-foreground py-2 pr-6 text-left font-medium tracking-wider">
                  BADGES
                </th>
                <th className="text-muted-foreground py-2 text-left font-medium tracking-wider">
                  SKILLS
                </th>
              </tr>
            </thead>
            <tbody>
              {members.items.map((member, i) => {
                const rank = i + 1;
                const avatarUrl = getAvatarUrl(member.email, member.image);
                const initials = getInitials(member.profile.displayName);
                const skills = member.profile.skills.slice(0, 3);
                const isTopThree = rank <= 3;

                return (
                  <tr
                    key={member.profile.userId}
                    className="border-border hover:bg-secondary/50 border-b transition-colors"
                  >
                    <td className="py-3 pr-4 align-top">
                      <Link
                        href={`/members/${member.profile.userId}`}
                        className="block"
                      >
                        <span
                          className={
                            isTopThree
                              ? "font-medium text-foreground"
                              : "text-muted-foreground"
                          }
                        >
                          {rank}
                        </span>
                      </Link>
                    </td>
                    <td className="py-3 pr-6 align-top">
                      <Link
                        href={`/members/${member.profile.userId}`}
                        className="flex items-start gap-2"
                      >
                        {avatarUrl ? (
                          <img
                            src={avatarUrl}
                            alt={member.profile.displayName}
                            className="mt-0.5 h-6 w-6 shrink-0 rounded-full object-cover"
                          />
                        ) : (
                          <div className="bg-secondary text-muted-foreground mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[9px]">
                            {initials}
                          </div>
                        )}
                        <div className="min-w-0">
                          <span className="block truncate font-medium text-foreground">
                            {member.profile.displayName}
                          </span>
                          {member.profile.company && (
                            <span className="text-muted-foreground block truncate">
                              @ {member.profile.company}
                            </span>
                          )}
                        </div>
                      </Link>
                    </td>
                    <td className="py-3 pr-6 align-top">
                      <Link
                        href={`/members/${member.profile.userId}`}
                        className="block"
                      >
                        <span className="border-border text-muted-foreground rounded border px-1.5 py-0.5 text-[10px] tracking-wider">
                          {t("level")} {member.profile.level}
                        </span>
                      </Link>
                    </td>
                    <td className="py-3 pr-6 align-top">
                      <Link
                        href={`/members/${member.profile.userId}`}
                        className="block"
                      >
                        <span
                          className={
                            isTopThree
                              ? "font-medium text-foreground"
                              : "text-muted-foreground"
                          }
                        >
                          {member.profile.xp}
                        </span>
                      </Link>
                    </td>
                    <td className="py-3 pr-6 align-top">
                      <Link
                        href={`/members/${member.profile.userId}`}
                        className="block"
                      >
                        <span className="text-muted-foreground">
                          {member.badgeCount > 0 ? member.badgeCount : "—"}
                        </span>
                      </Link>
                    </td>
                    <td className="py-3 align-top">
                      <Link
                        href={`/members/${member.profile.userId}`}
                        className="flex flex-wrap gap-1"
                      >
                        {skills.length > 0 ? (
                          skills.map((skill) => (
                            <span
                              key={skill}
                              className="border-border text-muted-foreground rounded border border-dashed px-1.5 py-0.5 text-[10px] tracking-wider"
                            >
                              {skill}
                            </span>
                          ))
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

**Step 2: Verify the build compiles**

Run: `cd c:/projects/customers/aitcom && npx tsc --noEmit`
Expected: no errors

**Step 3: Commit**

```bash
git add src/app/[locale]/members/page.tsx
git commit -m "feat: replace members grid with competitive leaderboard table"
```

---

### Task 3: Verify i18n key exists

The page now uses `t("leaderboard")` as the page header (previously it was `t("title")`). Check the translation files to confirm the key exists.

**Files:**
- Read: `src/messages/en.json` (or wherever translations live)

**Step 1: Find translation files**

Run: `find src -name "*.json" | grep -i message`

**Step 2: Check the `members` namespace**

Confirm the `members` object has a `leaderboard` key. If it already exists (it does — it was used for the leaderboard section label in the old page), no change needed. If missing, add:

```json
"leaderboard": "Leaderboard"
```

**Step 3: Commit if changed**

```bash
git add src/messages/*.json
git commit -m "i18n: ensure leaderboard key in members namespace"
```

---

### Task 4: Visual check

**Step 1: Start dev server**

Run: `npm run dev` (or `pnpm dev`)

**Step 2: Navigate to `/members`**

Check:
- [ ] Page header says `/ LEADERBOARD`
- [ ] Table columns: `#`, `MEMBER`, `LVL`, `XP`, `BADGES`, `SKILLS`
- [ ] Avatars render without broken image icons
- [ ] Rank 1, 2, 3 have brighter text for rank number and XP
- [ ] Clicking a row navigates to the member profile
- [ ] Empty skills/badges show `—`
- [ ] Search still works
