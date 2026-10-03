import { db } from "@/server/db";

import { allCollectors, getCollector } from "./catalog";
import { buildLiveContext } from "./context/live";
import type { ExecutorDeps } from "./executor";
import { collectorsEnabled, disabledCollectorIds } from "./flags";
import { kickCollectorWorker } from "./kick";
import { createCollectorRuns } from "./runs";

/** Composition root: the real facade (for tRPC in slice 2, MCP in slice 4). */
export function liveCollectorRuns() {
  return createCollectorRuns({
    db,
    enabled: collectorsEnabled,
    catalog: {
      all: () => {
        const disabled = disabledCollectorIds();
        return allCollectors().filter((c) => !disabled.has(c.id));
      },
      get: (id) => getCollector(id, disabledCollectorIds()),
    },
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
  };
}
