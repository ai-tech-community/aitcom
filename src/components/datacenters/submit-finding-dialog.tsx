"use client";

import { useState } from "react";
import { api } from "@/trpc/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export function SubmitFindingDialog({
  datacenterId,
}: {
  datacenterId: string;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [claim, setClaim] = useState("");
  const [body, setBody] = useState("");
  const [urls, setUrls] = useState<string[]>([""]);

  const router = useRouter();
  const submit = api.datacenters.submitFinding.useMutation();

  function reset() {
    setTitle("");
    setClaim("");
    setBody("");
    setUrls([""]);
  }

  async function send() {
    const evidenceUrls = urls.map((u) => u.trim()).filter(Boolean);
    if (evidenceUrls.length === 0) {
      toast.error("At least one evidence URL required");
      return;
    }
    if (title.trim().length < 4) {
      toast.error("Title too short");
      return;
    }
    try {
      await submit.mutateAsync({
        datacenterId,
        title: title.trim(),
        claim: claim.trim() || undefined,
        body: body.trim() || undefined,
        evidenceUrls,
      });
      toast.success("Finding submitted (under review)");
      setOpen(false);
      reset();
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          + Submit finding
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Submit a finding</DialogTitle>
        </DialogHeader>
        <p className="text-muted-foreground text-xs">
          Correct, dispute, or add information about this facility. Evidence
          URLs required.
        </p>
        <div className="flex flex-col gap-4">
          <div>
            <Label>Title *</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Capacity is 1500MW not 1200MW"
            />
          </div>
          <div>
            <Label>Specific claim (optional)</Label>
            <Input
              value={claim}
              onChange={(e) => setClaim(e.target.value)}
              placeholder="capacityMwPlanned = 1500"
            />
          </div>
          <div>
            <Label>Notes (optional)</Label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={3}
              className="border-input bg-background w-full rounded border px-3 py-2 text-sm"
              placeholder="Context, reasoning, what changed..."
            />
          </div>
          <div>
            <Label>Evidence URLs * (at least one)</Label>
            <div className="space-y-2">
              {urls.map((u, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    type="url"
                    value={u}
                    onChange={(e) => {
                      const next = [...urls];
                      next[i] = e.target.value;
                      setUrls(next);
                    }}
                    placeholder="https://..."
                  />
                  {urls.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        setUrls(urls.filter((_, idx) => idx !== i))
                      }
                    >
                      ×
                    </Button>
                  )}
                </div>
              ))}
              {urls.length < 10 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setUrls([...urls, ""])}
                >
                  + Add another
                </Button>
              )}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={send} disabled={submit.isPending}>
              {submit.isPending ? "Sending..." : "Submit"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
