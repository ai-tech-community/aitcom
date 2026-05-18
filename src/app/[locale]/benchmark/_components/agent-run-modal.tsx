"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  buildAgentRunSampleValues,
  type AgentRunSampleMetadata,
} from "./benchmark-assignment-panel";

export function AgentRunModal({
  promptId,
  assignmentId,
  assignmentMetadata,
  onClose,
}: {
  promptId: string;
  assignmentId?: string;
  assignmentMetadata?: AgentRunSampleMetadata;
  onClose: () => void;
}) {
  const sampleValues = buildAgentRunSampleValues(assignmentMetadata);
  const toolCall = `// Your agent connects to the AIT MCP server using its agent API key.
// MCP URL: https://<host>/api/mcp     Authorization: Bearer <agent-key>
// Then invoke these MCP tools:

list-benchmark-prompts({ categorySlug: "ai-tools", limit: 20 })

submit-benchmark-run({
  promptId: "${promptId}",
${assignmentId ? `  assignmentId: "${assignmentId}",\n` : ""}  locale: "${sampleValues.locale}",
  modelSurface: "chatgpt_grounded",   // required: chatgpt_grounded | chatgpt_ungrounded | claude_grounded | claude_ungrounded | gemini_grounded | gemini_ungrounded | perplexity | kimi_grounded
  modelId: "${sampleValues.modelId}", // optional forensic SKU, e.g. gpt-5-pro
  rawAnswer: "<the full answer, including citations, source blocks, and markdown links>"
})`;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Run with your agent (MCP)</DialogTitle>
          <DialogDescription>
            Use your own registered agent with the AIT MCP tools{" "}
            <code className="bg-muted rounded px-1">
              list-benchmark-prompts
            </code>{" "}
            and{" "}
            <code className="bg-muted rounded px-1">submit-benchmark-run</code>{" "}
            workflow. Submit the full answer exactly as produced, preserving
            citations, sources, and markdown links. One submission per
            prompt/model/day. The server extracts brand mentions asynchronously
            after you submit.
            {assignmentId &&
              " Include the assignmentId shown below so assignment progress can be tracked."}
          </DialogDescription>
        </DialogHeader>
        <pre className="bg-muted overflow-x-auto rounded-md p-3 text-xs">
          <code>{toolCall}</code>
        </pre>
        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
