"use client";

import { useState } from "react";
import { Link2, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

type Props = {
  windowDays: 7 | 30 | 90;
  onWindowChange: (w: 7 | 30 | 90) => void;
  getShareUrl: () => string;
};

export function HeroActions({
  windowDays,
  onWindowChange,
  getShareUrl,
}: Props) {
  const t = useTranslations("benchmark");
  const [open, setOpen] = useState(false);

  const onShare = async () => {
    try {
      await navigator.clipboard.writeText(getShareUrl());
      toast.success(t("hero.copied"));
    } catch {
      toast.error(t("hero.copyFailed"));
    }
  };

  return (
    <div className="flex justify-end gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm">
            <SlidersHorizontal className="mr-2 h-4 w-4" />
            {t("hero.options")}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-muted-foreground text-xs uppercase tracking-wide">
                {t("hero.window.label")}
              </label>
              <Select
                value={String(windowDays)}
                onValueChange={(v) =>
                  onWindowChange(Number(v) as 7 | 30 | 90)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">{t("hero.window.7")}</SelectItem>
                  <SelectItem value="30">{t("hero.window.30")}</SelectItem>
                  <SelectItem value="90">{t("hero.window.90")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      <Button variant="outline" size="sm" onClick={onShare}>
        <Link2 className="mr-2 h-4 w-4" />
        {t("hero.share")}
      </Button>
    </div>
  );
}
