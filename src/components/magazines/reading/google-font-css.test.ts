import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { findFontFilesInCss } =
  require("next/dist/compiled/@next/font/dist/google/find-font-files-in-css.js") as {
    findFontFilesInCss: (
      css: string,
      subsets?: string[],
    ) => Array<{
      googleFontFileUrl: string;
      preloadFontFile: boolean;
      ext: string;
    }>;
  };

describe("next/font Google CSS parsing", () => {
  it("treats an extensionless kit URL as woff2 when the CSS says so", () => {
    const css = `/* latin */
@font-face {
  font-family: 'Newsreader';
  font-style: normal;
  font-weight: 400;
  src: url(https://fonts.gstatic.com/l/font?kit=abc&skey=def) format('woff2');
}`;

    expect(findFontFilesInCss(css, ["latin"])).toEqual([
      {
        googleFontFileUrl: "https://fonts.gstatic.com/l/font?kit=abc&skey=def",
        preloadFontFile: true,
        ext: "woff2",
      },
    ]);
  });

  it("keeps the extension on a normal woff2 URL", () => {
    const css = `/* latin */
@font-face {
  src: url(https://fonts.gstatic.com/s/newsreader/file.woff2) format('woff2');
}`;

    expect(findFontFilesInCss(css, ["latin"])[0]?.ext).toBe("woff2");
  });
});
