import { describe, it, expect, vi } from "vitest";

// event-form-dialog.tsx imports `api` from here for its live queries/mutations
// — pulling in the real module drags in `@/server/api/root` (every tRPC
// router, Payload, env validation requiring DATABASE_URL etc). This test only
// exercises the pure submit-payload helper, so stub it out the same way
// community-card.test.tsx does for its trpc import.
vi.mock("@/trpc/react", () => ({ api: {} }));

import {
  buildEventSubmitPayload,
  emptyEventFormData,
} from "./event-form-dialog";

const SLUG = "acme-community";

// #210: clearing every audience chip and saving an edit must persist an
// empty audience list — the server (I-T1) now honors an explicit `[]` as
// "clear the audience", so the form must stop collapsing empty arrays to
// `undefined` ("no change") when editing. Create/resubmit keep the
// omit-when-empty behavior (an empty audience on create is a validation
// error, not an intentional clear).
describe("buildEventSubmitPayload", () => {
  it("sends audience: [] when editing with every chip cleared", () => {
    const form = { ...emptyEventFormData, title: "Demo", audience: [] };
    const payload = buildEventSubmitPayload(form, "edit", SLUG);
    expect(payload.audience).toEqual([]);
  });

  it("sends the populated audience list unchanged when editing", () => {
    const form = {
      ...emptyEventFormData,
      title: "Demo",
      audience: ["ai-engineers", "founders"],
    };
    const payload = buildEventSubmitPayload(form, "edit", SLUG);
    expect(payload.audience).toEqual(["ai-engineers", "founders"]);
  });

  it("sends audience: [] when resubmitting with every chip cleared", () => {
    const form = { ...emptyEventFormData, title: "Demo", audience: [] };
    const payload = buildEventSubmitPayload(form, "resubmit", SLUG);
    expect(payload.audience).toEqual([]);
  });

  it("omits audience when creating with no chips selected", () => {
    const form = { ...emptyEventFormData, title: "Demo", audience: [] };
    const payload = buildEventSubmitPayload(form, "create", SLUG);
    expect(payload.audience).toBeUndefined();
  });

  it("sends the populated audience list when creating", () => {
    const form = {
      ...emptyEventFormData,
      title: "Demo",
      audience: ["ai-engineers"],
    };
    const payload = buildEventSubmitPayload(form, "create", SLUG);
    expect(payload.audience).toEqual(["ai-engineers"]);
  });

  it("parses comma-separated tags and drops blanks", () => {
    const form = {
      ...emptyEventFormData,
      title: "Demo",
      tags: "ai,  llm ,, agents",
    };
    const payload = buildEventSubmitPayload(form, "create", SLUG);
    expect(payload.tags).toEqual(["ai", "llm", "agents"]);
  });

  it("carries the community slug through", () => {
    const form = { ...emptyEventFormData, title: "Demo" };
    const payload = buildEventSubmitPayload(form, "create", SLUG);
    expect(payload.communitySlug).toBe(SLUG);
  });
});
