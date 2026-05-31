"use client";

import { useState } from "react";
import { api } from "@/trpc/react";
import { weekdayLabel } from "@/server/communities/rituals";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Category = "general" | "question" | "showcase" | "job";
type Mode = "auto" | "review";

const CATEGORIES: Category[] = ["general", "question", "showcase", "job"];
const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

export function RitualForm({
  slug,
  onDone,
}: {
  slug: string;
  onDone: () => void;
}) {
  const utils = api.useUtils();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState<Category>("general");
  const [weekday, setWeekday] = useState(1);
  const [mode, setMode] = useState<Mode>("review");

  const create = api.rituals.create.useMutation({
    onSuccess: () => {
      void utils.rituals.list.invalidate({ slug });
      onDone();
    },
  });

  const titleTooShort = title.trim().length < 3;
  const bodyEmpty = body.trim().length === 0;
  const disabled = create.isPending || titleTooShort || bodyEmpty;

  return (
    <form
      className="space-y-4 rounded-lg border p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (disabled) return;
        create.mutate({ slug, title, body, category, weekday, mode });
      }}
    >
      <div>
        <Label htmlFor="ritual-title" className="font-mono text-xs">
          Title
        </Label>
        <Input
          id="ritual-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          minLength={3}
          maxLength={255}
          placeholder="Weekly showcase thread"
          className="mt-1 font-mono text-sm"
        />
      </div>

      <div>
        <Label htmlFor="ritual-body" className="font-mono text-xs">
          Body
        </Label>
        <Textarea
          id="ritual-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={10000}
          rows={4}
          placeholder="What should this recurring post say?"
          className="mt-1 font-mono text-sm"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="ritual-category" className="font-mono text-xs">
            Category
          </Label>
          <Select
            value={category}
            onValueChange={(v) => setCategory(v as Category)}
          >
            <SelectTrigger
              id="ritual-category"
              className="mt-1 font-mono text-sm capitalize"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => (
                <SelectItem key={c} value={c} className="capitalize">
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="ritual-weekday" className="font-mono text-xs">
            Weekday
          </Label>
          <Select
            value={String(weekday)}
            onValueChange={(v) => setWeekday(Number(v))}
          >
            <SelectTrigger
              id="ritual-weekday"
              className="mt-1 font-mono text-sm"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WEEKDAYS.map((d) => (
                <SelectItem key={d} value={String(d)}>
                  {weekdayLabel(d)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label htmlFor="ritual-mode" className="font-mono text-xs">
          Mode
        </Label>
        <Select value={mode} onValueChange={(v) => setMode(v as Mode)}>
          <SelectTrigger id="ritual-mode" className="mt-1 font-mono text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="review">Review before posting</SelectItem>
            <SelectItem value="auto">Auto-post</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {create.error && (
        <p className="text-destructive text-sm">{create.error.message}</p>
      )}

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onDone}
          disabled={create.isPending}
        >
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={disabled}>
          {create.isPending ? "Creating…" : "Create ritual"}
        </Button>
      </div>
    </form>
  );
}
