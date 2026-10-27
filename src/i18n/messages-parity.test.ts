import { describe, expect, it } from "vitest";

import en from "../../messages/en.json";
import nl from "../../messages/nl.json";

function flattenedKeys(value: object, prefix = ""): string[] {
  return Object.entries(value).flatMap(([key, child]: [string, unknown]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof child === "object" && child !== null
      ? flattenedKeys(child, path)
      : [path];
  });
}

describe("message catalogues", () => {
  it("en and nl have the same keys for the magazine and badge copy", () => {
    for (const [english, dutch] of [
      [en.magazineEditor, nl.magazineEditor],
      [en.magazines, nl.magazines],
      [en.articleEditor.magazine, nl.articleEditor.magazine],
      [en.badges, nl.badges],
    ]) {
      expect(flattenedKeys(dutch!).sort()).toEqual(
        flattenedKeys(english!).sort(),
      );
    }
  });
});
