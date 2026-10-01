import { describe, expect, it } from "vitest";

import {
  postMentionMailCopy,
  renderPostMentionHtml,
} from "./post-mention-mail-copy";

const mail = {
  authorName: "Jane <b>Doe</b>",
  communityName: "GIF\nLab",
  isVideo: false,
};
const urls = {
  post: "/en/communities/gif-lab",
  manage: "/en/dashboard/notifications",
};

describe("post mention mail", () => {
  it("names who and where on one line, in English or Dutch", () => {
    expect(postMentionMailCopy("en", mail).subject).toBe(
      "Jane <b>Doe</b> mentioned you in GIF Lab",
    );
    expect(postMentionMailCopy("nl", { ...mail, isVideo: true })).toMatchObject(
      {
        subject: "Jane <b>Doe</b> noemde je in GIF Lab",
        cta: "Bekijk de video",
      },
    );
  });

  it("escapes member names and links to the post and the switch", () => {
    const html = renderPostMentionHtml("en", mail, urls);
    expect(html).not.toContain("<b>");
    expect(html).toContain("Jane &lt;b&gt;Doe&lt;/b&gt;");
    expect(html).toContain('href="/en/communities/gif-lab"');
    expect(html).toContain('href="/en/dashboard/notifications"');
    expect(html).toContain("Open the post");
  });
});
