import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dir = dirname(fileURLToPath(import.meta.url));

function src(rel: string) {
  return readFileSync(join(dir, rel), "utf8");
}

describe("locale homepage unused-JS splits", () => {
  it("does not statically import signed-in chrome into the locale layout graph", () => {
    const layout = src("../../app/[locale]/layout.tsx");
    expect(layout).not.toMatch(/from ["']@\/components\/inbox\/inbox-root["']/);
    expect(layout).not.toMatch(
      /from ["']@\/components\/communities\/explore\/space-window-root["']/,
    );
    expect(layout).toContain("SessionChrome");
  });

  it("lazy-loads inbox and space windows only after a signed-in user exists", () => {
    const chrome = src("../session-chrome.tsx");
    expect(chrome).toContain("next/dynamic");
    expect(chrome).toContain("inbox-root");
    expect(chrome).toContain("space-window-root");
    expect(chrome).toContain("documentAuthUser");
  });

  it("loads BuildingModal behind next/dynamic so closed feature cards stay light", () => {
    const featureModals = src("../feature-modals.tsx");
    expect(featureModals).toContain("next/dynamic");
    expect(featureModals).not.toMatch(
      /^import\s+\{[^}]*BuildingModal[^}]*\}\s+from/m,
    );
  });

  it("loads RulesModal behind next/dynamic so the locale shell stays light", () => {
    const rules = src("../community/rules-provider.tsx");
    expect(rules).toContain("next/dynamic");
    expect(rules).not.toMatch(/^import\s+\{[^}]*RulesModal[^}]*\}\s+from/m);
  });

  it("keeps guest navbar free of notification and messages modules", () => {
    const navbar = src("../navbar.tsx");
    expect(navbar).toContain("next/dynamic");
    expect(navbar).not.toMatch(
      /^import\s+\{[^}]*NotificationBell[^}]*\}\s+from/m,
    );
    expect(navbar).not.toMatch(
      /^import\s+\{[^}]*MessagesNavLink[^}]*\}\s+from/m,
    );
  });
});
