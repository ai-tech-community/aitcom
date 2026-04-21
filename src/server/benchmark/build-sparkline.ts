export type SparklinePoint = { date: string; value: number };

/**
 * Downsample daily `{ date, value }` rows into a fixed-length array of
 * evenly-spaced buckets covering the requested window, zero-filling gaps.
 *
 * - Output length is always exactly `buckets`.
 * - Bucket N covers day `today - (buckets - 1 - N)` from the reference day.
 * - Multiple input rows falling into the same bucket are averaged.
 * - Input rows outside the window are silently dropped.
 */
export function buildSparkline(
  rows: Array<{ date: string; value: number }>,
  windowDays: number,
  buckets: number,
): SparklinePoint[] {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const dayMs = 86_400_000;
  const dayStep = Math.max(1, Math.round(windowDays / buckets));

  const out: SparklinePoint[] = [];
  const sums = new Array<number>(buckets).fill(0);
  const counts = new Array<number>(buckets).fill(0);

  for (let i = 0; i < buckets; i++) {
    const bucketDate = new Date(
      today.getTime() - (buckets - 1 - i) * dayStep * dayMs,
    );
    out.push({
      date: bucketDate.toISOString().slice(0, 10),
      value: 0,
    });
  }

  for (const r of rows) {
    const rowMs = Date.parse(r.date);
    if (Number.isNaN(rowMs)) continue;
    const rowDay = Math.floor(rowMs / dayMs) * dayMs;
    const delta = Math.floor((today.getTime() - rowDay) / dayMs);
    if (delta < 0 || delta >= windowDays) continue;
    const bucketIdx = buckets - 1 - Math.floor(delta / dayStep);
    if (bucketIdx < 0 || bucketIdx >= buckets) continue;
    sums[bucketIdx]! += r.value;
    counts[bucketIdx]! += 1;
  }

  for (let i = 0; i < buckets; i++) {
    if (counts[i]! > 0) out[i]!.value = sums[i]! / counts[i]!;
  }

  return out;
}
