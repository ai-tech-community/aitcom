"use client";

import {
  useEffect,
  useState,
  useCallback,
  useRef,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { LazyMotion, domAnimation, m, AnimatePresence, useDragControls } from "framer-motion";
import { Terminal, Minus, Maximize2, Minimize2, X } from "lucide-react";

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return isMobile;
}

type WindowState = "normal" | "minimized" | "maximized";

type BuildingModalProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  /** Offset index so multiple windows don't stack exactly on top of each other */
  windowIndex?: number;
  children: React.ReactNode;
};

const DEFAULT_WIDTH = 640;
const DEFAULT_HEIGHT = 480;
const STACK_OFFSET = 30;

export function BuildingModal({
  isOpen,
  onClose,
  title,
  subtitle,
  windowIndex = 0,
  children,
}: BuildingModalProps) {
  const isMobile = useIsMobile();
  const [windowState, setWindowState] = useState<WindowState>("normal");
  const [size, setSize] = useState({ w: DEFAULT_WIDTH, h: DEFAULT_HEIGHT });
  const dragControls = useDragControls();
  const resizeRef = useRef<{
    startX: number;
    startY: number;
    startW: number;
    startH: number;
  } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Reset when modal opens
  useEffect(() => {
    if (isOpen) {
      setWindowState("normal");
      setSize({ w: DEFAULT_WIDTH, h: DEFAULT_HEIGHT });
    }
  }, [isOpen]);

  const toggleMaximize = useCallback(() => {
    setWindowState((s) => (s === "maximized" ? "normal" : "maximized"));
  }, []);

  const toggleMinimize = useCallback(() => {
    setWindowState((s) => (s === "minimized" ? "normal" : "minimized"));
  }, []);

  // Resize via pointer drag on the handle
  const onResizePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      resizeRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        startW: size.w,
        startH: size.h,
      };

      const onMove = (ev: globalThis.PointerEvent) => {
        if (!resizeRef.current) return;
        const dw = ev.clientX - resizeRef.current.startX;
        const dh = ev.clientY - resizeRef.current.startY;
        setSize({
          w: Math.max(360, resizeRef.current.startW + dw),
          h: Math.max(200, resizeRef.current.startH + dh),
        });
      };

      const onUp = () => {
        resizeRef.current = null;
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [size],
  );

  // Bring window to front on click
  const bringToFront = useCallback(() => {
    if (containerRef.current) {
      // Bump z-index above siblings
      containerRef.current.style.zIndex = String(
        50 + Date.now() % 1000,
      );
    }
  }, []);

  // Cascade offset for multiple windows
  const offset = windowIndex * STACK_OFFSET;

  return (
    <LazyMotion features={domAnimation}>
      <AnimatePresence>
        {isOpen && (
          <m.div
          ref={containerRef}
          className={`fixed flex flex-col overflow-hidden border border-zinc-200 bg-white shadow-2xl ${
            isMobile
              ? "inset-0 z-50 rounded-none"
              : windowState === "maximized"
                ? "inset-0 z-50 rounded-none"
                : windowState === "minimized"
                  ? "bottom-0 z-50 w-72 rounded-b-none rounded-t-lg"
                  : "z-50 rounded-lg"
          }`}
          style={
            isMobile
              ? undefined
              : windowState === "normal"
                ? {
                    width: size.w,
                    height: size.h,
                    left: `calc(50% - ${size.w / 2}px + ${offset}px)`,
                    top: `calc(50% - ${size.h / 2}px + ${offset}px)`,
                  }
                : windowState === "minimized"
                  ? { left: 16 + windowIndex * 288 }
                  : undefined
          }
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          drag={!isMobile && windowState === "normal"}
          dragControls={dragControls}
          dragMomentum={false}
          dragListener={false}
          onPointerDown={bringToFront}
        >
          {/* Title bar - drag handle on desktop, static on mobile */}
          <div
            className={`flex h-9 shrink-0 items-center justify-between border-b border-zinc-200 bg-white px-3 select-none ${
              isMobile ? "" : "cursor-grab active:cursor-grabbing"
            }`}
            onPointerDown={(e) => {
              if (!isMobile && windowState === "normal") dragControls.start(e);
            }}
            onDoubleClick={isMobile ? undefined : toggleMaximize}
          >
            <div className="flex items-center gap-2">
              <Terminal className="h-3.5 w-3.5 text-zinc-400" />
            </div>
            <span className="pointer-events-none font-mono text-[11px] font-medium tracking-wider text-zinc-400">
              {title.toUpperCase()}
            </span>
            <div className="flex items-center gap-0.5">
              {!isMobile && (
                <>
                  <button
                    onClick={toggleMinimize}
                    className="rounded p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600"
                    title="Minimize"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={toggleMaximize}
                    className="rounded p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600"
                    title={windowState === "maximized" ? "Restore" : "Maximize"}
                  >
                    {windowState === "maximized" ? (
                      <Minimize2 className="h-3.5 w-3.5" />
                    ) : (
                      <Maximize2 className="h-3.5 w-3.5" />
                    )}
                  </button>
                </>
              )}
              <button
                onClick={onClose}
                className="rounded p-1 text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-500"
                aria-label="Close"
                title="Close"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Content - hidden when minimized */}
          {windowState !== "minimized" && (
            <div className="flex flex-1 flex-col overflow-hidden px-4 py-4 sm:px-8 sm:py-6">
              {/* Top grid markers */}
              <div className="-mx-4 -mt-4 flex justify-between px-4 pb-3 sm:-mx-8 sm:-mt-6 sm:pb-4">
                <span className="font-mono text-sm text-zinc-200">+</span>
                <span className="font-mono text-sm text-zinc-200">+</span>
                <span className="font-mono text-sm text-zinc-200">+</span>
              </div>

              {/* Title block */}
              {subtitle && (
                <div className="mb-3 shrink-0 sm:mb-4">
                  <h2 className="text-lg font-extrabold tracking-tight text-zinc-900 sm:text-2xl">
                    {title}
                  </h2>
                  <p className="mt-0.5 text-xs leading-relaxed text-zinc-500 sm:mt-1 sm:text-[15px]">
                    {subtitle}
                  </p>
                </div>
              )}

              {/* Scrollable content */}
              <div className="flex-1 overflow-y-auto">{children}</div>

              {/* Bottom grid markers */}
              <div className="-mx-4 -mb-4 flex justify-between px-4 pt-3 sm:-mx-8 sm:-mb-6 sm:pt-4">
                <span className="font-mono text-sm text-zinc-200">+</span>
                <span className="font-mono text-sm text-zinc-200">+</span>
                <span className="font-mono text-sm text-zinc-200">+</span>
              </div>
            </div>
          )}

          {/* Resize handle - normal mode only, desktop only */}
          {!isMobile && windowState === "normal" && (
            <div
              className="absolute bottom-0 right-0 z-10 h-5 w-5 cursor-nwse-resize touch-none"
              onPointerDown={onResizePointerDown}
            >
              <svg
                className="h-full w-full text-zinc-300"
                viewBox="0 0 16 16"
                fill="currentColor"
              >
                <circle cx="13" cy="13" r="1.5" />
                <circle cx="8.5" cy="13" r="1.5" />
                <circle cx="13" cy="8.5" r="1.5" />
                <circle cx="4" cy="13" r="1.5" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <circle cx="13" cy="4" r="1.5" />
              </svg>
            </div>
          )}
          </m.div>
        )}
      </AnimatePresence>
    </LazyMotion>
  );
}
