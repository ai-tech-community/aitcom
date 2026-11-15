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
  /**
   * Show a community's rules to accept. Pass the slug of the community the
   * refused write belongs to (a Launchpad project's, say); without one the
   * provider's own community is shown, the Hub by default.
   */
  openRulesModal: (communitySlug?: string) => void;
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
  const [requestedSlug, setRequestedSlug] = useState<string | undefined>();
  const t = useTranslations("community.rules");

  const openRulesModal = useCallback((slug?: string) => {
    setRequestedSlug(slug);
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
          communitySlug={requestedSlug ?? communitySlug}
        />
      ) : null}
    </RulesContext.Provider>
  );
}
