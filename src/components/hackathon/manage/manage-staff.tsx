"use client";

import { useState } from "react";
import { toast } from "sonner";

import { api } from "@/trpc/react";

export function ManageStaff({
  challengeId,
  isAdmin,
}: {
  challengeId: number;
  isAdmin: boolean;
}) {
  const utils = api.useUtils();
  const staff = api.hackathon.listStaff.useQuery({ challengeId });
  const [organizerId, setOrganizerId] = useState("");
  const [judgeId, setJudgeId] = useState("");

  const grant = api.hackathon.grantStaff.useMutation({
    onSuccess: () => {
      void utils.hackathon.listStaff.invalidate({ challengeId });
      setOrganizerId("");
      setJudgeId("");
    },
    onError: (e) => toast.error(e.message),
  });
  const revoke = api.hackathon.revokeStaff.useMutation({
    onSuccess: () => void utils.hackathon.listStaff.invalidate({ challengeId }),
    onError: (e) => toast.error(e.message),
  });

  if (staff.isLoading || !staff.data) return null;

  return (
    <div className="space-y-6">
      {isAdmin && (
        <section>
          <h3 className="font-medium">Organizers</h3>
          <ul className="mt-2 space-y-1">
            {staff.data.organizers.map((o) => (
              <li key={o.id} className="flex items-center justify-between">
                <span>{o.userId}</span>
                <button
                  className="text-sm text-red-600"
                  onClick={() =>
                    revoke.mutate({
                      challengeId,
                      userId: o.userId,
                      role: "organizer",
                    })
                  }
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex gap-2">
            <input
              className="border px-2 py-1"
              placeholder="user id"
              value={organizerId}
              onChange={(e) => setOrganizerId(e.target.value)}
            />
            <button
              disabled={!organizerId || grant.isPending}
              onClick={() =>
                grant.mutate({
                  challengeId,
                  userId: organizerId,
                  role: "organizer",
                })
              }
            >
              Add organizer
            </button>
          </div>
        </section>
      )}

      <section>
        <h3 className="font-medium">Judges</h3>
        <ul className="mt-2 space-y-1">
          {staff.data.judges.map((j) => (
            <li key={j.id} className="flex items-center justify-between">
              <span>{j.userId}</span>
              <button
                className="text-sm text-red-600"
                onClick={() =>
                  revoke.mutate({
                    challengeId,
                    userId: j.userId,
                    role: "judge",
                  })
                }
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex gap-2">
          <input
            className="border px-2 py-1"
            placeholder="user id"
            value={judgeId}
            onChange={(e) => setJudgeId(e.target.value)}
          />
          <button
            disabled={!judgeId || grant.isPending}
            onClick={() =>
              grant.mutate({ challengeId, userId: judgeId, role: "judge" })
            }
          >
            Add judge
          </button>
        </div>
      </section>
    </div>
  );
}
