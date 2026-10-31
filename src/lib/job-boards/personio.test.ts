import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { extractXml } from "../../server/collectors/extract/extract-xml";
import {
  parsePersonioBoard,
  personioFeedUrl,
  recognizePersonioBoard,
} from "./personio";

const board = {
  origin: "https://demo.jobs.personio.de",
  language: "en" as const,
};
const decode = (xml: string): unknown =>
  JSON.parse(extractXml(xml).rows[0]!.json!);
const fixture = readFileSync(
  path.join(__dirname, "fixtures/personio.xml"),
  "utf8",
);

describe("Personio board addresses", () => {
  it.each([
    "https://demo.jobs.personio.de/",
    "https://demo.jobs.personio.de/xml?language=en",
    "https://demo.jobs.personio.de/job/1822269",
    "https://demo.jobs.personio.de/job/1822269/apply?language=en",
  ])("recognizes %s", (value) =>
    expect(recognizePersonioBoard(new URL(value))).toEqual(board),
  );
  it("preserves .com and the selected language", () => {
    const match = recognizePersonioBoard(
      new URL("https://demo.jobs.personio.com/xml?language=fr"),
    );
    expect(match).toEqual({
      origin: "https://demo.jobs.personio.com",
      language: "fr",
    });
    expect(personioFeedUrl(match!, "nl")).toBe(
      "https://demo.jobs.personio.com/xml?language=nl",
    );
  });
  it.each([
    "http://demo.jobs.personio.de/",
    "https://personio.de/",
    "https://jobs.personio.de/",
    "https://a.b.jobs.personio.de/",
    "https://demo.jobs.personio.de.evil.test/",
    "https://demo.jobs.personio.de/admin",
    "https://demo.jobs.personio.de/job/not-an-id",
    "https://demo.jobs.personio.de/xml?language=xx",
    "https://u:p@demo.jobs.personio.com/",
    "https://demo.jobs.personio.de:8443/",
    "https://-demo.jobs.personio.de/",
    "https://demo_.jobs.personio.de/",
  ])("leaves %s unrecognized", (value) =>
    expect(recognizePersonioBoard(new URL(value))).toBeNull(),
  );
});

describe("parsed Personio rows", () => {
  it("maps a real fixture and never treats createdAt or a Remote office as publication/workplace metadata", () => {
    const rows = parsePersonioBoard(decode(fixture), board, "en");
    expect(rows).toHaveLength(2);
    expect(rows?.[0]).toEqual({
      title: "Bewerberpool",
      location: "München",
      department: null,
      url: "https://demo.jobs.personio.de/job/1822268?language=en",
      applyUrl: "https://demo.jobs.personio.de/job/1822268/apply?language=en",
      postedAt: null,
      description: null,
      descriptionTruncated: false,
      employmentType: "permanent · full-time",
      workplaceType: null,
    });
    expect(rows?.[1]).toMatchObject({
      title: "Initiative application (Full time)",
      location: "Remote",
      postedAt: null,
      workplaceType: null,
    });
  });
  it("supports singleton blocks, repeated offices, heading escaping and CDATA HTML", () => {
    const document = decode(
      "<workzag-jobs><position><id>1</id><name>Engineer</name><office>Berlin</office><additionalOffices><office>Berlin</office><office>Paris</office></additionalOffices><jobDescriptions><jobDescription><name>R&amp;D &lt;role&gt;</name><value><![CDATA[<p>Build things.</p>]]></value></jobDescription></jobDescriptions></position></workzag-jobs>",
    );
    expect(parsePersonioBoard(document, board, "fr")?.[0]).toMatchObject({
      location: "Berlin, Paris",
      descriptionMarkup: {
        html: "<section><h2>R&amp;D &lt;role&gt;</h2><p>Build things.</p></section>",
        encoded: false,
      },
      url: "https://demo.jobs.personio.de/job/1?language=fr",
    });
  });
  it("keeps an empty description in the selected language as a valid job", () => {
    expect(
      parsePersonioBoard(
        decode(
          "<workzag-jobs><position><id>1</id><name>Engineer</name><jobDescriptions>  </jobDescriptions></position></workzag-jobs>",
        ),
        board,
        "nl",
      )?.[0],
    ).toMatchObject({ description: null, employmentType: null });
  });
  it("distinguishes empty feeds from malformed envelopes and postings", () => {
    expect(parsePersonioBoard(decode("<workzag-jobs/>"), board, "en")).toEqual(
      [],
    );
    expect(
      parsePersonioBoard(decode('<workzag-jobs version="1"/>'), board, "en"),
    ).toEqual([]);
    for (const value of [
      null,
      {},
      { "workzag-jobs": { nonsense: "x" } },
      { "workzag-jobs": { position: { id: "../bad", name: "Engineer" } } },
    ])
      expect(parsePersonioBoard(value, board, "en")).toBeNull();
  });
});
