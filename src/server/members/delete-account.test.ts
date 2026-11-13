import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/db", () => ({ db: {} }));
vi.mock("@/env", () => ({
  env: {
    NODE_ENV: "test",
    DATABASE_URL: "postgres://localhost:5432/test",
    NEXT_PUBLIC_APP_URL: "https://app.test",
    NEON_LOCAL_PROXY: undefined,
  },
}));

import {
  account,
  activityEvents,
  agentApiKeys,
  agentDrafts,
  agentProfiles,
  agentSuggestions,
  agentWebhooks,
  communityMatchingProfiles,
  eventRegistrations,
  hackathonStaffInvite,
  hubMailPrefs,
  magazineSubscriptions,
  memberProfiles,
  messages,
  newsStorySuggestions,
  notifications,
  paymentComplimentaryMembers,
  paymentOrders,
  paymentSubscriptions,
  referralEmailInvites,
  session,
  socialIdentities,
  verification,
  startupMemberCvs,
  startups,
  user,
} from "@/server/db/schema";
import {
  AccountNotFoundError,
  AUTHORED_CONTENT,
  DELETED_AUTHOR_ID,
  DELETED_MEMBER_NAME,
  deleteMemberAccount,
  deletedAccountEmail,
} from "@/server/members/delete-account";

type Call = {
  op: "delete" | "update" | "execute";
  table?: unknown;
  values?: unknown;
  query?: unknown;
};

function recordingDb(existing: { id: string; email: string } | null) {
  const calls: Call[] = [];

  function selectChain(table: unknown) {
    const rows =
      table === user && existing
        ? [existing]
        : table === agentProfiles
          ? []
          : [];
    const result = Promise.resolve(rows);
    return Object.assign(result, { limit: () => result });
  }

  const tx = {
    select: () => ({
      from: (table: unknown) => ({
        where: () => selectChain(table),
      }),
    }),
    delete: (table: unknown) => ({
      where: () => {
        calls.push({ op: "delete", table });
        return Promise.resolve();
      },
    }),
    update: (table: unknown) => ({
      set: (values: unknown) => ({
        where: () => {
          calls.push({ op: "update", table, values });
          return Promise.resolve();
        },
      }),
    }),
    execute: (query: unknown) => {
      calls.push({ op: "execute", query });
      return Promise.resolve();
    },
  };

  return {
    calls,
    transaction: (fn: (trx: typeof tx) => Promise<void>) => fn(tx),
  };
}

function updates(calls: Call[], table: unknown): unknown[] {
  return calls
    .filter((call) => call.op === "update" && call.table === table)
    .map((call) => call.values);
}

function deleted(calls: Call[]): unknown[] {
  return calls.filter((call) => call.op === "delete").map((call) => call.table);
}

describe("deleteMemberAccount", () => {
  it("gives each deleted account its own non-deliverable email", () => {
    expect(deletedAccountEmail("user-1")).toBe(
      "deleted+user-1@deleted.invalid",
    );
    expect(deletedAccountEmail("user-1")).not.toBe(
      deletedAccountEmail("user-2"),
    );
  });

  it("removes sign-in and profile data, anonymizes the account, and de-links payments", async () => {
    const db = recordingDb({ id: "user-1", email: "ada@example.com" });

    await deleteMemberAccount(db as never, "user-1");

    expect(deleted(db.calls)).toEqual(
      expect.arrayContaining([
        session,
        account,
        verification,
        memberProfiles,
        socialIdentities,
        startupMemberCvs,
        communityMatchingProfiles,
        notifications,
        hubMailPrefs,
        newsStorySuggestions,
        agentApiKeys,
        agentWebhooks,
        agentDrafts,
        agentSuggestions,
        paymentComplimentaryMembers,
      ]),
    );
    expect(deleted(db.calls)).not.toContain(user);
    expect(deleted(db.calls)).not.toContain(paymentOrders);

    expect(updates(db.calls, user)).toEqual([
      {
        name: DELETED_MEMBER_NAME,
        firstName: null,
        lastName: null,
        email: "deleted+user-1@deleted.invalid",
        emailVerified: false,
        image: null,
        newsStoryEmailOptedOutAt: expect.any(Date),
      },
    ]);
    expect(updates(db.calls, paymentOrders)).toEqual([
      { buyerId: null, buyerEmail: "redacted@deleted.invalid" },
    ]);
    expect(updates(db.calls, paymentSubscriptions)).toEqual([
      { userId: null, token: null, cancelAtPeriodEnd: true },
    ]);
    expect(updates(db.calls, eventRegistrations)).toEqual([{ answers: {} }]);
    expect(updates(db.calls, messages)).toEqual([
      {
        content: "[deleted]",
        metadata: null,
        uiResource: null,
        uiProducerTrust: null,
      },
    ]);
    expect(updates(db.calls, activityEvents)).toEqual([{ metadata: null }]);
    expect(updates(db.calls, referralEmailInvites)).toEqual([
      { senderName: DELETED_MEMBER_NAME },
    ]);
    expect(updates(db.calls, magazineSubscriptions)).toEqual([
      { email: null, confirmTokenHash: null },
    ]);
    expect(updates(db.calls, hackathonStaffInvite)).toEqual([
      { email: "redacted+user-1@deleted.invalid" },
    ]);
    expect(updates(db.calls, startups)).toEqual([
      {
        claimedByUserId: null,
        claimStatus: null,
        claimDraft: null,
        claimedAt: null,
      },
      { submittedByUserId: null },
    ]);
    expect(updates(db.calls, agentProfiles)).toMatchObject([
      { ownerId: null, xHandle: null, canReadOwnerDMs: false },
    ]);

    const executed = db.calls
      .filter((call) => call.op === "execute")
      .map((call) => JSON.stringify(call.query));
    expect(executed).toHaveLength(AUTHORED_CONTENT.length);
    const sqlText = executed.join("\n");
    expect(sqlText).toContain('public.\\"forum_threads\\"');
    expect(sqlText).toContain('public.\\"forum_replies\\"');
    expect(sqlText).toContain('public.\\"community_ideas\\"');
    expect(sqlText).toContain('\\"author_name\\"');
    expect(sqlText).not.toContain("SET public.");
    expect(sqlText).toContain(DELETED_AUTHOR_ID);
    expect(sqlText).toContain("user-1");
  });

  it("does nothing when the account is already gone", async () => {
    const db = recordingDb(null);

    await expect(
      deleteMemberAccount(db as never, "missing"),
    ).rejects.toBeInstanceOf(AccountNotFoundError);
    expect(db.calls).toEqual([]);
  });
});
