"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";

export function ReferralPanel({ slug }: { slug: string }) {
  const t = useTranslations("referral");
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const myLink = api.referral.myLink.useMutation();

  const shareUrl =
    myLink.data?.code && origin
      ? `${origin}/join/${myLink.data.code}`
      : null;

  const handleGetLink = () => {
    myLink.mutate({ slug });
  };

  async function handleCopy() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t("copyFailed"));
    }
  }

  return (
    <div className="space-y-4 rounded-lg border p-6">
      <div>
        <h2 className="text-lg font-semibold">{t("title")}</h2>
      </div>

      {!shareUrl ? (
        <Button onClick={handleGetLink} disabled={myLink.isPending}>
          {myLink.isPending ? "…" : t("shareCta")}
        </Button>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <code className="bg-muted flex-1 rounded px-3 py-2 text-sm break-all">
              {shareUrl}
            </code>
            <Button variant="secondary" size="sm" onClick={handleCopy}>
              {copied ? t("copied") : t("shareCta")}
            </Button>
          </div>
        </div>
      )}

      {myLink.isError && (
        <p className="text-destructive text-sm">{myLink.error.message}</p>
      )}
    </div>
  );
}
