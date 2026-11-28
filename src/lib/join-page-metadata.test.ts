import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";

import { CANONICAL_PRODUCTION_ORIGIN } from "@/server/better-auth/base-url";

import en from "../../messages/en.json";
import { JOIN_PAGE_TITLE, joinPageMetadata } from "./join-page-metadata";
import { buildAlternates } from "./metadata";

const TITLE = "Join AIT: The Free AI Startup Community in Europe";
const DESCRIPTION =
  "The free home for AI people in Europe. Find AI jobs, claim your startup page, post on Launchpad and join AI events. Free to join.";

it("sets the join title, description, social tags, and self-canonical", () => {
  expect(JOIN_PAGE_TITLE).toBe(TITLE);
  expect(en.hubJoin.metaDescription).toBe(DESCRIPTION);
  expect(en.hubJoin.metaDescription.length).toBeLessThanOrEqual(155);
  expect(TITLE.toLowerCase()).not.toMatch(/co-?founder/);
  expect(DESCRIPTION.toLowerCase()).not.toMatch(/co-?founder/);
  expect(en.hubJoin.title.toLowerCase()).not.toMatch(/co-?founder/);

  const meta = joinPageMetadata({
    description: en.hubJoin.metaDescription,
    kicker: "Join",
  });
  expect(meta.title).toEqual({ absolute: TITLE });
  expect(meta.description).toBe(DESCRIPTION);
  expect(meta.openGraph).toMatchObject({
    title: TITLE,
    description: DESCRIPTION,
  });
  expect(meta.twitter).toMatchObject({
    title: TITLE,
    description: DESCRIPTION,
  });

  expect(buildAlternates("/join", "en").canonical).toBe(
    `${CANONICAL_PRODUCTION_ORIGIN}/en/join`,
  );

  const page = readFileSync(
    join(process.cwd(), "src/app/[locale]/join/page.tsx"),
    "utf8",
  );
  expect(page).toContain("joinPageMetadata");
  expect(page).toContain('t("metaDescription")');
  expect(page).toContain('localeAlternates("/join")');
  expect(page).toContain("index: true");
  expect(page).toContain("follow: true");
  expect(page).not.toContain("index: false");
  expect(page).not.toContain('title: t("title")');
});
