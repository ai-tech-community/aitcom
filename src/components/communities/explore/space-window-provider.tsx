"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "@/i18n/navigation";
import {
  spaceWindowReducer,
  initialSpaceWindowState,
  MAX_OPEN_BY_BREAKPOINT,
  type SpaceWindowRef,
  type SpaceWindowState,
} from "./space-window-reducer";

type Breakpoint = "desktop" | "tablet" | "mobile";

const DESKTOP_MIN = 1024;
const TABLET_MIN = 768;

function getBreakpoint(width: number): Breakpoint {
  if (width >= DESKTOP_MIN) return "desktop";
  if (width >= TABLET_MIN) return "tablet";
  return "mobile";
}

function useBreakpoint(): Breakpoint {
  const [breakpoint, setBreakpoint] = useState<Breakpoint>("desktop");
  useEffect(() => {
    const handleResize = () => setBreakpoint(getBreakpoint(window.innerWidth));
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);
  return breakpoint;
}

type SpaceWindowContextValue = SpaceWindowState & {
  openSpace: (ref: SpaceWindowRef) => void;
  closeSpace: (key: string) => void;
  minimizeSpace: (key: string) => void;
  restoreSpace: (key: string) => void;
};

const SpaceWindowContext = createContext<SpaceWindowContextValue | null>(null);

export function SpaceWindowProvider({ children }: { children: ReactNode }) {
  const breakpoint = useBreakpoint();
  const router = useRouter();
  const [state, dispatch] = useReducer(
    spaceWindowReducer,
    initialSpaceWindowState,
  );
  const maxOpen = MAX_OPEN_BY_BREAKPOINT[breakpoint];

  // When the viewport shrinks, push overflow windows into the taskbar.
  useEffect(() => {
    dispatch({ type: "enforceMax", maxOpen });
  }, [maxOpen]);

  const openSpace = useCallback(
    (ref: SpaceWindowRef) => {
      if (breakpoint === "mobile") {
        router.push(
          `/communities/${ref.communitySlug}/spaces/${ref.spaceSlug}`,
        );
        return;
      }
      dispatch({
        type: "open",
        ref,
        maxOpen: MAX_OPEN_BY_BREAKPOINT[breakpoint],
      });
    },
    [breakpoint, router],
  );

  const closeSpace = useCallback(
    (key: string) => dispatch({ type: "close", key }),
    [],
  );
  const minimizeSpace = useCallback(
    (key: string) => dispatch({ type: "minimize", key }),
    [],
  );
  const restoreSpace = useCallback(
    (key: string) =>
      dispatch({
        type: "restore",
        key,
        maxOpen: MAX_OPEN_BY_BREAKPOINT[breakpoint],
      }),
    [breakpoint],
  );

  const value: SpaceWindowContextValue = {
    ...state,
    openSpace,
    closeSpace,
    minimizeSpace,
    restoreSpace,
  };

  return (
    <SpaceWindowContext.Provider value={value}>
      {children}
    </SpaceWindowContext.Provider>
  );
}

export function useSpaceWindows(): SpaceWindowContextValue {
  const ctx = useContext(SpaceWindowContext);
  if (!ctx)
    throw new Error(
      "useSpaceWindows must be used within a <SpaceWindowProvider>",
    );
  return ctx;
}
