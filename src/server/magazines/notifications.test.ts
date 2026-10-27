import { afterEach, describe, expect, it, vi } from "vitest";

import * as messages from "@/i18n/messages";
import type { ScheduleFailure } from "@/lib/magazines/issue-history";
import { notifications } from "@/server/db/schema";

import type { Deps } from "./deps";
import {
  insertMagazineNoticesIn,
  issuePublishedNotices,
  notifyRoleAssigned,
  notifyScheduleFailed,
} from "./notifications";

afterEach(() => vi.restoreAllMocks());

describe("magazine notices", () => {
  it("tells each editor why a scheduled issue did not go out", async () => {
    const copy: Record<ScheduleFailure, string> = {
      empty:
        "It has no items, so it could not be published. It is a draft again.",
      invalid_item:
        "Something in it needs fixing. Open it to see what. It is a draft again.",
      no_rights:
        "The person who scheduled it can no longer publish for The Gazette. Open it to publish or schedule it yourself.",
      error:
        "Something went wrong on our side, so it could not be published. It is a draft again. Open it to try again.",
      auto_off:
        "Automatic publishing is switched off for The Gazette, so this issue stays a draft. Publish it yourself when it is ready.",
    };
    for (const reason of Object.keys(copy) as ScheduleFailure[]) {
      const values = vi.fn<
        (rows: (typeof notifications.$inferInsert)[]) => Promise<void>
      >(async () => undefined);
      const insert = vi.fn(() => ({ values }));
      await notifyScheduleFailed({ insert } as unknown as Deps["db"], {
        editorIds: ["owner", "editor"],
        reason,
        issue: { id: 42, title: "Autumn" },
        magazineName: "The Gazette",
        community: { id: "community", slug: "our-community" },
      });
      expect(insert).toHaveBeenCalledExactlyOnceWith(notifications);
      expect(values).toHaveBeenCalledExactlyOnceWith(
        ["owner", "editor"].map((userId) => ({
          userId,
          type: "magazine_issue_schedule_failed",
          title: "“Autumn” did not go out",
          content: copy[reason],
          communityId: "community",
          metadata: {
            reviewPath: "/communities/our-community/magazine/issues/42/edit",
            linkLabel: "Open the issue",
            communityId: "community",
            reason,
            issueId: 42,
          },
        })),
      );
    }
  });

  it("clips long titles and writes the shared metadata", async () => {
    const values = vi.fn(async () => undefined);
    const insert = vi.fn(() => ({ values }));
    const db = { insert } as unknown as Deps["db"];
    await notifyRoleAssigned(db, {
      userId: "writer",
      role: "contributor",
      magazineName: "🌻".repeat(300),
      community: { id: "community", slug: "our-community" },
    });
    expect(insert).toHaveBeenCalledExactlyOnceWith(notifications);
    expect(values).toHaveBeenCalledTimes(1);
    const rows = values.mock.calls[0] as unknown as [
      (typeof notifications.$inferInsert)[],
    ];
    expect(rows[0]).toHaveLength(1);
    expect(Array.from(rows[0][0]!.title)).toHaveLength(255);
    expect(rows[0][0]!.title.endsWith("…")).toBe(true);
    expect(rows[0][0]).toMatchObject({
      userId: "writer",
      type: "magazine_role_assigned",
      communityId: "community",
      content:
        "You are now a contributor. Writes articles and sends them to the editors.",
      metadata: {
        reviewPath: "/communities/our-community/magazine",
        linkLabel: "Open the magazine",
        communityId: "community",
        magazineRole: "contributor",
      },
    });
  });

  it("never throws when the insert fails", async () => {
    const error = new Error("Inbox unavailable");
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    for (const insert of [
      () => {
        throw error;
      },
      () => ({
        values: async () => {
          throw error;
        },
      }),
    ]) {
      await expect(
        notifyRoleAssigned({ insert } as unknown as Deps["db"], {
          userId: "writer",
          role: "editor",
          magazineName: "The Gazette",
          community: { id: "community", slug: "our-community" },
        }),
      ).resolves.toBeUndefined();
    }
    expect(log).toHaveBeenCalledWith("[magazines] notification failed", error);
  });

  it("never throws when the notification text cannot load", async () => {
    const error = new Error("Messages unavailable");
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(messages, "loadMessages").mockRejectedValueOnce(error);
    const insert = vi.fn();
    await expect(
      notifyRoleAssigned({ insert } as unknown as Deps["db"], {
        userId: "writer",
        role: "contributor",
        magazineName: "The Gazette",
        community: { id: "community", slug: "our-community" },
      }),
    ).resolves.toBeUndefined();
    expect(insert).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith("[magazines] notification failed", error);
  });
});

it("writes one new-issue notice per user, linking to the issue", async () => {
  const notices = await issuePublishedNotices({
    userIds: ["member", "outsider"],
    magazine: { id: 7, name: "The Gazette", slug: "gazette" },
    issue: { id: 42, number: 3, title: "Autumn", slug: "autumn" },
    community: { id: "community", slug: "our-community" },
  });
  expect(notices).toEqual(
    ["member", "outsider"].map((userId) => ({
      userId,
      type: "magazine_issue_published",
      title: "New in The Gazette: Autumn",
      content: "Issue 3 is out.",
      communityId: "community",
      path: "/magazines/gazette/autumn",
      linkLabel: "Read the issue",
      extra: { issueId: 42, magazineId: 7 },
    })),
  );
  const values = vi.fn(async () => undefined);
  await insertMagazineNoticesIn(
    { insert: () => ({ values }) } as unknown as Pick<Deps["db"], "insert">,
    notices,
  );
  expect(values.mock.calls[0]).toEqual([
    notices.map(({ path, linkLabel, extra, ...row }) => ({
      ...row,
      metadata: {
        reviewPath: path,
        linkLabel,
        communityId: "community",
        ...extra,
      },
    })),
  ]);
});

it("insertMagazineNoticesIn throws", async () => {
  const insert = () => {
    throw new Error("Inbox unavailable");
  };
  await expect(
    insertMagazineNoticesIn(
      { insert } as unknown as Pick<Deps["db"], "insert">,
      [
        {
          userId: "member",
          type: "magazine_issue_published",
          title: "New issue",
          content: "Out now",
          communityId: "community",
          path: "/issue",
          linkLabel: "Read the issue",
        },
      ],
    ),
  ).rejects.toThrow("Inbox unavailable");
});
