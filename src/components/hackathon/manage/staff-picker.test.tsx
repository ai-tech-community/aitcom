import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StaffPicker } from "./staff-picker";

const { mockCandidates, mockUseUtils, mockGrant, mockInvite } = vi.hoisted(
  () => ({
    mockCandidates: vi.fn(),
    mockUseUtils: vi.fn(),
    mockGrant: vi.fn(),
    mockInvite: vi.fn(),
  }),
);

vi.mock("@/trpc/react", () => ({
  api: {
    useUtils: mockUseUtils,
    hackathon: {
      listStaffCandidates: { useQuery: mockCandidates },
      listStaff: { invalidate: vi.fn() },
      grantStaff: { useMutation: mockGrant },
      inviteStaffByEmail: { useMutation: mockInvite },
    },
  },
}));

function setup() {
  mockUseUtils.mockReturnValue({
    hackathon: {
      listStaff: { invalidate: vi.fn() },
      listStaffCandidates: { invalidate: vi.fn() },
    },
  });
  mockGrant.mockReturnValue({ mutate: vi.fn(), isPending: false });
  mockInvite.mockReturnValue({ mutate: vi.fn(), isPending: false });
}

describe("StaffPicker", () => {
  it("renders matching candidates with email + Add", () => {
    setup();
    mockCandidates.mockReturnValue({
      isFetching: false,
      data: {
        items: [
          {
            userId: "m1",
            displayName: "Mara Member",
            email: "mara@example.com",
            image: null,
          },
        ],
      },
    });

    render(<StaffPicker challengeId={1} role="judge" />);
    fireEvent.change(screen.getByPlaceholderText(/search members/i), {
      target: { value: "mara" },
    });

    expect(screen.getByText("Mara Member")).toBeInTheDocument();
    expect(screen.getByText("mara@example.com")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
  });

  it("offers invite-by-email when the term is an email with no match", () => {
    setup();
    const inviteMutate = vi.fn();
    mockInvite.mockReturnValue({ mutate: inviteMutate, isPending: false });
    mockCandidates.mockReturnValue({
      isFetching: false,
      data: { items: [] },
    });

    render(<StaffPicker challengeId={1} role="judge" />);
    fireEvent.change(screen.getByPlaceholderText(/search members/i), {
      target: { value: "outsider@example.com" },
    });

    const inviteBtn = screen.getByRole("button", { name: /invite judge/i });
    fireEvent.click(inviteBtn);
    expect(inviteMutate).toHaveBeenCalledWith({
      challengeId: 1,
      email: "outsider@example.com",
      role: "judge",
    });
  });
});
