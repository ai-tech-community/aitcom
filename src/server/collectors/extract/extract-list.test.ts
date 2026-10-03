// @vitest-environment node
import { describe, expect, it } from "vitest";
import { extractList } from "./extract-list";
import {
  ExtractError,
  MAX_CELL_CHARS,
  MAX_OUTPUT_CHARS_PER_PAGE,
  MAX_ROWS_PER_PAGE,
  type ExtractSpec,
} from "./protocol";

const BASE_URL = "https://conf.example/talks";

const SPEAKERS_HTML = `<!doctype html>
<html><body>
<ul class="speakers">
  <li class="speaker"><a href="/s/ada">Ada</a><span class="role">CTO</span></li>
  <li class="speaker"><a href="https://conf.example/s/grace">Grace</a><span class="role">Admiral</span></li>
  <li class="speaker"><a href="s/linus">Linus</a><span class="role">Maintainer</span></li>
</ul>
<a class="next" href="?page=2">Next</a>
</body></html>`;

const SPEAKERS_SPEC: ExtractSpec = {
  baseUrl: BASE_URL,
  itemSelector: "li.speaker",
  fields: [
    { name: "name", selector: "a" },
    { name: "link", selector: "a", attribute: "href" },
    { name: "role", selector: ".role" },
  ],
  nextPageSelector: "a.next",
};

function nestedDivs(depth: number): string {
  return `<html><body>${"<div>".repeat(depth)}deep${"</div>".repeat(depth)}</body></html>`;
}

function captureError(run: () => unknown): ExtractError {
  try {
    run();
  } catch (error) {
    if (error instanceof ExtractError) return error;
    throw error;
  }
  throw new Error("expected an ExtractError");
}

