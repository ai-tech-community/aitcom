import { expect, it } from "vitest";

import { shareTargets } from "./share";

it("encodes the URL and title for X, LinkedIn and email", () => {
  expect(
    shareTargets("https://example.test/nl?a=1&b=two#end", "AI & wij?"),
  ).toEqual({
    x: "https://twitter.com/intent/tweet?text=AI%20%26%20wij%3F&url=https%3A%2F%2Fexample.test%2Fnl%3Fa%3D1%26b%3Dtwo%23end",
    linkedIn:
      "https://www.linkedin.com/sharing/share-offsite/?url=https%3A%2F%2Fexample.test%2Fnl%3Fa%3D1%26b%3Dtwo%23end",
    email:
      "mailto:?subject=AI%20%26%20wij%3F&body=https%3A%2F%2Fexample.test%2Fnl%3Fa%3D1%26b%3Dtwo%23end",
  });
});
