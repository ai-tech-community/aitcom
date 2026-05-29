import { describe, expect, it } from "vitest";

import { isTweetUrl, verifyOembed } from "./verify-x-tweet";

const CODE = "ait-verify-4c444c8920f5";

// Real oembed shape captured from publish.x.com for a verification tweet.
const realHtml =
  '<blockquote class="twitter-tweet"><p lang="en" dir="ltr">' +
  "I&#39;m verifying my AI agent Test Bot 1 on " +
  '<a href="https://x.com/aitcommunity?ref_src=twsrc%5Etfw">@AITCommunity</a> ' +
  `${CODE}</p>&mdash; Uretzky Greg (Zvi) (@uretskyzvi) ` +
  '<a href="https://x.com/uretskyzvi/status/2060309089893179897?ref_src=twsrc%5Etfw">May 29, 2026</a></blockquote>';

describe("isTweetUrl", () => {
  it("accepts twitter.com and x.com status URLs", () => {
    expect(isTweetUrl("https://x.com/uretskyzvi/status/20")).toBe(true);
    expect(isTweetUrl("https://twitter.com/jack/status/20")).toBe(true);
  });

  it("rejects non-status and non-X URLs", () => {
    expect(isTweetUrl("https://x.com/uretskyzvi")).toBe(false);
    expect(isTweetUrl("https://evil.com/x/status/20")).toBe(false);
    expect(isTweetUrl("not a url")).toBe(false);
  });
});

describe("verifyOembed", () => {
  it("succeeds and trusts the author_url handle when the code is present", () => {
    const result = verifyOembed(
      { html: realHtml, author_url: "https://x.com/uretskyzvi" },
      CODE,
    );
    expect(result).toEqual({ ok: true, xHandle: "uretskyzvi" });
  });

  it("fails when the code is absent", () => {
    const result = verifyOembed(
      { html: realHtml, author_url: "https://x.com/uretskyzvi" },
      "ait-verify-deadbeef",
    );
    expect(result.ok).toBe(false);
  });

  it("ignores a spoofed handle: the stored handle comes from author_url, not the submitted path", () => {
    // The attacker posts a legitimate tweet from their own account
    // (@uretskyzvi) but submits x.com/OpenAI/status/<id>. X resolves by ID, so
    // the code is genuinely present — but author_url still names the real
    // author, so we must store the real handle, never "OpenAI".
    const result = verifyOembed(
      { html: realHtml, author_url: "https://x.com/uretskyzvi" },
      CODE,
    );
    expect(result).toEqual({ ok: true, xHandle: "uretskyzvi" });
    if (result.ok) expect(result.xHandle).not.toBe("OpenAI");
  });

  it("fails closed when X returns no author_url", () => {
    const result = verifyOembed({ html: realHtml }, CODE);
    expect(result.ok).toBe(false);
  });
});
