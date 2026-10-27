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

import { ItemRow, type ItemRowView } from "./item-row";

describe("ItemRow", () => {
  it.each([
    { reason: { type: "mostReplies" as const, count: 42 } },
    { reason: null },
  ])("shows why the magazine picked the item ($reason)", ({ reason }) => {
    const view: ItemRowView = {
      key: "thread-1",
      title: "Community chat",
      kindLabel: "Forum thread",
      reason,
      unavailable: false,
      membersOnly: false,
      problem: null,
      highlighted: false,
      selected: false,
    };
    renderWithIntl(
      <ul>
        <ItemRow
          view={view}
          position={1}
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
    const line = screen.queryByText(/Picked because:/);
    if (reason) {
      expect(line).toHaveTextContent(
        "Picked because: Most talked about: 42 replies",
      );
      expect(line).toHaveClass("text-muted-foreground", "text-xs");
    } else expect(line).toBeNull();
  });

  it("exposes its edit button so Done can return focus", () => {
    const editButtonRef = vi.fn();
    renderWithIntl(
      <ul>
        <ItemRow
          view={{
            key: "item-1",
            title: "Community meetup",
            kindLabel: "Event",
            reason: null,
            unavailable: false,
            membersOnly: false,
            problem: null,
            highlighted: false,
            selected: false,
            onEdit: vi.fn(),
            editButtonRef,
          }}
          position={1}
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
    expect(editButtonRef).toHaveBeenCalledWith(
      screen.getByRole("button", { name: /^Community meetup/ }),
    );
  });

  it("says when only members see an item", () => {
    renderWithIntl(
      <ul>
        <ItemRow
          view={{
            key: "item-1",
            title: "Community meetup",
            kindLabel: "Event",
            reason: null,
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
