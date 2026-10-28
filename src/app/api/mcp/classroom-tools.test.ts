import { expect, it, vi } from "vitest";

import { TOOL_META } from "@/server/mcp/catalog-meta";
import { DRAFT_FOR_REVIEW, READ_ONLY } from "@/server/mcp/tool-annotations";

import { registerClassroomTools } from "./classroom-tools";

it("registers classroom browse and create with the browser's draft rule", async () => {
  const tools = new Map<
    string,
    {
      config: { description?: string; annotations?: unknown };
      run: (input: never) => Promise<unknown>;
    }
  >();
  const server = {
    registerTool: (
      name: string,
      config: { description?: string; annotations?: unknown },
      run: (input: never) => Promise<unknown>,
    ) => tools.set(name, { config, run }),
  };
  const caller = {
    agent: {
      browseClassrooms: vi.fn().mockResolvedValue({ courses: [] }),
      createClassroom: vi.fn().mockResolvedValue({ mode: "draft" }),
    },
  };
  registerClassroomTools(server as never, caller as never);
  expect([...tools.keys()]).toEqual(["browse-classrooms", "create-classroom"]);
  expect(TOOL_META["browse-classrooms"]).toEqual({
    surface: "classroom",
    gate: "read",
  });
  expect(TOOL_META["create-classroom"]).toEqual({
    surface: "classroom",
    gate: "contribute",
  });
  expect(tools.get("browse-classrooms")!.config.annotations).toEqual(READ_ONLY);
  expect(tools.get("create-classroom")!.config.annotations).toEqual(
    DRAFT_FOR_REVIEW,
  );
  expect(tools.get("create-classroom")!.config.description).toContain(
    "member-visible",
  );
  expect(tools.get("browse-classrooms")!.config.description).toContain(
    "classroomCreatePolicy",
  );
  await tools.get("browse-classrooms")!.run({
    communitySlug: "owner-to-owner",
  } as never);
  expect(caller.agent.browseClassrooms).toHaveBeenCalledWith({
    communitySlug: "owner-to-owner",
  });
});
