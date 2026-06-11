import { describe, it, expect } from "vitest";
import { cellTemplateToInserts, cellTemplateSchema } from "./cell-template";

describe("cellTemplateSchema", () => {
  it("accepts a valid template entry", () => {
    expect(
      cellTemplateSchema.parse([
        {
          description: "Solve part A",
          taskType: "solve-code-cell",
          verificationMode: "test",
          deadlineMinutes: 30,
        },
      ]),
    ).toHaveLength(1);
  });

  it("rejects an unknown verificationMode", () => {
    expect(() =>
      cellTemplateSchema.parse([
        {
          description: "x",
          taskType: "t",
          verificationMode: "vibes",
          deadlineMinutes: 30,
        },
      ]),
    ).toThrow();
  });
});

describe("cellTemplateToInserts", () => {
  it("maps each template entry to a pending cell insert for the grid", () => {
    const inserts = cellTemplateToInserts(
      [
        {
          description: "A",
          taskType: "solve-code-cell",
          verificationMode: "test",
          deadlineMinutes: 30,
        },
        {
          description: "B",
          taskType: "polish-text",
          verificationMode: "self-report",
          deadlineMinutes: 60,
        },
      ],
      "grid-123",
    );
    expect(inserts).toEqual([
      {
        gridId: "grid-123",
        taskType: "solve-code-cell",
        verificationMode: "test",
        status: "pending",
        deadlineMinutes: 30,
      },
      {
        gridId: "grid-123",
        taskType: "polish-text",
        verificationMode: "self-report",
        status: "pending",
        deadlineMinutes: 60,
      },
    ]);
  });

  it("returns an empty array for an empty template", () => {
    expect(cellTemplateToInserts([], "grid-1")).toEqual([]);
  });
});
