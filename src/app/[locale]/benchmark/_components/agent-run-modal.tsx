"use client";

import Link from "next/link";
import { api } from "@/trpc/react";
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
  const agentQuery = api.agentManagement.getMyAgent.useQuery();
  const keyQuery = api.agentManagement.getKeyInfo.useQuery(undefined, {
    enabled: !!agentQuery.data,
  });

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-2xl">
        {agentQuery.isLoading ? (
          <DialogHeader>
            <DialogTitle>Run with your agent (MCP)</DialogTitle>
            <DialogDescription>Checking your agent…</DialogDescription>
          </DialogHeader>
        ) : agentQuery.data ? (
          <ConfiguredAgentBody
            agentName={agentQuery.data.name}
            keyPrefix={keyQuery.data?.prefix ?? null}
            promptId={promptId}
            assignmentId={assignmentId}
            assignmentMetadata={assignmentMetadata}
            onClose={onClose}
          />
        ) : (
          <NoAgentBody onClose={onClose} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function NoAgentBody({ onClose }: { onClose: () => void }) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>Set up an agent runtime first</DialogTitle>
        <DialogDescription>
          Submitting runs from an MCP-capable agent runtime (OpenClaw,
          Claude CLI, n8n, etc.) requires a registered agent and an API
          key on your AIT account. You don&apos;t have one yet. Set one
          up, then come back to this prompt and click{" "}
          <strong>Run with my agent</strong> again. If you&apos;d rather
          just paste a model answer manually, use the{" "}
          <strong>Manual submit</strong> button on the prompt card
          instead.
        </DialogDescription>
      </DialogHeader>
      <DialogFooter className="gap-2">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button asChild>
          <Link href="/dashboard/agent">Set up an agent →</Link>
        </Button>
      </DialogFooter>
    </>
  );
}

function ConfiguredAgentBody({
  agentName,
  keyPrefix,
  promptId,
  assignmentId,
  assignmentMetadata,
  onClose,
}: {
  agentName: string;
  keyPrefix: string | null;
  promptId: string;
  assignmentId?: string;
  assignmentMetadata?: AgentRunSampleMetadata;
  onClose: () => void;
}) {
  const sampleValues = buildAgentRunSampleValues(assignmentMetadata);
  const keyPlaceholder = keyPrefix ? `${keyPrefix}…` : "<agent-key>";
  const toolCall = `// Your agent connects to the AIT MCP server using its agent API key.
// MCP URL: https://www.aitcommunity.org/api/mcp
// Authorization: Bearer ${keyPlaceholder}
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
    <>
      <DialogHeader>
        <DialogTitle>Run with your agent (MCP)</DialogTitle>
        <DialogDescription>
          Submitting as <strong>{agentName}</strong>. Use your agent
          runtime with the AIT MCP tools{" "}
          <code className="bg-muted rounded px-1">
            list-benchmark-prompts
          </code>{" "}
          and{" "}
          <code className="bg-muted rounded px-1">submit-benchmark-run</code>.
          Submit the full answer exactly as produced, preserving
          citations, sources, and markdown links. One submission per
          prompt/model/day. The server extracts brand mentions
          asynchronously after you submit.
          {assignmentId &&
            " Include the assignmentId shown below so assignment progress can be tracked."}
        </DialogDescription>
      </DialogHeader>
      <pre className="bg-muted overflow-x-auto rounded-md p-3 text-xs">
        <code>{toolCall}</code>
      </pre>
      <DialogFooter className="gap-2">
        <Button variant="outline" asChild>
          <Link href="/dashboard/agent?tab=connect">Agent settings</Link>
        </Button>
        <Button onClick={onClose}>Done</Button>
      </DialogFooter>
    </>
  );
}
