"use client";

import { createContext, useCallback, useContext, useState } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";

const RulesModal = dynamic(
  () =>
    import("@/components/community/modals/rules-modal").then(
      (m) => m.RulesModal,
    ),
  { ssr: false },
);

type RulesContextValue = {
  openRulesModal: () => void;
};

const RulesContext = createContext<RulesContextValue>({
  openRulesModal: () => undefined,
});

export function useRulesModal() {
  return useContext(RulesContext);
}

interface RulesProviderProps {
  children: React.ReactNode;
  communitySlug?: string;
}

export function RulesProvider({ children, communitySlug }: RulesProviderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const t = useTranslations("community.rules");

  const openRulesModal = useCallback(() => {
    setMounted(true);
    setIsOpen(true);
  }, []);

  return (
    <RulesContext.Provider value={{ openRulesModal }}>
      {children}
      {mounted ? (
        <RulesModal
          isOpen={isOpen}
          onClose={() => setIsOpen(false)}
          title={t("title")}
          subtitle={t("subtitle")}
          communitySlug={communitySlug}
        />
      ) : null}
    </RulesContext.Provider>
  );
}
