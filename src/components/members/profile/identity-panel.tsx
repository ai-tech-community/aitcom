import { Pencil } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { getInitials } from "@/lib/avatar";
import { PROFILE_SETTINGS_HREF } from "@/lib/dashboard-routes";
import { calculateLevel, tierForXp } from "@/lib/gamification";
import type { ProfileCommunity } from "@/server/members/profile-communities";
import type { MemberProfileData } from "@/server/members/profile-page";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/section-label";
import { MessageMemberButton } from "@/components/message-member-button";
import { VerifiedSocials } from "@/components/verified-socials";

import { XpProgress } from "./xp-progress";

/**
 * Who the member is: the profile frame's left panel on large screens and
 * its compact header above the tabs on small ones. Holds the page's one h1.
 */
export async function IdentityPanel({
  data,
  communities,
  viewerSignedIn,
}: {
  data: MemberProfileData;
  communities: readonly ProfileCommunity[];
  viewerSignedIn: boolean;
}) {
  const [t, tMembers, tTiers, format] = await Promise.all([
    getTranslations("memberProfile"),
    getTranslations("members"),
    getTranslations("tiers"),
    getFormatter(),
  ]);
  const { profile, social } = data;
  const isOwner = data.audience === "owner";
  const avatarUrl = data.user?.avatarUrl ?? data.user?.image ?? null;
  const level = calculateLevel(profile.xp);
  const websiteUrl = social.website?.url ?? profile.websiteUrl;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4 lg:flex-col lg:items-start">
        <Avatar className="size-14 lg:size-20">
          {avatarUrl && <AvatarImage src={avatarUrl} alt="" />}
          <AvatarFallback className="font-mono text-base lg:text-xl">
            {getInitials(profile.displayName)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-balance wrap-break-word">
            {profile.displayName}
          </h1>
          <p className="text-muted-foreground font-mono text-xs">
            {t("levelTier", {
              level,
              tier: tTiers(tierForXp(profile.xp).key),
            })}
          </p>
        </div>
      </div>

      <XpProgress xp={profile.xp} />

      {[profile.company, social.github, social.linkedin, websiteUrl].some(
        Boolean,
      ) && (
        <div className="space-y-2">
          {profile.company && (
            <p className="text-muted-foreground text-sm wrap-break-word">
              {t("company", { company: profile.company })}
            </p>
          )}
          <VerifiedSocials
            github={social.github}
            linkedin={social.linkedin}
            websiteUrl={websiteUrl}
            githubLabel={tMembers("github")}
            linkedinLabel={tMembers("linkedin")}
            websiteLabel={tMembers("website")}
            verifiedLabel={tMembers("verified")}
          />
        </div>
      )}

      {isOwner ? (
        <Button asChild variant="outline" size="sm" className="gap-2">
          <Link href={PROFILE_SETTINGS_HREF}>
            <Pencil aria-hidden className="size-3.5" />
            {t("editProfile")}
          </Link>
        </Button>
      ) : (
        viewerSignedIn && <MessageMemberButton recipientId={profile.userId} />
      )}

      <p className="text-muted-foreground text-xs">
        {t("memberSince", {
          date: format.dateTime(profile.createdAt, {
            month: "long",
            year: "numeric",
          }),
        })}
      </p>

      {(communities.length > 0 || isOwner) && (
        <section aria-labelledby="profile-communities" className="space-y-3">
          <SectionLabel id="profile-communities">
            {t("communities.title")}
          </SectionLabel>
          {communities.length > 0 ? (
            <ul className="flex flex-wrap gap-2 lg:flex-col lg:gap-1">
              {communities.map((community) => (
                <li key={community.slug}>
                  <Link
                    href={`/communities/${community.slug}`}
                    className="hover:bg-secondary/50 focus-visible:ring-ring/50 flex min-h-8 items-center gap-2 rounded-md pr-2 text-sm outline-none focus-visible:ring-[3px] lg:-mx-1 lg:px-1"
                  >
                    <Avatar size="sm" className="rounded-md">
                      {community.logoUrl && (
                        <AvatarImage src={community.logoUrl} alt="" />
                      )}
                      <AvatarFallback className="rounded-md font-mono text-xs">
                        {getInitials(community.name)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="min-w-0 truncate">{community.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground text-sm">
              {t("communities.ownerEmpty")}{" "}
              <Link
                href="/communities"
                className="text-foreground underline underline-offset-4"
              >
                {t("communities.ownerEmptyCta")}
              </Link>
            </p>
          )}
        </section>
      )}
    </div>
  );
}

/**
 * The panel for an owner who has no profile yet: only their account name
 * and avatar. The Overview tells them how to set the profile up.
 */
export function SetupIdentityPanel({
  name,
  avatarUrl,
}: {
  name: string;
  avatarUrl: string | null;
}) {
  return (
    <div className="flex items-center gap-4 lg:flex-col lg:items-start">
      <Avatar className="size-14 lg:size-20">
        {avatarUrl && <AvatarImage src={avatarUrl} alt="" />}
        <AvatarFallback className="font-mono text-base lg:text-xl">
          {getInitials(name)}
        </AvatarFallback>
      </Avatar>
      <h1 className="min-w-0 text-2xl font-semibold tracking-tight text-balance wrap-break-word">
        {name}
      </h1>
    </div>
  );
}
