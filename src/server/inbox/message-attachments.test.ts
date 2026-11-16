import { describe, expect, it, vi } from "vitest";

import {
  attachmentStandIn,
  loadAttachments,
  textForReaders,
  withAttachments,
  type MessageAttachmentView,
} from "./message-attachments";

const gif: MessageAttachmentView = {
  id: "att-1",
  kind: "gif",
  position: 0,
  title: "Happy dance",
  mp4Url: "https://media.giphy.com/media/abc123/giphy.mp4",
  stillUrl: "https://media.giphy.com/media/abc123/giphy_s.gif",
  width: 400,
  height: 300,
};

describe("attachmentStandIn", () => {
  it("names a GIF by its title", () => {
    expect(attachmentStandIn([gif])).toBe("[GIF: Happy dance]");
  });

  it("says only GIF when the GIF has no title", () => {
    expect(attachmentStandIn([{ ...gif, title: "" }])).toBe("[GIF]");
  });

  it("is empty for a message with no attachments", () => {
    expect(attachmentStandIn([])).toBe("");
  });
});

describe("textForReaders", () => {
  it("puts the stand-in on its own line after the words", () => {
    expect(textForReaders("hi", [gif])).toBe("hi\n[GIF: Happy dance]");
  });

  it("is only the stand-in for a GIF-only message", () => {
    expect(textForReaders("", [gif])).toBe("[GIF: Happy dance]");
  });

  it("is only the words for a message with no attachments", () => {
    expect(textForReaders("hi", [])).toBe("hi");
  });
});

describe("loadAttachments", () => {
  it("asks the database nothing for no messages", async () => {
    const select = vi.fn();
    const db = { select } as unknown as Parameters<typeof loadAttachments>[0];
    expect(await loadAttachments(db, [])).toEqual(new Map());
    expect(await withAttachments(db, [])).toEqual([]);
    expect(select).not.toHaveBeenCalled();
  });
});
