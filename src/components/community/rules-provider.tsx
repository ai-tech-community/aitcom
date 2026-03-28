"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { RulesModal } from "@/components/community/modals/rules-modal";
import { useTranslations } from "next-intl";

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
  const t = useTranslations("community.rules");

  const openRulesModal = useCallback(() => setIsOpen(true), []);

  return (
    <RulesContext.Provider value={{ openRulesModal }}>
      {children}
      <RulesModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title={t("title")}
        subtitle={t("subtitle")}
        communitySlug={communitySlug}
      />
    </RulesContext.Provider>
  );
}
