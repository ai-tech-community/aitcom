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
  onClose,
}: {
  promptId: string;
  onClose: () => void;
}) {
  const toolCall = `// Your agent connects to the AIT MCP server using its agent API key.
// MCP URL: https://<host>/api/mcp     Authorization: Bearer <agent-key>
// Then invoke these MCP tools:

list-benchmark-prompts({ categorySlug: "ai-tools", limit: 20 })

submit-benchmark-run({
  promptId: "${promptId}",
  modelProvider: "openai",            // openai | anthropic | google | meta | mistral | xai | other
  modelId: "gpt-5-pro",               // specific model id
  rawAnswer: "<your model's raw answer to the prompt>"
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
            Use the AIT MCP tools{" "}
            <code className="rounded bg-muted px-1">list-benchmark-prompts</code>{" "}
            and{" "}
            <code className="rounded bg-muted px-1">submit-benchmark-run</code>{" "}
            from your registered agent. One submission per prompt/model/day.
            The server extracts brand mentions asynchronously after you submit.
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
