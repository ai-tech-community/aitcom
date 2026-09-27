import { describe, expect, it } from "vitest";
import { EMBED_PROVIDER_LABELS, resolveEmbed } from "./embed-providers";

const YT = "dQw4w9WgXcQ";
const GID = "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-x";

describe("resolveEmbed", () => {
  it.each([
    [`https://www.youtube.com/watch?v=${YT}`, `https://www.youtube-nocookie.com/embed/${YT}`],
    [`https://youtube.com/watch?v=${YT}&t=90`, `https://www.youtube-nocookie.com/embed/${YT}?start=90`],
    [`https://m.youtube.com/watch?v=${YT}`, `https://www.youtube-nocookie.com/embed/${YT}`],
    [`https://youtu.be/${YT}?t=42`, `https://www.youtube-nocookie.com/embed/${YT}?start=42`],
    [`https://www.youtube.com/embed/${YT}`, `https://www.youtube-nocookie.com/embed/${YT}`],
    [`https://www.youtube.com/shorts/${YT}`, `https://www.youtube-nocookie.com/embed/${YT}`],
    [`https://www.youtube.com/live/${YT}`, `https://www.youtube-nocookie.com/embed/${YT}`],
    [`https://www.youtube-nocookie.com/embed/${YT}`, `https://www.youtube-nocookie.com/embed/${YT}`],
  ])("youtube: %s", (raw, src) => {
    expect(resolveEmbed(raw)).toEqual({
      provider: "youtube",
      label: "YouTube",
      embedSrc: src,
      aspect: "16:9",
      needsPublicSharing: false,
    });
  });

  it.each([
    ["https://vimeo.com/123456789", "https://player.vimeo.com/video/123456789"],
    ["https://vimeo.com/123456789/abcdef1234", "https://player.vimeo.com/video/123456789?h=abcdef1234"],
    ["https://player.vimeo.com/video/123456789", "https://player.vimeo.com/video/123456789"],
    ["https://player.vimeo.com/video/123456789?h=abcdef1234", "https://player.vimeo.com/video/123456789?h=abcdef1234"],
    ["https://player.vimeo.com/video/123456789?h=abc-def", "https://player.vimeo.com/video/123456789"],
  ])("vimeo: %s", (raw, src) => {
    expect(resolveEmbed(raw)?.embedSrc).toBe(src);
    expect(resolveEmbed(raw)?.provider).toBe("vimeo");
  });

  it("loom share and embed links", () => {
    const id = "0123456789abcdef0123456789abcdef";
    for (const raw of [
      `https://www.loom.com/share/${id}`,
      `https://loom.com/share/${id}?sid=x`,
      `https://www.loom.com/embed/${id}`,
    ]) {
      expect(resolveEmbed(raw)).toMatchObject({
        provider: "loom",
        embedSrc: `https://www.loom.com/embed/${id}`,
      });
    }
  });

  it("google slides edit and published links", () => {
    expect(
      resolveEmbed(`https://docs.google.com/presentation/d/${GID}/edit#slide=id.p`),
    ).toEqual({
      provider: "google-slides",
      label: "Google Slides",
      embedSrc: `https://docs.google.com/presentation/d/${GID}/embed?start=false&loop=false`,
      aspect: "16:9",
      needsPublicSharing: true,
    });
    expect(
      resolveEmbed(`https://docs.google.com/presentation/d/e/2PACX-${GID}/pub?start=false`),
    ).toMatchObject({
      provider: "google-slides",
      embedSrc: `https://docs.google.com/presentation/d/e/2PACX-${GID}/embed?start=false&loop=false`,
    });
  });

  it("google docs, sheets and drive files", () => {
    expect(resolveEmbed(`https://docs.google.com/document/d/${GID}/edit`)).toEqual({
      provider: "google-docs",
      label: "Google Docs",
      embedSrc: `https://docs.google.com/document/d/${GID}/preview`,
      aspect: "page",
      needsPublicSharing: true,
    });
    expect(resolveEmbed(`https://docs.google.com/spreadsheets/d/${GID}/edit#gid=0`)).toMatchObject({
      provider: "google-sheets",
      embedSrc: `https://docs.google.com/spreadsheets/d/${GID}/preview`,
      aspect: "page",
    });
    for (const raw of [
      `https://drive.google.com/file/d/${GID}/view?usp=sharing`,
      `https://drive.google.com/open?id=${GID}`,
    ]) {
      expect(resolveEmbed(raw)).toMatchObject({
        provider: "google-drive",
        embedSrc: `https://drive.google.com/file/d/${GID}/preview`,
        aspect: "16:9",
        needsPublicSharing: true,
      });
    }
  });

  it("figma files, designs, prototypes and boards", () => {
    for (const kind of ["file", "design", "proto", "board"]) {
      const raw = `https://www.figma.com/${kind}/AbCdEf123456/Some-Name?node-id=1-2`;
      const canonical = `https://www.figma.com/${kind}/AbCdEf123456`;
      expect(resolveEmbed(raw)).toMatchObject({
        provider: "figma",
        embedSrc: `https://www.figma.com/embed?embed_host=aitcommunity&url=${encodeURIComponent(canonical)}`,
      });
    }
  });

  it("trims whitespace and accepts http as well as https", () => {
    expect(resolveEmbed(`  http://youtu.be/${YT}  `)?.embedSrc).toBe(
      `https://www.youtube-nocookie.com/embed/${YT}`,
    );
  });

  describe("refuses anything it cannot build safely", () => {
    it.each([
      "",
      "   ",
      "not a url",
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      `ftp://youtube.com/watch?v=${YT}`,
      `https://youtube.com.evil.test/watch?v=${YT}`,
      `https://evil.test/watch?v=${YT}`,
      `https://evil.test/?u=https://docs.google.com/presentation/d/${GID}`,
      "https://www.youtube.com/watch?v=short",
      "https://www.youtube.com/watch",
      "https://www.youtube.com/embed/videoseries?list=PL1234567890",
      "https://www.youtube.com/playlist?list=PL1234567890",
      "https://vimeo.com/channels/staffpicks",
      "https://www.loom.com/share/not-hex",
      "https://docs.google.com/forms/d/abc/viewform",
      "https://docs.google.com/presentation/d/short/edit",
      "https://www.figma.com/community/file/123",
      `https://www.youtube.com/watch?v=${YT}&pad=${"a".repeat(2100)}`,
    ])("%s", (raw) => {
      expect(resolveEmbed(raw)).toBeNull();
    });
  });

  it("lists every provider label for help text", () => {
    expect(EMBED_PROVIDER_LABELS).toEqual([
      "YouTube",
      "Vimeo",
      "Loom",
      "Google Slides",
      "Google Docs",
      "Google Sheets",
      "Google Drive",
      "Figma",
    ]);
  });
});
