"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { BuildingModal } from "@/components/community/building-modal";
import { useRequireAuth } from "@/components/auth/auth-required-dialog";
import { Loader2, Plus } from "lucide-react";

export function CreateCommunityDialog() {
  const t = useTranslations("communities.create");
  const router = useRouter();
  const utils = api.useUtils();
  const { requireAuth } = useRequireAuth();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [joinPolicy, setJoinPolicy] = useState<
    "open" | "invite_only" | "approval_required"
  >("open");
  const [isListed, setIsListed] = useState(true);

  const mutation = api.communities.create.useMutation({
    onSuccess: (community) => {
      setOpen(false);
      resetForm();
      void utils.communities.invalidate();
      router.push(`/communities/${community.slug}` as never);
    },
  });

  function resetForm() {
    setName("");
    setDescription("");
    setJoinPolicy("open");
    setIsListed(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    mutation.mutate({
      name,
      description: description || undefined,
      joinPolicy,
      isListedInDirectory: isListed,
    });
  }

  return (
    <>
      <Button
        size="sm"
        className="font-mono text-xs"
        onClick={() =>
          requireAuth(() => setOpen(true), "Sign in to create a community")
        }
      >
        <Plus className="mr-1.5 h-3.5 w-3.5" />
        {t("title")}
      </Button>

      <BuildingModal
        isOpen={open}
        onClose={() => {
          setOpen(false);
          resetForm();
        }}
        title={t("title")}
        subtitle={t("name")}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label className="font-mono text-xs">{t("name")}</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. PyTorch Amsterdam"
              required
              minLength={2}
              maxLength={100}
              className="mt-1 font-mono text-sm"
            />
          </div>
          <div>
            <Label className="font-mono text-xs">{t("description")}</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is your community about?"
              maxLength={500}
              rows={3}
              className="mt-1 font-mono text-sm"
            />
          </div>
          <div>
            <Label className="font-mono text-xs">{t("joinPolicy")}</Label>
            <Select
              value={joinPolicy}
              onValueChange={(v) =>
                setJoinPolicy(v as "open" | "invite_only" | "approval_required")
              }
            >
              <SelectTrigger className="mt-1 font-mono text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="open">{t("joinPolicyOpen")}</SelectItem>
                <SelectItem value="invite_only">
                  {t("joinPolicyInviteOnly")}
                </SelectItem>
                <SelectItem value="approval_required">
                  {t("joinPolicyApprovalRequired")}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-3">
            <Switch checked={isListed} onCheckedChange={setIsListed} />
            <Label className="font-mono text-xs">
              Listed in community directory
            </Label>
          </div>
          {mutation.error && (
            <p className="text-destructive text-sm">{mutation.error.message}</p>
          )}
          <Button
            type="submit"
            disabled={mutation.isPending || name.length < 2}
            className="w-full font-mono text-xs"
          >
            {mutation.isPending && (
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            )}
            {t("submit")}
          </Button>
        </form>
      </BuildingModal>
    </>
  );
}
