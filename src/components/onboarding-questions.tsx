"use client";

import { useState } from "react";
import { api } from "@/trpc/react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ChevronRight, SkipForward } from "lucide-react";

type Intent = "learning" | "networking" | "expertise" | "hiring" | "all";
type Experience = "junior" | "mid" | "senior" | "lead";

const INTEREST_OPTIONS = [
  "AI / Machine Learning",
  "Automation / DevOps",
  "Web Development",
  "Data Engineering",
  "Cloud Infrastructure",
] as const;

export function OnboardingQuestions({
  onComplete,
}: {
  onComplete: () => void;
}) {
  const t = useTranslations("onboarding");
  const [step, setStep] = useState(0);
  const [intent, setIntent] = useState<Intent | null>(null);
  const [interests, setInterests] = useState<string[]>([]);
  const [customInterest, setCustomInterest] = useState("");
  const [experience, setExperience] = useState<Experience | null>(null);

  const saveIntent = api.onboarding.saveIntent.useMutation({
    onSuccess: () => onComplete(),
  });
  const skipIntent = api.onboarding.skipIntent.useMutation({
    onSuccess: () => onComplete(),
  });

  const handleSkip = () => skipIntent.mutate();

  const handleNext = () => {
    if (step < 2) {
      setStep((prev) => prev + 1);
    } else if (intent && experience) {
      const allInterests = customInterest.trim()
        ? [...interests, customInterest.trim()]
        : interests;
      saveIntent.mutate({
        intent,
        interests: allInterests,
        experienceLevel: experience,
      });
    }
  };

  const canProceed =
    (step === 0 && intent !== null) ||
    (step === 1 && interests.length > 0) ||
    (step === 2 && experience !== null);

  const toggleInterest = (interest: string) => {
    setInterests((prev) =>
      prev.includes(interest)
        ? prev.filter((i) => i !== interest)
        : [...prev, interest],
    );
  };

  return (
    <div className="mx-auto max-w-lg">
      {/* Progress indicator */}
      <div className="mb-8 flex items-center justify-center gap-2">
        {[0, 1, 2].map((n) => (
          <div
            key={n}
            className={`h-1.5 w-12 rounded-full transition-colors ${
              n <= step ? "bg-primary" : "bg-secondary"
            }`}
          />
        ))}
      </div>

      {/* Step 0: Intent */}
      {step === 0 && (
        <div>
          <h2 className="text-xl font-semibold tracking-tight">{t("q1Title")}</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            {t("q1Subtitle")}
          </p>
          <div className="mt-6 space-y-2">
            {(
              [
                ["learning", t("intentLearning")],
                ["networking", t("intentNetworking")],
                ["expertise", t("intentExpertise")],
                ["hiring", t("intentHiring")],
                ["all", t("intentAll")],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                onClick={() => setIntent(value)}
                className={`w-full rounded-lg border px-4 py-3 text-left text-sm transition-colors ${
                  intent === value
                    ? "border-primary bg-primary/5 text-foreground"
                    : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 1: Interests */}
      {step === 1 && (
        <div>
          <h2 className="text-xl font-semibold tracking-tight">{t("q2Title")}</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            {t("q2Subtitle")}
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            {INTEREST_OPTIONS.map((option) => (
              <button
                key={option}
                onClick={() => toggleInterest(option)}
                className={`rounded-full border px-4 py-2 font-mono text-xs tracking-wider transition-colors ${
                  interests.includes(option)
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                }`}
              >
                {option}
              </button>
            ))}
          </div>
          <input
            type="text"
            placeholder={t("otherInterest")}
            value={customInterest}
            onChange={(e) => setCustomInterest(e.target.value)}
            className="border-border placeholder:text-muted-foreground focus:border-primary mt-4 w-full rounded-lg border bg-transparent px-4 py-2 text-sm focus:outline-none"
          />
        </div>
      )}

      {/* Step 2: Experience */}
      {step === 2 && (
        <div>
          <h2 className="text-xl font-semibold tracking-tight">{t("q3Title")}</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            {t("q3Subtitle")}
          </p>
          <div className="mt-6 space-y-2">
            {(
              [
                ["junior", t("expJunior")],
                ["mid", t("expMid")],
                ["senior", t("expSenior")],
                ["lead", t("expLead")],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                onClick={() => setExperience(value)}
                className={`w-full rounded-lg border px-4 py-3 text-left text-sm transition-colors ${
                  experience === value
                    ? "border-primary bg-primary/5 text-foreground"
                    : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="mt-8 flex items-center justify-between">
        <button
          onClick={handleSkip}
          disabled={skipIntent.isPending}
          className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm transition-colors"
        >
          <SkipForward className="h-3.5 w-3.5" />
          {t("skip")}
        </button>
        <Button
          onClick={handleNext}
          disabled={!canProceed || saveIntent.isPending}
          className="gap-1 font-mono text-xs tracking-wider"
        >
          {step === 2 ? t("finish") : t("next")}
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
