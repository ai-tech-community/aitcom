import type { Metadata } from "next";
import { LaunchpadForm } from "@/components/launchpad/launchpad-form";

export const metadata: Metadata = {
  title: "Submit Project - Launchpad",
};

export default function NewLaunchpadProjectPage() {
  return <LaunchpadForm mode="create" />;
}
