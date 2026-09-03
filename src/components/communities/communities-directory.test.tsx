import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

vi.mock("./discover/town-square-hero", () => ({
  TownSquareHero: () => <div>hero</div>,
}));
vi.mock("./discover/discover-facets", () => ({
  DiscoverFacets: () => <div>facets</div>,
}));
vi.mock("./discover/discover-communities", () => ({
  DiscoverCommunities: () => <div>communities</div>,
}));
vi.mock("./discover/discover-spaces", () => ({
  DiscoverSpaces: () => <div>spaces</div>,
}));
vi.mock("./create-community-dialog", () => ({
  CreateCommunityDialog: () => <button type="button">create</button>,
}));

import { CommunitiesDirectory } from "./communities-directory";

describe("CommunitiesDirectory", () => {
  it("uses the same max-w-6xl page shell as Events", () => {
    const { container } = render(<CommunitiesDirectory />);
    const shell = container.firstElementChild;
    expect(shell?.className.split(/\s+/)).toContain("max-w-6xl");
    expect(shell?.className.split(/\s+/)).not.toContain("max-w-5xl");
  });
});
