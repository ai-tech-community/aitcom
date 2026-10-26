import { describe, expect, it } from "vitest";

import {
  articleTextModeFor,
  type IssueReaderAccess,
  seesEditorLayer,
} from "./access";

/**
 * Pins what each reader access level gets (ADR-0042, Decision 2). A new
 * level fails to compile in the helpers and must be added here on purpose.
 */
const EXPECTED: Record<
  IssueReaderAccess,
  { text: ReturnType<typeof articleTextModeFor>; editorLayer: boolean }
> = {
  full: { text: "published", editorLayer: false },
  editor: { text: "latest_draft", editorLayer: true },
};

describe("reader access levels", () => {
  it.each(
    Object.entries(EXPECTED) as [
      IssueReaderAccess,
      (typeof EXPECTED)[IssueReaderAccess],
    ][],
  )("%s", (access, expected) => {
    expect(articleTextModeFor(access)).toBe(expected.text);
    expect(seesEditorLayer(access)).toBe(expected.editorLayer);
  });
});
