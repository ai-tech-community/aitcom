import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/server/payload", () => ({
  getPayloadClient: vi.fn(),
}));

import { getPayloadClient } from "@/server/payload";
import {
  renderTemplate,
  renderEmailFromTemplate,
  REGISTRATION_CONFIRMATION_TEMPLATE_KEY,
} from "./email-template";

const mockGetPayloadClient = vi.mocked(getPayloadClient);

function mockPayloadFind(result: unknown) {
  const find = vi.fn().mockResolvedValue(result);
  mockGetPayloadClient.mockResolvedValue({
    find,
  } as unknown as Awaited<ReturnType<typeof getPayloadClient>>);
  return find;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

describe("renderTemplate", () => {
  it("substitutes known variables in subject and body", () => {
    const result = renderTemplate(
      {
        subject: "Registration confirmed: {{eventTitle}}",
        body: "<p>Hi {{name}}, see you at {{eventTitle}}.</p>",
      },
      { name: "Ada", eventTitle: "AI Night" },
    );
    expect(result.subject).toBe("Registration confirmed: AI Night");
    expect(result.html).toBe("<p>Hi Ada, see you at AI Night.</p>");
  });

  it("tolerates whitespace inside placeholder braces", () => {
    const result = renderTemplate(
      { subject: "Hello {{ name }}", body: "<p>{{  name  }}</p>" },
      { name: "Ada" },
    );
    expect(result.subject).toBe("Hello Ada");
    expect(result.html).toBe("<p>Ada</p>");
  });

  it("renders unknown variables as empty string", () => {
    const result = renderTemplate(
      { subject: "Hi {{nope}}", body: "<p>{{alsoNope}}!</p>" },
      { name: "Ada" },
    );
    expect(result.subject).toBe("Hi ");
    expect(result.html).toBe("<p>!</p>");
  });

  it("renders null/undefined variable values as empty string", () => {
    const result = renderTemplate(
      { subject: "{{a}}|{{b}}", body: "{{a}}|{{b}}" },
      { a: null, b: undefined },
    );
    expect(result.subject).toBe("|");
    expect(result.html).toBe("|");
  });

  it("HTML-escapes variable values in the body", () => {
    const result = renderTemplate(
      { subject: "s", body: "<p>{{name}}</p>" },
      { name: "<script>alert(\"x\")</script> & 'co'" },
    );
    expect(result.html).toBe(
      "<p>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;co&#39;</p>",
    );
    expect(result.html).not.toContain("<script>");
  });

  it("does not HTML-escape the subject (plain text, not HTML)", () => {
    const result = renderTemplate(
      { subject: "Tom & Jerry <live>", body: "x" },
      {},
    );
    expect(result.subject).toBe("Tom & Jerry <live>");
    const withVar = renderTemplate(
      { subject: "{{title}}", body: "x" },
      { title: "Q&A <night>" },
    );
    expect(withVar.subject).toBe("Q&A <night>");
  });

  it("keeps admin-authored HTML in the body untouched", () => {
    const body = '<a href="https://example.com?a=1&b=2">link</a>';
    expect(renderTemplate({ subject: "s", body }, {}).html).toBe(body);
  });

  it("handles empty template content without throwing", () => {
    expect(renderTemplate({ subject: "", body: "" }, { name: "Ada" })).toEqual({
      subject: "",
      html: "",
    });
  });

  it("never throws on malformed/hostile input", () => {
    expect(() =>
      renderTemplate(
        { subject: "{{}} {{ }} {{a", body: "}} {{x}} {{y{{z}}" },
        {},
      ),
    ).not.toThrow();
    expect(() =>
      renderTemplate(
        null as unknown as { subject: string; body: string },
        null as unknown as Record<string, string>,
      ),
    ).not.toThrow();
  });
});

describe("renderEmailFromTemplate", () => {
  const vars = { name: "Ada", eventTitle: "AI Night" };

  it("renders a found, enabled template", async () => {
    const find = mockPayloadFind({
      docs: [
        {
          subject: "Confirmed: {{eventTitle}}",
          body: "<p>Hi {{name}}</p>",
          enabled: true,
        },
      ],
    });
    const result = await renderEmailFromTemplate(
      REGISTRATION_CONFIRMATION_TEMPLATE_KEY,
      vars,
    );
    expect(result).toEqual({
      subject: "Confirmed: AI Night",
      html: "<p>Hi Ada</p>",
    });
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({ collection: "email-templates", limit: 1 }),
    );
  });

  it("returns null when no template exists (fallback)", async () => {
    mockPayloadFind({ docs: [] });
    await expect(renderEmailFromTemplate("missing-key", vars)).resolves.toBe(
      null,
    );
    // Missing templates are the normal case — no warning expected.
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("returns null when the template has a blank subject or body (fallback)", async () => {
    mockPayloadFind({ docs: [{ subject: "  ", body: "<p>hi</p>" }] });
    await expect(
      renderEmailFromTemplate(REGISTRATION_CONFIRMATION_TEMPLATE_KEY, vars),
    ).resolves.toBe(null);
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining(REGISTRATION_CONFIRMATION_TEMPLATE_KEY),
    );

    mockPayloadFind({ docs: [{ subject: "Hi", body: "   " }] });
    await expect(
      renderEmailFromTemplate(REGISTRATION_CONFIRMATION_TEMPLATE_KEY, vars),
    ).resolves.toBe(null);
    expect(console.warn).toHaveBeenCalledTimes(2);
  });

  it("returns null when the template renders to blank output (fallback)", async () => {
    mockPayloadFind({
      docs: [{ subject: "{{unknownVar}}", body: "<p>hi {{name}}</p>" }],
    });
    await expect(
      renderEmailFromTemplate(REGISTRATION_CONFIRMATION_TEMPLATE_KEY, vars),
    ).resolves.toBe(null);
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining(REGISTRATION_CONFIRMATION_TEMPLATE_KEY),
    );
  });

  it("returns null when the payload query throws (fallback, never rejects)", async () => {
    const find = vi.fn().mockRejectedValue(new Error("db down"));
    mockGetPayloadClient.mockResolvedValue({
      find,
    } as unknown as Awaited<ReturnType<typeof getPayloadClient>>);
    await expect(
      renderEmailFromTemplate(REGISTRATION_CONFIRMATION_TEMPLATE_KEY, vars),
    ).resolves.toBe(null);
  });

  it("returns null when the payload client itself fails to init (fallback)", async () => {
    mockGetPayloadClient.mockRejectedValue(new Error("no payload"));
    await expect(
      renderEmailFromTemplate(REGISTRATION_CONFIRMATION_TEMPLATE_KEY, vars),
    ).resolves.toBe(null);
  });

  it("only matches enabled templates in the query", async () => {
    const find = mockPayloadFind({ docs: [] });
    await renderEmailFromTemplate(REGISTRATION_CONFIRMATION_TEMPLATE_KEY, vars);
    expect(find).toHaveBeenCalledTimes(1);
    const arg = find.mock.calls[0]?.[0] as { where: { and: unknown[] } };
    expect(arg.where.and).toContainEqual({
      enabled: { not_equals: false },
    });
  });
});
