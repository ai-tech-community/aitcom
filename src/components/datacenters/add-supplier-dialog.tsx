"use client";

import { useState } from "react";
import { api } from "@/trpc/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

const CATEGORIES = [
  { v: "gc", l: "General contractor" },
  { v: "civil", l: "Civil/site work" },
  { v: "electrical", l: "Electrical" },
  { v: "transformer", l: "Transformers / switchgear" },
  { v: "backup-power", l: "Generators / UPS" },
  { v: "cooling", l: "Cooling / HVAC" },
  { v: "fiber", l: "Networking / fiber" },
  { v: "hardware", l: "GPU / hardware" },
  { v: "security", l: "Security" },
  { v: "staffing", l: "Staffing / operations" },
  { v: "other", l: "Other" },
] as const;

type Category = (typeof CATEGORIES)[number]["v"];

interface BrandHit {
  id: string;
  slug: string;
  canonicalName: string;
  website: string | null;
}

export function AddSupplierDialog({ datacenterId }: { datacenterId: string }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [selectedBrand, setSelectedBrand] = useState<BrandHit | null>(null);
  const [category, setCategory] = useState<Category>("gc");
  const [role, setRole] = useState("");
  const [contractValueUsd, setContractValueUsd] = useState("");
  const [isLocal, setIsLocal] = useState(false);
  const [sourceUrl, setSourceUrl] = useState("");
  const sourceUrlTrimmed = sourceUrl.trim();
  const sourceUrlValid = /^https?:\/\/\S+/.test(sourceUrlTrimmed);

  const router = useRouter();
  const search = api.datacenters.searchBrands.useQuery(
    { q, limit: 8 },
    { enabled: q.length >= 2 && !selectedBrand },
  );
  const createBrand = api.datacenters.createBrand.useMutation();
  const addSupplier = api.datacenters.addSupplier.useMutation();

  function reset() {
    setQ("");
    setSelectedBrand(null);
    setCategory("gc");
    setRole("");
    setContractValueUsd("");
    setIsLocal(false);
    setSourceUrl("");
  }

  async function submit() {
    try {
      let brand = selectedBrand;
      if (!brand && q.trim().length >= 2) {
        const created = await createBrand.mutateAsync({
          canonicalName: q.trim(),
          website: sourceUrlTrimmed,
        });
        if (!created) throw new Error("Failed to create brand");
        brand = {
          id: created.id,
          slug: created.slug,
          canonicalName: created.canonicalName,
          website: null,
        };
      }
      if (!brand) {
        toast.error("Pick or type a supplier company");
        return;
      }
      await addSupplier.mutateAsync({
        datacenterId,
        supplierBrandId: brand.id,
        category,
        role: role.trim() || undefined,
        contractValueUsd: contractValueUsd
          ? Number(contractValueUsd)
          : undefined,
        isLocal,
        sources: [{ url: sourceUrlTrimmed }],
      });
      toast.success("Supplier added (pending verification)");
      setOpen(false);
      reset();
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          + Add supplier
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a supplier</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div>
            <Label>Supplier company</Label>
            <Input
              value={selectedBrand ? selectedBrand.canonicalName : q}
              onChange={(e) => {
                setQ(e.target.value);
                setSelectedBrand(null);
              }}
              placeholder="Search or type a new company name"
            />
            {q.length >= 2 &&
              !selectedBrand &&
              search.data &&
              search.data.length > 0 && (
                <ul className="border-border mt-1 max-h-48 overflow-y-auto rounded border">
                  {search.data.map((b) => (
                    <li key={b.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedBrand(b as BrandHit)}
                        className="hover:bg-muted w-full px-3 py-1.5 text-left text-sm"
                      >
                        {b.canonicalName}
                        <span className="text-muted-foreground ml-2 text-xs">
                          {b.slug}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            {q.length >= 2 && !selectedBrand && search.data?.length === 0 && (
              <p className="text-muted-foreground mt-1 text-xs">
                No match. Submitting will create new brand &quot;{q.trim()}
                &quot;.
              </p>
            )}
          </div>

          <div>
            <Label>Category</Label>
            <Select
              value={category}
              onValueChange={(v) => setCategory(v as Category)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c.v} value={c.v}>
                    {c.l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Role / scope (optional)</Label>
            <Input
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="Phase 2 GC, primary fiber backbone, ..."
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Contract value (USD)</Label>
              <Input
                type="number"
                value={contractValueUsd}
                onChange={(e) => setContractValueUsd(e.target.value)}
                placeholder="e.g. 50000000"
              />
            </div>
            <div className="flex flex-col">
              <Label>Local supplier</Label>
              <label className="mt-2 inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={isLocal}
                  onChange={(e) => setIsLocal(e.target.checked)}
                />
                Same region as facility
              </label>
            </div>
          </div>

          <div>
            <Label htmlFor="source-url">Source URL (required)</Label>
            <Input
              id="source-url"
              type="url"
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              placeholder="https://..."
              required
              aria-required="true"
            />
            <p className="text-muted-foreground mt-1 text-xs">
              A public link that documents this supplier relationship. Reused as
              the brand source if a new supplier is created.
            </p>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={submit}
              disabled={
                addSupplier.isPending ||
                createBrand.isPending ||
                !sourceUrlValid ||
                (!selectedBrand && q.trim().length < 2)
              }
            >
              {addSupplier.isPending || createBrand.isPending
                ? "Saving..."
                : "Add"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
