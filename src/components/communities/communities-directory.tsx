"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { TownSquareHero } from "./discover/town-square-hero";
import { DiscoverFacets } from "./discover/discover-facets";
import { DiscoverCommunities, type Facet } from "./discover/discover-communities";
import { DiscoverSpaces } from "./discover/discover-spaces";
import { CreateCommunityDialog } from "./create-community-dialog";

const DEBOUNCE_MS = 300;

export function CommunitiesDirectory() {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [facet, setFacet] = useState<Facet>("trending");
  const ref = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onSearchChange = useCallback((v: string) => {
    setSearch(v);
    if (ref.current) clearTimeout(ref.current);
    ref.current = setTimeout(() => setDebounced(v), DEBOUNCE_MS);
  }, []);
  useEffect(() => () => { if (ref.current) clearTimeout(ref.current); }, []);

  const searching = debounced.trim().length > 0;

  return (
    <div className="mx-auto max-w-5xl px-6 py-16 sm:px-12">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <TownSquareHero search={search} onSearchChange={onSearchChange} />
        </div>
        <div className="shrink-0 pt-1"><CreateCommunityDialog /></div>
      </div>

      <div className="mt-6">
        <DiscoverFacets value={facet} onChange={setFacet} disabled={searching} />
      </div>

      <div className="mt-6">
        <DiscoverCommunities facet={facet} search={debounced} />
      </div>

      <DiscoverSpaces search={debounced} />
    </div>
  );
}
