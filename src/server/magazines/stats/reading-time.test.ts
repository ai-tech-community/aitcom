// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import type { Deps } from "../deps";
import { loadIssueAccessById } from "../issue-access";
import { recordReadingTimeFor } from "./reading-time";

vi.mock("../issue-access", () => ({ loadIssueAccessById: vi.fn() }));
const values = vi.fn();
const update = vi.fn();
const insert = vi.fn(() => ({ values }));
const find = vi.fn();
const deps = { db: { insert }, payload: { find } } as unknown as Deps;
const input = {
  issueId: 7,
  sessionId: "788c43e9-bdc4-4e72-818e-f7fd0878b632",
  activeSeconds: 75,
  viewerId: null,
  now: new Date("2026-10-30T12:00:00Z"),
};
const compile = (statement: SQL) =>
  new PgDialect({ casing: "snake_case" }).sqlToQuery(statement);
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(loadIssueAccessById).mockResolvedValue({
    issue: { id: 7, magazineId: 12 },
    access: "full",
  } as never);
  values.mockReturnValue({ onConflictDoUpdate: update });
  update.mockResolvedValue(undefined);
  find.mockResolvedValue({ docs: [{ id: 11 }] });
});
describe("reading time recorder", () => {
  it.each(["none", "editor"] as const)(
    "refuses %s access before any write",
    async (access) => {
      vi.mocked(loadIssueAccessById).mockResolvedValue({
        issue: { id: 7, magazineId: 12 },
        access,
      } as never);
      expect(await recordReadingTimeFor(deps, input)).toBe(false);
      expect(insert).not.toHaveBeenCalled();
    },
  );
  it("refuses missing issues and articles outside a published issue", async () => {
    vi.mocked(loadIssueAccessById).mockResolvedValueOnce(null);
    expect(await recordReadingTimeFor(deps, input)).toBe(false);
    find.mockResolvedValue({ docs: [] });
    expect(await recordReadingTimeFor(deps, { ...input, articleId: 11 })).toBe(
      false,
    );
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "articles",
        draft: false,
        where: {
          and: [
            { id: { equals: 11 } },
            { status: { equals: "published" } },
            { magazineIssue: { equals: 7 } },
          ],
        },
      }),
    );
    expect(insert).not.toHaveBeenCalled();
  });
  it.each(["full", "teaser"] as const)(
    "records %s readable pages without retaining identity",
    async (access) => {
      vi.mocked(loadIssueAccessById).mockResolvedValue({
        issue: { id: 7, magazineId: 12 },
        access,
      } as never);
      expect(
        await recordReadingTimeFor(deps, { ...input, articleId: 11 }),
      ).toBe(true);
      expect(loadIssueAccessById).toHaveBeenCalledWith(deps, 7, null);
      expect(values).toHaveBeenCalledWith({
        id: input.sessionId,
        magazineId: 12,
        issueId: 7,
        articleId: 11,
        activeSeconds: 15,
        firstSeenAt: input.now,
        lastSeenAt: input.now,
      });
      const config = update.mock.calls[0]![0];
      const duration = compile(config.set.activeSeconds);
      expect(duration.sql).toContain("GREATEST");
      expect(duration.sql).toContain("LEAST");
      expect(duration.sql).toContain("EXTRACT(EPOCH");
      expect(duration.params).toEqual([75, 7200, 15, input.now.toISOString()]);
      const binding = compile(config.setWhere);
      expect(binding.sql).toContain("IS NOT DISTINCT FROM");
      expect(binding.params).toEqual([12, 7, 11]);
      expect(JSON.stringify(values.mock.calls)).not.toMatch(
        /readerKey|viewerId|userAgent/,
      );
    },
  );
  it("binds issue-page sessions to a null article and initializes zero safely", async () => {
    await recordReadingTimeFor(deps, { ...input, activeSeconds: 0 });
    expect(values.mock.calls[0]![0]).toMatchObject({
      activeSeconds: 0,
      articleId: null,
    });
    expect(compile(update.mock.calls[0]![0].setWhere).params).toEqual([
      12,
      7,
      null,
    ]);
  });
});
