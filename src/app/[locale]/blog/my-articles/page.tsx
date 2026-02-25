import { redirect } from "next/navigation";
import { getSession } from "@/server/better-auth/server";
import { getPayloadClient } from "@/server/payload";
import { Link } from "@/i18n/navigation";

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${String(d.getDate()).padStart(2, "0")}`;
}

const statusColors: Record<string, string> = {
  draft: "border-zinc-500/40 text-zinc-400",
  published: "border-green-500/40 text-green-400",
};

const reviewColors: Record<string, string> = {
  pending_review: "border-yellow-500/40 text-yellow-400",
  approved: "border-green-500/40 text-green-400",
  changes_requested: "border-orange-500/40 text-orange-400",
  rejected: "border-red-500/40 text-red-400",
};

const reviewLabels: Record<string, string> = {
  pending_review: "PENDING REVIEW",
  approved: "APPROVED",
  changes_requested: "CHANGES REQUESTED",
  rejected: "REJECTED",
};

export default async function MyArticlesPage() {
  const session = await getSession();
  if (!session?.user) redirect("/auth/signin");

  const payload = await getPayloadClient();
  const { docs: articles } = await payload.find({
    collection: "articles",
    where: { authorId: { equals: session.user.id } },
    sort: "-updatedAt",
    limit: 50,
    depth: 0,
    draft: true,
  });

  return (
    <div className="px-6 py-16 sm:px-12">
      {/* Header */}
      <div className="border-border flex items-center justify-between border-b pb-4">
        <div>
          <h1 className="text-muted-foreground font-mono text-xs font-medium tracking-wider">
            / MY ARTICLES
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Manage your drafts and published articles.
          </p>
        </div>
        <Link
          href="/blog/write"
          className="bg-foreground text-background hover:bg-foreground/90 rounded px-4 py-2 font-mono text-xs tracking-wider transition-colors"
        >
          + WRITE
        </Link>
      </div>

      {articles.length === 0 ? (
        <div className="mt-12 text-center">
          <p className="text-muted-foreground">You haven&apos;t written any articles yet.</p>
          <Link
            href="/blog/write"
            className="text-foreground mt-4 inline-block font-mono text-xs tracking-wider underline underline-offset-4"
          >
            Write your first article
          </Link>
        </div>
      ) : (
        <>
          {/* Table Header - desktop */}
          <div className="border-border hidden items-center border-b px-4 py-2.5 sm:flex">
            <span className="text-muted-foreground w-28 font-mono text-[11px] font-medium tracking-wider">
              / DATE
            </span>
            <span className="text-muted-foreground flex-1 font-mono text-[11px] font-medium tracking-wider">
              / TITLE
            </span>
            <span className="text-muted-foreground w-24 font-mono text-[11px] font-medium tracking-wider">
              / STATUS
            </span>
            <span className="text-muted-foreground w-36 font-mono text-[11px] font-medium tracking-wider">
              / REVIEW
            </span>
            <span className="text-muted-foreground w-16 font-mono text-[11px] font-medium tracking-wider">
              / ACTIONS
            </span>
          </div>

          {/* Article Rows */}
          {articles.map((article) => (
            <div
              key={article.id}
              className="border-border flex flex-col gap-2 border-b px-4 py-4 sm:flex-row sm:items-center sm:gap-0 sm:py-3.5"
            >
              {/* Title */}
              <span className="text-[15px] font-medium leading-snug sm:order-2 sm:flex-1">
                {article.title}
              </span>

              {/* Date */}
              <div className="flex items-center gap-3 sm:order-1 sm:w-28">
                <div className="bg-foreground h-2 w-2 rounded-full" />
                <span className="font-mono text-[12px]">
                  {article.updatedAt ? formatDate(article.updatedAt) : "-"}
                </span>
              </div>

              {/* Status badge */}
              <span
                className={`sm:order-3 sm:w-24 rounded border px-2 py-0.5 font-mono text-[10px] font-medium tracking-wider w-fit ${
                  statusColors[article.status] ?? "border-zinc-500/40 text-zinc-400"
                }`}
              >
                {article.status.toUpperCase()}
              </span>

              {/* Review status */}
              <span className="sm:order-4 sm:w-36">
                {article.reviewStatus ? (
                  <span
                    className={`rounded border px-2 py-0.5 font-mono text-[10px] font-medium tracking-wider ${
                      reviewColors[article.reviewStatus] ?? ""
                    }`}
                  >
                    {reviewLabels[article.reviewStatus] ?? article.reviewStatus}
                  </span>
                ) : (
                  <span className="text-muted-foreground font-mono text-[10px]">-</span>
                )}
              </span>

              {/* Actions */}
              <div className="flex gap-2 sm:order-5 sm:w-16">
                <Link
                  href={`/blog/edit/${article.slug}`}
                  className="text-muted-foreground hover:text-foreground font-mono text-[10px] tracking-wider transition-colors"
                >
                  EDIT
                </Link>
              </div>

              {/* Review note - full width */}
              {article.reviewStatus === "changes_requested" && article.reviewNote && (
                <div className="mt-1 w-full rounded border border-orange-500/20 bg-orange-500/5 px-3 py-2 text-xs sm:order-6">
                  {article.reviewNote}
                </div>
              )}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
