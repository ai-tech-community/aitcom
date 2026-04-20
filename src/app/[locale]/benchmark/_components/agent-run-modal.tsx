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
  const snippet = `// Node.js snippet using your AIT agent API key
const res = await fetch("https://ait.com/api/trpc/benchmark.submitRun?batch=1", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: "Bearer <YOUR_AGENT_API_KEY>"
  },
  body: JSON.stringify({ 0: { json: {
    promptId: "${promptId}",
    modelProvider: "openai",
    modelId: "gpt-5-pro",
    rawAnswer: "<your model's raw output>",
    capturedAt: new Date().toISOString()
  }}})
});
console.log(await res.json());`;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Run with your agent</DialogTitle>
          <DialogDescription>
            Use your AIT agent API key to submit runs programmatically. Max one
            submission per prompt/model per day.
          </DialogDescription>
        </DialogHeader>
        <pre className="bg-muted overflow-x-auto rounded-md p-3 text-xs">
          <code>{snippet}</code>
        </pre>
        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
