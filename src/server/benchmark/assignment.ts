export function selectAssignmentPrompts<
  T extends { approvedAt: Date | string; id: string },
>(prompts: T[], limit: number): T[] {
  if (limit < 1) return [];

  return [...prompts]
    .sort((a, b) => {
      const byDate =
        new Date(b.approvedAt).getTime() - new Date(a.approvedAt).getTime();
      return byDate || a.id.localeCompare(b.id);
    })
    .slice(0, limit);
}

export class AssignmentFilterNotFoundError extends Error {
  constructor(label: string, readonly slug: string) {
    super(`${label} not found`);
    this.name = "AssignmentFilterNotFoundError";
  }
}

export function requireAssignmentFilter<T>(
  label: string,
  slug: string | undefined,
  row: T | undefined,
): T | undefined {
  if (slug && !row) {
    throw new AssignmentFilterNotFoundError(label, slug);
  }

  return row;
}

export class AssignmentMetadataMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AssignmentMetadataMismatchError";
  }
}

export function validateAssignmentRunMetadata(
  assignment: {
    modelProvider: string | null;
    modelId: string | null;
    locale: string | null;
  },
  run: {
    modelProvider: string;
    modelId: string;
    locale: string;
  },
): void {
  if (
    assignment.modelProvider &&
    assignment.modelProvider !== run.modelProvider
  ) {
    throw new AssignmentMetadataMismatchError(
      "Assignment model provider must match the submitted run.",
    );
  }

  if (assignment.modelId && assignment.modelId !== run.modelId) {
    throw new AssignmentMetadataMismatchError(
      "Assignment model id must match the submitted run.",
    );
  }

  if (assignment.locale && assignment.locale !== run.locale) {
    throw new AssignmentMetadataMismatchError(
      "Assignment locale must match the submitted run.",
    );
  }
}

export function buildAssignmentInstructions(input: {
  assignmentId: string;
  prompts: Array<{ id: string; text: string }>;
  modelProvider?: string | null;
  modelId?: string | null;
  locale: string;
}): string {
  const modelLine =
    input.modelProvider || input.modelId
      ? `Use model metadata: provider=${input.modelProvider ?? "unknown"}, model=${input.modelId ?? "unknown"}.`
      : "Include the provider, model id, model version, channel, and temperature metadata you used.";

  const promptLines = input.prompts
    .map(
      (prompt, index) =>
        `${index + 1}. ${prompt.text}\n   promptId: ${prompt.id}`,
    )
    .join("\n");

  return [
    `Benchmark assignment: ${input.assignmentId}`,
    `Locale: ${input.locale}`,
    modelLine,
    "",
    "Run each prompt with your model and submit every result through the MCP submit-benchmark-run tool.",
    "Preserve the full raw answer exactly, including source/citation blocks, markdown links, and any model/channel metadata.",
    "Pass assignmentId with every submission so progress can be tracked.",
    "",
    "Prompts:",
    promptLines,
  ].join("\n");
}
