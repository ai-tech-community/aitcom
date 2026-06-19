"use client";
import { useState } from "react";
import { useTranslations, useFormatter } from "next-intl";
import { api } from "@/trpc/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";

const WELCOME_TEMPLATE =
  "Hi! Welcome to the community — glad you joined. Anything I can help you get started with?";

function WelcomeComposer({
  slug,
  memberUserId,
}: {
  slug: string;
  memberUserId: string;
}) {
  const utils = api.useUtils();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState(WELCOME_TEMPLATE);
  const [sent, setSent] = useState(false);

  const sendWelcome = api.insights.sendWelcome.useMutation({
    onSuccess: async () => {
      setSent(true);
      setOpen(false);
      await utils.insights.unactivatedNewcomers.invalidate({ slug });
    },
  });

  if (sent) {
    return <p className="text-muted-foreground text-xs">Welcome sent ✓</p>;
  }

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Send welcome
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        rows={3}
        maxLength={2000}
        className="text-sm"
        aria-label="Welcome message"
      />
      {sendWelcome.error ? (
        <p className="text-destructive text-xs">
          {sendWelcome.error.message || "Could not send. Try again."}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={sendWelcome.isPending || message.trim().length === 0}
          onClick={() =>
            sendWelcome.mutate({ slug, memberUserId, message: message.trim() })
          }
        >
          {sendWelcome.isPending ? "Sending…" : "Send"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={sendWelcome.isPending}
          onClick={() => setOpen(false)}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

export function UnactivatedList({ slug }: { slug: string }) {
  const t = useTranslations("communities.insights");
  const format = useFormatter();
  const { data, isLoading, isError, refetch } =
    api.insights.unactivatedNewcomers.useQuery({
      slug,
    });
  return (
    <div className="rounded-lg border">
      <div className="border-b p-4">
        <h3 className="text-sm font-semibold">{t("newcomersTitle")}</h3>
        <p className="text-muted-foreground text-xs">
          {t("newcomersSubtitle")}
        </p>
      </div>
      {isLoading ? (
        <div
          role="status"
          aria-label={t("loading")}
          className="h-24 animate-pulse"
        />
      ) : isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : !data || data.length === 0 ? (
        <EmptyState title={t("unactivatedEmpty")} />
      ) : (
        <div className="divide-y">
          {data.map((m) => (
            <div
              key={m.userId}
              className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-center gap-3">
                <Avatar>
                  {m.image ? (
                    <AvatarImage src={m.image} alt={m.displayName ?? ""} />
                  ) : null}
                  <AvatarFallback>
                    {(m.displayName ?? "?")[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-medium">
                    {m.displayName ?? "Member"}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {t("newcomersJoined", {
                      date: format.dateTime(new Date(m.joinedAt), {
                        dateStyle: "medium",
                      }),
                    })}
                  </p>
                </div>
              </div>
              <div className="sm:w-72 sm:shrink-0">
                <WelcomeComposer slug={slug} memberUserId={m.userId} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
