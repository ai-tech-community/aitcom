import { queryOptions, useQueries, useQuery } from "@tanstack/react-query";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
  COMMUNITY_SLUG_MAX_LENGTH,
  generateSlug,
  isValidCommunitySlug,
} from "@/server/communities/slug-utils";
import { api } from "@/trpc/react";

type Lookup = ReturnType<
  typeof api.useUtils
>["client"]["communities"]["isSlugAvailable"];
type AddressStatus =
  | "empty"
  | "invalid"
  | "checking"
  | "clear"
  | "taken"
  | "checkFailed";

function addressQuery(lookup: Lookup, slug: string) {
  return queryOptions({
    queryKey: ["community-creation-slug-availability", slug],
    staleTime: 0,
    retry: false,
    queryFn: ({ signal }) => lookup.query({ slug }, { signal }),
  });
}

function getSuggestions(
  nameAddress: string,
  address: string,
  suffixes: readonly string[],
) {
  const seen = new Set([address, nameAddress]);
  return suffixes.flatMap((suffix) => {
    const ending = generateSlug(suffix);
    const base = (nameAddress || address).slice(
      0,
      COMMUNITY_SLUG_MAX_LENGTH - ending.length - 1,
    );
    const slug = generateSlug(`${base}-${ending}`);
    if (seen.has(slug) || !isValidCommunitySlug(slug)) return [];
    seen.add(slug);
    return [slug];
  });
}

export function useCreationAddress({
  name,
  customAddress,
  conflict,
  suffixes,
}: {
  name: string;
  customAddress: string | null;
  conflict: boolean;
  suffixes: readonly string[];
}) {
  const nameAddress = generateSlug(name);
  const address = customAddress ?? nameAddress;
  const valid =
    (customAddress !== null || name.length >= 2) &&
    isValidCommunitySlug(address);
  const candidate = useDebouncedValue(valid ? address : "", 300);
  const { client } = api.useUtils();
  const lookup = client.communities.isSlugAvailable;
  const check = useQuery({
    ...addressQuery(lookup, candidate),
    enabled: valid && address === candidate && !conflict,
  });

  let status: AddressStatus;
  if (!name && customAddress === null) status = "empty";
  else if (!valid) status = "invalid";
  else if (conflict) status = "taken";
  else if (address !== candidate || check.isPending || check.isFetching)
    status = "checking";
  else if (!check.isSuccess) status = "checkFailed";
  else if (check.data.available) status = "clear";
  else status = check.data.reason === "invalid" ? "invalid" : "taken";

  const suggested =
    status === "taken" && name.length >= 2
      ? getSuggestions(nameAddress, address, suffixes)
      : [];
  const canCheckName =
    status === "taken" &&
    customAddress !== null &&
    address !== nameAddress &&
    isValidCommunitySlug(nameAddress);
  const nameCheck = useQuery({
    ...addressQuery(lookup, nameAddress),
    enabled: canCheckName,
  });
  const checks = useQueries({
    queries: suggested.map((slug) => addressQuery(lookup, slug)),
  });
  const checkingAlternatives = checks.some(
    (check) => check.isPending || check.isFetching,
  );

  return {
    address,
    status,
    // Publish the ranked choices together so a late lookup cannot replace
    // a suggestion the user is about to pick.
    alternatives: checkingAlternatives
      ? []
      : suggested
          .filter((_, index) => {
            const check = checks[index];
            return check?.isSuccess && check.data.available;
          })
          .slice(0, 2),
    checkingAlternatives,
    canUseNameAddress:
      canCheckName &&
      nameCheck.isSuccess &&
      nameCheck.data.available &&
      !nameCheck.isFetching,
  };
}
