import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const NAME = "20261008b_unlist_test_communities";

describe(NAME, () => {
  const source = readFileSync(
    join(process.cwd(), `src/migrations/${NAME}.ts`),
    "utf8",
  );
  const index = readFileSync(
    join(process.cwd(), "src/migrations/index.ts"),
    "utf8",
  );

  it("sorts after 20261006b_event_end_date and 20261008a_forum_reply_count_repair", () => {
    expect(NAME > "20261006b_event_end_date").toBe(true);
    expect(NAME > "20261008a_forum_reply_count_repair").toBe(true);
    expect(index).toContain(`name: "${NAME}"`);
    expect(
      index.indexOf('name: "20261008a_forum_reply_count_repair"'),
    ).toBeLessThan(index.indexOf(`name: "${NAME}"`));
  });

  it("unlists both communities and does not delete anything", () => {
    expect(source).toContain('UPDATE "app"."community"');
    expect(source).toContain('"is_listed_in_directory" = false');
    expect(source).toContain("'xxx-ai'");
    expect(source).toContain("'demo-community'");
    expect(source).not.toContain("DELETE");
    expect(source).not.toContain("enum__locales");
    expect(source).not.toContain("::");
  });
});
