import { describe, it, expect } from "vitest";
import {
  spaceWindowReducer,
  initialSpaceWindowState,
  windowKey,
  type SpaceWindowRef,
} from "./space-window-reducer";

const ref = (slug: string): SpaceWindowRef => ({
  communitySlug: "acme",
  spaceSlug: slug,
  spaceName: slug.toUpperCase(),
  communityName: "ACME",
});
const keys = (list: SpaceWindowRef[]) => list.map(windowKey);

describe("spaceWindowReducer", () => {
  it("opens a window", () => {
    const s = spaceWindowReducer(initialSpaceWindowState, { type: "open", ref: ref("a"), maxOpen: 3 });
    expect(keys(s.open)).toEqual(["acme/a"]);
    expect(s.minimized).toEqual([]);
  });

  it("dedupes an already-open space (no second window)", () => {
    let s = spaceWindowReducer(initialSpaceWindowState, { type: "open", ref: ref("a"), maxOpen: 3 });
    s = spaceWindowReducer(s, { type: "open", ref: ref("a"), maxOpen: 3 });
    expect(keys(s.open)).toEqual(["acme/a"]);
  });

  it("auto-minimizes the oldest when exceeding maxOpen", () => {
    let s = initialSpaceWindowState;
    for (const k of ["a", "b", "c", "d"]) {
      s = spaceWindowReducer(s, { type: "open", ref: ref(k), maxOpen: 3 });
    }
    expect(keys(s.open)).toEqual(["acme/b", "acme/c", "acme/d"]);
    expect(keys(s.minimized)).toEqual(["acme/a"]);
  });

  it("minimizes and restores", () => {
    let s = spaceWindowReducer(initialSpaceWindowState, { type: "open", ref: ref("a"), maxOpen: 3 });
    s = spaceWindowReducer(s, { type: "minimize", key: "acme/a" });
    expect(s.open).toEqual([]);
    expect(keys(s.minimized)).toEqual(["acme/a"]);
    s = spaceWindowReducer(s, { type: "restore", key: "acme/a", maxOpen: 3 });
    expect(keys(s.open)).toEqual(["acme/a"]);
    expect(s.minimized).toEqual([]);
  });

  it("re-opening a minimized space restores it", () => {
    let s = spaceWindowReducer(initialSpaceWindowState, { type: "open", ref: ref("a"), maxOpen: 3 });
    s = spaceWindowReducer(s, { type: "minimize", key: "acme/a" });
    s = spaceWindowReducer(s, { type: "open", ref: ref("a"), maxOpen: 3 });
    expect(keys(s.open)).toEqual(["acme/a"]);
    expect(s.minimized).toEqual([]);
  });

  it("closes from open and from minimized", () => {
    let s = spaceWindowReducer(initialSpaceWindowState, { type: "open", ref: ref("a"), maxOpen: 3 });
    s = spaceWindowReducer(s, { type: "open", ref: ref("b"), maxOpen: 3 });
    s = spaceWindowReducer(s, { type: "minimize", key: "acme/b" });
    s = spaceWindowReducer(s, { type: "close", key: "acme/a" });
    s = spaceWindowReducer(s, { type: "close", key: "acme/b" });
    expect(s.open).toEqual([]);
    expect(s.minimized).toEqual([]);
  });

  it("enforceMax moves overflow oldest to minimized (breakpoint shrink)", () => {
    let s = initialSpaceWindowState;
    for (const k of ["a", "b", "c"]) {
      s = spaceWindowReducer(s, { type: "open", ref: ref(k), maxOpen: 3 });
    }
    s = spaceWindowReducer(s, { type: "enforceMax", maxOpen: 1 });
    expect(keys(s.open)).toEqual(["acme/c"]);
    expect(keys(s.minimized)).toEqual(["acme/a", "acme/b"]);
  });
});
