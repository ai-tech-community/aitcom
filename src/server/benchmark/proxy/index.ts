import type { ModelSurface } from "@/server/db/schema";

import { callChatGptGrounded } from "./chatgpt-grounded";
import type { ProxyRunInput, ProxyRunResult } from "./types";
import { ProxyError } from "./types";

export type { NormalizedSource, ProxyRunInput, ProxyRunResult } from "./types";
export { ProxyError } from "./types";

/**
 * Surfaces with a working proxy client. Keep in sync with the per-surface
 * implementations below; auto-seed and the queue worker scan against this list.
 */
export const ENABLED_SURFACES = ["chatgpt_grounded"] as const satisfies
  readonly ModelSurface[];

export type EnabledSurface = (typeof ENABLED_SURFACES)[number];

export function isEnabledSurface(
  surface: ModelSurface,
): surface is EnabledSurface {
  return (ENABLED_SURFACES as readonly ModelSurface[]).includes(surface);
}

export interface RunOnSurfaceDeps {
  fetchImpl?: typeof fetch;
}

export async function runOnSurface(
  surface: ModelSurface,
  input: ProxyRunInput,
  deps: RunOnSurfaceDeps = {},
): Promise<ProxyRunResult> {
  switch (surface) {
    case "chatgpt_grounded":
      return callChatGptGrounded(input, {
        apiKey: process.env.OPENAI_API_KEY ?? "",
        fetchImpl: deps.fetchImpl,
      });
    default:
      throw new ProxyError(
        `No proxy client implemented for surface "${surface}"`,
        surface,
      );
  }
}
