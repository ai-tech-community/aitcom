type Bucket = {
  key: string;
  label: string;
  aiOnly: number;
  humanOnly: number;
  collaborative: number;
};

export function safePercent(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Number(((numerator / denominator) * 100).toFixed(1));
}

export function safeDelta(current: number, previous: number): number {
  if (previous <= 0) return current > 0 ? 100 : 0;
  return Number((((current - previous) / previous) * 100).toFixed(1));
}

export function clampRate(value: number): number {
  if (Number.isNaN(value) || !Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return Number(value.toFixed(1));
}

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export function toWeeklyBuckets(
  rows: Array<{
    createdAt: Date;
    actorType: string;
    action: string;
  }>,
  weeks = 8,
): Bucket[] {
  const now = new Date();
  const firstWeek = startOfWeek(new Date(now.getTime() - (weeks - 1) * 7 * 24 * 60 * 60 * 1000));
  const map = new Map<string, Bucket>();

  for (let i = 0; i < weeks; i++) {
    const wk = new Date(firstWeek.getTime() + i * 7 * 24 * 60 * 60 * 1000);
    const key = wk.toISOString();
    map.set(key, {
      key,
      label: wk.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
      aiOnly: 0,
      humanOnly: 0,
      collaborative: 0,
    });
  }

  for (const row of rows) {
    const wk = startOfWeek(new Date(row.createdAt));
    const bucket = map.get(wk.toISOString());
    if (!bucket) continue;

    const isCollaborativeAction =
      row.action.startsWith("challenge.") ||
      row.action.startsWith("thread.") ||
      row.action.startsWith("article.");

    if (isCollaborativeAction) {
      bucket.collaborative += 1;
      continue;
    }

    if (row.actorType === "agent") bucket.aiOnly += 1;
    else bucket.humanOnly += 1;
  }

  return [...map.values()];
}

