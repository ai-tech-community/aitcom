"use client";

import { useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function BrandSearchWidget() {
  const [slug, setSlug] = useState("");
  return (
    <div className="flex flex-col gap-3 rounded-md border p-4">
      <h3 className="text-sm font-medium">Brand profile</h3>
      <div className="flex gap-2">
        <Input placeholder="brand slug" value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} />
        <Button asChild disabled={!slug}>
          <Link href={`/benchmark/brands/${slug}`}>Open</Link>
        </Button>
      </div>
    </div>
  );
}
