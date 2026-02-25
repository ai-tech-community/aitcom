"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ChallengeList } from "@/components/challenges/challenge-list";
import { SponsorChallengeForm } from "@/components/challenges/sponsor-challenge-form";
import { Plus } from "lucide-react";

export function ChallengesDashboardContent() {
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="space-y-6">
      {!showForm && (
        <div className="flex justify-end">
          <Button
            onClick={() => setShowForm(true)}
            className="font-mono text-xs tracking-wider"
          >
            <Plus className="h-3.5 w-3.5" />
            Create Challenge
          </Button>
        </div>
      )}

      {showForm && (
        <SponsorChallengeForm
          onCancel={() => setShowForm(false)}
          onCreated={() => setShowForm(false)}
        />
      )}

      <ChallengeList />
    </div>
  );
}
