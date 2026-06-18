import { getTranslations } from "next-intl/server";
import { getPayloadClient } from "@/server/payload";
import Image from "next/image";

const typeLabels: Record<string, string> = {
  remote: "REMOTE",
  hybrid: "HYBRID",
  onsite: "ON-SITE",
};

export default async function CommunityJobsPage() {
  const t = await getTranslations("jobs");

  const payload = await getPayloadClient();
  const { docs: jobs } = await payload.find({
    collection: "jobs",
    where: { status: { equals: "active" } },
    sort: "-postedAt",
    limit: 50,
    depth: 1,
  });

  return (
    <div>
      {jobs.length === 0 ? (
        <p className="text-muted-foreground mt-8 text-center font-mono text-xs tracking-wider">
          {t("noJobs")}
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {jobs.map((job) => {
            const sponsor =
              typeof job.sponsor === "object" ? job.sponsor : null;
            const logo =
              sponsor && typeof sponsor.logo === "object" ? sponsor.logo : null;
            return (
              <a
                key={job.id}
                href={job.url}
                target="_blank"
                rel="noopener noreferrer"
                className="border-border hover:border-foreground/30 flex items-center gap-3 rounded-lg border px-4 py-4 transition-colors sm:gap-4"
              >
                {logo?.url && (
                  <Image
                    src={logo.url}
                    alt={sponsor?.name ?? ""}
                    width={40}
                    height={40}
                    className="h-10 w-10 rounded object-contain"
                  />
                )}
                <div className="flex-1">
                  <span className="text-sm font-medium">{job.title}</span>
                  {sponsor && (
                    <span className="text-muted-foreground ml-2 text-xs">
                      {sponsor.name}
                    </span>
                  )}
                  <div className="text-muted-foreground mt-1 flex gap-2 font-mono text-xs tracking-wider">
                    <span>{job.location}</span>
                    <span className="border-border rounded border px-1.5 py-0.5">
                      {typeLabels[job.type] ?? job.type}
                    </span>
                  </div>
                </div>
                <span className="text-muted-foreground hidden font-mono text-xs font-light sm:inline">
                  +
                </span>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
