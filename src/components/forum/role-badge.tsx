"use client";

type Role = "admin" | "moderator" | "contributor" | "member";

const roleStyles: Record<Role, string> = {
  admin: "bg-orange-100 text-orange-700",
  moderator: "bg-blue-100 text-blue-700",
  contributor: "bg-green-100 text-green-700",
  member: "bg-zinc-100 text-zinc-500",
};

export function RoleBadge({ role }: { role?: string | null }) {
  if (!role || role === "member") return null;
  return (
    <span
      className={`rounded-full px-1.5 py-0.5 font-mono text-[8px] font-semibold uppercase tracking-wider ${roleStyles[role as Role] ?? roleStyles.member}`}
    >
      {role}
    </span>
  );
}
