import { describe, expect, it } from "vitest";
import { NotAFeedError, parseFeed, plainText } from "./feed";

const RSS = `<?xml version="1.0"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>Example</title>
    <item>
      <title>First &amp; best</title>
      <link>/posts/1</link>
      <pubDate>Tue, 01 Sep 2026 10:00:00 GMT</pubDate>
      <dc:creator>Ada</dc:creator>
      <description><![CDATA[<p>Hello <b>world</b>&nbsp;today</p>]]></description>
    </item>
    <item>
      <title>Second</title>
      <link>https://example.com/posts/2</link>
      <pubDate>not a date</pubDate>
    </item>
  </channel>
</rss>`;

const ATOM = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Example</title>
  <entry>
    <title type="html">Atom &lt;i&gt;one&lt;/i&gt;</title>
    <link rel="self" href="https://example.com/self/1"/>
    <link rel="alternate" href="https://example.com/a/1"/>
    <updated>2026-09-02T08:00:00Z</updated>
    <author><name>Grace</name></author>
    <summary>Short summary</summary>
  </entry>
</feed>`;

describe("parseFeed", () => {
  it("reads RSS 2.0 items, resolving relative links and stripping HTML", () => {
    const entries = parseFeed(RSS, "https://example.com/feed.xml");
    expect(entries).toEqual([
      {
        title: "First & best",
        url: "https://example.com/posts/1",
        publishedAt: "2026-09-01T10:00:00.000Z",
        author: "Ada",
        summary: "Hello world today",
      },
      {
        title: "Second",
        url: "https://example.com/posts/2",
        publishedAt: null,
        author: null,
        summary: "",
      },
    ]);
  });

  it("reads Atom entries, preferring the alternate link", () => {
    expect(parseFeed(ATOM, "https://example.com/atom")).toEqual([
      {
        title: "Atom one",
        url: "https://example.com/a/1",
        publishedAt: "2026-09-02T08:00:00.000Z",
        author: "Grace",
        summary: "Short summary",
      },
    ]);
  });

  it("returns no entries for an empty channel", () => {
    expect(
      parseFeed(
        "<rss><channel><title>x</title></channel></rss>",
        "https://e.com/",
      ),
    ).toEqual([]);
  });

  it("rejects an HTML page", () => {
    expect(() =>
      parseFeed(
        "<!doctype html><html><body>Hi</body></html>",
        "https://e.com/",
      ),
    ).toThrow(NotAFeedError);
  });

  it("rejects declared entities before parsing (entity-expansion bomb)", () => {
    const bomb = `<?xml version="1.0"?>
<!DOCTYPE lolz [<!ENTITY lol "lol"><!ENTITY lol2 "&lol;&lol;&lol;&lol;">]>
<rss><channel><item><title>&lol2;</title></item></channel></rss>`;
    const started = Date.now();
    expect(() => parseFeed(bomb, "https://e.com/")).toThrow(NotAFeedError);
    expect(Date.now() - started).toBeLessThan(100);
  });

  it("keeps out-of-range character references as text instead of failing", () => {
    const rss = `<rss><channel>
      <item><title>Bad &#99999999; ref</title></item>
      <item><title>Hex &#x110000; &#xD800; ok &#x41;</title></item>
      <item><title>Fine</title></item>
    </channel></rss>`;
    expect(parseFeed(rss, "https://e.com/").map((e) => e.title)).toEqual([
      "Bad &#99999999; ref",
      "Hex &#x110000; &#xD800; ok A",
      "Fine",
    ]);
  });

  it("drops non-web links", () => {
    const rss = `<rss><channel><item><title>x</title><link>javascript:alert(1)</link></item></channel></rss>`;
    expect(parseFeed(rss, "https://e.com/")[0]?.url).toBeNull();
  });
});

describe("plainText", () => {
  it("removes scripts and styles with their content", () => {
    expect(plainText("<style>p{}</style>a<script>x()</script> b")).toBe("a b");
  });

  it("removes a script or style block even when its tags use other cases", () => {
    expect(
      plainText("a<SCRIPT type=x>bad()</Script>b<style>p{}</STYLE>c"),
    ).toBe("a b c");
  });

  it("keeps the text after an unclosed script tag, like any other tag", () => {
    expect(plainText("a<script>b")).toBe("a b");
  });

  it.each([
    ["unclosed script tags", "<script>x".repeat(120_000)],
    ["unclosed style tags", "<style>x".repeat(130_000)],
    ["tags that never close", "<a".repeat(500_000)],
  ])("stays fast on ~1 MB of %s", (_name, hostile) => {
    const started = performance.now();
    const out = plainText(hostile);
    expect(performance.now() - started).toBeLessThan(250);
    expect(out.length).toBeLessThanOrEqual(1_000);
  });

  it("truncates with an ellipsis", () => {
    expect(plainText("abcdef", 4)).toBe("abc…");
  });
});
