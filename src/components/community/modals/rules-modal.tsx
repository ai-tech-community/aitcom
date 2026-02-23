"use client";

import { api } from "@/trpc/react";
import { LexicalRenderer } from "@/lib/lexical";
import { BuildingModal } from "../building-modal";

type RulesModalProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle: string;
  windowIndex?: number;
};

export function RulesModal({ isOpen, onClose, title, subtitle, windowIndex }: RulesModalProps) {
  const { data, isLoading } = api.community.getRules.useQuery(undefined, {
    enabled: isOpen,
    staleTime: 5 * 60 * 1000,
  });

  return (
    <BuildingModal isOpen={isOpen} onClose={onClose} title={title} subtitle={subtitle} windowIndex={windowIndex}>
      {isLoading && (
        <div className="space-y-2 py-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-4 animate-pulse rounded bg-zinc-100" />
          ))}
        </div>
      )}
      {data && (
        <div className="prose prose-sm max-w-none prose-headings:text-zinc-900 prose-p:text-zinc-600 prose-a:text-orange-600">
          <LexicalRenderer content={data.content} />
        </div>
      )}
      {!isLoading && !data && (
        <p className="py-4 font-mono text-xs text-zinc-400">
          Community rules are being written. Check back soon.
        </p>
      )}
    </BuildingModal>
  );
}
