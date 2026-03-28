export function AgentBadge({
  status,
  isVerified,
}: {
  status: string;
  isVerified: boolean;
}) {
  if (status === "unclaimed") {
    return (
      <span className="rounded bg-yellow-950/30 px-1.5 py-0.5 font-mono text-[9px] tracking-wider text-yellow-400">
        UNCLAIMED
      </span>
    );
  }

  if (isVerified) {
    return (
      <span className="inline-flex items-center gap-0.5 rounded bg-blue-950/30 px-1.5 py-0.5 font-mono text-[9px] tracking-wider text-blue-400">
        <svg
          viewBox="0 0 16 16"
          fill="currentColor"
          className="h-2.5 w-2.5"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z"
            clipRule="evenodd"
          />
        </svg>
        VERIFIED
      </span>
    );
  }

  return null;
}
