import { expect, it, vi } from "vitest";

import nl from "../../../../messages/nl.json";

vi.mock("@/server/email", () => ({ sendGatedEmail: vi.fn() }));
vi.mock("@/server/payload", () => ({ getPayloadClient: vi.fn() }));

import {
  absoluteIssueUrl,
  issueMail,
  magazineUnsubscribeUrl,
  confirmationMail,
  magazineConfirmUrl,
  renderMagazineMail,
} from "./mail";

it("escapes everything a magazine name can carry", async () => {
  const mail = await confirmationMail({
    locale: "en",
    magazineName: '<b>&"x"',
    confirmUrl: "https://example.test/?a=1&b=2",
  });
  expect(mail.html).not.toContain('<b>&"x"');
  expect(mail.html).toContain("&lt;b&gt;&amp;&quot;x&quot;");
  const rendered = renderMagazineMail({
    subject: "Subject",
    heading: "<heading>",
    paragraphs: ["<body>"],
    action: { label: "<action>", href: 'https://example.test/"&' },
    footer: ["<footer>"],
    unsubscribe: { label: "<leave>", href: 'https://example.test/leave?x="&' },
  });
  for (const word of ["heading", "body", "action", "footer", "leave"]) {
    expect(rendered.html).toContain(`&lt;${word}&gt;`);
    expect(rendered.html).not.toContain(`<${word}>`);
  }
  expect(rendered.html).toContain("https://example.test/&quot;&amp;");
  expect(rendered.html).toContain("https://example.test/leave?x=&quot;&amp;");
});

it("has a text part with the link", async () => {
  const confirmUrl = "https://example.test/?a=1&b=2";
  const mail = await confirmationMail({
    locale: "en",
    magazineName: "Gazette",
    confirmUrl,
  });
  expect(mail.text).toContain(confirmUrl);
  expect(mail.text).toContain("Yes, email me new issues");
  expect(mail.text).toContain("The link works for 7 days.");
  expect(mail.text).toContain("AIT Community");
});

it("writes the confirmation in the subscriber's language", async () => {
  const input = { magazineName: "Gazette", confirmUrl: "https://example.test" };
  const english = await confirmationMail({ ...input, locale: "en" });
  const dutch = await confirmationMail({ ...input, locale: "nl" });
  expect(dutch.subject).not.toBe(english.subject);
  expect(dutch.subject).toBe(
    nl.magazineMail.confirm.subject.replace("{magazine}", "Gazette"),
  );
  expect(dutch.text).toContain(nl.magazineMail.confirm.action);
});

it("links to the confirm page in that language", () => {
  expect(magazineConfirmUrl("nl", "abc")).toBe(
    "https://www.aitcommunity.org/nl/magazine-subscriptions/confirm?t=abc",
  );
  expect(magazineConfirmUrl("en", "a&b")).toContain("?t=a%26b");
});

it("an issue email links to the issue and to unsubscribe", async () => {
  const issueUrl = absoluteIssueUrl(
    "nl",
    { slug: "gazette" },
    { slug: "herfst" },
  );
  const unsubscribeUrl = magazineUnsubscribeUrl("nl", "a&b");
  expect(issueUrl).toBe(
    "https://www.aitcommunity.org/nl/magazines/gazette/herfst",
  );
  expect(unsubscribeUrl).toBe(
    "https://www.aitcommunity.org/nl/unsubscribe?t=a%26b",
  );
  const dutch = await issueMail({
    locale: "nl",
    magazineName: "Gazette",
    communityName: "Tuinclub",
    issue: { number: 3, title: "Herfst" },
    issueUrl,
    unsubscribeUrl,
  });
  const english = await issueMail({
    locale: "en",
    magazineName: "Gazette",
    communityName: "Garden club",
    issue: { number: 3, title: "Autumn" },
    issueUrl,
    unsubscribeUrl,
  });
  expect(dutch.subject).toBe("Gazette: Herfst");
  expect(dutch.text).toContain("Nummer 3 van Gazette, van Tuinclub, is uit.");
  expect(english.subject).toBe("Gazette: Autumn");
  expect(english.text).toContain(
    "Issue 3 of Gazette, from Garden club, is out.",
  );
  expect(english.text).toContain(
    "You get this email because you subscribed to Gazette.",
  );
  for (const mail of [dutch, english])
    for (const part of [mail.html, mail.text]) {
      expect(part).toContain(issueUrl);
      expect(part).toContain(unsubscribeUrl);
    }
});
