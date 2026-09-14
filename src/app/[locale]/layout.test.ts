import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dir = dirname(fileURLToPath(import.meta.url));
const layout = readFileSync(join(dir, "layout.tsx"), "utf8");

describe("locale document head", () => {
  it("loads Ahrefs Web Analytics once with the production data-key", () => {
    expect(layout).toContain('from "next/script"');
    expect(layout).toContain('src="https://analytics.ahrefs.com/analytics.js"');
    expect(layout).toContain('strategy="beforeInteractive"');
    expect(layout.match(/data-key="oeVpx7mDaVnimLgu0ewixg"/g)).toHaveLength(1);
    expect(layout.match(/analytics\.ahrefs\.com\/analytics\.js/g)).toHaveLength(
      1,
    );
  });
});
