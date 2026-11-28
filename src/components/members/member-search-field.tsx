import type { ComponentProps } from "react";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";

export function MemberSearchField({
  label,
  ...props
}: Omit<ComponentProps<"input">, "type"> & { label: string }) {
  return (
    <label className="relative block min-w-0">
      <span className="sr-only">{label}</span>
      <Search
        aria-hidden
        className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
      />
      <Input type="search" className="min-h-11 pl-9 shadow-none" {...props} />
    </label>
  );
}
