"use client";
import { Star } from "lucide-react";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { useRequireAuth } from "@/components/auth/auth-required-dialog";
import { toast } from "sonner";

interface Props {
  brandSlug: string;
  isAuthenticated: boolean;
}

export function WatchBrandButton({ brandSlug, isAuthenticated }: Props) {
  const utils = api.useUtils();
  const { promptAuth } = useRequireAuth();
  const isWatched = api.benchmark.brands.isWatched.useQuery(
    { brandSlug },
    { enabled: isAuthenticated },
  );

  const watch = api.benchmark.brands.watch.useMutation({
    onSuccess: () => {
      toast.success("Watching this brand. You'll get alerts on big shifts.");
      void utils.benchmark.brands.isWatched.invalidate({ brandSlug });
      void utils.benchmark.brands.listMyWatches.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });
  const unwatch = api.benchmark.brands.unwatch.useMutation({
    onSuccess: () => {
      toast.success("Unwatched.");
      void utils.benchmark.brands.isWatched.invalidate({ brandSlug });
      void utils.benchmark.brands.listMyWatches.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  if (!isAuthenticated) {
    return (
      <Button
        size="sm"
        variant="outline"
        onClick={() => promptAuth("Sign in to watch this brand")}
      >
        <Star className="mr-1 h-3.5 w-3.5" />
        Watch
      </Button>
    );
  }

  const watched = isWatched.data?.watched ?? false;
  const pending = watch.isPending || unwatch.isPending;

  return (
    <Button
      size="sm"
      variant={watched ? "secondary" : "outline"}
      disabled={pending}
      onClick={() => {
        if (watched) unwatch.mutate({ brandSlug });
        else watch.mutate({ brandSlug });
      }}
    >
      <Star className={`mr-1 h-3.5 w-3.5 ${watched ? "fill-current" : ""}`} />
      {watched ? "Watching" : "Watch"}
    </Button>
  );
}
