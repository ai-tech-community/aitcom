import { MemberProofTile } from "@/components/join/member-proof-tile";
import { SectionLabel } from "@/components/ui/section-label";
import type { ConsentedJoinMember } from "@/lib/join-page-proof";

/** Name, role, and one consented line. Renders nothing when the list is empty. */
export function MemberProof({
  label,
  members,
}: {
  label: string;
  members: readonly ConsentedJoinMember[];
}) {
  if (members.length === 0) return null;

  return (
    <section className="mt-16" aria-labelledby="join-member-proof">
      <SectionLabel id="join-member-proof">{label}</SectionLabel>
      <ul className="mt-6 flex flex-col gap-6 sm:flex-row sm:flex-wrap">
        {members.map((member) => (
          <li
            key={`${member.name}-${member.role}`}
            className="flex max-w-xs gap-3"
          >
            <MemberProofTile name={member.name} photoUrl={member.photoUrl} />
            <div className="min-w-0">
              <p className="font-semibold">{member.name}</p>
              <p className="text-muted-foreground text-sm">{member.role}</p>
              <p className="mt-1 text-sm leading-relaxed" dir="auto">
                {member.line}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
