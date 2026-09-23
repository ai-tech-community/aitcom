"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
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
import { SectionLabel } from "@/components/ui/section-label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import type { StartupRolePublic } from "@/lib/investigations/startup-roles";

export type RoleHelpDraft = {
  communitySlug: string;
  note: string;
  classroom: string;
};

/**
 * Ask one community for help on a tracked role. The preview mirrors what
 * the community sees (an anonymous member, the role, the note), so nothing
 * is posted blind.
 */
export function StartupsJobsHelpSheet({
  role,
  communities,
  pending,
  onPost,
  onClose,
}: {
  role: StartupRolePublic | null;
  communities: readonly { slug: string; name: string }[];
  pending: boolean;
  onPost: (draft: RoleHelpDraft) => void;
  onClose: () => void;
}) {
  const t = useTranslations("jobsBoard");
  const [communitySlug, setCommunitySlug] = useState(
    communities[0]?.slug ?? "",
  );
  const [note, setNote] = useState("");
  const [classroom, setClassroom] = useState("");
  // A new role opens with a clean draft.
  const [draftFor, setDraftFor] = useState(role?.id ?? null);
  if ((role?.id ?? null) !== draftFor) {
    setDraftFor(role?.id ?? null);
    setCommunitySlug(communities[0]?.slug ?? "");
    setNote("");
    setClassroom("");
  }

  const canPost = Boolean(note.trim() && communitySlug) && !pending;

  return (
    <Sheet
      open={role !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent className="sm:max-w-md" data-startup-help-sheet="">
        {role ? (
          <>
            <SheetHeader>
              <SheetTitle>{t("ask")}</SheetTitle>
              <SheetDescription>
                {role.title} · {role.startupName}. {t("sheetLead")}
              </SheetDescription>
            </SheetHeader>
            <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor={`community-${role.id}`}>{t("community")}</Label>
                {communities.length === 0 ? (
                  <p className="text-muted-foreground text-sm">
                    {t("communityEmpty")}
                  </p>
                ) : (
                  <Select
                    value={communitySlug}
                    onValueChange={setCommunitySlug}
                  >
                    <SelectTrigger id={`community-${role.id}`}>
                      <SelectValue placeholder={t("community")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {communities.map((community) => (
                          <SelectItem
                            key={community.slug}
                            value={community.slug}
                          >
                            {community.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor={`note-${role.id}`}>{t("note")}</Label>
                <Textarea
                  id={`note-${role.id}`}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor={`classroom-${role.id}`}>{t("classroom")}</Label>
                <Input
                  id={`classroom-${role.id}`}
                  value={classroom}
                  onChange={(event) => setClassroom(event.target.value)}
                />
                <p className="text-muted-foreground text-xs">
                  {t("classroomHelp")}
                </p>
              </div>

              <section
                aria-labelledby={`preview-${role.id}`}
                data-startup-help-preview=""
                className="flex flex-col gap-3"
              >
                <SectionLabel as="h3" id={`preview-${role.id}`}>
                  {t("previewTitle")}
                </SectionLabel>
                <div className="bg-muted/40 border-border flex flex-col gap-1 rounded-xl border p-4">
                  <p className="text-muted-foreground font-mono text-xs tracking-wider uppercase">
                    {t("member")}
                  </p>
                  <p className="font-medium">{role.title}</p>
                  <p className="text-muted-foreground text-sm">
                    {role.startupName}
                  </p>
                  {note.trim() ? (
                    <p className="text-sm leading-relaxed whitespace-pre-line">
                      {note.trim()}
                    </p>
                  ) : null}
                  {classroom.trim() ? (
                    <p className="text-muted-foreground font-mono text-xs tracking-wider uppercase">
                      {classroom.trim()}
                    </p>
                  ) : null}
                </div>
              </section>
            </div>
            <SheetFooter>
              <Button
                type="button"
                disabled={!canPost}
                onClick={() =>
                  onPost({
                    communitySlug,
                    note: note.trim(),
                    classroom: classroom.trim(),
                  })
                }
              >
                {pending ? t("posting") : t("post")}
              </Button>
              <Button type="button" variant="ghost" onClick={onClose}>
                {t("cancel")}
              </Button>
            </SheetFooter>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
