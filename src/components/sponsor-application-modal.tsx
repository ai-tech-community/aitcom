"use client";

import { useReducer, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { api } from "@/trpc/react";

type Tier = "gold" | "silver" | "bronze";

type FormState = {
  step: number;
  success: boolean;
  companyName: string;
  website: string;
  contactName: string;
  contactEmail: string;
  tier: Tier;
  message: string;
};

type FormAction =
  | { type: "SET_STEP"; step: number }
  | { type: "SET_FIELD"; field: keyof FormState; value: string }
  | { type: "SET_TIER"; tier: Tier }
  | { type: "SET_SUCCESS" }
  | { type: "RESET" };

const initialState: FormState = {
  step: 1,
  success: false,
  companyName: "",
  website: "",
  contactName: "",
  contactEmail: "",
  tier: "silver",
  message: "",
};

function formReducer(state: FormState, action: FormAction): FormState {
  switch (action.type) {
    case "SET_STEP":
      return { ...state, step: action.step };
    case "SET_FIELD":
      return { ...state, [action.field]: action.value };
    case "SET_TIER":
      return { ...state, tier: action.tier };
    case "SET_SUCCESS":
      return { ...state, success: true };
    case "RESET":
      return initialState;
  }
}

export function SponsorApplicationModal() {
  const t = useTranslations("sponsors");
  const [open, setOpen] = useState(false);
  const [state, dispatch] = useReducer(formReducer, initialState);
  const { step, success, companyName, website, contactName, contactEmail, tier, message } = state;

  const applyMutation = api.sponsors.submitApplication.useMutation({
    onSuccess: () => dispatch({ type: "SET_SUCCESS" }),
  });

  function handleSubmit() {
    applyMutation.mutate({
      companyName,
      website: website || undefined,
      contactName,
      contactEmail,
      tier,
      message: message || undefined,
    });
  }

  const tierKey = (t_tier: Tier) =>
    `tier${t_tier.charAt(0).toUpperCase() + t_tier.slice(1)}` as
      | "tierGold"
      | "tierSilver"
      | "tierBronze";

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) dispatch({ type: "RESET" });
      }}
    >
      <DialogTrigger asChild>
        <button className="bg-foreground text-background rounded px-6 py-3 font-mono text-sm font-semibold transition-opacity hover:opacity-80">
          {t("becomeSponsor")}
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-mono text-sm tracking-wider">
            {success ? t("successTitle") : t("applyTitle")}
          </DialogTitle>
        </DialogHeader>

        {success ? (
          <div className="space-y-4 py-4">
            <p className="text-muted-foreground text-sm">
              {t("successMessage")}
            </p>
            <button
              onClick={() => setOpen(false)}
              className="bg-foreground text-background rounded px-4 py-2 font-mono text-xs font-semibold"
            >
              {t("close")}
            </button>
          </div>
        ) : (
          <div className="space-y-6 py-4">
            {/* Step indicators */}
            <div className="flex gap-2">
              {[1, 2, 3].map((s) => (
                <div
                  key={s}
                  className={`h-1 flex-1 rounded ${s <= step ? "bg-foreground" : "bg-border"}`}
                />
              ))}
            </div>

            {/* Step 1: Company Info */}
            {step === 1 && (
              <div className="space-y-4">
                <p className="text-muted-foreground font-mono text-xs tracking-wider">
                  {t("stepCompany")}
                </p>
                <div className="space-y-3">
                  <label className="block">
                    <span className="font-mono text-xs">
                      {t("companyName")}
                    </span>
                    <input
                      type="text"
                      value={companyName}
                      onChange={(e) => dispatch({ type: "SET_FIELD", field: "companyName", value: e.target.value })}
                      className="border-border bg-background mt-1 block w-full rounded border px-3 py-2 font-mono text-sm"
                      required
                    />
                  </label>
                  <label className="block">
                    <span className="font-mono text-xs">{t("website")}</span>
                    <input
                      type="url"
                      value={website}
                      onChange={(e) => dispatch({ type: "SET_FIELD", field: "website", value: e.target.value })}
                      className="border-border bg-background mt-1 block w-full rounded border px-3 py-2 font-mono text-sm"
                    />
                  </label>
                  <label className="block">
                    <span className="font-mono text-xs">
                      {t("contactName")}
                    </span>
                    <input
                      type="text"
                      value={contactName}
                      onChange={(e) => dispatch({ type: "SET_FIELD", field: "contactName", value: e.target.value })}
                      className="border-border bg-background mt-1 block w-full rounded border px-3 py-2 font-mono text-sm"
                      required
                    />
                  </label>
                  <label className="block">
                    <span className="font-mono text-xs">
                      {t("contactEmail")}
                    </span>
                    <input
                      type="email"
                      value={contactEmail}
                      onChange={(e) => dispatch({ type: "SET_FIELD", field: "contactEmail", value: e.target.value })}
                      className="border-border bg-background mt-1 block w-full rounded border px-3 py-2 font-mono text-sm"
                      required
                    />
                  </label>
                </div>
                <div className="flex justify-end">
                  <button
                    onClick={() => dispatch({ type: "SET_STEP", step: 2 })}
                    disabled={!companyName || !contactName || !contactEmail}
                    className="bg-foreground text-background rounded px-4 py-2 font-mono text-xs font-semibold disabled:opacity-40"
                  >
                    {t("next")}
                  </button>
                </div>
              </div>
            )}

            {/* Step 2: Tier Selection */}
            {step === 2 && (
              <div className="space-y-4">
                <p className="text-muted-foreground font-mono text-xs tracking-wider">
                  {t("stepTier")}
                </p>
                <div className="grid gap-3">
                  {(["gold", "silver", "bronze"] as const).map((t_tier) => (
                    <button
                      key={t_tier}
                      onClick={() => dispatch({ type: "SET_TIER", tier: t_tier })}
                      className={`rounded border p-4 text-left font-mono text-sm transition-colors ${
                        tier === t_tier
                          ? "border-foreground bg-foreground/5"
                          : "border-border hover:border-foreground/30"
                      }`}
                    >
                      {t(tierKey(t_tier)).toUpperCase()}
                    </button>
                  ))}
                </div>
                <div className="flex justify-between">
                  <button
                    onClick={() => dispatch({ type: "SET_STEP", step: 1 })}
                    className="text-muted-foreground font-mono text-xs hover:underline"
                  >
                    {t("back")}
                  </button>
                  <button
                    onClick={() => dispatch({ type: "SET_STEP", step: 3 })}
                    className="bg-foreground text-background rounded px-4 py-2 font-mono text-xs font-semibold"
                  >
                    {t("next")}
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: Message */}
            {step === 3 && (
              <div className="space-y-4">
                <p className="text-muted-foreground font-mono text-xs tracking-wider">
                  {t("stepMessage")}
                </p>
                <label className="block">
                  <span className="font-mono text-xs">{t("message")}</span>
                  <textarea
                    value={message}
                    onChange={(e) => dispatch({ type: "SET_FIELD", field: "message", value: e.target.value })}
                    rows={4}
                    className="border-border bg-background mt-1 block w-full rounded border px-3 py-2 font-mono text-sm"
                    placeholder={t("messagePlaceholder")}
                  />
                </label>
                <div className="flex justify-between">
                  <button
                    onClick={() => dispatch({ type: "SET_STEP", step: 2 })}
                    className="text-muted-foreground font-mono text-xs hover:underline"
                  >
                    {t("back")}
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={applyMutation.isPending}
                    className="bg-foreground text-background rounded px-4 py-2 font-mono text-xs font-semibold disabled:opacity-40"
                  >
                    {applyMutation.isPending ? t("submitting") : t("submit")}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
