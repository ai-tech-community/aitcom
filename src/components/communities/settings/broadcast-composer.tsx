"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface BroadcastComposerProps {
  slug: string;
}

export function BroadcastComposer({ slug }: BroadcastComposerProps) {
  const t = useTranslations("broadcast");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const send = api.broadcast.send.useMutation({
    onSuccess: (r) => {
      toast.success(t("sent", { emailed: r.emailed }));
      setSubject("");
      setBody("");
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const canSend = subject.trim().length > 0 && body.trim().length > 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSend || send.isPending) return;
    send.mutate({ slug, subject, body });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{t("title")}</h2>
        <p className="text-muted-foreground mt-1 text-sm">{t("description")}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1">
          <Label htmlFor="broadcast-subject" className="text-xs">
            {t("subject")}
          </Label>
          <Input
            id="broadcast-subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={200}
            placeholder={t("subject")}
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="broadcast-body" className="text-xs">
            {t("body")}
          </Label>
          <Textarea
            id="broadcast-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={5000}
            placeholder={t("body")}
            rows={6}
          />
        </div>

        <Button type="submit" size="sm" disabled={!canSend || send.isPending}>
          {send.isPending && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
          {send.isPending ? t("sending") : t("send")}
        </Button>
      </form>
    </div>
  );
}
