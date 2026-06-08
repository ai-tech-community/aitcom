import { describe, expect, it } from "vitest";
import { courseProgressPercent, canCreateCourse, youtubeEmbedUrl } from "./classroom";

describe("courseProgressPercent", () => {
  it("is 0 when there are no lessons", () => {
    expect(courseProgressPercent(0, 0)).toBe(0);
  });
  it("is 0 when nothing completed", () => {
    expect(courseProgressPercent(0, 5)).toBe(0);
  });
  it("rounds to nearest percent", () => {
    expect(courseProgressPercent(1, 3)).toBe(33);
    expect(courseProgressPercent(2, 3)).toBe(67);
  });
  it("caps at 100", () => {
    expect(courseProgressPercent(5, 5)).toBe(100);
    expect(courseProgressPercent(6, 5)).toBe(100);
  });
});

describe("canCreateCourse", () => {
  it("allows any active member under all_members", () => {
    expect(canCreateCourse("all_members", "member")).toBe(true);
  });
  it("blocks non-admins under admins_only", () => {
    expect(canCreateCourse("admins_only", "member")).toBe(false);
    expect(canCreateCourse("admins_only", "moderator")).toBe(false);
  });
  it("allows owner/admin under admins_only", () => {
    expect(canCreateCourse("admins_only", "owner")).toBe(true);
    expect(canCreateCourse("admins_only", "admin")).toBe(true);
  });
  it("blocks a non-member regardless of policy", () => {
    expect(canCreateCourse("all_members", null)).toBe(false);
  });
});

describe("youtubeEmbedUrl", () => {
  it("converts watch URLs", () => {
    expect(youtubeEmbedUrl("https://www.youtube.com/watch?v=abc123")).toBe("https://www.youtube.com/embed/abc123");
  });
  it("converts youtu.be URLs", () => {
    expect(youtubeEmbedUrl("https://youtu.be/abc123")).toBe("https://www.youtube.com/embed/abc123");
  });
  it("returns null for non-youtube", () => {
    expect(youtubeEmbedUrl("https://vimeo.com/123")).toBeNull();
  });
  it("returns null for a malformed url", () => {
    expect(youtubeEmbedUrl("not a url")).toBeNull();
  });
});
