"use client";

import { useRouter } from "@/i18n/navigation";
import { ErrorState } from "@/components/ui/error-state";

export function MemberLoadError() {
  const router = useRouter();
  return (
    <ErrorState
      onRetry={() => router.refresh()}
      className="[&_button]:min-h-11"
    />
  );
}
