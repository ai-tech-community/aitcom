// Every place that creates an event must decide who organizes it (ADR-0038):
// a native event needs an organizerId, or nobody can see its attendees; an
// external one has none. This inventory fails when a create path appears or
// disappears without that decision being recorded here.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..", "..");

/** Each file that calls `payload.create({ collection: "events" })`, with the
 *  organizer decision for it and how many create calls it holds. */
const DECISIONS: Record<string, { creates: number; organizer: string }> = {
  "src/server/api/routers/events.ts": {
    creates: 2,
    organizer: "createEvent: the admin; submitEvent: the submitting member",
  },
  "src/server/api/routers/hackathon.ts": {
    creates: 1,
    organizer: "createHackathon: the admin",
  },
  "src/server/events/discovery/ingest.ts": {
    creates: 1,
    organizer: "none: discovered events are external",
  },
};

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      return name === "node_modules" ? [] : sourceFiles(path);
    }
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)
      ? [path]
      : [];
  });
}

/** Count `.create({` calls whose `collection` (within 3 lines) is events. */
function eventCreateCalls(source: string): number {
  const lines = source.split("\n");
  let count = 0;
  lines.forEach((line, i) => {
    if (!line.includes(".create({")) return;
    const window = lines.slice(i, i + 4).join("\n");
    if (/collection:\s*"events"/.test(window)) count++;
  });
  return count;
}

describe("event create paths", () => {
  it("each has an organizer decision", () => {
    const found: Record<string, number> = {};
    for (const dir of ["src", "scripts"]) {
      let files: string[] = [];
      try {
        files = sourceFiles(join(ROOT, dir));
      } catch {
        continue; // scripts/ is optional
      }
      for (const file of files) {
        const n = eventCreateCalls(readFileSync(file, "utf-8"));
        if (n > 0) found[relative(ROOT, file)] = n;
      }
    }

    const expected = Object.fromEntries(
      Object.entries(DECISIONS).map(([file, d]) => [file, d.creates]),
    );
    expect(found).toEqual(expected);
  });

  it("native create paths set organizerId", () => {
    for (const [file, decision] of Object.entries(DECISIONS)) {
      if (decision.organizer.startsWith("none")) continue;
      const source = readFileSync(join(ROOT, file), "utf-8");
      const organizerSets = source.match(/organizerId:\s*userId/g) ?? [];
      expect(organizerSets.length, file).toBeGreaterThanOrEqual(
        decision.creates,
      );
    }
  });
});
