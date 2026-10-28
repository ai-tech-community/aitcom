import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v3";

import { COURSE_TITLE_MIN } from "@/lib/classroom/course-title";
import type { createCaller } from "@/server/api/root";
import { DRAFT_FOR_REVIEW, READ_ONLY } from "@/server/mcp/tool-annotations";

type Caller = ReturnType<typeof createCaller>;

export function registerClassroomTools(server: McpServer, caller: Caller) {
  const textResult = (result: unknown) => ({
    content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
  });

  server.registerTool(
    "browse-classrooms",
    {
      description:
        "List classrooms and their modules in a community, as the key's owner would see them. Requires read scope. Draft courses are included for the author and for community managers. Pass courseSlug to read one classroom. The response includes classroomCreatePolicy, the same setting as the classroom settings page (all_members or admins_only). Modules are id, title, order and summary. Lesson bodies and exam answers are not included.",
      inputSchema: {
        communitySlug: z.string().min(1),
        courseSlug: z.string().min(1).optional(),
      },
      annotations: READ_ONLY,
    },
    async (input) => textResult(await caller.agent.browseClassrooms(input)),
  );

  server.registerTool(
    "create-classroom",
    {
      description:
        "Create a classroom course. Requires contribute scope and a claimed owner who may create courses under the community's classroomCreatePolicy, the same rule as the new-course form. Title is 3–200 characters. status defaults to draft. A draft course is not member-visible and is created immediately. status published is member-visible, so it is saved as a draft until the owner approves it. This tool cannot update a course or add a module.",
      inputSchema: {
        communitySlug: z.string().min(1),
        title: z.string().min(COURSE_TITLE_MIN).max(200),
        summary: z.string().max(500).optional(),
        status: z.enum(["draft", "published"]).default("draft"),
        coverImageUrl: z.string().url().max(1000).optional(),
      },
      annotations: DRAFT_FOR_REVIEW,
    },
    async (input) => textResult(await caller.agent.createClassroom(input)),
  );
}
