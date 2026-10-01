"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { api } from "@/trpc/react";
import { useRequireAuth } from "@/components/auth/auth-required-dialog";
import { HUB_SLUG } from "@/server/communities/hub";
import {
  viewerJoinAction,
  type JoinPolicy,
  type MembershipStatus,
  type ViewerJoinAction,
} from "@/server/communities/invite-policy";
import type { CommunityRole } from "@/server/communities/role-utils";
import { JOIN_COMMUNITY_PARAM, joinReturnPath } from "./join-community-link";

export type Membership = {
  status: MembershipStatus;
  role: CommunityRole;
};

/**
 * The signed-in viewer's memberships by community slug (empty for guests).
 * One query for the whole page, shared by every join control on it.
 */
export function useMyMemberships(): ReadonlyMap<string, Membership> {
  const { authStatus } = useRequireAuth();
  const query = api.communities.getMyCommunities.useQuery(undefined, {
    enabled: authStatus === "authenticated",
  });
  return useMemo(
    () =>
      new Map(
        (query.data ?? []).map((m) => [
          m.slug,
          { status: m.status, role: m.role },
        ]),
      ),
    [query.data],
  );
}

/** Join, request or leave, with the caches every join control reads. */
function useJoinMutations(slug: string) {
  const utils = api.useUtils();
  const refresh = () => {
    void utils.communities.getMyCommunities.invalidate();
    void utils.communities.getBySlug.invalidate({ slug });
    void utils.communities.getMembers.invalidate({ slug });
    void utils.communities.directory.invalidate();
  };
  return {
    join: api.communities.join.useMutation({ onSuccess: refresh }),
    request: api.communities.requestToJoin.useMutation({ onSuccess: refresh }),
    leave: api.communities.leave.useMutation({ onSuccess: refresh }),
  };
}

export type CommunityJoin = {
  action: ViewerJoinAction;
  /** Joins or requests; a guest is asked to sign in and comes back joined. */
  run: () => Promise<void>;
  leave: () => Promise<void>;
  busy: boolean;
};

/**
 * One community's join control state and actions, following
 * `viewerJoinAction`. `membership` overrides the page-wide lookup when the
 * caller already knows it (e.g. the community page's server data).
 */
export function useCommunityJoin({
  slug,
  name,
  joinPolicy,
  membership,
  onChange,
}: {
  slug: string;
  /** For messages ("You're in …"); generic wording when absent. */
  name?: string;
  joinPolicy: JoinPolicy;
  membership?: Membership | null;
  /** After a successful join, request or leave (e.g. refresh server data). */
  onChange?: () => void;
}): CommunityJoin {
  const t = useTranslations("communities.discover");
  const { authStatus, promptAuth } = useRequireAuth();
  const mine = useMyMemberships();
  const mutations = useJoinMutations(slug);
  const [busy, setBusy] = useState(false);

  const current =
    membership !== undefined ? membership : (mine.get(slug) ?? null);
  const action = viewerJoinAction({
    joinPolicy,
    status: current?.status ?? null,
    role: current?.role ?? null,
    isHub: slug === HUB_SLUG,
  });

  const perform = async (work: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await work();
      toast.success(done);
      onChange?.();
    } catch {
      // tRPC errors are shown by the global error handler.
    } finally {
      setBusy(false);
    }
  };

  const said = (key: "joined" | "requested" | "left" | "signInToJoin") =>
    name ? t(key, { community: name }) : t(`${key}Generic`);

  const run = async () => {
    if (authStatus !== "authenticated") {
      const here = `${window.location.pathname}${window.location.search}`;
      promptAuth(said("signInToJoin"), {
        returnTo: joinReturnPath(here, slug),
      });
      return;
    }
    if (action.kind === "join") {
      await perform(() => mutations.join.mutateAsync({ slug }), said("joined"));
    } else if (action.kind === "request") {
      await perform(
        () => mutations.request.mutateAsync({ slug }),
        said("requested"),
      );
    }
  };

  const leave = async () => {
    if (action.kind !== "member" || !action.canLeave) return;
    await perform(() => mutations.leave.mutateAsync({ slug }), said("left"));
  };

  return { action, run, leave, busy };
}

/**
 * Finishes a join a guest started before signing in: on `?join=<slug>`,
 * once signed in, joins (or requests to join) that community, then drops
 * the param so refresh or Back does not repeat it. Runs once per page;
 * mounted wherever a join control can send a guest to sign in (the
 * directory and the community pages).
 */
export function useJoinDeepLink(onDone?: () => void): void {
  const t = useTranslations("communities.discover");
  const { authStatus } = useRequireAuth();
  const utils = api.useUtils();
  const join = api.communities.join.useMutation();
  const request = api.communities.requestToJoin.useMutation();
  const handled = useRef(false);
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  });

  useEffect(() => {
    if (handled.current || authStatus !== "authenticated") return;
    const url = new URL(window.location.href);
    const slug = url.searchParams.get(JOIN_COMMUNITY_PARAM);
    if (!slug) return;
    handled.current = true;
    url.searchParams.delete(JOIN_COMMUNITY_PARAM);
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );

    void (async () => {
      try {
        const [community, mine] = await Promise.all([
          utils.communities.getBySlug.fetch({ slug }),
          utils.communities.getMyCommunities.fetch(),
        ]);
        const membership = mine.find((m) => m.slug === slug);
        const action = viewerJoinAction({
          joinPolicy: community.joinPolicy,
          status: membership?.status ?? null,
          role: membership?.role ?? null,
          isHub: slug === HUB_SLUG,
        });
        if (action.kind === "join") {
          await join.mutateAsync({ slug });
          toast.success(t("joined", { community: community.name }));
        } else if (action.kind === "request") {
          await request.mutateAsync({ slug });
          toast.success(t("requested", { community: community.name }));
        } else {
          return;
        }
        void utils.communities.getMyCommunities.invalidate();
        void utils.communities.getBySlug.invalidate({ slug });
        void utils.communities.getMembers.invalidate({ slug });
        void utils.communities.directory.invalidate();
        onDoneRef.current?.();
      } catch {
        // tRPC errors are shown by the global error handler.
      }
    })();
  }, [authStatus, join, request, t, utils]);
}
