import {
  NEXT_UP_TIERS,
  type NextUpContext,
  type NextUpItem,
  type NextUpLoader,
  type NextUpResult,
} from "./types";

export type LoaderFailureLog = (loader: string, error: unknown) => void;

const logToConsole: LoaderFailureLog = (loader, error) => {
  console.error(`[next-up] loader "${loader}" failed`, error);
};

const tierRank = new Map(NEXT_UP_TIERS.map((tier, i) => [tier, i]));

/**
 * Display order: by tier (see `NEXT_UP_TIERS`), time-bound items by their
 * instant, soonest first. Everything else keeps the loader order, so a
 * stable sort is enough.
 */
function compareItems(a: NextUpItem, b: NextUpItem): number {
  const byTier = tierRank.get(a.urgency.tier)! - tierRank.get(b.urgency.tier)!;
  if (byTier !== 0) return byTier;
  if (a.urgency.tier === "timeBound" && b.urgency.tier === "timeBound") {
    return Date.parse(a.urgency.at) - Date.parse(b.urgency.at);
  }
  return 0;
}

/**
 * Run every loader in parallel and merge their items into one ordered list.
 *
 * One failing loader does not fail the read: it is logged, its items are
 * missing and `partial` says so. When every loader fails there is nothing
 * true to show, so the read fails with the first error (the client then
 * offers a retry instead of a misleading "nothing next").
 */
export async function composeNextUp(
  loaders: readonly NextUpLoader[],
  ctx: NextUpContext,
  { logFailure = logToConsole }: { logFailure?: LoaderFailureLog } = {},
): Promise<NextUpResult> {
  const settled = await Promise.allSettled(
    // Wrapped so a loader that throws before returning a promise is
    // settled like any other failure.
    loaders.map((loader) => Promise.resolve().then(() => loader.load(ctx))),
  );

  const items: NextUpItem[] = [];
  const failures: unknown[] = [];
  settled.forEach((result, i) => {
    if (result.status === "fulfilled") {
      items.push(...result.value);
    } else {
      failures.push(result.reason);
      logFailure(loaders[i]!.name, result.reason);
    }
  });

  if (loaders.length > 0 && failures.length === loaders.length) {
    throw failures[0];
  }

  return { items: items.sort(compareItems), partial: failures.length > 0 };
}
