"use client";

import { use, useEffect, useRef } from "react";
import { api } from "@/trpc/react";
import { useRouter } from "@/i18n/navigation";
import { Loader2 } from "lucide-react";

export default function RedeemInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const router = useRouter();
  const hasFired = useRef(false);

  const mutation = api.communities.redeemInvite.useMutation({
    onSuccess: (data) => {
      router.replace(`/communities/${data.communitySlug}`);
    },
  });

  useEffect(() => {
    if (hasFired.current) return;
    hasFired.current = true;
    mutation.mutate({ token });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (mutation.error) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center">
          <p className="text-destructive text-lg font-medium">
            {mutation.error.message}
          </p>
          <button
            onClick={() => router.replace("/communities")}
            className="text-muted-foreground mt-4 underline"
          >
            Browse communities
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin" />
    </div>
  );
}
