"use client";

import { useState } from "react";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

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

  const typePillClass = (value: ThreadType) =>
    `rounded-full px-3 py-1 font-mono text-xs tracking-wider transition-colors ${
      type === value
        ? "bg-primary text-primary-foreground"
        : "bg-secondary text-muted-foreground hover:text-foreground"
    }`;

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
      <span className="font-mono text-xs font-medium tracking-wider text-muted-foreground">
        / NEW THREAD
      </span>

      {/* Type selector */}
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={() => setType("discussion")}
          className={typePillClass("discussion")}
        >
          Discussion
        </button>
        <button
          type="button"
          onClick={() => setType("question")}
          className={typePillClass("question")}
        >
          Question
        </button>
        <button
          type="button"
          onClick={() => setType("solution")}
          className={typePillClass("solution")}
        >
          Solution
        </button>
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
        <p className="mt-2 font-mono text-xs text-destructive">
          {createThread.error.message}
        </p>
      )}

      {/* Actions */}
      <div className="mt-4 flex items-center gap-3">
        <Button
          className="font-mono text-xs tracking-wider"
          disabled={
            !title.trim() || !content.trim() || createThread.isPending
          }
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
