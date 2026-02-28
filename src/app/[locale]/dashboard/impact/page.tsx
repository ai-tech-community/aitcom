import type { Metadata } from "next";
import { QADashboard } from "@/components/impact/qa-dashboard";

export const metadata: Metadata = {
  title: "Impact QA - AIT",
};

export default function Page() {
  return <QADashboard />;
}
