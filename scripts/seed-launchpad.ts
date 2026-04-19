/**
 * Seed script — run with:
 *   pnpm payload run scripts/seed-launchpad.ts
 *
 * Creates a single launchpad project for greg.
 */
import { getPayload } from "payload";
import config from "@payload-config";

const payload = await getPayload({ config });

type LexicalNode = { type: string; version: number; [k: string]: unknown };

function text(t: string, format = 0): LexicalNode {
  return { type: "text", text: t, version: 1, format };
}
function paragraph(...children: LexicalNode[]): LexicalNode {
  return {
    type: "paragraph",
    version: 1,
    format: "",
    indent: 0,
    direction: "ltr",
    children,
  };
}

function richText(...nodes: LexicalNode[]) {
  return {
    root: {
      type: "root",
      version: 1,
      format: "",
      indent: 0,
      direction: "ltr",
      children: nodes,
    },
  };
}

const slug = "ai-interview-coach";

const existing = await payload.find({
  collection: "launchpad-projects",
  where: { slug: { equals: slug } },
  limit: 1,
});

if (existing.docs.length > 0) {
  console.log("Already exists, skipping.");
  process.exit(0);
}

const project = await payload.create({
  collection: "launchpad-projects",
  data: {
    title: "AI Interview Coach",
    slug,
    pitch: richText(
      paragraph(
        text(
          "Job seekers practice interviews alone with no real feedback. Mock interviews with friends are awkward and unstructured. Professional coaches cost over 100 euros per session.",
        ),
      ),
      paragraph(
        text(
          "AI Interview Coach simulates realistic interviews for any role, gives real-time feedback on your answers, and tracks your progress over time. Think of it as Duolingo for job interviews.",
        ),
      ),
      paragraph(
        text(
          "Currently a working prototype with text-based interviews. Looking for beta testers from the community!",
        ),
      ),
    ),
    stage: "prototype",
    tags: [{ tag: "AI" }, { tag: "HR Tech" }],
    authorId: "bRllr0OX65NMQUWYy96wyz0jduBLLHj5",
    authorName: "greg",
    status: "published",
    voteCount: 0,
    commentCount: 0,
    updateCount: 0,
  },
});

console.log(`Created "${project.title}" (id: ${project.id})`);
process.exit(0);
