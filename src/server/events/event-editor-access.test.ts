import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/db", () => ({ db: {} }));
vi.mock("@/server/payload", () => ({ getPayloadClient: vi.fn() }));

const { editorModeFor } = await import("./event-editor-access");

describe("editorModeFor", () => {
  it.each([
    [
      "an admin",
      {
        isAdmin: true,
        isSubmitter: false,
        status: "published",
        wantsResubmit: false,
      },
      "edit",
    ],
    [
      "an admin asking to resubmit someone else's",
      {
        isAdmin: true,
        isSubmitter: false,
        status: "rejected",
        wantsResubmit: true,
      },
      "edit",
    ],
    [
      "an admin resubmitting their own rejected one",
      {
        isAdmin: true,
        isSubmitter: true,
        status: "rejected",
        wantsResubmit: true,
      },
      "resubmit",
    ],
    [
      "an admin editing their own rejected one",
      {
        isAdmin: true,
        isSubmitter: true,
        status: "rejected",
        wantsResubmit: false,
      },
      "edit",
    ],
    [
      "the submitter of a rejected event",
      {
        isAdmin: false,
        isSubmitter: true,
        status: "rejected",
        wantsResubmit: false,
      },
      "resubmit",
    ],
    [
      "the submitter of a pending event",
      {
        isAdmin: false,
        isSubmitter: true,
        status: "draft",
        wantsResubmit: true,
      },
      null,
    ],
    [
      "the submitter of a published event",
      {
        isAdmin: false,
        isSubmitter: true,
        status: "published",
        wantsResubmit: false,
      },
      null,
    ],
    [
      "another member",
      {
        isAdmin: false,
        isSubmitter: false,
        status: "rejected",
        wantsResubmit: true,
      },
      null,
    ],
  ] as const)("%s → %s", (_who, input, expected) => {
    expect(editorModeFor(input)).toBe(expected);
  });
});
