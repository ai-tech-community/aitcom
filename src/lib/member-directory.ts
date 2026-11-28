const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/** A headline can reuse an authored short bio or the member's company. */
export function memberHeadline(company?: string | null, bio?: string | null) {
  const companyName = company?.trim();
  if (companyName) return companyName;

  const firstLine = bio?.trim().split(/\r?\n/, 1)[0]?.trim();
  return firstLine && firstLine.length <= 140 ? firstLine : null;
}

export function joinedRecently(joinedAt: Date, now: Date) {
  const age = now.getTime() - joinedAt.getTime();
  return age >= 0 && age <= THIRTY_DAYS_MS;
}

export function showNewMemberBadge(
  joinedAt: Date,
  communityCreatedAt: Date,
  now: Date,
) {
  return (
    now.getTime() - communityCreatedAt.getTime() > THIRTY_DAYS_MS &&
    joinedRecently(joinedAt, now)
  );
}

type RosterSubtitle = {
  headline?: string | null;
  role?: string | null;
  community?: string | null;
};

export function rosterSubtitle({ headline, role, community }: RosterSubtitle) {
  for (const value of [headline, role, community]) {
    const text = value?.trim();
    if (text) return text;
  }
  return null;
}

type RosterIdentity = RosterSubtitle & {
  userId: string;
  name: string;
  handle?: string | null;
  joinedAt?: Date;
};

export type RosterCaption =
  | { kind: "text"; text: string }
  | { kind: "joined"; date: Date; includeTime: boolean };

const nameKey = (value: string) => value.trim().normalize("NFKC").toLowerCase();

function captionsFor(member: RosterIdentity) {
  return [member.headline, member.role, member.community, member.handle];
}

function joinedKey(member: RosterIdentity, includeTime: boolean) {
  return member.joinedAt?.toISOString().slice(0, includeTime ? 19 : 10);
}

/** Use distinguishable public facts for same-name rows that appear together. */
export function rosterCaptions(members: readonly RosterIdentity[]) {
  const names = new Map<string, RosterIdentity[]>();
  const captions = new Map<string, RosterCaption>();
  for (const member of members) {
    const name = nameKey(member.name);
    const group = names.get(name) ?? [];
    group.push(member);
    names.set(name, group);
  }

  for (const group of names.values()) {
    if (group.length < 2) continue;
    for (const member of group) {
      const others = group.filter((other) => other.userId !== member.userId);
      const otherText = new Set(
        others
          .flatMap(captionsFor)
          .flatMap((value) => (value ? [nameKey(value)] : [])),
      );
      const text = captionsFor(member).find(
        (value) => value?.trim() && !otherText.has(nameKey(value)),
      );
      if (text) {
        captions.set(member.userId, { kind: "text", text: text.trim() });
        continue;
      }
      if (!member.joinedAt) continue;
      for (const includeTime of [false, true]) {
        if (
          others.every(
            (other) =>
              joinedKey(other, includeTime) !== joinedKey(member, includeTime),
          )
        ) {
          captions.set(member.userId, {
            kind: "joined",
            date: member.joinedAt,
            includeTime,
          });
          break;
        }
      }
    }
  }

  return captions;
}
