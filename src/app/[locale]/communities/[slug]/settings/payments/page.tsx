"use client";
import { use } from "react";
import { PaymentsSettings } from "@/components/communities/payments/payments-settings";

export default function CommunityPaymentsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  return <PaymentsSettings slug={use(params).slug} />;
}
