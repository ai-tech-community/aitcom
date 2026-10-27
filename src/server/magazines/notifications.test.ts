import { afterEach, describe, expect, it, vi } from "vitest";

import * as messages from "@/i18n/messages";
import { notifications } from "@/server/db/schema";

import type { Deps } from "./deps";
import { notifyRoleAssigned } from "./notifications";

afterEach(() => vi.restoreAllMocks());

describe("magazine notices", () => {
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
