import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";

import { JOIN_PAGE_TITLE, joinPageMetadata } from "./join-page-metadata";

const TITLE = "Claim Your AI Startup & Find Your Cofounder | AIT Community";

it("sets the join document title and keeps the existing description", () => {
  expect(JOIN_PAGE_TITLE).toBe(TITLE);
  const meta = joinPageMetadata({
    description: "Make an account and join the community that fits.",
    kicker: "Join",
  });
  expect(meta.title).toEqual({ absolute: TITLE });
  expect(meta.description).toBe(
    "Make an account and join the community that fits.",
  );
  expect(meta.openGraph).toMatchObject({
    title: TITLE,
    description: "Make an account and join the community that fits.",
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
