import { z } from "zod";

import { newsArticleUrl } from "./draft";

export const RUMOR_DAILY_LIMIT = 5;
export const RUMOR_WINDOW_MS = 24 * 60 * 60 * 1000;

export const rumorInputSchema = z
  .object({
    title: z.string().trim().min(3).max(140),
    url: z.string().trim().max(2048).optional().default(""),
    body: z.string().trim().min(10).max(500),
  })
  .superRefine((value, ctx) => {
    if (!value.url) return;
    if (!newsArticleUrl(value.url)) {
      ctx.addIssue({ code: "custom", path: ["url"], message: "url" });
    }
  });

export type RumorInput = z.infer<typeof rumorInputSchema>;

export type NewRumor = {
  userId: string;
  submitterName: string;
  title: string;
  url: string | null;
  body: string;
};

export function rumorRateDecision(recentCount: number): "ok" | "limited" {
  return recentCount >= RUMOR_DAILY_LIMIT ? "limited" : "ok";
}

export function rumorWindowStart(now: Date): Date {
  return new Date(now.getTime() - RUMOR_WINDOW_MS);
}

export function normalizeRumor(
  input: RumorInput,
): Omit<NewRumor, "userId" | "submitterName"> {
  return {
    title: input.title,
    url: input.url ? newsArticleUrl(input.url) : null,
    body: input.body,
  };
}

export function isNewsStaffRole(role: string | null | undefined): boolean {
  return role === "admin" || role === "editor";
}

export function submitterLabel(user: {
  name?: string | null;
  email?: string | null;
}): string {
  const name = user.name?.trim();
  if (name) return name.slice(0, 80);
  const local = user.email?.split("@")[0]?.trim();
  if (local) return local.slice(0, 80);
  return "Member";
}

export type RumorWrite = {
  countRecent(userId: string, since: Date): Promise<number>;
  insert(row: NewRumor): Promise<string>;
  setHidden(id: string, hiddenAt: Date | null): Promise<boolean>;
  remove(id: string): Promise<boolean>;
};

export type SubmitRumorResult =
  | { ok: true; id: string }
  | { ok: false; reason: "limited" };

export async function submitNewsRumor(
  store: Pick<RumorWrite, "countRecent" | "insert">,
  args: {
    userId: string;
    submitterName: string;
    input: RumorInput;
    now: Date;
  },
): Promise<SubmitRumorResult> {
  const recent = await store.countRecent(
    args.userId,
    rumorWindowStart(args.now),
  );
  if (rumorRateDecision(recent) === "limited") {
    return { ok: false, reason: "limited" };
  }
  const id = await store.insert({
    userId: args.userId,
    submitterName: args.submitterName,
    ...normalizeRumor(args.input),
  });
  return { ok: true, id };
}

export type ModerateRumorResult = "ok" | "forbidden" | "missing";

export async function moderateNewsRumor(
  store: Pick<RumorWrite, "setHidden" | "remove">,
  args: {
    staff: boolean;
    action: "hide" | "show" | "delete";
    id: string;
    now: Date;
  },
): Promise<ModerateRumorResult> {
  if (!args.staff) return "forbidden";
  if (args.action === "delete") {
    return (await store.remove(args.id)) ? "ok" : "missing";
  }
  const hiddenAt = args.action === "hide" ? args.now : null;
  return (await store.setHidden(args.id, hiddenAt)) ? "ok" : "missing";
}
