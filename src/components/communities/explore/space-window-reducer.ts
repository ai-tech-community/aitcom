export type SpaceWindowRef = {
  communitySlug: string;
  spaceSlug: string;
  spaceName: string | null;
  communityName: string;
};

export type SpaceWindowState = {
  open: SpaceWindowRef[];
  minimized: SpaceWindowRef[];
};

export const initialSpaceWindowState: SpaceWindowState = {
  open: [],
  minimized: [],
};

export const MAX_OPEN_BY_BREAKPOINT = {
  desktop: 3,
  tablet: 1,
  mobile: 0,
} as const;

export function windowKey(ref: {
  communitySlug: string;
  spaceSlug: string;
}): string {
  return `${ref.communitySlug}/${ref.spaceSlug}`;
}

export type SpaceWindowAction =
  | { type: "open"; ref: SpaceWindowRef; maxOpen: number }
  | { type: "minimize"; key: string }
  | { type: "restore"; key: string; maxOpen: number }
  | { type: "close"; key: string }
  | { type: "enforceMax"; maxOpen: number };

function clampOverflow(
  open: SpaceWindowRef[],
  minimized: SpaceWindowRef[],
  maxOpen: number,
): SpaceWindowState {
  if (open.length <= maxOpen) return { open, minimized };
  const overflow = open.slice(0, open.length - maxOpen);
  const kept = open.slice(open.length - maxOpen);
  return { open: kept, minimized: [...minimized, ...overflow] };
}

export function spaceWindowReducer(
  state: SpaceWindowState,
  action: SpaceWindowAction,
): SpaceWindowState {
  switch (action.type) {
    case "open": {
      const key = windowKey(action.ref);
      if (state.open.some((w) => windowKey(w) === key)) return state; // dedupe
      const minimized = state.minimized.filter((w) => windowKey(w) !== key);
      return clampOverflow(
        [...state.open, action.ref],
        minimized,
        action.maxOpen,
      );
    }
    case "restore": {
      const ref = state.minimized.find((w) => windowKey(w) === action.key);
      if (!ref) return state;
      const minimized = state.minimized.filter(
        (w) => windowKey(w) !== action.key,
      );
      return clampOverflow([...state.open, ref], minimized, action.maxOpen);
    }
    case "minimize": {
      const ref = state.open.find((w) => windowKey(w) === action.key);
      if (!ref) return state;
      return {
        open: state.open.filter((w) => windowKey(w) !== action.key),
        minimized: [...state.minimized, ref],
      };
    }
    case "close": {
      return {
        open: state.open.filter((w) => windowKey(w) !== action.key),
        minimized: state.minimized.filter((w) => windowKey(w) !== action.key),
      };
    }
    case "enforceMax": {
      return clampOverflow(state.open, state.minimized, action.maxOpen);
    }
  }
}
