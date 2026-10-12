import { describe, expect, it } from "vitest";

import { sanitizeStartupRoleDescription } from "./startup-roles";
import { isPublishableJobTitle } from "./startup-job-boards";
import {
  isNoindexOpenJob,
  OPEN_JOB_DESCRIPTION_INDEX_MIN,
  OPEN_JOB_JS_WHITESPACE,
  OPEN_JOB_SANITIZE_NON_WS_REMOVAL_MAX,
  openJobNonWhitespaceCount,
  openJobRobots,
  openJobSitemapDescription,
  openJobSitemapNeedsBody,
} from "./job-indexability";

const SHORT = "a".repeat(199);
const LONG = "a".repeat(200);

describe("isNoindexOpenJob", () => {
  it("noindexes a description under 200 characters, including empty", () => {
    expect(
      isNoindexOpenJob({ title: "Staff Engineer", descriptionText: SHORT }),
    ).toBe(true);
    expect(
      isNoindexOpenJob({ title: "Staff Engineer", descriptionText: "" }),
    ).toBe(true);
    expect(
      isNoindexOpenJob({ title: "Staff Engineer", descriptionText: null }),
    ).toBe(true);
    expect(
      isNoindexOpenJob({
        title: "Employee Login for US Jobs",
        descriptionText: null,
      }),
    ).toBe(true);
  });

  it("indexes a 200 character description with a publishable title", () => {
    expect(
      isNoindexOpenJob({ title: "Staff Engineer", descriptionText: LONG }),
    ).toBe(false);
  });

  it("noindexes a long description whose title the existing filter rejects", () => {
    expect(isPublishableJobTitle("View Job")).toBe(false);
    expect(isPublishableJobTitle("United States (Remote)")).toBe(false);
    expect(isNoindexOpenJob({ title: "View Job", descriptionText: LONG })).toBe(
      true,
    );
    expect(
      isNoindexOpenJob({
        title: "United States (Remote)",
        descriptionText: LONG,
      }),
    ).toBe(true);
    // #438's filter still accepts this live junk title. Do not add a second filter.
    expect(isPublishableJobTitle("Employee Login for US Jobs")).toBe(true);
  });

  it("becomes indexable once the description reaches 200 characters", () => {
    const title = "Staff Engineer";
    expect(isNoindexOpenJob({ title, descriptionText: SHORT })).toBe(true);
    expect(isNoindexOpenJob({ title, descriptionText: LONG })).toBe(false);
  });

  it("counts the trimmed description", () => {
    expect(
      isNoindexOpenJob({
        title: "Staff Engineer",
        descriptionText: `  ${SHORT}  `,
      }),
    ).toBe(true);
    expect(
      isNoindexOpenJob({
        title: "Staff Engineer",
        descriptionText: `  ${LONG}  `,
      }),
    ).toBe(false);
  });
});

