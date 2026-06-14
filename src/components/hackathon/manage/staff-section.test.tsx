import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StaffSection } from "./staff-section";

const { mockUseUtils, mockRevoke, mockRevokeInvite } = vi.hoisted(() => ({
  mockUseUtils: vi.fn(),
  mockRevoke: vi.fn(),
  mockRevokeInvite: vi.fn(),
}));

vi.mock("@/trpc/react", () => ({
  api: {
    useUtils: mockUseUtils,
    hackathon: {
      listStaff: { invalidate: vi.fn() },
      revokeStaff: { useMutation: mockRevoke },
      revokeStaffInvite: { useMutation: mockRevokeInvite },
      // referenced by the nested StaffPicker:
      listStaffCandidates: {
        useQuery: () => ({ isFetching: false, data: undefined }),
      },
      grantStaff: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      inviteStaffByEmail: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
    },
  },
}));

describe("StaffSection", () => {
  it("renders members (avatar/name/email + Remove) and pending invites (Cancel)", () => {
    mockUseUtils.mockReturnValue({
      hackathon: {
        listStaff: { invalidate: vi.fn() },
        listStaffCandidates: { invalidate: vi.fn() },
      },
    });
    const revokeMutate = vi.fn();
    mockRevoke.mockReturnValue({ mutate: revokeMutate, isPending: false });
    const cancelMutate = vi.fn();
    mockRevokeInvite.mockReturnValue({ mutate: cancelMutate, isPending: false });

    render(
      <StaffSection
        challengeId={1}
        role="judge"
        title="Judges"
        members={[
          {
            id: "s1",
            userId: "u1",
            displayName: "Judy Judge",
            email: "judy@example.com",
            image: null,
          },
        ]}
        pendingInvites={[
          { id: "inv1", email: "ext@example.com", role: "judge" },
        ]}
      />,
    );

    expect(screen.getByText("Judy Judge")).toBeInTheDocument();
    expect(screen.getByText("judy@example.com")).toBeInTheDocument();
    expect(screen.getByText("ext@example.com")).toBeInTheDocument();
    expect(screen.getByText(/invited · pending/i)).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: /remove judy judge/i }),
    );
    expect(revokeMutate).toHaveBeenCalledWith({
      challengeId: 1,
      userId: "u1",
      role: "judge",
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: /cancel invite for ext@example.com/i,
      }),
    );
    expect(cancelMutate).toHaveBeenCalledWith({ inviteId: "inv1" });
  });
});
