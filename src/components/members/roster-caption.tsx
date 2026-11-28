import { useFormatter, useTranslations } from "next-intl";
import type { RosterCaption } from "@/lib/member-directory";

export function RosterCaptionText({ caption }: { caption: RosterCaption }) {
  const t = useTranslations("redesign.members");
  const format = useFormatter();
  switch (caption.kind) {
    case "text":
      return caption.text;
    case "joined":
      return t("rosterJoined", {
        date: format.dateTime(caption.date, {
          month: "short",
          day: "numeric",
          year: "numeric",
          timeZone: "UTC",
          ...(caption.includeTime && {
            hour: "numeric",
            minute: "2-digit",
            second: "2-digit",
            timeZoneName: "short",
          }),
        }),
      });
  }
}
