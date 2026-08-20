/**
 * Coerce live challenge rows into a shape Payload's admin editor can hydrate.
 *
 * Live row 9 (title "test") was created through the hackathon scaffold and
 * later published. That path leaves `tags: null`, empty-string reward fields,
 * incomplete Lexical text nodes, and numeric cell-template fields — the admin
 * JSON/Lexical/array widgets then throw (blank form) and a Status-only bulk
 * save 500s with no toast because Payload re-validates the whole document.
 */

const TEXT_MODES = new Set(["normal", "token", "segmented"]);

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function sanitizeTextNode(node: Record<string, unknown>): Record<string, unknown> {
  return {
    ...node,
    type: "text",
    text: typeof node.text === "string" ? node.text : "",
    version: typeof node.version === "number" ? node.version : 1,
    format: typeof node.format === "number" ? node.format : 0,
    detail: typeof node.detail === "number" ? node.detail : 0,
    mode: TEXT_MODES.has(String(node.mode)) ? node.mode : "normal",
    style: typeof node.style === "string" ? node.style : "",
  };
}

function sanitizeElementNode(node: Record<string, unknown>): Record<string, unknown> {
  const children = Array.isArray(node.children)
    ? node.children.map(sanitizeLexicalNode)
    : [];
  const next: Record<string, unknown> = {
    ...node,
    children,
    version: typeof node.version === "number" ? node.version : 1,
    format: node.format ?? "",
    indent: typeof node.indent === "number" ? node.indent : 0,
    direction: node.direction ?? "ltr",
  };
  if (node.type === "paragraph") {
    next.textFormat = typeof node.textFormat === "number" ? node.textFormat : 0;
    next.textStyle = typeof node.textStyle === "string" ? node.textStyle : "";
  }
  return next;
}

function sanitizeLexicalNode(value: unknown): unknown {
  const node = asRecord(value);
  if (!node) return value;
  if (node.type === "text") return sanitizeTextNode(node);
  if (Array.isArray(node.children) || node.type === "root") {
    return sanitizeElementNode(node);
  }
  return node;
}

export function sanitizeChallengeDescription(value: unknown): unknown {
  const root = asRecord(value)?.root;
  if (!root) {
    return {
      root: {
        type: "root",
        version: 1,
        direction: "ltr",
        format: "",
        indent: 0,
        children: [
          {
            type: "paragraph",
            version: 1,
            format: "",
            indent: 0,
            direction: "ltr",
            textFormat: 0,
            textStyle: "",
            children: [],
          },
        ],
      },
    };
  }
  return { ...(asRecord(value) ?? {}), root: sanitizeElementNode({ ...root, type: "root" }) };
}

function emptyToNull(value: unknown): unknown {
  return value === "" ? null : value;
}

function coercePositiveInt(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.round(n));
}

export function sanitizeChallengeCellTemplate(value: unknown): unknown {
  if (value == null) return [];
  if (!Array.isArray(value)) return value;
  return value.map((row) => {
    const r = asRecord(row);
    if (!r) return row;
    return {
      ...r,
      description: typeof r.description === "string" ? r.description : "",
      taskType: typeof r.taskType === "string" ? r.taskType : "",
      verificationMode:
        typeof r.verificationMode === "string" ? r.verificationMode : "self-report",
      deadlineMinutes: coercePositiveInt(r.deadlineMinutes, 60),
    };
  });
}

export function sanitizeChallengeForAdmin<T extends Record<string, unknown>>(
  doc: T,
): T {
  const next: Record<string, unknown> = { ...doc };

  if ("tags" in next && (next.tags == null || next.tags === "")) {
    next.tags = [];
  }

  if ("description" in next) {
    next.description = sanitizeChallengeDescription(next.description);
  }

  const rewards = asRecord(next.rewards);
  if (rewards) {
    next.rewards = {
      ...rewards,
      badgeReward: emptyToNull(rewards.badgeReward),
      sponsorReward: emptyToNull(rewards.sponsorReward),
    };
  }

  if ("cellTemplate" in next) {
    next.cellTemplate = sanitizeChallengeCellTemplate(next.cellTemplate);
  }

  const signal = asRecord(next.signalSource);
  if (signal && signal.type == null) {
    const rest = { ...signal };
    delete rest.type;
    next.signalSource = rest;
  }

  return next as T;
}
