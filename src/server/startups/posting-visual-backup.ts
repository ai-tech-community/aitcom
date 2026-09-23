import { execFile, spawn } from "node:child_process";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { sanitizeStartupRoleDescription } from "@/lib/investigations/startup-roles";

const execFileAsync = promisify(execFile);

/** Local screenshot + Tesseract reads. No paid vision API. */
export const STARTUP_ROLE_VISUAL_BACKUP_CAP = 12;

const SCREENSHOT_TIMEOUT_MS = 15_000;

type Budget = { left: number };

const budget: Budget = { left: 0 };

export function armVisualBackup(
  maxPages = STARTUP_ROLE_VISUAL_BACKUP_CAP,
): void {
  budget.left = maxPages;
}

export function visualBackupRemaining(): number {
  return budget.left;
}

export type CommandRunner = (
  file: string,
  args: readonly string[],
  timeoutMs: number,
) => Promise<{ stdout: string }>;

async function defaultFindBinary(
  names: readonly string[],
): Promise<string | null> {
  for (const name of names) {
    try {
      const { stdout } = await execFileAsync("which", [name], {
        timeout: 2_000,
      });
      const found = stdout.trim().split("\n")[0]?.trim();
      if (found) return found;
    } catch {
      // Try the next name.
    }
  }
  return null;
}

async function defaultRun(
  file: string,
  args: readonly string[],
  timeoutMs: number,
): Promise<{ stdout: string }> {
  const { stdout } = await execFileAsync(file, [...args], {
    timeout: timeoutMs,
    maxBuffer: 2_000_000,
  });
  return { stdout: stdout.toString() };
}

/** Chrome writes the screenshot and then often stays alive. Stop it once the file exists. */
function screenshotWithChrome(
  chrome: string,
  args: readonly string[],
  image: string,
  timeoutMs: number,
): Promise<void> {
  return new Promise((resolve) => {
    const child = spawn(chrome, [...args], { detached: true, stdio: "ignore" });
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearInterval(timer);
      clearTimeout(timeout);
      if (child.pid) {
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch {
          // The browser already exited.
        }
      }
      resolve();
    };
    const timer = setInterval(() => {
      void stat(image)
        .then((info) => {
          if (info.size > 1000) finish();
        })
        .catch(() => undefined);
    }, 400);
    const timeout = setTimeout(finish, timeoutMs);
    child.on("error", finish);
    child.on("exit", finish);
  });
}

function httpUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * Backup for a posting whose HTML had no readable JD.
 * One headless screenshot and a local OCR pass. Returns null when the
 * backup is off, the budget is spent, or Chrome/Tesseract are not installed.
 */
export async function ocrPostingPage(
  pageUrl: string,
  options?: {
    enabled?: boolean;
    findBinary?: (names: readonly string[]) => Promise<string | null>;
    run?: CommandRunner;
    budget?: Budget;
  },
): Promise<string | null> {
  const enabled =
    options?.enabled ?? process.env.STARTUP_ROLE_VISUAL_BACKUP === "1";
  const remaining = options?.budget ?? budget;
  if (!enabled || remaining.left <= 0) return null;
  const url = httpUrl(pageUrl);
  if (!url) return null;
  const findBinary = options?.findBinary ?? defaultFindBinary;
  const run = options?.run ?? defaultRun;
  const chrome = await findBinary([
    "google-chrome",
    "google-chrome-stable",
    "chromium",
    "chromium-browser",
  ]);
  const tesseract = await findBinary(["tesseract"]);
  if (!chrome || !tesseract) return null;

  remaining.left -= 1;
  const dir = await mkdtemp(join(tmpdir(), "startup-role-ocr-"));
  const image = join(dir, "posting.png");
  const chromeArgs = [
    "--headless",
    "--disable-gpu",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--hide-scrollbars",
    "--no-first-run",
    "--disable-background-networking",
    `--user-data-dir=${join(dir, "profile")}`,
    "--window-size=1280,2400",
    `--screenshot=${image}`,
    url,
  ];
  try {
    if (options?.run) {
      await run(chrome, chromeArgs, SCREENSHOT_TIMEOUT_MS);
    } else {
      await screenshotWithChrome(
        chrome,
        chromeArgs,
        image,
        SCREENSHOT_TIMEOUT_MS,
      );
    }
    const { stdout } = await run(
      tesseract,
      [image, "stdout", "-l", "eng", "--psm", "6"],
      SCREENSHOT_TIMEOUT_MS,
    );
    const text = sanitizeStartupRoleDescription(stdout);
    return text && text.length >= 80 ? text : null;
  } catch {
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
