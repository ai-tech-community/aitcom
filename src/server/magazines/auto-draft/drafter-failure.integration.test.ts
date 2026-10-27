// @vitest-environment node
import type * as History from "../issue-history";
import type * as Editorship from "../editorship";
import type * as Issues from "../issue-service";
import type * as Runs from "./runs";
import type * as Picks from "./picks";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { at, drafterFixture, isLocalDbConfigured, now } from "./test-fixtures";

const failures = vi.hoisted(() => ({
  save: false,
  picks: false,
  schedule: false,
  history: false,
  editors: false,
  claim: false,
}));
vi.mock("../issue-service", async (importOriginal) => {
  const real = await importOriginal<typeof Issues>();
  return {
    ...real,
    setIssueItems: async (...args: Parameters<typeof real.setIssueItems>) => {
      if (failures.save) {
        failures.save = false;
        throw new Error("Save failed");
      }
      return real.setIssueItems(...args);
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
    claimAutoDraftRun: async (
      ...args: Parameters<typeof real.claimAutoDraftRun>
    ) => {
      if (failures.claim) {
        failures.claim = false;
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
      failures.picks = false;
      failures.schedule = false;
      failures.history = false;
      failures.editors = false;
      failures.claim = false;
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
        for (let i = 0; i < 5; i++) {
          const { magazine } = await f.makeMagazine(
            `unclaimed-${i}-${f.fx.suffix}`,
          );
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
        expect(log).toHaveBeenCalled();
      } finally {
        log.mockRestore();
      }
    });

    async function crashedIssue(scheduled = false) {
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
      });
      return issue;
    }

    it("a run that died half-way is cleaned up, never doubled", async () => {
      const leftover = await crashedIssue();
      expect(await f.manual()).toMatchObject({
        status: "skipped",
        reason: "draft_open",
        openIssueId: leftover.id,
      });
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
