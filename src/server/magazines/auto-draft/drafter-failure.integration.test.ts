// @vitest-environment node
import type * as History from "../issue-history";
import type * as Editorship from "../editorship";
import type * as Issues from "../issue-service";
import type * as Runs from "./runs";
import type * as Picks from "./picks";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { inArray } from "drizzle-orm";
import { inPayloadTransaction } from "../payload-writes";
import {
  at,
  drafterFixture,
  isLocalDbConfigured,
  now,
} from "@/test/magazine-auto-draft-fixture";

const failures = vi.hoisted(() => ({
  save: false,
  crashAfterSave: false,
  cleanupCrash: false,
  picks: false,
  schedule: false,
  history: false,
  editors: false,
  claim: false,
  cleanupEdit: false,
}));
vi.mock("../issue-service", async (importOriginal) => {
  const real = await importOriginal<typeof Issues>();
  return {
    ...real,
    deleteDraftIssue: async (
      ...args: Parameters<typeof real.deleteDraftIssue>
    ) => {
      if (failures.cleanupCrash) {
        failures.cleanupCrash = false;
        throw new Error("Process stopped before cleanup");
      }
      if (failures.cleanupEdit) {
        failures.cleanupEdit = false;
        const [deps, issue] = args;
        await deps.payload.update({
          collection: "magazine-issues",
          id: issue.id,
          data: { title: "An edit during cleanup" },
          depth: 0,
        });
      }
      return real.deleteDraftIssue(...args);
    },
    setIssueItems: async (...args: Parameters<typeof real.setIssueItems>) => {
      if (failures.save) {
        failures.save = false;
        throw new Error("Save failed");
      }
      const saved = await real.setIssueItems(...args);
      if (failures.crashAfterSave) {
        failures.crashAfterSave = false;
        // The write committed, but no caller-side follow-up or cleanup ran.
        failures.cleanupCrash = true;
        throw new Error("Process stopped after the item commit");
      }
      return saved;
    },
    scheduleIssue: async (...args: Parameters<typeof real.scheduleIssue>) => {
      if (failures.schedule) {
        const { magazineError } = await import("../errors");
        throw magazineError("ISSUE_EMPTY");
      }
      return real.scheduleIssue(...args);
    },
  };
});
vi.mock("./picks", async (importOriginal) => {
  const real = await importOriginal<typeof Picks>();
  return {
    ...real,
    saveAutoPicks: async (...args: Parameters<typeof real.saveAutoPicks>) => {
      if (failures.picks) {
        failures.picks = false;
        throw new Error("Picks failed");
      }
      return real.saveAutoPicks(...args);
    },
  };
});
vi.mock("../issue-history", async (importOriginal) => {
  const real = await importOriginal<typeof History>();
  return {
    ...real,
    recordIssueHistory: async (
      ...args: Parameters<typeof real.recordIssueHistory>
    ) => {
      if (failures.history) {
        failures.history = false;
        throw new Error("History unavailable");
      }
      return real.recordIssueHistory(...args);
    },
  };
});
vi.mock("../editorship", async (importOriginal) => {
  const real = await importOriginal<typeof Editorship>();
  return {
    ...real,
    listMagazineEditorIds: async (
      ...args: Parameters<typeof real.listMagazineEditorIds>
    ) => {
      if (failures.editors) {
        failures.editors = false;
        throw new Error("Editors unavailable");
      }
      return real.listMagazineEditorIds(...args);
    },
  };
});
vi.mock("./runs", async (importOriginal) => {
  const real = await importOriginal<typeof Runs>();
  return {
    ...real,
    failedRunIssues: async (
      ...args: Parameters<typeof real.failedRunIssues>
    ) => {
      const rows = await real.failedRunIssues(...args);
      // Exercise an adversarial database result order: the current claim first.
      return rows.sort(
        (a, b) => Number(b.id === args[2]) - Number(a.id === args[2]),
      );
    },
    claimAutoDraftRun: async (
      ...args: Parameters<typeof real.claimAutoDraftRun>
    ) => {
      if (failures.claim) {
        failures.claim = false;
        failures.cleanupEdit = false;
        throw new Error("Claim unavailable");
      }
      return real.claimAutoDraftRun(...args);
    },
  };
});
vi.mock("next-intl/server", async () => {
  const { createTranslator } = await import("next-intl");
  const { loadMessages } = await import("@/i18n/messages");
  return {
    getTranslations: async ({
      locale,
      namespace,
    }: {
      locale: "en" | "nl";
      namespace: "magazineEditor.autoDraft";
    }) =>
      createTranslator({
        locale,
        namespace,
        messages: await loadMessages(locale),
      }),
  };
});

