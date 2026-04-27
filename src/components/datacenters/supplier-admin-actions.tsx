"use client";

import { api } from "@/trpc/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function SupplierAdminActions({
  id,
  verified,
}: {
  id: string;
  verified: boolean;
}) {
  const router = useRouter();
  const verify = api.datacenters.verifySupplier.useMutation({
    onSuccess: () => router.refresh(),
    onError: (e) => toast.error(e.message),
  });
  const remove = api.datacenters.removeSupplier.useMutation({
    onSuccess: () => {
      toast.success("Removed");
      router.refresh();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => verify.mutate({ id, verified: !verified })}
        title={verified ? "Mark unverified" : "Mark verified"}
        className="h-6 px-2 text-xs"
      >
        {verified ? "✓" : "○"}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          if (confirm("Remove supplier?")) remove.mutate({ id });
        }}
        className="h-6 px-2 text-xs text-red-600"
      >
        ×
      </Button>
    </div>
  );
}
