import { describe, expect, it } from "vitest";

import {
  MAGAZINE_CAPABILITIES,
  MAGAZINE_ROLES,
  handInFor,
  isMagazineRole,
  roleCan,
  rolesWith,
} from "./roles";

describe("magazine roles", () => {
  it("gives each role exactly its capabilities", () => {
    expect(
      MAGAZINE_ROLES.map((role) =>
        MAGAZINE_CAPABILITIES.map((capability) => roleCan(role, capability)),
      ),
    ).toEqual([
      [true, true, true],
      [true, true, false],
      [true, false, false],
    ]);
    for (const capability of MAGAZINE_CAPABILITIES) {
      expect(roleCan(null, capability)).toBe(false);
    }
  });

  it("hands in by marking ready only with edit", () => {
    expect(handInFor(false)).toBe("send_for_review");
    expect(handInFor(true)).toBe("mark_ready");
    expect(
      MAGAZINE_ROLES.map((role) => handInFor(roleCan(role, "edit"))),
    ).toEqual(["mark_ready", "mark_ready", "send_for_review"]);
  });

  it("lists the roles that grant a capability", () => {
    expect(rolesWith("edit")).toEqual(["editor_in_chief", "editor"]);
    expect(rolesWith("write")).toEqual([
      "editor_in_chief",
      "editor",
      "contributor",
    ]);
    expect(rolesWith("manage")).toEqual(["editor_in_chief"]);
  });

  it("recognises only the three role names", () => {
    for (const role of ["editor_in_chief", "editor", "contributor"]) {
      expect(isMagazineRole(role)).toBe(true);
    }
    for (const value of ["owner", "admin", "", "Editor", "toString"]) {
      expect(isMagazineRole(value)).toBe(false);
    }
  });
});
