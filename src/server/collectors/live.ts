import { db } from "@/server/db";
import { recordFeedNews } from "@/server/news/record";

import { allCollectors, getCollector } from "./catalog";
import { buildLiveContext } from "./context/live";
import type { ExecutorDeps } from "./executor";
import { disabledCollectorIds } from "./flags";
import { kickCollectorWorker } from "./kick";
import { allPresets, getPreset } from "./presets/catalog";
import { createCollectorRuns } from "./runs";

/** Composition root: the real facade (for tRPC in slice 2, MCP in slice 4). */
export function liveCollectorRuns() {
  return createCollectorRuns({
    db,
    catalog: {
      all: () => {
        const disabled = disabledCollectorIds();
        return allCollectors().filter((c) => !disabled.has(c.id));
      },
      get: (id) => getCollector(id, disabledCollectorIds()),
      everything: allCollectors,
    },
    presets: { all: allPresets, get: getPreset },
    kick: kickCollectorWorker,
    now: () => new Date(),
  });
}

/** Composition root: the real executor dependencies for the worker route. */
export function liveExecutorDeps(): ExecutorDeps {
  return {
    db,
    getCollector: (id) => getCollector(id, disabledCollectorIds()),
    buildContext: (args) => buildLiveContext({ db, ...args }),
    now: Date.now,
    onFeedItems: async (items) => {
      await recordFeedNews(items);
    },
  };
}
