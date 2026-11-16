import { describe, expect, it } from "vitest";

import { messagePreview } from "./message-preview";

describe("messagePreview", () => {
  it("shows the words when the message has any", () => {
    expect(
      messagePreview({ content: "hi", attachmentKind: "gif" }, "GIF"),
    ).toBe("hi");
  });

  it("names the GIF when the message is only a GIF", () => {
    expect(messagePreview({ content: "", attachmentKind: "gif" }, "GIF")).toBe(
      "GIF",
    );
  });

  it("shows nothing for an empty message without an attachment", () => {
    expect(
      messagePreview({ content: "", attachmentKind: null }, "GIF"),
    ).toBeNull();
  });

  it("shows nothing when there is no last message", () => {
    expect(messagePreview(undefined, "GIF")).toBeNull();
    expect(messagePreview(null, "GIF")).toBeNull();
  });
});
