import { describe, it, expect } from "vitest";

import {
  applyImport,
  buildEventSubmitPayload,
  deriveConflictPanelState,
  emptyEventFormData,
  getMutationErrorMessage,
} from "./event-form-model";

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

// Final-review item 2 (IMPORTANT): during the 600ms debounce window the
// panel used to keep showing the *previous* debounced input's result
// (stale conflicts/clear) because `debouncedConflictInput` doesn't change
// until the timer fires — only `!debouncedConflictInput` (true only before
// the very first check ever ran) or `isFetching` (only true once the query
// actually starts) gated "checking". `debouncePending` closes that window:
// it's true for the entire time a newer input is waiting on the timer,
// regardless of what the previous input's query settled to.
describe("deriveConflictPanelState", () => {
  const settled = {
    gateMet: true,
    debouncePending: false,
    hasDebouncedInput: true,
    isFetching: false,
    isError: false,
    conflictCount: 0,
  };

  it("is idle when the date/audience gate isn't met, regardless of other flags", () => {
    expect(
      deriveConflictPanelState({
        ...settled,
        gateMet: false,
        conflictCount: 3,
      }),
    ).toBe("idle");
  });

  it("is checking while debouncePending is true even though a stale result would say 'clear'", () => {
    expect(
      deriveConflictPanelState({
        ...settled,
        debouncePending: true,
        conflictCount: 0,
      }),
    ).toBe("checking");
  });

  it("is checking while debouncePending is true even though a stale result would say 'conflicts'", () => {
    expect(
      deriveConflictPanelState({
        ...settled,
        debouncePending: true,
        conflictCount: 5,
      }),
    ).toBe("checking");
  });

  it("is checking before the first debounced input has ever landed", () => {
    expect(
      deriveConflictPanelState({ ...settled, hasDebouncedInput: false }),
    ).toBe("checking");
  });

  it("is checking while the query is actively fetching", () => {
    expect(deriveConflictPanelState({ ...settled, isFetching: true })).toBe(
      "checking",
    );
  });

  it("is error once settled with no pending debounce and the query failed", () => {
    expect(deriveConflictPanelState({ ...settled, isError: true })).toBe(
      "error",
    );
  });

  it("is clear once settled with zero conflicts", () => {
    expect(deriveConflictPanelState({ ...settled, conflictCount: 0 })).toBe(
      "clear",
    );
  });

  it("is conflicts once settled with at least one conflict", () => {
    expect(deriveConflictPanelState({ ...settled, conflictCount: 1 })).toBe(
      "conflicts",
    );
  });
});

const QUESTION = {
  id: "q1",
  type: "short_text" as const,
  label: "Company",
  required: false,
};

describe("buildEventSubmitPayload — registration questions", () => {
  it("always sends the questions, so [] removes them", () => {
    expect(
      buildEventSubmitPayload(emptyEventFormData, "edit", SLUG)
        .registrationQuestions,
    ).toEqual([]);
    expect(
      buildEventSubmitPayload(
        { ...emptyEventFormData, registrationQuestions: [QUESTION] },
        "create",
        SLUG,
      ).registrationQuestions,
    ).toEqual([QUESTION]);
  });

  it("sends none for an event people register for on another site", () => {
    expect(
      buildEventSubmitPayload(
        {
          ...emptyEventFormData,
          sourceUrl: "https://lu.ma/x",
          registrationQuestions: [QUESTION],
        },
        "edit",
        SLUG,
      ).registrationQuestions,
    ).toEqual([]);
  });
});

describe("applyImport", () => {
  it("fills what the link found and keeps the rest", () => {
    const form = { ...emptyEventFormData, title: "Mine", city: "Utrecht" };
    const result = applyImport(form, {
      title: "Imported",
      summary: null,
      description: null,
      date: "2026-11-02",
      startTime: null,
      endTime: null,
      location: null,
      city: null,
      country: "Netherlands",
      format: null,
      sourceUrl: "https://lu.ma/x",
      coverImageId: null,
      coverImageUrl: null,
    });
    expect(result).toMatchObject({
      title: "Imported",
      date: "2026-11-02",
      city: "Utrecht",
      country: "Netherlands",
      sourceUrl: "https://lu.ma/x",
    });
  });
});

describe("getMutationErrorMessage", () => {
  it("prefers the field message the router exposes", () => {
    expect(
      getMutationErrorMessage(
        { data: { zodError: { fieldErrors: { title: ["Too short"] } } } },
        "fallback",
      ),
    ).toBe("Too short");
  });

  it("falls back for raw zod dumps and missing messages", () => {
    expect(getMutationErrorMessage({ message: '[{"code":"x"}]' }, "fb")).toBe(
      "fb",
    );
    expect(getMutationErrorMessage({}, "fb")).toBe("fb");
    expect(getMutationErrorMessage({ message: "Server said no" }, "fb")).toBe(
      "Server said no",
    );
  });
});
