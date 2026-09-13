"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  AWESOME_AI_OSS_BLURB_MAX,
  AWESOME_CATEGORY_IDS,
  AWESOME_CATEGORY_LABELS,
  type AwesomeCategoryId,
  type AwesomeLocale,
} from "@/lib/investigations/awesome-ai-oss";
import {
  AWESOME_REPO_DUPLICATE_ERROR,
  AWESOME_REPO_URL_ERROR,
} from "@/lib/investigations/awesome-ai-oss-url";
import { api } from "@/trpc/react";

export function AwesomeAiOssSubmitDialog({
  open,
  onOpenChange,
  locale,
  copy,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locale: AwesomeLocale;
  copy: {
    title: string;
    help: string;
    fieldName: string;
    fieldRepo: string;
    fieldCategory: string;
    fieldBlurb: string;
    fieldBlurbHint: string;
    fieldNote: string;
    submitForReview: string;
    cancel: string;
    submitSuccess: string;
  };
}) {
  const [name, setName] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [category, setCategory] = useState<AwesomeCategoryId | "">("");
  const [blurb, setBlurb] = useState("");
  const [reviewerNote, setReviewerNote] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);
  const [duplicateError, setDuplicateError] = useState<string | null>(null);

  const submit = api.awesomeAiOss.submit.useMutation({
    onSuccess: () => {
      toast.success(copy.submitSuccess);
      reset();
      onOpenChange(false);
    },
    onError: (error) => {
      if (error.message === AWESOME_REPO_URL_ERROR) {
        setUrlError(AWESOME_REPO_URL_ERROR);
        return;
      }
      if (error.message === AWESOME_REPO_DUPLICATE_ERROR) {
        setDuplicateError(AWESOME_REPO_DUPLICATE_ERROR);
        return;
      }
      toast.error(error.message);
    },
  });

  function reset() {
    setName("");
    setRepoUrl("");
    setCategory("");
    setBlurb("");
    setReviewerNote("");
    setUrlError(null);
    setDuplicateError(null);
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setUrlError(null);
    setDuplicateError(null);
    if (!category) return;
    submit.mutate({
      name,
      repoUrl,
      category,
      blurb,
      reviewerNote: reviewerNote.trim() || undefined,
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.help}</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-2">
            <Label htmlFor="awesome-name">{copy.fieldName}</Label>
            <Input
              id="awesome-name"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="awesome-repo">{copy.fieldRepo}</Label>
            <Input
              id="awesome-repo"
              type="url"
              required
              value={repoUrl}
              aria-invalid={Boolean(urlError || duplicateError)}
              onChange={(event) => {
                setRepoUrl(event.target.value);
                setUrlError(null);
                setDuplicateError(null);
              }}
            />
            {urlError ? (
              <p className="text-destructive text-sm">{urlError}</p>
            ) : null}
            {duplicateError ? (
              <p className="text-destructive text-sm">{duplicateError}</p>
            ) : null}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="awesome-category">{copy.fieldCategory}</Label>
            <Select
              value={category}
              onValueChange={(value) => setCategory(value as AwesomeCategoryId)}
            >
              <SelectTrigger id="awesome-category" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {AWESOME_CATEGORY_IDS.map((id) => (
                    <SelectItem key={id} value={id}>
                      {AWESOME_CATEGORY_LABELS[id][locale]}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="awesome-blurb">{copy.fieldBlurb}</Label>
            <Input
              id="awesome-blurb"
              required
              maxLength={AWESOME_AI_OSS_BLURB_MAX}
              value={blurb}
              onChange={(event) => setBlurb(event.target.value)}
            />
            <p className="text-muted-foreground text-xs">
              {copy.fieldBlurbHint}
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="awesome-note">{copy.fieldNote}</Label>
            <Textarea
              id="awesome-note"
              value={reviewerNote}
              onChange={(event) => setReviewerNote(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {copy.cancel}
            </Button>
            <Button type="submit" disabled={submit.isPending || !category}>
              {copy.submitForReview}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
