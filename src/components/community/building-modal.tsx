"use client";

import {
  useEffect,
  useState,
  useCallback,
  useRef,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  LazyMotion,
  domMax,
  m,
  AnimatePresence,
  useDragControls,
  useMotionValue,
} from "framer-motion";
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
  /** When provided, the minimize button calls this instead of toggling internal minimize state. */
  onMinimize?: () => void;
  children: React.ReactNode;
};

// Module-level counter for stacking modals. Stays below 50 so that
// portaled UI (Select / Popover at z-50) always renders above modals.
let topZ = 40;

const DEFAULT_WIDTH = 640;
const DEFAULT_HEIGHT = 480;
const STACK_OFFSET = 30;

export function BuildingModal({
  isOpen,
  onClose,
  title,
  subtitle,
  windowIndex = 0,
  onMinimize,
  children,
}: BuildingModalProps) {
  const isMobile = useIsMobile();
  const [windowState, setWindowState] = useState<WindowState>("normal");
  const [size, setSize] = useState({ w: DEFAULT_WIDTH, h: DEFAULT_HEIGHT });
  const dragControls = useDragControls();
  // Drag offset, owned here so we can zero it when leaving the normal state —
  // otherwise a leftover translate would shift the maximized (inset) window.
  const x = useMotionValue(0);
  const y = useMotionValue(0);
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
      x.set(0);
      y.set(0);
    }
  }, [isOpen, x, y]);

  // Zero the drag offset whenever the window leaves the normal (draggable)
  // state, so maximized/minimized align to their CSS-positioned edges instead
  // of being shifted by a previous drag's transform.
  useEffect(() => {
    if (windowState !== "normal") {
      x.set(0);
      y.set(0);
    }
  }, [windowState, x, y]);

  const toggleMaximize = useCallback(() => {
    setWindowState((s) => (s === "maximized" ? "normal" : "maximized"));
  }, []);

  const toggleMinimize = useCallback(() => {
    setWindowState((s) => (s === "minimized" ? "normal" : "minimized"));
  }, []);

  const handleMinimizeClick = useCallback(() => {
    if (onMinimize) {
      onMinimize();
      return;
    }
    toggleMinimize();
  }, [onMinimize, toggleMinimize]);

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

  // Bring window to front on click (keep z-index < 50 so portaled
  // dropdowns at z-50 always render above the modal)
  const bringToFront = useCallback(() => {
    if (containerRef.current) {
      topZ = topZ >= 49 ? 41 : topZ + 1;
      containerRef.current.style.zIndex = String(topZ);
    }
  }, []);

  // Cascade offset for multiple windows
  const offset = windowIndex * STACK_OFFSET;

  return (
    <LazyMotion features={domMax}>
      <AnimatePresence>
        {isOpen && (
          <m.div
            ref={containerRef}
            className={`border-border bg-card fixed flex flex-col overflow-hidden border shadow-2xl ${
              isMobile
                ? "inset-0 z-40 rounded-none"
                : windowState === "maximized"
                  ? "inset-x-0 top-12 bottom-0 z-40 rounded-none"
                  : windowState === "minimized"
                    ? "bottom-0 z-40 w-72 rounded-t-lg rounded-b-none"
                    : "z-40 rounded-lg"
            }`}
            style={{
              // x/y carry the drag offset; zeroed (above) when not normal so
              // maximized/minimized snap to their CSS edges.
              x,
              y,
              ...(isMobile
                ? {}
                : windowState === "normal"
                  ? {
                      width: size.w,
                      height: size.h,
                      left: `calc(50% - ${size.w / 2}px + ${offset}px)`,
                      top: `calc(50% - ${size.h / 2}px + ${offset}px)`,
                    }
                  : windowState === "minimized"
                    ? { left: 16 + windowIndex * 288 }
                    : {}),
            }}
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
              className={`border-border bg-card flex h-9 shrink-0 items-center justify-between border-b px-3 select-none ${
                isMobile ? "" : "cursor-grab touch-none active:cursor-grabbing"
              }`}
              onPointerDown={(e) => {
                if (!isMobile && windowState === "normal")
                  dragControls.start(e);
              }}
              onDoubleClick={isMobile ? undefined : toggleMaximize}
            >
              <div className="flex items-center gap-2">
                <Terminal className="text-muted-foreground h-3.5 w-3.5" />
              </div>
              <span className="text-muted-foreground pointer-events-none font-mono text-xs font-medium tracking-wider">
                {title.toUpperCase()}
              </span>
              <div className="flex items-center gap-0.5">
                {!isMobile && (
                  <>
                    <button
                      onClick={handleMinimizeClick}
                      className="text-muted-foreground hover:bg-accent hover:text-foreground rounded p-1 transition-colors"
                      title="Minimize"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={toggleMaximize}
                      className="text-muted-foreground hover:bg-accent hover:text-foreground rounded p-1 transition-colors"
                      title={
                        windowState === "maximized" ? "Restore" : "Maximize"
                      }
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
                  className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive rounded p-1 transition-colors"
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
                  <span className="text-border font-mono text-sm">+</span>
                  <span className="text-border font-mono text-sm">+</span>
                  <span className="text-border font-mono text-sm">+</span>
                </div>

                {/* Title block */}
                {subtitle && (
                  <div className="mb-3 shrink-0 sm:mb-4">
                    <h2 className="text-foreground text-lg font-semibold tracking-tight sm:text-2xl">
                      {title}
                    </h2>
                    <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed sm:mt-1 sm:text-base">
                      {subtitle}
                    </p>
                  </div>
                )}

                {/* Scrollable content */}
                <div className="flex-1 overflow-y-auto">{children}</div>

                {/* Bottom grid markers */}
                <div className="-mx-4 -mb-4 flex justify-between px-4 pt-3 sm:-mx-8 sm:-mb-6 sm:pt-4">
                  <span className="text-border font-mono text-sm">+</span>
                  <span className="text-border font-mono text-sm">+</span>
                  <span className="text-border font-mono text-sm">+</span>
                </div>
              </div>
            )}

            {/* Resize handle - normal mode only, desktop only */}
            {!isMobile && windowState === "normal" && (
              <div
                className="absolute right-0 bottom-0 z-10 h-5 w-5 cursor-nwse-resize touch-none"
                onPointerDown={onResizePointerDown}
              >
                <svg
                  className="text-border h-full w-full"
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
