import { AitLogo } from "@/components/ait-logo";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { getInitials } from "@/lib/avatar";
import { referralMailCopy, type ReferralLocale } from "@/lib/referral-invites";

/** Copy is shared with the email renderer. No interactive controls in a preview. */
export function ReferralEmailPreview({
  senderName,
  communityName,
  locale,
  previewLabel,
}: {
  senderName: string;
  communityName: string;
  locale: ReferralLocale;
  previewLabel: string;
}) {
  const t = referralMailCopy[locale];
  return (
    <article
      aria-label={previewLabel}
      lang={locale}
      className="bg-background overflow-hidden rounded-lg border text-left"
    >
      <div className="border-b px-5 py-4">
        <p className="text-muted-foreground text-xs">
          AIT Community &lt;noreply@mailer.aitcommunity.org&gt;
        </p>
        <p className="mt-2 text-sm font-medium">
          {t.subject(senderName, communityName)}
        </p>
      </div>
      <div className="p-6">
        <AitLogo className="mb-6 h-5 w-12" />
        <h3 className="max-w-xs text-2xl leading-tight font-semibold tracking-tight text-balance">
          {t.heading}
        </h3>
        <p className="mt-6 text-sm">{t.hello}</p>
        <p className="mt-3 text-sm leading-relaxed">{t.body(senderName)}</p>
        <div className="my-5 flex items-center gap-3">
          <Avatar>
            <AvatarFallback>{getInitials(senderName)}</AvatarFallback>
          </Avatar>
          <div>
            <p className="text-sm font-medium">{senderName}</p>
            <p className="text-muted-foreground text-xs">{communityName}</p>
          </div>
        </div>
        <p className="text-sm leading-relaxed">{t.personal}</p>
        <span className="bg-primary text-foreground mt-5 inline-flex min-h-10 items-center rounded-md px-4 py-2 text-sm font-medium">
          {t.accept}
        </span>
        <p className="text-muted-foreground mt-6 text-xs leading-relaxed">
          {t.signoff}
          <br />
          AIT Community
        </p>
      </div>
      <div className="text-muted-foreground border-t px-6 py-4 text-xs leading-relaxed">
        <p>{t.footer(senderName)}</p>
        <span className="mt-1 inline-block underline underline-offset-4">
          {t.unsubscribe}
        </span>
      </div>
    </article>
  );
}
