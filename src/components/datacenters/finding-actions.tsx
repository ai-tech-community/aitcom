"use client";

import { useState } from "react";
import { api } from "@/trpc/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

export function FindingActions({
  finding,
  currentUserId,
  isAdmin,
}: {
  finding: {
    id: string;
    userId: string;
    upvotes: number;
    status: string;
  };
  currentUserId: string | null;
  isAdmin: boolean;
}) {
  const [optimisticVotes, setOptimisticVotes] = useState(finding.upvotes);
  const [voted, setVoted] = useState(false);
  const router = useRouter();

  const upvote = api.datacenters.upvoteFinding.useMutation({
    onSuccess: (data) => {
      setOptimisticVotes(data.upvotes);
      setVoted(data.voted);
    },
    onError: (e) => toast.error(e.message),
  });
  const setStatus = api.datacenters.setFindingStatus.useMutation({
    onSuccess: () => {
      toast.success("Status updated");
      router.refresh();
    },
    onError: (e) => toast.error(e.message),
  });
  const remove = api.datacenters.removeFinding.useMutation({
    onSuccess: () => {
      toast.success("Removed");
      router.refresh();
    },
    onError: (e) => toast.error(e.message),
  });

  const canDelete =
    !!currentUserId && (currentUserId === finding.userId || isAdmin);
  const canVote = !!currentUserId;

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => canVote && upvote.mutate({ id: finding.id })}
        disabled={!canVote || upvote.isPending}
        className={`flex items-center gap-1 rounded px-2 py-0.5 text-xs ${
          voted ? "bg-primary text-primary-foreground" : "hover:bg-muted"
        }`}
        title={canVote ? "Upvote" : "Sign in to vote"}
      >
        ▲ {optimisticVotes}
      </button>

      {(isAdmin || canDelete) && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
              ⋯
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {isAdmin && (
              <>
                <DropdownMenuItem
                  onClick={() =>
                    setStatus.mutate({ id: finding.id, status: "verified" })
                  }
                >
                  Mark verified
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    setStatus.mutate({ id: finding.id, status: "disputed" })
                  }
                >
                  Mark disputed
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    setStatus.mutate({ id: finding.id, status: "review" })
                  }
                >
                  Reset to review
                </DropdownMenuItem>
              </>
            )}
            {canDelete && (
              <DropdownMenuItem
                className="text-red-600"
                onClick={() => {
                  if (confirm("Delete finding?"))
                    remove.mutate({ id: finding.id });
                }}
              >
                Delete
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
