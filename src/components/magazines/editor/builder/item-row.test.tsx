import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithIntl } from "../../test-intl";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import { ItemRow } from "./item-row";

describe("ItemRow", () => {
  it("says when only members see an item", () => {
    renderWithIntl(
      <ul>
        <ItemRow
          view={{
            key: "item-1",
            title: "Community meetup",
            kindLabel: "Event",
            unavailable: false,
            membersOnly: true,
            problem: null,
            highlighted: false,
            selected: false,
          }}
          position={0}
          total={1}
          actions={{
            canMoveUp: false,
            canMoveDown: false,
            onMove: vi.fn(),
            onRemove: vi.fn(),
          }}
        />
      </ul>,
    );
    expect(screen.getByText("Event · Only members see this")).toBeVisible();
  });
});