describe("extractList", () => {
  it("extracts one row per item and the next-page link", () => {
    expect(extractList(SPEAKERS_HTML, SPEAKERS_SPEC)).toEqual({
      rows: [
        { name: "Ada", link: "https://conf.example/s/ada", role: "CTO" },
        {
          name: "Grace",
          link: "https://conf.example/s/grace",
          role: "Admiral",
        },
        {
          name: "Linus",
          link: "https://conf.example/s/linus",
          role: "Maintainer",
        },
      ],
      nextUrl: "https://conf.example/talks?page=2",
      truncated: false,
    });
  });

  it("gives null for a column with no match in the item", () => {
    const html = `<ul>
      <li class="speaker"><a href="/s/ada">Ada</a></li>
      <li class="speaker"><span class="role">CTO</span></li>
    </ul>`;
    const { rows } = extractList(html, SPEAKERS_SPEC);
    expect(rows).toEqual([
      { name: "Ada", link: "https://conf.example/s/ada", role: null },
      { name: null, link: null, role: "CTO" },
    ]);
  });

  it("gives null for an attribute the matched element does not have", () => {
    const html = `<ul><li class="speaker"><a>Ada</a></li></ul>`;
    const { rows } = extractList(html, {
      baseUrl: BASE_URL,
      itemSelector: "li",
      fields: [
        { name: "link", selector: "a", attribute: "href" },
        { name: "title", selector: "a", attribute: "title" },
      ],
    });
    expect(rows).toEqual([{ link: null, title: null }]);
  });

  it("collapses and trims whitespace in text, across nested elements", () => {
    const html = `<ul><li class="item"><p class="bio">
        Ada \n\t  <b>Lovelace</b>
        wrote   the <i>first</i>\n program   </p></li></ul>`;
    const { rows } = extractList(html, {
      baseUrl: BASE_URL,
      itemSelector: "li.item",
      fields: [{ name: "bio", selector: ".bio" }],
    });
    expect(rows).toEqual([{ bio: "Ada Lovelace wrote the first program" }]);
  });

  it("caps a text cell at MAX_CELL_CHARS characters", () => {
    const html = `<ul><li class="item"><p>${"x".repeat(3_000)}</p></li></ul>`;
    const { rows } = extractList(html, {
      baseUrl: BASE_URL,
      itemSelector: "li.item",
      fields: [{ name: "text", selector: "p" }],
    });
    expect(MAX_CELL_CHARS).toBe(2_000);
    expect(rows[0]?.text).toBe("x".repeat(2_000));
  });

  it("keeps the space between text pieces when the cap cuts early", () => {
    const html = `<ul><li class="item"><p>${"a".repeat(1_998)}   <b>bc</b>de</p></li></ul>`;
    const { rows } = extractList(html, {
      baseUrl: BASE_URL,
      itemSelector: "li.item",
      fields: [{ name: "text", selector: "p" }],
    });
    expect(rows[0]?.text).toBe(`${"a".repeat(1_998)} b`);
  });

  it("never ends a capped cell with a space", () => {
    const html = `<ul><li class="item"><p>${"a".repeat(1_999)} b</p></li></ul>`;
    const { rows } = extractList(html, {
      baseUrl: BASE_URL,
      itemSelector: "li.item",
      fields: [{ name: "text", selector: "p" }],
    });
    expect(rows[0]?.text).toBe("a".repeat(1_999));
  });

  it("reads a capped cell from a ~4 MB text node quickly", () => {
    const hugeText = "word ".repeat(800_000);
    expect(hugeText.length).toBe(4_000_000);
    const html = `<ul><li class="item"><p>${hugeText}</p></li></ul>`;
    const started = performance.now();
    const { rows } = extractList(html, {
      baseUrl: BASE_URL,
      itemSelector: "li.item",
      fields: [{ name: "text", selector: "p" }],
    });
    const elapsedMs = performance.now() - started;
    const text = rows[0]?.text ?? "";
    expect(text.length).toBeLessThanOrEqual(MAX_CELL_CHARS);
    expect(text.length).toBe(1_999);
    expect(text.startsWith("word word ")).toBe(true);
    expect(elapsedMs).toBeLessThan(1_000);
  });

  it("skips script, style, noscript and template content in text", () => {
    const html = `<ul>
      <li class="item"><span><script>var x=1</script>Ada</span></li>
      <li class="item"><span><style>.a{color:red}</style>Grace<noscript>Enable JS</noscript><template><b>Hidden</b></template></span></li>
    </ul>`;
    const { rows } = extractList(html, {
      baseUrl: BASE_URL,
      itemSelector: "li.item",
      fields: [{ name: "name", selector: "span" }],
    });
    expect(rows).toEqual([{ name: "Ada" }, { name: "Grace" }]);
  });

  it("gives an empty cell when a field matches a script, style, noscript or template", () => {
    const html = `<ul><li class="item">
      <script>var secret = 1;</script>
      <style>.a { color: red }</style>
      <noscript>Enable JS</noscript>
      <template><b>Hidden</b></template>
    </li></ul>`;
    const { rows } = extractList(html, {
      baseUrl: BASE_URL,
      itemSelector: "li.item",
      fields: [
        { name: "script", selector: "script" },
        { name: "style", selector: "style" },
        { name: "noscript", selector: "noscript" },
        { name: "template", selector: "template" },
      ],
    });
    expect(rows).toEqual([
      { script: "", style: "", noscript: "", template: "" },
    ]);
  });

  it("leaves a JSON-LD block out of a card's text", () => {
    const html = `<ul class="talks"><li class="card">
      <h3>Opening keynote</h3>
      <script type="application/ld+json">{"@context":"https://schema.org","@type":"Event","name":"Opening keynote"}</script>
      <p>Ada Lovelace</p>
    </li></ul>`;
    const { rows } = extractList(html, {
      baseUrl: BASE_URL,
      itemSelector: "ul.talks",
      fields: [{ name: "card", selector: "li.card" }],
    });
    expect(rows).toEqual([{ card: "Opening keynote Ada Lovelace" }]);
  });

  it("uses the first match in document order for a field", () => {
    const html = `<ul><li class="item">
      <div class="x"><div class="x">inner</div> outer</div>
      <div class="x">later</div>
    </li></ul>`;
    const { rows } = extractList(html, {
      baseUrl: BASE_URL,
      itemSelector: "li.item",
      fields: [{ name: "text", selector: ".x" }],
    });
    expect(rows).toEqual([{ text: "inner outer" }]);
  });

  it("trims and caps a plain attribute value at MAX_CELL_CHARS characters", () => {
    const html = `<ul><li class="item">
      <span data-a="  short  " data-b="${"y".repeat(3_000)}">s</span>
    </li></ul>`;
    const { rows } = extractList(html, {
      baseUrl: BASE_URL,
      itemSelector: "li.item",
      fields: [
        { name: "a", selector: "span", attribute: "data-a" },
        { name: "b", selector: "span", attribute: "data-b" },
      ],
    });
    expect(rows).toEqual([{ a: "short", b: "y".repeat(2_000) }]);
  });

  it("collapses whitespace inside a plain attribute value", () => {
    const html = `<ul><li class="item">
      <img alt="  Ada \n\t  Lovelace  " src="/a.png">
    </li></ul>`;
    const { rows } = extractList(html, {
      baseUrl: BASE_URL,
      itemSelector: "li.item",
      fields: [{ name: "alt", selector: "img", attribute: "alt" }],
    });
    expect(rows).toEqual([{ alt: "Ada Lovelace" }]);
  });

  it("gives null for javascript: and mailto: links", () => {
    const html = `<ul>
      <li class="item"><a href="javascript:alert(1)">x</a></li>
      <li class="item"><a href="mailto:ada@example.com">y</a></li>
      <li class="item"><img src="data:image/png;base64,AAAA"></li>
    </ul>`;
    const { rows } = extractList(html, {
      baseUrl: BASE_URL,
      itemSelector: "li.item",
      fields: [
        { name: "link", selector: "a", attribute: "href" },
        { name: "image", selector: "img", attribute: "src" },
      ],
    });
    expect(rows).toEqual([
      { link: null, image: null },
      { link: null, image: null },
      { link: null, image: null },
    ]);
  });

  it("resolves src and action attributes against the base URL", () => {
    const html = `<ul><li class="item">
      <img src="/img/ada.png"><form action="search"></form>
    </li></ul>`;
    const { rows } = extractList(html, {
      baseUrl: BASE_URL,
      itemSelector: "li.item",
      fields: [
        { name: "image", selector: "img", attribute: "src" },
        { name: "form", selector: "form", attribute: "action" },
      ],
    });
    expect(rows).toEqual([
      {
        image: "https://conf.example/img/ada.png",
        form: "https://conf.example/search",
      },
    ]);
  });

  it("gives a null nextUrl when no next link is on the page", () => {
    const html = SPEAKERS_HTML.replace(
      '<a class="next" href="?page=2">Next</a>',
      "",
    );
    expect(extractList(html, SPEAKERS_SPEC).nextUrl).toBeNull();
  });

  it("gives a null nextUrl when no next-page selector is given", () => {
    const spec: ExtractSpec = {
      baseUrl: SPEAKERS_SPEC.baseUrl,
      itemSelector: SPEAKERS_SPEC.itemSelector,
      fields: SPEAKERS_SPEC.fields,
    };
    expect(extractList(SPEAKERS_HTML, spec).nextUrl).toBeNull();
  });

  it("takes the first next-page match that has an href", () => {
    const html = `<ul><li class="speaker">x</li></ul>
      <span class="next">Next</span>
      <a class="next" href="/talks?page=3">Next</a>
      <a class="next" href="/talks?page=9">Next</a>`;
    expect(extractList(html, SPEAKERS_SPEC).nextUrl).toBe(
      "https://conf.example/talks?page=3",
    );
  });

  it("gives a null nextUrl for a javascript: next link", () => {
    const html = `<ul><li class="speaker">x</li></ul>
      <a class="next" href="javascript:void(0)">Next</a>`;
    expect(extractList(html, SPEAKERS_SPEC).nextUrl).toBeNull();
  });

  it("refuses a field selector outside the allowlist", () => {
    const error = captureError(() =>
      extractList(SPEAKERS_HTML, {
        ...SPEAKERS_SPEC,
        fields: [{ name: "name", selector: "div:has(p)" }],
      }),
    );
    expect(error.code).toBe("selector_not_allowed");
  });

  it("refuses an item selector or next-page selector outside the allowlist", () => {
    expect(
      captureError(() =>
        extractList(SPEAKERS_HTML, {
          ...SPEAKERS_SPEC,
          itemSelector: "li ~ li",
        }),
      ).code,
    ).toBe("selector_not_allowed");
    expect(
      captureError(() =>
        extractList(SPEAKERS_HTML, {
          ...SPEAKERS_SPEC,
          nextPageSelector: "a:nth-child(2)",
        }),
      ).code,
    ).toBe("selector_not_allowed");
  });

  it("refuses a page nested deeper than the depth cap", () => {
    const error = captureError(() =>
      extractList(nestedDivs(600), {
        baseUrl: BASE_URL,
        itemSelector: "div",
        fields: [{ name: "text", selector: "div" }],
      }),
    );
    expect(error.code).toBe("page_too_deep");
  });

  it("accepts a page nested 300 levels deep", () => {
    const { rows } = extractList(nestedDivs(300), {
      baseUrl: BASE_URL,
      itemSelector: "div:empty",
      fields: [{ name: "text", selector: "span" }],
    });
    expect(rows).toEqual([]);
    const deep = extractList(nestedDivs(300), {
      baseUrl: BASE_URL,
      itemSelector: "body > div",
      fields: [{ name: "text", selector: "div" }],
    });
    expect(deep.rows).toEqual([{ text: "deep" }]);
  });

  it("counts nesting inside a <template> against the depth cap", () => {
    const html = `<html><body><ul><li class="item">x</li></ul><template>${"<div>".repeat(600)}deep${"</div>".repeat(600)}</template></body></html>`;
    const error = captureError(() =>
      extractList(html, {
        baseUrl: BASE_URL,
        itemSelector: "li.item",
        fields: [{ name: "text", selector: "li" }],
      }),
    );
    expect(error.code).toBe("page_too_deep");
  });

  it("refuses a page 5 000 levels deep without a stack overflow", () => {
    const error = captureError(() =>
      extractList(nestedDivs(5_000), {
        baseUrl: BASE_URL,
        itemSelector: "div",
        fields: [{ name: "text", selector: "div" }],
      }),
    );
    expect(error.code).toBe("page_too_deep");
  });

  it("reads text from an element with a very wide list of children", () => {
    const html = `<ul><li class="item"><p>${"<b></b>".repeat(200_000)}end</p></li></ul>`;
    const { rows } = extractList(html, {
      baseUrl: BASE_URL,
      itemSelector: "li.item",
      fields: [{ name: "text", selector: "p" }],
    });
    expect(rows).toEqual([{ text: "end" }]);
  });

  it("keeps at most MAX_ROWS_PER_PAGE rows", () => {
    const items = Array.from(
      { length: 6_000 },
      (_, i) => `<li class="item"><span>${i}</span></li>`,
    ).join("");
    const { rows, truncated } = extractList(`<ul>${items}</ul>`, {
      baseUrl: BASE_URL,
      itemSelector: "li.item",
      fields: [{ name: "n", selector: "span" }],
    });
    expect(MAX_ROWS_PER_PAGE).toBe(5_000);
    expect(rows).toHaveLength(5_000);
    expect(truncated).toBe(true);
    expect(rows[0]).toEqual({ n: "0" });
    expect(rows[4_999]).toEqual({ n: "4999" });
  });

  it("drops rows past the per-page output budget and says so", () => {
    const longCell = "z".repeat(MAX_CELL_CHARS);
    const items = Array.from(
      { length: 500 },
      () =>
        `<li class="item"><p class="a">${longCell}</p><p class="b">${longCell}</p><p class="c">${longCell}</p></li>`,
    ).join("");
    const { rows, truncated } = extractList(`<ul>${items}</ul>`, {
      baseUrl: BASE_URL,
      itemSelector: "li.item",
      fields: [
        { name: "a", selector: ".a" },
        { name: "b", selector: ".b" },
        { name: "c", selector: ".c" },
      ],
    });
    expect(MAX_OUTPUT_CHARS_PER_PAGE).toBe(2_000_000);
    // Each row holds 6 000 characters: 333 rows fit (1 998 000), 334 do not.
    expect(rows).toHaveLength(333);
    expect(truncated).toBe(true);
    expect(rows[332]).toEqual({ a: longCell, b: longCell, c: longCell });
  });

  it("counts attribute values in the output budget", () => {
    const longValue = "v".repeat(MAX_CELL_CHARS);
    const items = Array.from(
      { length: 1_200 },
      () => `<li class="item"><span data-v="${longValue}">s</span></li>`,
    ).join("");
    const { rows, truncated } = extractList(`<ul>${items}</ul>`, {
      baseUrl: BASE_URL,
      itemSelector: "li.item",
      fields: [{ name: "v", selector: "span", attribute: "data-v" }],
    });
    expect(rows).toHaveLength(1_000);
    expect(truncated).toBe(true);
  });

  it("refuses a base URL that is not http(s)", () => {
    expect(
      captureError(() =>
        extractList(SPEAKERS_HTML, { ...SPEAKERS_SPEC, baseUrl: "not a url" }),
      ).code,
    ).toBe("extract_failed");
  });
});

describe("ExtractError", () => {
  it("is an Error carrying its code", () => {
    const error = new ExtractError("page_too_deep");
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe("page_too_deep");
    expect(error.name).toBe("ExtractError");
  });
});
