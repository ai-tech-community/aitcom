import { Skeleton } from "@/components/ui/skeleton";

/** A tab's content while it loads; the frame around it stays in place. */
export default function MemberProfileTabLoading() {
  return (
    <div aria-busy="true" className="space-y-8">
      {[0, 1].map((block) => (
        <div key={block} className="space-y-3">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ))}
    </div>
  );
}
