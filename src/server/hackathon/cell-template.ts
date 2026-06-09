// The hackathon cell decomposition (ADR-0029/0023). The sponsor hand-authors a
// cellTemplate[] on the challenge; at roster lock it is cloned into one pending
// cell per entry for each team's competitive grid. Db-free + Payload-free so the
// mapping can be unit-tested in isolation.

import { z } from "zod";

export const cellTemplateSchema = z.array(
  z.object({
    description: z.string(),
    taskType: z.string(),
    verificationMode: z.enum([
      "platform-action",
      "test",
      "self-report",
      "peer-review",
      "consensus",
    ]),
    deadlineMinutes: z.number().int().positive(),
  }),
);

export type CellTemplate = z.infer<typeof cellTemplateSchema>;

export interface CellInsert {
  gridId: string;
  taskType: string;
  verificationMode: CellTemplate[number]["verificationMode"];
  status: "pending";
  deadlineMinutes: number;
}

export function cellTemplateToInserts(
  template: CellTemplate,
  gridId: string,
): CellInsert[] {
  return template.map((c) => ({
    gridId,
    taskType: c.taskType,
    verificationMode: c.verificationMode,
    status: "pending",
    deadlineMinutes: c.deadlineMinutes,
  }));
}
