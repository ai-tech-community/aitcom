// The deploy runner (scripts/db-apply-pending.ts) calls each migration's
// up/down with `{ db }` only. A migration that reaches for `payload` (for
// example `payload.logger`) passes local `payload migrate` and its own tests,
// then crashes the production build. This keeps every migration inside the
// contract the runner actually honours.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const DIR = __dirname;
const MIGRATIONS = readdirSync(DIR).filter(
  (name) => /^\d{8}[a-z]?_.+\.ts$/.test(name) && !name.includes(".test."),
);

describe("migrations use only what the deploy runner passes", () => {
  it("finds the migrations", () => {
    expect(MIGRATIONS.length).toBeGreaterThan(50);
  });

  it.each(MIGRATIONS)("%s takes only { db }", (name) => {
    const source = readFileSync(join(DIR, name), "utf-8");
    const signatures = [
      ...source.matchAll(/export async function (up|down)\(([^)]*)\)/g),
    ];
    expect(signatures.length, `${name}: up/down not found`).toBeGreaterThan(0);

    for (const [, fn, params] of signatures) {
      // An unused `_` / `_args` parameter (a no-op down) touches nothing.
      if (/^\s*_\w*\s*:\s*Migrate(?:Up|Down)Args\s*$/.test(params!)) continue;
      // `{ db }` or `{ db: _db }`: the only key is db. A bare `args` param
      // could reach args.payload, so it is refused too.
      const destructured =
        /^\s*\{([^}]*)\}\s*:\s*Migrate(?:Up|Down)Args\s*$/.exec(params!);
      expect(destructured, `${name} ${fn}(${params})`).not.toBeNull();
      const keys = destructured![1]!
        .split(",")
        .map((part) => part.split(":")[0]!.trim())
        .filter(Boolean);
      expect(keys, `${name} ${fn}`).toEqual(["db"]);
    }
  });
});
