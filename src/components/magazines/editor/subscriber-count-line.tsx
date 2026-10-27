"use client";

import { useTranslations } from "next-intl";
import { Fragment } from "react";

import { api } from "@/trpc/react";

/** Staff see counts only; this supplementary line stays absent until available. */
export function SubscriberCountLine({ slug }: { slug: string }) {
  const t = useTranslations("magazineEditor.desk");
  const query = api.magazines.subscriberCounts.useQuery({ slug });
  if (query.isLoading || query.isError || !query.data) return null;

  const { withAccount, byEmail, waiting } = query.data;
  const details = [
    ["subscribersWithAccount", withAccount],
    ["subscribersByEmail", byEmail],
    ["subscribersWaiting", waiting],
  ] as const;
  const visible = details.filter(([, count]) => count > 0);

  return (
    <div className="flex flex-col gap-1 text-sm">
      <p>
        {t.rich("subscribers", {
          count: withAccount + byEmail + waiting,
          number: (chunks) => <span className="font-mono">{chunks}</span>,
        })}
      </p>
      {visible.length > 0 && (
        <p className="text-muted-foreground">
          {visible.map(([key, count], index) => (
            <Fragment key={key}>
              {index > 0 && " · "}
              {t.rich(key, {
                count,
                number: (chunks) => <span className="font-mono">{chunks}</span>,
              })}
            </Fragment>
          ))}
        </p>
      )}
    </div>
  );
}
