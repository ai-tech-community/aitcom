"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { api } from "@/trpc/react";
import { useRequireAuth } from "@/components/auth/auth-required-dialog";
import { useInitialAuthUser } from "@/components/auth/session-provider";
import { HUB_SLUG } from "@/server/communities/hub";
import {
  viewerJoinAction,
  type JoinPolicy,
  type MembershipStatus,
  type ViewerJoinAction,
} from "@/server/communities/invite-policy";
import type { CommunityRole } from "@/server/communities/role-utils";
import {
  JOIN_COMMUNITY_PARAM,
  joinReturnPath,
  rememberJoinIntent,
  takeJoinIntent,
} from "./join-community-link";

export type Membership = {
  status: MembershipStatus;
  role: CommunityRole;
};

/**
 * Whether the viewer is signed in. Trusts the client session once it has
 * answered; while it is still loading (or failed to load) it trusts the
 * user the server rendered the page for, so a member who clicks early is
 * never asked to sign in.
 */
export function useViewerSignedIn(): boolean {
  const { authStatus } = useRequireAuth();
  const initialUser = useInitialAuthUser();
  if (authStatus === "authenticated") return true;
  if (authStatus === "guest") return false;
  return !!initialUser?.id;
}

/**
 * The signed-in viewer's memberships by community slug (empty for guests).
 * One query for the whole page, shared by every join control on it.
 */
export function useMyMemberships(): ReadonlyMap<string, Membership> {
  const signedIn = useViewerSignedIn();
  const query = api.communities.getMyCommunities.useQuery(undefined, {
    enabled: signedIn,
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

// ─── A join finishing in the background (after sign-in) ────────────────────

let finishingSlug: string | null = null;
const listeners = new Set<() => void>();

function setFinishingSlug(slug: string | null) {
  finishingSlug = slug;
  for (const listener of listeners) listener();
}

/** The slug a deep-link join is finishing, so its controls show busy. */
function useFinishingSlug(): string | null {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    () => finishingSlug,
    () => null,
  );
}

// ─── The one way a join, request or leave is performed ─────────────────────

type Verb = "join" | "request" | "leave";

const SAID: Record<Verb, { done: string; failed: string }> = {
  join: { done: "joined", failed: "joinFailed" },
  request: { done: "requested", failed: "requestFailed" },
  leave: { done: "left", failed: "leaveFailed" },
};

/**
 * Runs a membership change for a community and refreshes what reads it:
 * the viewer's memberships and that community's page data. The directory
 * is left alone — its counts come from a cached snapshot, and re-sorting it
 * under the pointer would move the card that was just joined.
 */
function useMembershipRunner() {
  const t = useTranslations("communities.discover");
  const utils = api.useUtils();
  const join = api.communities.join.useMutation();
  const request = api.communities.requestToJoin.useMutation();
  const leave = api.communities.leave.useMutation();

  return async (
    verb: Verb,
    slug: string,
    name: string | undefined,
  ): Promise<boolean> => {
    const said = (key: string) =>
      name ? t(key, { community: name }) : t(`${key}Generic`);
    const mutation = { join, request, leave }[verb];
    try {
      await mutation.mutateAsync({ slug });
      toast.success(said(SAID[verb].done));
      void utils.communities.getMyCommunities.invalidate();
      void utils.communities.getBySlug.invalidate({ slug });
      void utils.communities.getMembers.invalidate({ slug });
      return true;
    } catch {
      // Name the problem and the way forward; never the raw server error.
      toast.error(said(SAID[verb].failed));
      return false;
    }
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
  const { promptAuth } = useRequireAuth();
  const signedIn = useViewerSignedIn();
  const mine = useMyMemberships();
  const runMembership = useMembershipRunner();
  const finishing = useFinishingSlug();
  const [busy, setBusy] = useState(false);

  const current =
    membership !== undefined ? membership : (mine.get(slug) ?? null);
  const action = viewerJoinAction({
    joinPolicy,
    status: current?.status ?? null,
    role: current?.role ?? null,
    isHub: slug === HUB_SLUG,
  });

  const perform = async (verb: Verb) => {
    setBusy(true);
    const ok = await runMembership(verb, slug, name);
    setBusy(false);
    if (ok) onChange?.();
  };

  const run = async () => {
    if (!signedIn) {
      const here = `${window.location.pathname}${window.location.search}`;
      // Only a join this browser asked for may finish after sign-in.
      rememberJoinIntent(slug);
      promptAuth(
        name
          ? t("signInToJoin", { community: name })
          : t("signInToJoinGeneric"),
        {
          returnTo: joinReturnPath(here, slug),
          description: name
            ? t("signInToJoinBody", { community: name })
            : t("signInToJoinBodyGeneric"),
        },
      );
      return;
    }
    if (action.kind === "join") await perform("join");
    else if (action.kind === "request") await perform("request");
  };

  const leave = async () => {
    if (action.kind !== "member" || !action.canLeave) return;
    await perform("leave");
  };

  return { action, run, leave, busy: busy || finishing === slug };
}

/**
 * Finishes a join a guest started before signing in. On `?join=<slug>`,
 * once signed in, it joins (or requests to join) that community — but only
 * when this browser recorded that intent when Join was pressed, so a link
 * someone else sent can never make a member join anything. The param is
 * always dropped, so refresh or Back does not repeat it. Mounted wherever a
 * join control can send a guest to sign in (the directory and community
 * pages).
 */
export function useJoinDeepLink(onDone?: () => void): void {
  const { authStatus } = useRequireAuth();
  const utils = api.useUtils();
  const runMembership = useMembershipRunner();
  const handled = useRef(false);
  const latest = useRef({ onDone, runMembership });
  useEffect(() => {
    latest.current = { onDone, runMembership };
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
    if (!takeJoinIntent(slug)) return;

    void (async () => {
      setFinishingSlug(slug);
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
        const verb =
          action.kind === "join"
            ? "join"
            : action.kind === "request"
              ? "request"
              : null;
        if (verb) {
          const ok = await latest.current.runMembership(
            verb,
            slug,
            community.name,
          );
          if (ok) latest.current.onDone?.();
        }
      } catch {
        // The community could not be read (gone, or offline): nothing to join.
      } finally {
        setFinishingSlug(null);
      }
    })();
  }, [authStatus, utils]);
}
