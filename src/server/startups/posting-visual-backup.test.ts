import { describe, expect, it } from "vitest";

import {
  armVisualBackup,
  ocrPostingPage,
  visualBackupRemaining,
} from "./posting-visual-backup";

describe("ocrPostingPage", () => {
  it("stays off unless the backup is explicitly enabled", async () => {
    armVisualBackup(2);
    expect(
      await ocrPostingPage("https://balink.net/job/team-leader-ios", {
        enabled: false,
      }),
    ).toBeNull();
    expect(visualBackupRemaining()).toBe(2);
  });

  it("reads a local screenshot with Tesseract and does not call a vision API", async () => {
    const calls: string[][] = [];
    const text = await ocrPostingPage(
      "https://balink.net/job/team-leader-ios",
      {
        enabled: true,
        budget: { left: 1 },
        findBinary: async (names) => names[0] ?? null,
        run: async (file, args) => {
          calls.push([file, ...args]);
          if (file === "tesseract") {
            return {
              stdout:
                "Description\nIf you have a strong background in iOS development, lead the team and ship SwiftUI applications.",
            };
          }
          return { stdout: "" };
        },
      },
    );
    expect(calls.map((call) => call[0])).toEqual([
      "google-chrome",
      "tesseract",
    ]);
    expect(calls[0]?.some((arg) => arg.includes("--user-data-dir="))).toBe(
      true,
    );
    expect(
      calls.some((call) =>
        call.some((arg) => /openai|vision|anthropic/i.test(arg)),
      ),
    ).toBe(false);
    expect(text).toContain("strong background in iOS");
  });

  it("does not spend a screenshot on a non-http URL", async () => {
    const budget = { left: 1 };
    expect(
      await ocrPostingPage("file:///etc/passwd", {
        enabled: true,
        budget,
        findBinary: async () => "google-chrome",
        run: async () => {
          throw new Error("should not run");
        },
      }),
    ).toBeNull();
    expect(budget.left).toBe(1);
  });
});
