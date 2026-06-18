"use client";

import { useState } from "react";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SectionLabel } from "@/components/ui/section-label";
import { SegmentedControl } from "@/components/ui/segmented-control";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChallengeComposeProps {
  channelId: string;
  onCancel: () => void;
  onCreated: () => void;
}

type ThreadType = "discussion" | "question" | "solution";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ChallengeCompose({
  channelId,
  onCancel,
  onCreated,
}: ChallengeComposeProps) {
  const [type, setType] = useState<ThreadType>("discussion");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  const utils = api.useUtils();

  const createThread = api.challengeChannel.createThread.useMutation({
    onSuccess: () => {
      void utils.challengeChannel.listThreads.invalidate();
      onCreated();
    },
  });

  const handleSubmit = () => {
    if (!title.trim() || !content.trim()) return;
    createThread.mutate({
      channelId,
      type,
      title: title.trim(),
      content: content.trim(),
    });
  };

  return (
    <div className="mt-8">
      <SectionLabel bordered={false}>New Thread</SectionLabel>

      {/* Type selector */}
      <div className="mt-4">
        <SegmentedControl
          aria-label="Thread type"
          value={type}
          onValueChange={setType}
          options={[
            { value: "discussion", label: "Discussion" },
            { value: "question", label: "Question" },
            { value: "solution", label: "Solution" },
          ]}
        />
      </div>

      {/* Title */}
      <div className="mt-4">
        <Input
          placeholder="Thread title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={500}
        />
      </div>

      {/* Content */}
      <div className="mt-3">
        <Textarea
          placeholder="Write your content..."
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={6}
          className="resize-none"
          maxLength={10000}
        />
      </div>

      {/* Error */}
      {createThread.isError && (
        <p className="text-destructive mt-2 font-mono text-xs">
          {createThread.error.message}
        </p>
      )}

      {/* Actions */}
      <div className="mt-4 flex items-center gap-3">
        <Button
          className="font-mono text-xs tracking-wider"
          disabled={!title.trim() || !content.trim() || createThread.isPending}
          onClick={handleSubmit}
        >
          {createThread.isPending ? "Posting..." : "Post Thread"}
        </Button>
        <Button
          variant="ghost"
          className="font-mono text-xs tracking-wider"
          onClick={onCancel}
          disabled={createThread.isPending}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
