import { describe, expect, it } from "vitest";
import { collectAll, fakeContext } from "../testing/fake-context";
import { personioJobs } from "./personio-jobs";

const url = "https://demo.jobs.personio.de/xml?language=en";
const input = {
  url: "https://demo.jobs.personio.de/",
  language: "en" as const,
};
describe("Personio collector", () => {
  it("reads XML and description HTML through its context into exportable rows", async () => {
    const { ctx, requests, logs } = fakeContext({
      [url]: {
        body: "<workzag-jobs><position><id>1</id><name>Engineer</name><jobDescriptions><jobDescription><name>Mission</name><value><![CDATA[<p>Build useful things.</p><script>bad()</script>]]></value></jobDescription><jobDescription><name>Skills</name><value>&lt;ul&gt;&lt;li&gt;Curiosity&lt;/li&gt;&lt;/ul&gt;</value></jobDescription></jobDescriptions><createdAt>2026-10-01</createdAt></position></workzag-jobs>",
      },
    });
    const rows = await collectAll(personioJobs.run(input, ctx));
    expect(rows[0]).toMatchObject({
      title: "Engineer",
      description: "Mission\n\nBuild useful things.\n\nSkills\n\nCuriosity",
      postedAt: null,
      descriptionTruncated: false,
    });
    expect(rows[0]).not.toHaveProperty("descriptionMarkup");
    expect(personioJobs.itemSchema.safeParse(rows[0]).success).toBe(true);
    expect(requests).toEqual([{ url, accept: "application/xml,text/xml" }]);
    expect(logs).toEqual(["Found 1 job."]);
  });
  it("uses .com and the explicit selected language without retrying another domain", async () => {
    const { ctx, requests } = fakeContext({
      "https://demo.jobs.personio.com/xml?language=de": {
        body: "<workzag-jobs/>",
      },
    });
    expect(
      await collectAll(
        personioJobs.run(
          { url: "https://demo.jobs.personio.com/", language: "de" },
          ctx,
        ),
      ),
    ).toEqual([]);
    expect(requests).toHaveLength(1);
  });
  it.each([
    [404, "", "personio_feed_unavailable"],
    [403, "", "board_status"],
    [200, "<html/>", "board_response_invalid"],
    [
      200,
      "<workzag-jobs><position><id>1</id><name>R&undefined;</name></position></workzag-jobs>",
      "board_response_invalid",
    ],
    [200, "<workzag-jobs>", "board_response_invalid"],
    [
      200,
      '<!DOCTYPE workzag-jobs [<!ENTITY a "boom">]><workzag-jobs>&a;</workzag-jobs>',
      "board_response_invalid",
    ],
  ])(
    "explains invalid or unavailable feeds (%s)",
    async (status, body, code) => {
      const { ctx } = fakeContext({ [url]: { status, body } });
      await expect(
        collectAll(personioJobs.run(input, ctx)),
      ).rejects.toMatchObject({ outcome: "failed", detail: { code } });
    },
  );
  it("validates the supported board and defaults to English", () => {
    expect(personioJobs.inputSchema.parse({ url: input.url })).toEqual(input);
    expect(
      personioJobs.inputSchema.safeParse({ url: "https://evil.test/" }).success,
    ).toBe(false);
    expect(
      personioJobs.inputSchema.safeParse({ ...input, language: "xx" }).success,
    ).toBe(false);
  });
});
