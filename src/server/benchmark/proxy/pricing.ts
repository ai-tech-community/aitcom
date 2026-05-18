import type { ModelSurface } from "@/server/db/schema";

/**
 * Per-surface pricing for crude daily-budget enforcement. Values are
 * approximate published list prices as of mid-2026 and will drift; the
 * intent is to keep cost estimates within an order of magnitude, not to
 * be billing-accurate. Update when a surface launches or repricing
 * occurs.
 */
interface SurfacePricing {
  /** USD cents per 1,000,000 input tokens. */
  inputPer1MUsdCents: number;
  /** USD cents per 1,000,000 output tokens. */
  outputPer1MUsdCents: number;
  /**
   * Flat surcharge per grounded API call in USD cents (covers the
   * provider's per-request web-search fee). Zero when grounding has no
   * separate line item.
   */
  perCallSurchargeUsdCents: number;
}

const PRICING: Partial<Record<ModelSurface, SurfacePricing>> = {
  chatgpt_grounded: {
    inputPer1MUsdCents: 250,
    outputPer1MUsdCents: 1000,
    perCallSurchargeUsdCents: 3,
  },
};

export function estimateCostCents(
  surface: ModelSurface,
  promptTokens: number | null,
  completionTokens: number | null,
): number | null {
  const p = PRICING[surface];
  if (!p) return null;
  if (promptTokens === null && completionTokens === null) {
    // Even with no usage data we know there was one call.
    return p.perCallSurchargeUsdCents;
  }
  const input = ((promptTokens ?? 0) / 1_000_000) * p.inputPer1MUsdCents;
  const output = ((completionTokens ?? 0) / 1_000_000) * p.outputPer1MUsdCents;
  return Math.ceil(input + output + p.perCallSurchargeUsdCents);
}
