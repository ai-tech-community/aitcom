import { getTranslations } from "next-intl/server";

import { DashboardSection } from "@/components/dashboard/dashboard-section";

/** While the server loads the Job tracker: the section heading over a skeleton. */
export default async function DashboardJobsLoading() {
  const t = await getTranslations("jobsBoard");
  return <DashboardSection title={t("title")} status={{ kind: "loading" }} />;
}
