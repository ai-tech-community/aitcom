"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Input } from "@/components/ui/input";

export function MemberSearch() {
  const t = useTranslations("members");
  const router = useRouter();
  const [search, setSearch] = useState("");

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    // For MVP, we'll use URL search params and server-side revalidation
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    router.push(`/members${params.toString() ? `?${params.toString()}` : ""}`);
  };

  return (
    <form onSubmit={handleSearch} className="mt-6">
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t("search")}
        className="max-w-sm font-mono text-xs"
      />
    </form>
  );
}
