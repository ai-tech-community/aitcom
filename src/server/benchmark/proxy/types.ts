import type {
  ModelSurface,
  RunSourceBrandRelation,
  RunSourceKind,
  RunSourceType,
} from "@/server/db/schema";

export interface NormalizedSource {
  url: string;
  domain: string;
  title: string | null;
  snippet: string | null;
  position: number | null;
  kind: RunSourceKind;
  sourceType: RunSourceType;
  brandRelation: RunSourceBrandRelation;
  explicitCitation: boolean;
}

export interface ProxyRunInput {
  prompt: string;
  locale: string;
}

export interface ProxyRunResult {
  rawAnswer: string;
  sources: NormalizedSource[];
  providerResponseId: string;
  providerModelId: string;
  providerModelVersion: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  costCents: number | null;
  /**
   * Full verbatim provider response. Stored in `benchmark_run.proxy_response_raw`
   * so re-extraction is possible if the normaliser or source classifier
   * improves later.
   */
  providerResponseRaw: unknown;
}

export class ProxyError extends Error {
  constructor(
    message: string,
    readonly surface: ModelSurface,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ProxyError";
  }
}
