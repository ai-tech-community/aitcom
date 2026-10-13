import { describe, expect, it } from "vitest";

import {
  isNewsStaffRole,
  moderateNewsRumor,
  normalizeRumor,
  rumorInputSchema,
  rumorRateDecision,
  rumorWindowStart,
  submitNewsRumor,
  submitterLabel,
} from "./rumor-rules";

describe("rumor rules", () => {
  it("accepts a title, an optional https link, and a short note", () => {
    const parsed = rumorInputSchema.parse({
      title: "A lab shipped a model",
      url: "https://example.com/story",
      body: "Someone on the forum said the weights are up.",
    });
    expect(normalizeRumor(parsed)).toEqual({
      title: "A lab shipped a model",
      url: "https://example.com/story",
      body: "Someone on the forum said the weights are up.",
    });
  });

  it("allows a rumor with no link and refuses a javascript link", () => {
    expect(
      rumorInputSchema.parse({
        title: "Heard at the meetup",
        body: "No link yet, just a short note.",
      }).url,
    ).toBe("");
    expect(
      rumorInputSchema.safeParse({
        title: "Heard at the meetup",
        url: "javascript:alert(1)",
        body: "No link yet, just a short note.",
      }).success,
    ).toBe(false);
  });

  it("stops a sixth rumor inside the same day", () => {
    expect(rumorRateDecision(4)).toBe("ok");
    expect(rumorRateDecision(5)).toBe("limited");
    const now = new Date("2026-10-13T12:00:00.000Z");
    expect(rumorWindowStart(now).toISOString()).toBe(
      "2026-10-12T12:00:00.000Z",
    );
  });

  it("treats Payload admin and editor as staff", () => {
    expect(isNewsStaffRole("admin")).toBe(true);
    expect(isNewsStaffRole("editor")).toBe(true);
    expect(isNewsStaffRole("member")).toBe(false);
    expect(isNewsStaffRole(null)).toBe(false);
  });

  it("uses the member name, then the email name", () => {
    expect(
      submitterLabel({ name: "Ada Lovelace", email: "ada@example.com" }),
    ).toBe("Ada Lovelace");
    expect(submitterLabel({ name: "  ", email: "ada@example.com" })).toBe(
      "ada",
    );
  });
});

describe("submit and moderate rumors", () => {
  it("stores a rumor when the member is under the daily limit", async () => {
    const inserted: unknown[] = [];
    const result = await submitNewsRumor(
      {
        countRecent: async () => 1,
        insert: async (row) => {
          inserted.push(row);
          return "rumor-1";
        },
      },
      {
        userId: "user-1",
        submitterName: "Ada",
        now: new Date("2026-10-13T12:00:00.000Z"),
        input: rumorInputSchema.parse({
          title: "A lab shipped a model",
          url: "",
          body: "Someone on the forum said the weights are up.",
        }),
      },
    );
    expect(result).toEqual({ ok: true, id: "rumor-1" });
    expect(inserted).toEqual([
      {
        userId: "user-1",
        submitterName: "Ada",
        title: "A lab shipped a model",
        url: null,
        body: "Someone on the forum said the weights are up.",
      },
    ]);
  });

  it("does not store a rumor once the daily limit is reached", async () => {
    const result = await submitNewsRumor(
      {
        countRecent: async () => 5,
        insert: async () => {
          throw new Error("should not insert");
        },
      },
      {
        userId: "user-1",
        submitterName: "Ada",
        now: new Date(),
        input: rumorInputSchema.parse({
          title: "A lab shipped a model",
          body: "Someone on the forum said the weights are up.",
        }),
      },
    );
    expect(result).toEqual({ ok: false, reason: "limited" });
  });

  it("lets staff hide and delete, and refuses everyone else", async () => {
    const hidden: Array<Date | null> = [];
    const removed: string[] = [];
    const store = {
      setHidden: async (_id: string, at: Date | null) => {
        hidden.push(at);
        return true;
      },
      remove: async (id: string) => {
        removed.push(id);
        return true;
      },
    };
    const now = new Date("2026-10-13T12:00:00.000Z");
    expect(
      await moderateNewsRumor(store, {
        staff: false,
        action: "hide",
        id: "rumor-1",
        now,
      }),
    ).toBe("forbidden");
    expect(hidden).toEqual([]);
    expect(
      await moderateNewsRumor(store, {
        staff: true,
        action: "hide",
        id: "rumor-1",
        now,
      }),
    ).toBe("ok");
    expect(hidden).toEqual([now]);
    expect(
      await moderateNewsRumor(store, {
        staff: true,
        action: "delete",
        id: "rumor-1",
        now,
      }),
    ).toBe("ok");
    expect(removed).toEqual(["rumor-1"]);
  });
});
