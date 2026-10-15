"use client";

import { useTranslations } from "next-intl";
import { ArrowUpRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogClose,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  StorySuggestionBox,
  type SuggestionStory,
} from "./story-suggestion-box";

export function StoryContributeDialog({ story }: { story?: SuggestionStory }) {
  const t = useTranslations("newsStories.contribute");
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground shrink-0"
        >
          {t("entry")}
        </Button>
      </DialogTrigger>
      <DialogContent
        showCloseButton={false}
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto motion-reduce:animate-none"
      >
        <DialogHeader className="text-left">
          <DialogTitle>{t("dialogTitle")}</DialogTitle>
          <DialogDescription>{t("suggestHelp")}</DialogDescription>
        </DialogHeader>
        <StorySuggestionBox story={story} showHeading={false} />
        <div className="border-border flex flex-wrap items-center justify-between gap-3 border-t pt-4 text-sm">
          <Link
            href="/news/stories/contribute#agent-research"
            className="focus-visible:ring-ring inline-flex items-center gap-1 rounded-sm underline underline-offset-4 focus-visible:ring-2 focus-visible:outline-none"
          >
            {t("agentPath")}
            <ArrowUpRight className="size-3.5" aria-hidden />
          </Link>
          <DialogClose asChild>
            <Button variant="ghost" size="sm">
              {t("close")}
            </Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}
