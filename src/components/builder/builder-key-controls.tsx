"use client";

import { createContext, useContext, useRef, type ReactNode } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { useConfirm } from "@/components/confirm-dialog";
import {
  useCurrentRevealedKey,
  useRevealedKey,
} from "@/components/agent/revealed-key-context";
import { api } from "@/trpc/react";
import { BuilderFailure, BuilderRetry } from "./builder-ui";

type KeyAction = "generate" | "revoke";

type AgentActivity = { name: string; lastActiveAt?: Date | null };

function useKeyControls(agent: AgentActivity | null) {
  const t = useTranslations("redesign.builder.key");
  const format = useFormatter();
  const confirm = useConfirm();
  const confirming = useRef(false);
  const keyInfo = api.agentManagement.getKeyInfo.useQuery();
  const { setFullKey } = useRevealedKey();
  const fullKey = useCurrentRevealedKey(keyInfo);
  const utils = api.useUtils();
  const refresh = () => utils.agentManagement.getKeyInfo.invalidate();

  const generate = api.agentManagement.generateKey.useMutation({
    onSuccess: (data) => {
      setFullKey(data.key);
      return refresh();
    },
    onError: () => refresh(),
  });
  const revoke = api.agentManagement.revokeKey.useMutation({
    onSuccess: () => {
      setFullKey(null);
      return refresh();
    },
    onError: () => refresh(),
  });
  const activeKey =
    keyInfo.data && (!fullKey || fullKey.startsWith(keyInfo.data.prefix))
      ? keyInfo.data
      : null;
  const busy = generate.isPending || revoke.isPending;
  const failure: KeyAction | null = revoke.error
    ? "revoke"
    : generate.error
      ? "generate"
      : null;

  async function changeKey(action: KeyAction) {
    if (confirming.current || busy || !keyInfo.isSuccess) return;
    if (!activeKey && (fullKey || action === "revoke")) return;
    if (activeKey) {
      const rotate = action === "generate";
      confirming.current = true;
      let accepted: boolean;
      try {
        accepted = await confirm({
          title: t(rotate ? "rotate" : "revoke"),
          description: t(rotate ? "rotateConfirm" : "revokeConfirm", {
            prefix: activeKey.prefix,
            name: agent?.name ?? t("thisAgent"),
            callRecorded: agent?.lastActiveAt ? "yes" : "no",
            lastCall: agent?.lastActiveAt
              ? format.dateTime(new Date(agent.lastActiveAt), {
                  dateStyle: "medium",
                  timeStyle: "short",
                })
              : "",
          }),
          confirmLabel: t(rotate ? "rotate" : "revoke"),
          destructive: true,
        });
      } finally {
        confirming.current = false;
      }
      if (!accepted) return;
    }
    generate.reset();
    revoke.reset();
    if (action === "generate") generate.mutate();
    else revoke.mutate();
  }

  return {
    keyInfo,
    activeKey,
    fullKey,
    busy,
    generate,
    revoke,
    failure,
    changeKey,
  };
}

const BuilderKeyContext = createContext<ReturnType<
  typeof useKeyControls
> | null>(null);

export function BuilderKeyProvider({
  children,
  agent = null,
}: {
  children: ReactNode;
  agent?: AgentActivity | null;
}) {
  const controls = useKeyControls(agent);
  return (
    <BuilderKeyContext.Provider value={controls}>
      {children}
    </BuilderKeyContext.Provider>
  );
}

export function useBuilderKeyControls() {
  const controls = useContext(BuilderKeyContext);
  if (!controls)
    throw new Error("Builder key controls require BuilderKeyProvider");
  return controls;
}

export function BuilderKeyFailure() {
  const t = useTranslations("redesign.builder");
  const {
    failure,
    generate,
    revoke,
    busy,
    changeKey,
    keyInfo,
    activeKey,
    fullKey,
  } = useBuilderKeyControls();
  if (!failure) return null;
  const error = failure === "revoke" ? revoke.error : generate.error;
  const forbidden = error?.data?.code === "FORBIDDEN";
  return (
    <BuilderFailure
      reason={t(forbidden ? "key.accessDenied" : "key.changeFailedTitle")}
      status={error?.data?.httpStatus}
      action={
        <BuilderRetry
          label={t(forbidden ? "retryAccess" : "retry")}
          disabled={busy}
          onClick={() => {
            if (
              forbidden ||
              !keyInfo.isSuccess ||
              (!activeKey && (fullKey || failure === "revoke"))
            ) {
              void keyInfo.refetch();
            } else {
              void changeKey(failure);
            }
          }}
        />
      }
    >
      {t(forbidden ? "key.forbidden" : "key.changeFailed")}
    </BuilderFailure>
  );
}
