import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { beforeEach, describe, expect, it, vi } from "vitest";

const { enrollSpy } = vi.hoisted(() => ({ enrollSpy: vi.fn() }));
vi.mock("@/server/db", () => ({ db: { __fake: true } }));
vi.mock("./enroll-in-hub", () => ({
  enrollInHub: enrollSpy,
}));

import {
  enrollAfterVerification,
  enrollForCreatedUser,
  enrollOnSessionCreated,
} from "./enroll-on-auth";

/** Human member fixture — not an agent. */
const SOREN_ID = "soren-ravn";

beforeEach(() => enrollSpy.mockReset());

describe("Hub enrolment auth triggers", () => {
  it("enrols on user.create (every signup path)", async () => {
    await enrollForCreatedUser({ id: SOREN_ID });
    expect(enrollSpy).toHaveBeenCalledWith({ __fake: true }, SOREN_ID);
  });

  it("enrols on afterEmailVerification (email+password path)", async () => {
    await enrollAfterVerification({ id: SOREN_ID });
    expect(enrollSpy).toHaveBeenCalledWith({ __fake: true }, SOREN_ID);
  });

  it("enrols on session.create (first sign-in after verify)", async () => {
    await enrollOnSessionCreated({ userId: SOREN_ID });
    expect(enrollSpy).toHaveBeenCalledWith({ __fake: true }, SOREN_ID);
  });
});

describe("Better Auth wires email+password enrolment", () => {
  const src = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../better-auth/config.ts"),
    "utf8",
  );

  it("retries Hub enrolment after email verification, not only on user.create", () => {
    expect(src).toContain('from "@/server/db/enroll-on-auth"');
    expect(src).toContain("enrollForCreatedUser(user)");
    expect(src).toContain("enrollAfterVerification(user)");
    expect(src).toContain("enrollOnSessionCreated(session)");
  });
});
