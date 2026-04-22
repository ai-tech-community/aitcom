export interface PerModelRow {
  modelId: string;
  mentionsCount: number;
  runsTotal: number;
  visibilityPct: number;
  avgRank: number | null;
  sentimentPosPct: number;
  sentimentNeuPct: number;
  sentimentNegPct: number;
}

export interface CsvInput {
  perModel: PerModelRow[];
  topDomainsByModel: Record<string, string | undefined>;
}

const HEADER = [
  "model_id",
  "mentions_count",
  "runs_total",
  "visibility_pct",
  "avg_rank",
  "sentiment_pos_pct",
  "sentiment_neu_pct",
  "sentiment_neg_pct",
  "top_citation_domain",
].join(",");

function csvCell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function serializeBrandStatsCsv(input: CsvInput): string {
  const rows = input.perModel.map((r) =>
    [
      csvCell(r.modelId),
      csvCell(r.mentionsCount),
      csvCell(r.runsTotal),
      csvCell(r.visibilityPct.toFixed(2)),
      csvCell(r.avgRank === null ? null : r.avgRank.toFixed(2)),
      csvCell(r.sentimentPosPct),
      csvCell(r.sentimentNeuPct),
      csvCell(r.sentimentNegPct),
      csvCell(input.topDomainsByModel[r.modelId]),
    ].join(","),
  );
  return [HEADER, ...rows].join("\n") + "\n";
}
