import { describe, expect, it } from "vitest";

import {
  buildStartupRoleCopyPrompt,
  extractStartupRoleBrief,
} from "./startup-role-brief";
import { extractStartupCvText } from "./startup-cv";

const ROLE = {
  title: "Senior Staff Engineer",
  startupName: "Fixture Co",
  location: "Toronto, Canada",
  workType: "Full-time",
  sourceUrl: "https://fixture.example/careers/staff",
  descriptionText: `About the role
Build the product.

Requirements:
- 5 years shipping TypeScript
- English
- Must live near Toronto

Nice to have:
- Dutch
- Prior editor work

Benefits
Free lunch.`,
};

describe("extractStartupRoleBrief", () => {
  it("copies must-haves and nice-to-haves from the snapshot and never invents", () => {
    const brief = extractStartupRoleBrief(ROLE);
    expect(brief.mustHaves).toEqual([
      "5 years shipping TypeScript",
      "English",
      "Must live near Toronto",
    ]);
    expect(brief.niceToHaves).toEqual(["Dutch", "Prior editor work"]);
    expect(brief.mustHaves.join(" ")).not.toMatch(/Free lunch/i);
    expect(brief.seniority).toBe("senior");
    expect(brief.languages).toEqual(["English", "Dutch"]);
    expect(brief.sourceUrl).toBe(ROLE.sourceUrl);
  });

  it("soft-omits structured lists when the snapshot has no headings", () => {
    const brief = extractStartupRoleBrief({
      ...ROLE,
      title: "Engineer",
      descriptionText: "Build the editor.",
    });
    expect(brief.mustHaves).toEqual([]);
    expect(brief.niceToHaves).toEqual([]);
    expect(brief.seniority).toBeNull();
    expect(brief.languages).toEqual([]);
  });
});

describe("buildStartupRoleCopyPrompt", () => {
  it("includes the original URL and forbids invented employers", () => {
    const prompt = buildStartupRoleCopyPrompt(extractStartupRoleBrief(ROLE), {
      locale: "en",
      cvText: "Ada Example\nTypeScript engineer in Toronto.",
    });
    expect(prompt).toContain(ROLE.sourceUrl);
    expect(prompt).toMatch(/do not invent employers/i);
    expect(prompt).toContain("5 years shipping TypeScript");
    expect(prompt).toContain("Ada Example");
    expect(prompt).not.toMatch(/salary|fit score/i);
  });

  it("omits empty lists and asks to paste a CV when none is stored", () => {
    const prompt = buildStartupRoleCopyPrompt(
      extractStartupRoleBrief({
        ...ROLE,
        title: "Engineer",
        descriptionText: "Build the editor.",
      }),
      { locale: "en" },
    );
    expect(prompt).toContain("Paste my CV below.");
    expect(prompt).not.toContain("Must-haves");
    expect(prompt).not.toContain("Nice-to-haves");
  });
});

describe("extractStartupCvText", () => {
  it("reads a .txt CV and rejects empty or binary files", () => {
    const text = extractStartupCvText(
      Buffer.from("Ada Example\nStaff engineer. TypeScript, React, Postgres."),
      "ada.txt",
      "text/plain",
    );
    expect(text).toContain("Ada Example");
    expect(
      extractStartupCvText(Buffer.from(""), "ada.txt", "text/plain"),
    ).toBeNull();
    expect(
      extractStartupCvText(
        Buffer.from("\u0000\u0001\u0002 binary"),
        "ada.bin",
        "application/octet-stream",
      ),
    ).toBeNull();
  });

  it("pulls literal strings from a tiny PDF when they are long enough", () => {
    const body =
      "%PDF-1.1\n(Ada Example is a staff engineer writing TypeScript in Toronto.)\n%%EOF";
    const text = extractStartupCvText(
      Buffer.from(body, "latin1"),
      "ada.pdf",
      "application/pdf",
    );
    expect(text).toMatch(/Ada Example/);
  });
});
