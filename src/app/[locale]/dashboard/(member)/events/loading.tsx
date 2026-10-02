import { getTranslations } from "next-intl/server";

import { DashboardSection } from "@/components/dashboard/dashboard-section";
import { ListSkeleton } from "@/components/dashboard/list-skeleton";

/** While the server loads My events: the section heading over a skeleton. */
export default async function DashboardEventsLoading() {
  const t = await getTranslations("events.myEvents");
  return (
    <DashboardSection
      title={t("label")}
      status={{ kind: "loading" }}
      skeleton={<ListSkeleton withAction={false} />}
    />
  );
}