describe("openJobSitemapDescription", () => {
  it("lists every character JavaScript treats as whitespace", () => {
    const listed = new Set(OPEN_JOB_JS_WHITESPACE);
    for (const char of OPEN_JOB_JS_WHITESPACE) {
      expect(
        /\s/.test(char) || char.trim() === "",
        char.codePointAt(0)?.toString(16),
      ).toBe(true);
    }
    for (let code = 0; code <= 0xffff; code += 1) {
      const char = String.fromCharCode(code);
      if (/\s/.test(char) || char.trim() === "") {
        expect(listed.has(char), code.toString(16)).toBe(true);
      }
    }
    expect(listed.size).toBe(OPEN_JOB_JS_WHITESPACE.length);
  });

  it("drops at most the non-whitespace budget sanitize is allowed", () => {
    const content = "b".repeat(400);
    const samples = [
      content,
      `learn more ${content}`,
      `LEARN MORE\n${content}`,
      `read more ${content}`,
      `more info\t${content}`,
      `abcdefghAbout ${content}`,
      `${content}\nread more`,
      `${content}\n   more info`,
      `learn more ${content}\nread more`,
      `abAbout ${content}\nmore info`,
      `  \n${content}\n  `,
      `${"\u00a0".repeat(50)}${content}${"\u3000".repeat(10)}`,
    ];
    for (const sample of samples) {
      const before = openJobNonWhitespaceCount(sample);
      const after = openJobNonWhitespaceCount(
        sanitizeStartupRoleDescription(sample),
      );
      expect(before - after).toBeLessThanOrEqual(
        OPEN_JOB_SANITIZE_NON_WS_REMOVAL_MAX,
      );
    }
  });

  it("uses a stand-in when the body cannot change the length decision", () => {
    const title = "Staff Engineer";
    const long = "c".repeat(400);
    expect(
      openJobSitemapNeedsBody({
        rawChars: long.length,
        nonWsChars: long.length,
      }),
    ).toBe(false);
    const standIn = openJobSitemapDescription({
      rawChars: long.length,
      nonWsChars: long.length,
    });
    expect(standIn).toBe("a".repeat(OPEN_JOB_DESCRIPTION_INDEX_MIN));
    expect(isNoindexOpenJob({ title, descriptionText: standIn })).toBe(
      isNoindexOpenJob({ title, descriptionText: long }),
    );

    const standInShort = openJobSitemapDescription({
      rawChars: 119,
      nonWsChars: 119,
    });
    expect(isNoindexOpenJob({ title, descriptionText: standInShort })).toBe(
      true,
    );
    expect(isNoindexOpenJob({ title, descriptionText: null })).toBe(
      isNoindexOpenJob({
        title,
        descriptionText: openJobSitemapDescription({
          rawChars: 0,
          nonWsChars: 0,
        }),
      }),
    );
  });

  it("reads the body only for lengths that can still cross 200 characters", () => {
    const title = "Staff Engineer";
    const band = `learn more ${"c".repeat(190)}`;
    const rawChars = band.length;
    const nonWsChars = openJobNonWhitespaceCount(band);
    expect(rawChars).toBeGreaterThanOrEqual(OPEN_JOB_DESCRIPTION_INDEX_MIN);
    expect(openJobSitemapNeedsBody({ rawChars, nonWsChars })).toBe(true);
    expect(openJobSitemapDescription({ rawChars, nonWsChars })).toBeNull();
    const withBody = openJobSitemapDescription({
      rawChars,
      nonWsChars,
      body: band,
    });
    expect(isNoindexOpenJob({ title, descriptionText: withBody })).toBe(
      isNoindexOpenJob({ title, descriptionText: band }),
    );
  });

  it("does not treat emoji as characters that survive sanitize", () => {
    const title = "Staff Engineer";
    const thin = `${"b".repeat(199)}${"😀".repeat(26)}`;
    expect(openJobNonWhitespaceCount(thin)).toBe(199);
    expect(
      openJobSitemapNeedsBody({ rawChars: 199 + 26, nonWsChars: 199 }),
    ).toBe(true);
    expect(isNoindexOpenJob({ title, descriptionText: thin })).toBe(true);

    const indexed = `${"b".repeat(400)}${"😀".repeat(26)}`;
    expect(openJobNonWhitespaceCount(indexed)).toBe(400);
    expect(openJobSitemapNeedsBody({ rawChars: 426, nonWsChars: 400 })).toBe(
      false,
    );
    const standIn = openJobSitemapDescription({
      rawChars: 426,
      nonWsChars: 400,
    });
    expect(isNoindexOpenJob({ title, descriptionText: standIn })).toBe(
      isNoindexOpenJob({ title, descriptionText: indexed }),
    );
  });

  it("agrees with the page on one sanitize of a doubled leading CTA", () => {
    const title = "Staff Engineer";
    const raw = `learn more learn more ${"b".repeat(190)}`;
    const shown = sanitizeStartupRoleDescription(raw);
    expect(shown?.length ?? 0).toBeGreaterThanOrEqual(
      OPEN_JOB_DESCRIPTION_INDEX_MIN,
    );
    expect(isNoindexOpenJob({ title, descriptionText: raw })).toBe(false);
    expect(
      isNoindexOpenJob({
        title,
        descriptionText: shown,
        descriptionAlreadySanitized: true,
      }),
    ).toBe(false);
    expect(sanitizeStartupRoleDescription(shown)?.length ?? 0).toBeLessThan(
      OPEN_JOB_DESCRIPTION_INDEX_MIN,
    );
  });
});

describe("openJobRobots", () => {
  it("noindexes a closed role even when the description is long", () => {
    expect(
      openJobRobots({
        status: "closed",
        title: "Staff Engineer",
        descriptionText: LONG,
      }),
    ).toEqual({ index: false, follow: true });
  });

  it("noindexes a thin or junk open role and indexes a full one", () => {
    expect(
      openJobRobots({
        status: "open",
        title: "Staff Engineer",
        descriptionText: SHORT,
      }),
    ).toEqual({ index: false, follow: true });
    expect(
      openJobRobots({
        status: "open",
        title: "View Job",
        descriptionText: LONG,
      }),
    ).toEqual({ index: false, follow: true });
    expect(
      openJobRobots({
        status: "open",
        title: "Staff Engineer",
        descriptionText: LONG,
      }),
    ).toEqual({ index: true, follow: true });
  });
});
