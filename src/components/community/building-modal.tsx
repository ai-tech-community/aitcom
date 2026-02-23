"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";

type BuildingModalProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  accent?: boolean;
  children: React.ReactNode;
};

export function BuildingModal({
  isOpen,
  onClose,
  title,
  subtitle,
  accent = false,
  children,
}: BuildingModalProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              className="pointer-events-auto relative w-full max-w-2xl rounded-xl border border-zinc-800 bg-zinc-900 shadow-2xl"
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
            >
              <div
                className={`flex items-start justify-between border-b border-zinc-800 px-6 py-4 ${
                  accent ? "border-l-2 border-l-orange-500" : ""
                }`}
              >
                <div>
                  <h2 className="font-mono text-sm font-bold uppercase tracking-widest text-white">
                    {title}
                  </h2>
                  {subtitle && (
                    <p className="mt-0.5 font-mono text-[10px] tracking-wider text-zinc-500">
                      {subtitle}
                    </p>
                  )}
                </div>
                <button
                  onClick={onClose}
                  className="ml-4 shrink-0 rounded p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="max-h-[70vh] overflow-y-auto px-6 py-5">
                {children}
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
