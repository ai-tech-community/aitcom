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
    targetType: string | null;
    targetId: string | null;
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

  // --- Pass 1: find collaborative targets per weekly bucket ---
  // A target is collaborative if both "agent" and "member" acted on it in the same week.
  const weekTargetActors = new Map<string, Map<string, Set<string>>>();
  for (const row of rows) {
    if (!row.targetType || !row.targetId) continue;
    const wk = startOfWeek(new Date(row.createdAt)).toISOString();
    if (!map.has(wk)) continue;

    let targets = weekTargetActors.get(wk);
    if (!targets) {
      targets = new Map();
      weekTargetActors.set(wk, targets);
    }

    const targetKey = `${row.targetType}:${row.targetId}`;
    let actors = targets.get(targetKey);
    if (!actors) {
      actors = new Set();
      targets.set(targetKey, actors);
    }
    actors.add(row.actorType);
  }

  // Build set of collaborative target keys per week
  const collabTargets = new Map<string, Set<string>>();
  for (const [wk, targets] of weekTargetActors) {
    const collabSet = new Set<string>();
    for (const [targetKey, actors] of targets) {
      if (actors.has("agent") && actors.has("member")) {
        collabSet.add(targetKey);
      }
    }
    if (collabSet.size > 0) collabTargets.set(wk, collabSet);
  }

  // --- Pass 2: classify each event ---
  for (const row of rows) {
    const wk = startOfWeek(new Date(row.createdAt));
    const wkKey = wk.toISOString();
    const bucket = map.get(wkKey);
    if (!bucket) continue;

    const targetKey = row.targetType && row.targetId
      ? `${row.targetType}:${row.targetId}`
      : null;

    const isCollab = targetKey
      ? collabTargets.get(wkKey)?.has(targetKey) ?? false
      : false;

    if (isCollab) {
      bucket.collaborative += 1;
    } else if (row.actorType === "agent") {
      bucket.aiOnly += 1;
    } else {
      bucket.humanOnly += 1;
    }
  }

  return [...map.values()];
}

export type PersonalityLabel = "builder" | "researcher" | "critic" | "teacher";

const PERSONALITY_MAP: Record<string, PersonalityLabel> = {
  "challenge.enrolled": "builder",
  "challenge.channel_post": "builder",
  "challenge.solution_submitted": "builder",
  "challenge.objective_completed": "builder",
  "challenge.completed": "builder",
  "challenge.proposed": "builder",
  "challenge.created": "builder",
  "knowledge.share": "researcher",
  "agent.suggest_topic": "researcher",
  "idea.submitted": "researcher",
  "challenge.solution_rejected": "critic",
  "challenge.solution_approved": "critic",
  "thread.reply": "teacher",
};

export function classifyPersonality(action: string): PersonalityLabel | null {
  return PERSONALITY_MAP[action] ?? null;
}

export type ContextType = "forum_thread" | "challenge" | "event" | "workflow";

export function deriveContextType(action: string): ContextType | null {
  if (action.startsWith("challenge.")) return "challenge";
  if (action.startsWith("thread.") || action.startsWith("knowledge.")) return "forum_thread";
  if (action.startsWith("event.")) return "event";
  return null;
}

