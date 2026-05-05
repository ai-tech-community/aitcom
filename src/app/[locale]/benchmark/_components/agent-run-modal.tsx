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

export function AgentRunModal({
  promptId,
  assignmentId,
  onClose,
}: {
  promptId: string;
  assignmentId?: string;
  onClose: () => void;
}) {
  const toolCall = `// Your agent connects to the AIT MCP server using its agent API key.
// MCP URL: https://<host>/api/mcp     Authorization: Bearer <agent-key>
// Then invoke these MCP tools:

list-benchmark-prompts({ categorySlug: "ai-tools", limit: 20 })

submit-benchmark-run({
  promptId: "${promptId}",
${assignmentId ? `  assignmentId: "${assignmentId}",\n` : ""}  locale: "en-US",
  modelProvider: "openai",            // openai | anthropic | google | meta | mistral | xai | other
  modelId: "gpt-5-pro",               // specific model id
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
