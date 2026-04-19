"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

export function UseMyLocationButton() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [requesting, setRequesting] = useState(false);

  const hasLocation =
    searchParams.has("lat") && searchParams.has("lng");

  const requestLocation = () => {
    if (!navigator.geolocation) {
      toast.error("Geolocation not supported in this browser.");
      return;
    }
    setRequesting(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setRequesting(false);
        const next = new URLSearchParams(searchParams.toString());
        next.set("lat", pos.coords.latitude.toFixed(4));
        next.set("lng", pos.coords.longitude.toFixed(4));
        next.set("sort", "near");
        next.delete("page");
        startTransition(() => {
          router.replace(`${pathname}?${next.toString()}`, { scroll: false });
        });
        toast.success("Location set. Showing nearest events.");
      },
      (err) => {
        setRequesting(false);
        toast.error(
          err.code === err.PERMISSION_DENIED
            ? "Permission denied."
            : "Could not get your location.",
        );
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 },
    );
  };

  const clearLocation = () => {
    const next = new URLSearchParams(searchParams.toString());
    next.delete("lat");
    next.delete("lng");
    if (next.get("sort") === "near") next.delete("sort");
    next.delete("page");
    startTransition(() => {
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  };

  const baseClass =
    "inline-flex items-center gap-1.5 rounded border px-3 py-1.5 font-mono text-[11px] tracking-wider transition-colors";

  if (hasLocation) {
    return (
      <button
        type="button"
        onClick={clearLocation}
        className={cn(
          baseClass,
          "border-foreground bg-foreground text-background hover:bg-foreground/85",
        )}
      >
        <MapPin className="h-3 w-3" />
        USING YOUR LOCATION ✕
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={requestLocation}
      disabled={requesting}
      className={cn(baseClass, "border-border hover:bg-secondary/40")}
    >
      <MapPin className="h-3 w-3" />
      {requesting ? "LOCATING…" : "USE MY LOCATION"}
    </button>
  );
}
