"use client";

import { api } from "@/trpc/react";
import { LexicalRenderer } from "@/lib/lexical";
import { BuildingModal } from "../building-modal";

type RulesModalProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle: string;
};

export function RulesModal({ isOpen, onClose, title, subtitle }: RulesModalProps) {
  const { data, isLoading } = api.community.getRules.useQuery(undefined, {
    enabled: isOpen,
    staleTime: 5 * 60 * 1000,
  });

  return (
    <BuildingModal isOpen={isOpen} onClose={onClose} title={title} subtitle={subtitle}>
      {isLoading && (
        <div className="space-y-2 py-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-4 animate-pulse rounded bg-zinc-800" />
          ))}
        </div>
      )}
      {data && (
        <div className="prose-invert prose prose-sm max-w-none">
          <LexicalRenderer content={data.content} />
        </div>
      )}
      {!isLoading && !data && (
        <p className="py-4 font-mono text-xs text-zinc-500">
          Community rules are being written. Check back soon.
        </p>
      )}
    </BuildingModal>
  );
}