describe.skipIf(!isLocalDbConfigured())(
  "automatic draft recovery [DB integration]",
  { timeout: 30_000 },
  () => {
    const f = drafterFixture();
    beforeEach(() => {
      failures.save = false;
      failures.crashAfterSave = false;
      failures.cleanupCrash = false;
      failures.picks = false;
      failures.schedule = false;
      failures.history = false;
      failures.editors = false;
      failures.claim = false;
      failures.cleanupEdit = false;
    });

    it.each(["save", "picks"] as const)(
      "a failed %s leaves no half-made draft and can be tried again",
      async (stage) => {
        const log = vi
          .spyOn(console, "error")
          .mockImplementation(() => undefined);
        try {
          failures[stage] = true;
          expect(await f.pass()).toEqual({ drafted: 0, skipped: 0 });
          expect((await f.issues()).docs).toEqual([]);
          expect(await f.history()).toEqual([]);
          expect(await f.runs()).toEqual([
            expect.objectContaining({ status: "failed", attempts: 1 }),
          ]);
          expect(log).toHaveBeenCalledWith(
            "[magazines] automatic draft failed",
            expect.objectContaining({ magazineId: f.fx.magazine.id }),
          );
          expect(await f.pass(at(5))).toEqual({ drafted: 1, skipped: 0 });
          expect((await f.issues()).docs).toHaveLength(1);
          expect(await f.runs()).toEqual([
            expect.objectContaining({ status: "made", attempts: 2 }),
          ]);
        } finally {
          log.mockRestore();
        }
      },
    );

    it("a refused schedule keeps the draft and tells the editors", async () => {
      const log = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
      try {
        await f.save({ whenReady: "auto_publish" });
        failures.schedule = true;
        expect(await f.pass()).toEqual({ drafted: 1, skipped: 0 });
        expect((await f.issues()).docs).toEqual([
          expect.objectContaining({ status: "draft", scheduledVia: null }),
        ]);
        expect(await f.runs()).toEqual([
          expect.objectContaining({ status: "made" }),
        ]);
        expect((await f.history())[0]).toMatchObject({
          detail: { event: "draft_made", goesOutAt: null },
        });
        expect(await f.notices()).toHaveLength(3);
        for (const n of await f.notices())
          expect(n.content).toBe(
            "We picked 6 things for you. Check the draft and publish it when you are happy.",
          );
      } finally {
        log.mockRestore();
      }
    });

    it("cleans a leftover after the item commit without mistaking it for a person's edit", async () => {
      const log = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
      try {
        failures.crashAfterSave = true;
        expect(await f.pass()).toEqual({ drafted: 0, skipped: 0 });
        const leftovers = (await f.issues()).docs;
        expect(leftovers).toHaveLength(1);
        const leftover = leftovers[0]!;
        expect(leftover.items?.length).toBeGreaterThan(0);
        expect(await f.runs()).toEqual([
          expect.objectContaining({
            status: "failed",
            attempts: 1,
            issueId: leftover.id,
            lastWriteAt: new Date(leftover.updatedAt),
          }),
        ]);
        expect(await f.history()).toEqual([]);
        expect(await f.notices()).toEqual([]);

        expect(await f.pass(at(5))).toEqual({ drafted: 1, skipped: 0 });
        const rebuilt = (await f.issues()).docs;
        expect(rebuilt).toHaveLength(1);
        expect(rebuilt[0]!.id).not.toBe(leftover.id);
        expect(
          await f.m.payload.findByID({
            collection: "magazine-issues",
            id: leftover.id,
            disableErrors: true,
            depth: 0,
          }),
        ).toBeNull();
        expect(await f.runs()).toEqual([
          expect.objectContaining({
            status: "made",
            attempts: 2,
            issueId: rebuilt[0]!.id,
          }),
        ]);
        expect((await f.history()).map((entry) => entry.detail.event)).toEqual([
          "draft_made",
        ]);
        expect(await f.notices()).toHaveLength(3);
      } finally {
        log.mockRestore();
      }
    });

    it.each(["history", "editors"] as const)(
      "a completed draft survives a later %s failure",
      async (stage) => {
        const log = vi
          .spyOn(console, "error")
          .mockImplementation(() => undefined);
        try {
          failures[stage] = true;
          expect(await f.pass()).toEqual({ drafted: 1, skipped: 0 });
          const issue = (await f.issues()).docs[0]!;
          expect(await f.runs()).toEqual([
            expect.objectContaining({
              status: "made",
              attempts: 1,
              issueId: issue.id,
            }),
          ]);
          expect(await f.pass(at(5))).toEqual({ drafted: 0, skipped: 0 });
          expect((await f.issues()).docs[0]!.id).toBe(issue.id);
          expect(log).toHaveBeenCalled();
        } finally {
          log.mockRestore();
        }
      },
    );

    it("a skipped period stays finished when history is unavailable", async () => {
      const log = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
      try {
        await f.clearContent();
        failures.history = true;
        expect(await f.pass()).toEqual({ drafted: 0, skipped: 1 });
        expect(await f.runs()).toEqual([
          expect.objectContaining({ status: "skipped", attempts: 1 }),
        ]);
        expect(await f.pass(at(5))).toEqual({ drafted: 0, skipped: 0 });
        expect(await f.notices()).toHaveLength(3);
      } finally {
        log.mockRestore();
      }
    });

    it("a failure before claiming does not consume a turn", async () => {
      const log = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
      try {
        const settings = await f.m.settings.readAutoDraftSettings(
          f.m.db,
          f.fx.magazine.id,
        );
        const otherMagazineIds: number[] = [];
        // The fixture magazine was created first, so it is first by id in the due list.
        for (let i = 0; i < 5; i++) {
          const { magazine, community } = await f.makeMagazine(
            `unclaimed-${i}-${f.fx.suffix}`,
          );
          otherMagazineIds.push(magazine.id);
          await f.m.db.insert(f.m.schema.communityMemberships).values({
            communityId: community.id,
            userId: f.fx.ownerId,
            role: "owner",
          });
          await f.m.db.insert(f.m.schema.magazineAutoDraftSettings).values({
            ...settings,
            publicConfirmedAt: null,
            magazineId: magazine.id,
            updatedBy: f.fx.ownerId,
          });
        }
        failures.claim = true;
        expect(await f.pass()).toEqual({ drafted: 0, skipped: 5 });
        expect(await f.runs()).toEqual([]);
        const otherRuns = await f.m.db
          .select()
          .from(f.m.schema.magazineAutoDraftRuns)
          .where(
            inArray(
              f.m.schema.magazineAutoDraftRuns.magazineId,
              otherMagazineIds,
            ),
          );
        expect(otherRuns).toHaveLength(5);
        expect(otherRuns.map((run) => run.magazineId).sort()).toEqual(
          otherMagazineIds.sort(),
        );
        for (const run of otherRuns)
          expect(run).toMatchObject({
            status: "skipped",
            skipReason: "too_few",
            foundCount: 0,
          });
        expect(log).toHaveBeenCalled();
      } finally {
        log.mockRestore();
      }
    });

    async function crashedIssue(
      scheduled = false,
      run: Partial<typeof f.m.schema.magazineAutoDraftRuns.$inferInsert> = {},
    ) {
      let issue = await f.m.issues.createIssue(
        f.m,
        f.fx.magazine,
        { title: "Half-made" },
        f.actor(),
      );
      if (scheduled) {
        const { plainTextToLexical } =
          await import("@/server/challenge-engine/lexical");
        issue = (
          await f.m.issues.setIssueItems(
            f.m,
            issue,
            [{ kind: "editorial", body: plainTextToLexical("A start") }],
            issue.updatedAt,
            { ...f.actor(), via: "auto" },
          )
        ).issue;
        issue = await f.m.issues.scheduleIssue(
          f.m,
          issue,
          at(60),
          issue.updatedAt,
          { ...f.actor(), via: "auto" },
          now,
          { via: "auto" },
        );
      }
      await f.m.db.insert(f.m.schema.magazineAutoDraftRuns).values({
        magazineId: f.fx.magazine.id,
        periodKey: "month:2026-11",
        trigger: "schedule",
        status: "running",
        claimedAt: at(-20),
        issueId: issue.id,
        lastWriteAt: new Date(issue.updatedAt),
        ...run,
      });
      return issue;
    }

    it("a run that died half-way is cleaned up, never doubled", async () => {
      const leftover = await crashedIssue();
      expect(await f.pass()).toEqual({ drafted: 1, skipped: 0 });
      const { docs } = await f.issues();
      expect(docs).toHaveLength(1);
      expect(docs[0]!.id).not.toBe(leftover.id);
      expect(await f.runs()).toContainEqual(
        expect.objectContaining({
          periodKey: "month:2026-11",
          attempts: 2,
          status: "made",
          issueId: docs[0]!.id,
        }),
      );
      expect(
        (await f.history()).some((h) => h.detail.event === "deleted"),
      ).toBe(false);
    });

    it("cleans up a crashed automatic schedule before rebuilding", async () => {
      const leftover = await crashedIssue(true);
      expect(await f.pass()).toEqual({ drafted: 1, skipped: 0 });
      expect((await f.issues()).docs).toEqual([
        expect.objectContaining({ status: "draft" }),
      ]);
      expect((await f.issues()).docs[0]!.id).not.toBe(leftover.id);
      expect((await f.history()).map((entry) => entry.detail.event)).toEqual([
        "draft_made",
      ]);
    });

    it.each([
      {
        name: "manual crash",
        periodKey: "manual:crashed",
        trigger: "manual" as const,
        status: "running" as const,
        attempts: 1,
      },
      {
        name: "ended calendar period",
        periodKey: "month:2026-10",
        trigger: "schedule" as const,
        status: "failed" as const,
        attempts: 1,
      },
      {
        name: "exhausted attempts",
        periodKey: "month:2026-10",
        trigger: "schedule" as const,
        status: "failed" as const,
        attempts: 3,
      },
    ])(
      "cleans a leftover from $name on the next scheduled pass",
      async ({ periodKey, trigger, status, attempts }) => {
        const run = { periodKey, trigger, status, attempts };
        const leftover = await crashedIssue(false, run);
        expect(await f.pass()).toEqual({ drafted: 1, skipped: 0 });
        const { docs } = await f.issues();
        expect(docs).toHaveLength(1);
        expect(docs[0]!.id).not.toBe(leftover.id);
        const old = (await f.runs()).find(
          (entry) => entry.periodKey === run.periodKey,
        )!;
        expect(old.issueId).toBeNull();
        expect((await f.history()).map((entry) => entry.detail.event)).toEqual([
          "draft_made",
        ]);
      },
    );

    it.each(["history", "updatedAt"] as const)(
      "keeps a person's draft edit traced by %s",
      async (trace) => {
        let leftover = await crashedIssue();
        if (trace === "history") {
          const { plainTextToLexical } =
            await import("@/server/challenge-engine/lexical");
          leftover = (
            await f.m.issues.setIssueItems(
              f.m,
              leftover,
              [
                {
                  kind: "editorial",
                  body: plainTextToLexical("An editor's work"),
                },
              ],
              leftover.updatedAt,
              f.actor(),
            )
          ).issue;
          // Prove the person history protects it even without a later issue timestamp.
          const runId = (await f.runs())[0]!.id;
          await inPayloadTransaction(f.m.payload, (tx) =>
            f.m.runs.attachRunIssue(tx, runId, leftover.id, leftover.updatedAt),
          );
        } else {
          leftover = await f.m.payload.update({
            collection: "magazine-issues",
            id: leftover.id,
            data: { title: "An editor's title" },
            depth: 0,
          });
        }
        expect(await f.pass()).toEqual({ drafted: 1, skipped: 0 });
        expect((await f.issues()).docs).toEqual([
          expect.objectContaining({ id: leftover.id, title: leftover.title }),
        ]);
        expect(await f.runs()).toEqual([
          expect.objectContaining({
            status: "made",
            issueId: leftover.id,
            attempts: 2,
          }),
        ]);
        expect(await f.notices()).toEqual([]);
      },
    );

    it("keeps an editor save that lands between inspection and cleanup deletion", async () => {
      const leftover = await crashedIssue();
      failures.cleanupEdit = true;
      expect(await f.pass()).toEqual({ drafted: 1, skipped: 0 });
      expect((await f.issues()).docs).toEqual([
        expect.objectContaining({
          id: leftover.id,
          title: "An edit during cleanup",
        }),
      ]);
      expect(await f.notices()).toEqual([]);
    });

    it("cleans every other failed leftover before finishing a reclaimed takeover", async () => {
      const kept = await crashedIssue();
      await f.m.payload.update({
        collection: "magazine-issues",
        id: kept.id,
        data: { title: "Taken over" },
        depth: 0,
      });
      const removed = await crashedIssue(false, {
        periodKey: "manual:another-crash",
        trigger: "manual",
        status: "failed",
      });
      expect(await f.pass()).toEqual({ drafted: 1, skipped: 0 });
      expect((await f.issues()).docs).toEqual([
        expect.objectContaining({ id: kept.id }),
      ]);
      expect(
        (await f.runs()).find(
          (run) => run.periodKey === "manual:another-crash",
        ),
      ).toMatchObject({ status: "failed", issueId: null });
      expect(
        await f.m.payload.findByID({
          collection: "magazine-issues",
          id: removed.id,
          disableErrors: true,
        }),
      ).toBeNull();
      expect(await f.notices()).toEqual([]);
    });

    it("a person's explicit stop records why the automatic publish stopped", async () => {
      const leftover = await crashedIssue(true);
      await f.m.issues.unscheduleIssue(
        f.m,
        leftover,
        leftover.updatedAt,
        f.actor(),
      );
      expect((await f.history()).map((entry) => entry.detail)).toEqual([
        { event: "auto_publish_stopped", why: "stopped" },
      ]);
      expect((await f.history())[0]).toMatchObject({
        actorName: f.fx.editorId,
      });
    });

    it("keeps a crashed issue taken over by a person without another notice", async () => {
      let issue = await crashedIssue(true);
      issue = await f.m.issues.scheduleIssue(
        f.m,
        issue,
        at(120),
        issue.updatedAt,
        f.actor(),
        now,
      );
      expect(await f.pass()).toEqual({ drafted: 1, skipped: 0 });
      expect((await f.issues()).docs).toEqual([
        expect.objectContaining({
          id: issue.id,
          status: "scheduled",
          scheduledVia: "schedule",
        }),
      ]);
      expect(await f.notices()).toEqual([]);
      expect(await f.history()).toEqual([]);
      expect(await f.runs()).toEqual([
        expect.objectContaining({
          issueId: issue.id,
          attempts: 2,
          status: "made",
        }),
      ]);
    });
  },
);
