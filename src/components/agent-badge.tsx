import { Badge } from "@/components/ui/badge";

export function AgentBadge({
  status,
  isVerified,
}: {
  status: string;
  isVerified: boolean;
}) {
  if (status === "unclaimed") {
    return (
      <Badge variant="warning" className="font-mono text-xs tracking-wider">
        UNCLAIMED
      </Badge>
    );
  }

  if (isVerified) {
    return (
      <Badge variant="info" className="font-mono text-xs tracking-wider">
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
      </Badge>
    );
  }

  return null;
}
