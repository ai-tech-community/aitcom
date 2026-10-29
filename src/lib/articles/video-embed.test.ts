import { describe, expect, it } from "vitest";

import { articleVideoEmailHtml } from "./video-email";
import {
  ARTICLE_IFRAME_HOSTS,
  isAllowedEmbedSrc,
  resolveArticleVideo,
} from "./video-embed";

const YT = "dQw4w9WgXcQ";

describe("resolveArticleVideo", () => {
  it.each([
    [
      `https://www.youtube.com/watch?v=${YT}`,
      `https://www.youtube-nocookie.com/embed/${YT}`,
    ],
    [
      `https://youtube.com/watch?v=${YT}&t=90`,
      `https://www.youtube-nocookie.com/embed/${YT}?start=90`,
    ],
    [
      `https://m.youtube.com/watch?v=${YT}`,
      `https://www.youtube-nocookie.com/embed/${YT}`,
    ],
    [`https://youtu.be/${YT}`, `https://www.youtube-nocookie.com/embed/${YT}`],
    [`http://youtu.be/${YT}`, `https://www.youtube-nocookie.com/embed/${YT}`],
    [
      `https://www.youtube.com/embed/${YT}?autoplay=1`,
      `https://www.youtube-nocookie.com/embed/${YT}`,
    ],
    [
      `https://www.youtube.com/shorts/${YT}`,
      `https://www.youtube-nocookie.com/embed/${YT}`,
    ],
    [
      `https://www.youtube-nocookie.com/embed/${YT}?start=42`,
      `https://www.youtube-nocookie.com/embed/${YT}?start=42`,
    ],
  ])("youtube %s", (raw, embedSrc) => {
    const video = resolveArticleVideo(raw);
    expect(video).toMatchObject({
      kind: "embed",
      provider: "youtube",
      embedSrc,
      thumbnailUrl: `https://i.ytimg.com/vi/${YT}/hqdefault.jpg`,
    });
    expect(video?.kind === "embed" && isAllowedEmbedSrc(video.embedSrc)).toBe(
      true,
    );
  });

  it.each([
    ["https://vimeo.com/123456789", "https://player.vimeo.com/video/123456789"],
    [
      "https://vimeo.com/123456789/abcdef",
      "https://player.vimeo.com/video/123456789?h=abcdef",
    ],
    [
      "https://player.vimeo.com/video/123456789?h=abcdef&autoplay=1",
      "https://player.vimeo.com/video/123456789?h=abcdef",
    ],
  ])("vimeo %s", (raw, embedSrc) => {
    const video = resolveArticleVideo(raw);
    expect(video).toMatchObject({
      kind: "embed",
      provider: "vimeo",
      embedSrc,
      thumbnailUrl: null,
    });
    expect(video?.kind === "embed" && isAllowedEmbedSrc(video.embedSrc)).toBe(
      true,
    );
  });

  it("keeps Schooltv as a link card — the page has no public embed URL", () => {
    const video = resolveArticleVideo(
      "https://schooltv.nl/video-item/is-het-slecht-om-niet-te-ontbijten-victorias-factcheck",
    );
    expect(video).toEqual({
      kind: "card",
      provider: "schooltv",
      label: "Schooltv",
      href: "https://schooltv.nl/video-item/is-het-slecht-om-niet-te-ontbijten-victorias-factcheck",
      title: "Is het slecht om niet te ontbijten victorias factcheck",
    });
    expect(video).not.toHaveProperty("embedSrc");
  });

  it("turns a generic page into a link card", () => {
    expect(
      resolveArticleVideo("https://example.com/stories/night-owls"),
    ).toEqual({
      kind: "card",
      provider: "link",
      label: "example.com",
      href: "https://example.com/stories/night-owls",
      title: "Night owls",
    });
  });

  it.each([
    `https://youtube.com.evil.test/watch?v=${YT}`,
    `https://www.youtube.com.evil.test/embed/${YT}`,
    "https://player.vimeo.com.evil.test/video/123",
    "https://schooltv.nl.evil.test/video-item/sam",
    "javascript:alert(1)",
    "data:text/html,hi",
    `ftp://youtube.com/watch?v=${YT}`,
    "https://user:pass@www.youtube.com/watch?v=" + YT,
    "https://www.youtube.com/watch?v=short",
    "https://www.youtube.com/embed/videoseries?list=PL123",
    "",
    "   ",
  ])("does not embed %s", (raw) => {
    const video = resolveArticleVideo(raw);
    const embedded = video?.kind === "embed";
    expect(embedded).toBe(false);
  });
});

describe("isAllowedEmbedSrc", () => {
  it("allows only the hosts and paths this module builds", () => {
    expect(ARTICLE_IFRAME_HOSTS).toEqual([
      "www.youtube-nocookie.com",
      "player.vimeo.com",
    ]);
    expect(
      isAllowedEmbedSrc(`https://www.youtube-nocookie.com/embed/${YT}`),
    ).toBe(true);
    expect(isAllowedEmbedSrc(`https://www.youtube.com/embed/${YT}`)).toBe(
      false,
    );
    expect(
      isAllowedEmbedSrc(
        `https://www.youtube-nocookie.com/embed/${YT}?autoplay=1`,
      ),
    ).toBe(false);
    expect(isAllowedEmbedSrc("https://player.vimeo.com/video/123?h=abc")).toBe(
      true,
    );
    expect(isAllowedEmbedSrc("https://schooltv.nl/embed/abc")).toBe(false);
    expect(isAllowedEmbedSrc("https://evil.test/embed/" + YT)).toBe(false);
    expect(isAllowedEmbedSrc("javascript:alert(1)")).toBe(false);
  });
});

describe("articleVideoEmailHtml", () => {
  it("mails a YouTube thumbnail and link, never an iframe", () => {
    const html = articleVideoEmailHtml(`https://www.youtube.com/watch?v=${YT}`);
    expect(html).toContain(`https://i.ytimg.com/vi/${YT}/hqdefault.jpg`);
    expect(html).toContain(`https://www.youtube.com/watch?v=${YT}`);
    expect(html).toContain("Watch on YouTube");
    expect(html.toLowerCase()).not.toContain("<iframe");
  });

  it("mails a Schooltv link card with no iframe", () => {
    const html = articleVideoEmailHtml(
      "https://schooltv.nl/video-item/is-het-slecht-om-niet-te-ontbijten-victorias-factcheck",
    );
    expect(html).toContain("schooltv.nl/video-item/");
    expect(html).toContain("Is het slecht om niet te ontbijten");
    expect(html.toLowerCase()).not.toContain("<iframe");
    expect(html.toLowerCase()).not.toContain("<img");
  });

  it("escapes a hostile query so it cannot become markup", () => {
    const html = articleVideoEmailHtml(
      "https://example.com/?q=%3Cscript%3Ealert(1)%3C/script%3E",
    );
    expect(html.toLowerCase()).not.toContain("<script");
    expect(html.toLowerCase()).not.toContain("<iframe");
  });
});
