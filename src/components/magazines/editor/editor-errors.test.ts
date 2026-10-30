import { describe, expect, it } from "vitest";

import { MAGAZINE_ERROR_CODES } from "@/server/magazines/errors";

import en from "../../../../messages/en.json";
import nl from "../../../../messages/nl.json";

import { editorErrorKey, readEditorError } from "./editor-errors";

describe("editorErrorKey", () => {
  it.each([
    ["SCHEDULE_IN_PAST", "scheduleInPast"],
    ["SCHEDULE_TOO_FAR", "scheduleTooFar"],
    ["ISSUE_NOT_SCHEDULED", "issueNotScheduled"],
    ["STAFF_NOT_MEMBER", "staffNotMember"],
    ["STAFF_LEADS_COMMUNITY", "staffLeadsCommunity"],
    ["ARTICLE_LOCKED", "articleLocked"],
    ["ARTICLE_NOT_PENDING", "articleNotPending"],
    ["REVIEW_NOTE_REQUIRED", "reviewNoteRequired"],
    ["UNLISTED_PUBLIC_LEADERS_ONLY", "unlistedPublicLeadersOnly"],
  ])("maps %s to its own message", (code, key) => {
    expect(editorErrorKey(code)).toBe(key);
    expect(readEditorError({ message: code })).toEqual({
      key,
      itemIndex: null,
    });
  });

  it("maps every MagazineErrorCode to a message key present in en and nl", () => {
    const keys = new Set<string>();
    for (const code of MAGAZINE_ERROR_CODES) {
      const key = editorErrorKey(code);
      expect(key, code).not.toBe("generic");
      keys.add(key);
      expect(en.magazineEditor.errors[key], `en ${key}`).toEqual(
        expect.any(String),
      );
      expect(nl.magazineEditor.errors[key], `nl ${key}`).toEqual(
        expect.any(String),
      );
    }
    // One friendly message per refusal: no two codes share a text.
    expect(keys.size).toBe(MAGAZINE_ERROR_CODES.length);
  });

  it("maps anything unknown to the generic message", () => {
    expect(editorErrorKey(undefined)).toBe("generic");
    expect(editorErrorKey("something raw from the server")).toBe("generic");
    expect(editorErrorKey("toString")).toBe("generic");
    expect(en.magazineEditor.errors.generic).toEqual(expect.any(String));
    expect(nl.magazineEditor.errors.generic).toEqual(expect.any(String));
  });
});

describe("readEditorError", () => {
  it("reads the message key and the item the refusal points at", () => {
    expect(
      readEditorError({
        message: "ARTICLE_PLACED",
        data: { magazineItemIndex: 2 },
      }),
    ).toEqual({ key: "articlePlaced", itemIndex: 2 });
  });

  it("has no item index when the server sent none", () => {
    expect(readEditorError({ message: "ISSUE_CHANGED", data: null })).toEqual({
      key: "issueChanged",
      itemIndex: null,
    });
    expect(
      readEditorError({
        message: "MAGAZINE_SLUG_TAKEN",
        data: { magazineItemIndex: null },
      }),
    ).toEqual({ key: "magazineSlugTaken", itemIndex: null });
    expect(readEditorError(new Error("network down"))).toEqual({
      key: "generic",
      itemIndex: null,
    });
  });
});
