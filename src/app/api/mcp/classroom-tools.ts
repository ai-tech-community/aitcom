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
        "List classrooms and their modules and lessons in a community, as the key's owner would see them. Requires read scope. Draft courses are included for the author and for community managers. Pass courseSlug to read one classroom. The response includes classroomCreatePolicy, the same setting as the classroom settings page (all_members or admins_only). Each course lists its modules, the lessons in each module, and lessons that are not in a module. Lesson bodies and exam answers are not included.",
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
        "Create a classroom course. Requires contribute scope and a claimed owner who may create courses under the community's classroomCreatePolicy, the same rule as the new-course form. Title is 3–200 characters. The address is the title slug, with a short number only when that slug is already used. status defaults to draft. A draft course is not member-visible and is created immediately. status published is member-visible, so it is saved as a draft until the owner approves it. Use update-classroom to change a course, and create-module or create-lesson to add content.",
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

  server.registerTool(
    "update-classroom",
    {
      description:
        "Update a classroom the owner authored. Requires contribute scope. Title, summary, cover image URL, status, and an optional slug. Changing the title, or sending slug, replaces a timestamp address with a clean slug. A short number is added only when that address is already used. A change that keeps an unpublished course unpublished is saved immediately. Setting status to published, or editing a course members can already see, is saved as a draft until the owner approves it. This tool cannot archive a course.",
      inputSchema: {
        communitySlug: z.string().min(1),
        courseId: z.number().int().positive(),
        title: z.string().min(COURSE_TITLE_MIN).max(200).optional(),
        slug: z.string().min(1).max(80).optional(),
        summary: z.string().max(500).nullable().optional(),
        status: z.enum(["draft", "published"]).optional(),
        coverImageUrl: z.string().url().max(1000).nullable().optional(),
      },
      annotations: DRAFT_FOR_REVIEW,
    },
    async (input) => textResult(await caller.agent.updateClassroom(input)),
  );

  server.registerTool(
    "create-module",
    {
      description:
        "Add a module to a classroom the owner authored. Requires contribute scope. The first module on a course wraps its existing lessons, the same as the classroom builder. On an unpublished course the module is created immediately and the response status is draft. On a published course it is saved as a draft until the owner approves it, so members do not see it first. The response status is draft until that approval.",
      inputSchema: {
        communitySlug: z.string().min(1),
        courseId: z.number().int().positive(),
        title: z.string().min(1).max(200),
        summary: z.string().max(500).optional(),
      },
      annotations: DRAFT_FOR_REVIEW,
    },
    async (input) => textResult(await caller.agent.createModule(input)),
  );

  server.registerTool(
    "update-module",
    {
      description:
        "Update a module title or summary on a classroom the owner authored. Requires contribute scope. On an unpublished course the change is saved immediately and the response status is draft. On a published course it is saved as a draft until the owner approves it. The response status is draft until that approval.",
      inputSchema: {
        communitySlug: z.string().min(1),
        moduleId: z.number().int().positive(),
        title: z.string().min(1).max(200).optional(),
        summary: z.string().max(500).nullable().optional(),
      },
      annotations: DRAFT_FOR_REVIEW,
    },
    async (input) => textResult(await caller.agent.updateModule(input)),
  );

  server.registerTool(
    "create-lesson",
    {
      description:
        "Add a lesson to a classroom the owner authored. Requires contribute scope. Optional moduleId places it in that module. body is plain text stored as paragraphs. On an unpublished course the lesson is created immediately and the response status is draft. On a published course it is saved as a draft until the owner approves it. The response status is draft until that approval. This tool does not add an exam.",
      inputSchema: {
        communitySlug: z.string().min(1),
        courseId: z.number().int().positive(),
        moduleId: z.number().int().positive().optional(),
        title: z.string().min(1).max(200),
        body: z.string().max(50_000).optional(),
      },
      annotations: DRAFT_FOR_REVIEW,
    },
    async (input) => textResult(await caller.agent.createLesson(input)),
  );

  server.registerTool(
    "update-lesson",
    {
      description:
        "Update a lesson title or body on a classroom the owner authored. Requires contribute scope. body is plain text stored as paragraphs. On an unpublished course the change is saved immediately and the response status is draft. On a published course it is saved as a draft until the owner approves it. The response status is draft until that approval.",
      inputSchema: {
        communitySlug: z.string().min(1),
        lessonId: z.number().int().positive(),
        title: z.string().min(1).max(200).optional(),
        body: z.string().max(50_000).optional(),
      },
      annotations: DRAFT_FOR_REVIEW,
    },
    async (input) => textResult(await caller.agent.updateLesson(input)),
  );
}
