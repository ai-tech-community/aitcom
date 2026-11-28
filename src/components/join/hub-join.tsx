import { Link } from "@/i18n/navigation";
import { JsonLd } from "@/components/json-ld";
import { MemberProof } from "@/components/join/member-proof";
import { PromoteJoinCta } from "@/components/join/promote-join-cta";
import { WeeklyQuestion } from "@/components/join/weekly-question";
import { SectionLabel } from "@/components/ui/section-label";
import {
  JOIN_MEMBER_PROOF,
  JOIN_WEEKLY_QUESTION,
  consentedJoinMembers,
  resolveJoinWeeklyQuestion,
  type ConsentedJoinMember,
  type JoinWeeklyQuestion,
} from "@/lib/join-page-proof";
import { GUIDE_PATHS } from "@/lib/seo-guides";

export type HubJoinKey =
  | "kicker"
  | "title"
  | "lead"
  | "audienceFounders"
  | "audienceJobSeekers"
  | "audienceJobSeekersBody"
  | "audienceBuilders"
  | "audienceBuildersBody"
  | "audienceHosts"
  | "audienceHostsBody"
  | "faqLabel"
  | "faqAddQuestion"
  | "faqAddAnswer"
  | "faqCofounderQuestion"
  | "faqCofounderAnswer"
  | "faqFreeQuestion"
  | "faqFreeAnswer"
  | "memberProofLabel"
  | "weeklyQuestionLabel"
  | "memberKicker"
  | "memberTitle"
  | "memberLead"
  | "cta"
  | "hubCta"
  | "homeLabel"
  | "guideLabel";

const FAQ = [
  ["faqAddQuestion", "faqAddAnswer"],
  ["faqCofounderQuestion", "faqCofounderAnswer"],
  ["faqFreeQuestion", "faqFreeAnswer"],
] as const satisfies ReadonlyArray<readonly [HubJoinKey, HubJoinKey]>;

export function HubJoin({
  t,
  signupHref,
  promoteJoin = true,
  memberProof = consentedJoinMembers(JOIN_MEMBER_PROOF),
  weeklyQuestion = resolveJoinWeeklyQuestion(JOIN_WEEKLY_QUESTION),
}: {
  t: (key: HubJoinKey) => string;
  signupHref: string;
  promoteJoin?: boolean;
  memberProof?: readonly ConsentedJoinMember[];
  weeklyQuestion?: JoinWeeklyQuestion | null;
}) {
  return (
    <div className="mx-auto max-w-6xl px-6 py-16 sm:px-12">
      {promoteJoin ? <JoinFaqJsonLd t={t} /> : null}
      <SectionLabel as="div">
        {promoteJoin ? t("kicker") : t("memberKicker")}
      </SectionLabel>

      <div className="mt-8 max-w-2xl space-y-4">
        <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          {promoteJoin ? t("title") : t("memberTitle")}
        </h1>
        {!promoteJoin && (
          <p className="text-muted-foreground text-lg leading-relaxed">
            {t("memberLead")}
          </p>
        )}
        <div className="pt-2">
          <PromoteJoinCta
            promoteJoin={promoteJoin}
            guestHref={signupHref}
            guestLabel={t("cta")}
            hubLabel={t("hubCta")}
          />
        </div>
        <p className="text-muted-foreground text-sm leading-relaxed">
          <Link href="/" className="underline-offset-4 hover:underline">
            {t("homeLabel")}
          </Link>
          <span aria-hidden="true"> · </span>
          <Link
            href={GUIDE_PATHS.registerAgentMcp}
            className="underline-offset-4 hover:underline"
          >
            {t("guideLabel")}
          </Link>
        </p>
      </div>

      {promoteJoin ? (
        <MemberProof label={t("memberProofLabel")} members={memberProof} />
      ) : null}
      {promoteJoin ? (
        <WeeklyQuestion
          label={t("weeklyQuestionLabel")}
          question={weeklyQuestion}
        />
      ) : null}

      {promoteJoin ? (
        <section className="mt-16 max-w-2xl" aria-labelledby="join-faq">
          <SectionLabel id="join-faq">{t("faqLabel")}</SectionLabel>
          <dl className="mt-6 space-y-6">
            {FAQ.map(([questionKey, answerKey]) => (
              <div key={questionKey}>
                <dt className="text-base font-semibold">{t(questionKey)}</dt>
                <dd className="text-muted-foreground mt-2 leading-relaxed">
                  {t(answerKey)}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}
    </div>
  );
}

function JoinFaqJsonLd({ t }: { t: (key: HubJoinKey) => string }) {
  return (
    <JsonLd
      data={{
        "@type": "FAQPage",
        mainEntity: FAQ.map(([questionKey, answerKey]) => ({
          "@type": "Question",
          name: t(questionKey),
          acceptedAnswer: {
            "@type": "Answer",
            text: t(answerKey),
          },
        })),
      }}
    />
  );
}
