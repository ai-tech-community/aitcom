import { expect, it } from "vitest";

import { clientIpFromHeaders } from "./client-ip";

it("uses the first forwarded address, trimmed", () => {
  expect(
    clientIpFromHeaders(
      new Headers({
        "x-forwarded-for": " 192.0.2.1 , 192.0.2.2",
        "x-real-ip": "192.0.2.3",
      }),
    ),
  ).toBe("192.0.2.1");
});

it("falls back to the real address", () => {
  expect(clientIpFromHeaders(new Headers({ "x-real-ip": "192.0.2.3" }))).toBe(
    "192.0.2.3",
  );
  expect(
    clientIpFromHeaders(
      new Headers({ "x-forwarded-for": "", "x-real-ip": "192.0.2.3" }),
    ),
  ).toBe("192.0.2.3");
});

it("uses unknown when neither header is set", () => {
  expect(clientIpFromHeaders(new Headers())).toBe("unknown");
});
