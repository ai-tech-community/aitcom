import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemberStackView } from "./member-stack";

const faces = [
  { userId: "a", displayName: "Ada Lovelace", image: null },
  { userId: "b", displayName: "Bob", image: null },
];

describe("MemberStackView", () => {
  it("renders nothing below the threshold total", () => {
    const { container } = render(<MemberStackView faces={faces} total={3} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when there are no showable faces", () => {
    const { container } = render(<MemberStackView faces={[]} total={50} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders an avatar per face and the overflow count", () => {
    render(<MemberStackView faces={faces} total={396} />);
    // Initials fallbacks render for image-less faces.
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.getByText("B")).toBeInTheDocument();
    // total(396) - shownFaces(2) = 394
    expect(screen.getByText("+394")).toBeInTheDocument();
  });
});
