import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";

import en from "../../messages/en.json";

import { JOIN_PAGE_TITLE, joinPageMetadata } from "./join-page-metadata";

const TITLE = "Claim Your AI Startup & Find Your Cofounder | AIT Community";

it("sets the join document title and the specified description", () => {
  expect(JOIN_PAGE_TITLE).toBe(TITLE);
  expect(en.hubJoin.metaDescription.length).toBeLessThanOrEqual(155);
  const meta = joinPageMetadata({
    description: en.hubJoin.metaDescription,
    kicker: "Join",
  });
  expect(meta.title).toEqual({ absolute: TITLE });
  expect(meta.description).toBe(en.hubJoin.metaDescription);
  expect(meta.openGraph).toMatchObject({
    title: TITLE,
    description: en.hubJoin.metaDescription,
  });
  expect(meta.twitter).toMatchObject({ title: TITLE });

  const page = readFileSync(
    join(process.cwd(), "src/app/[locale]/join/page.tsx"),
    "utf8",
  );
  expect(page).toContain("joinPageMetadata");
  expect(page).toContain('t("metaDescription")');
  expect(page).not.toContain('title: t("title")');
});
