import { describe, it, expect } from "vitest";
import { generateSlug } from "./slug-utils";

describe("generateSlug", () => {
  it("lowercases and hyphenates", () => {
    expect(generateSlug("PyTorch Amsterdam")).toBe("pytorch-amsterdam");
  });
  it("strips special characters", () => {
    expect(generateSlug("AI & ML Community!")).toBe("ai-ml-community");
  });
  it("collapses multiple hyphens", () => {
    expect(generateSlug("hello---world")).toBe("hello-world");
  });
  it("trims leading/trailing hyphens", () => {
    expect(generateSlug("--hello--")).toBe("hello");
  });
  it("handles unicode", () => {
    expect(generateSlug("café AI")).toBe("cafe-ai");
  });
});
