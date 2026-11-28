import { Skeleton } from "@/components/ui/skeleton";
import { isOpenCommunitiesEnabled } from "@/lib/communities/redesign-flag";

/** A tab's content while it loads; the frame around it stays in place. */
export default function MemberProfileTabLoading() {
  if (isOpenCommunitiesEnabled()) {
    return (
      <div aria-busy="true" className="space-y-8">
        {[0, 1].map((block) => (
          <div key={block} className="space-y-3">
            <Skeleton className="h-6 w-36 motion-reduce:animate-none" />
            <div className="border-border space-y-3 border-t pt-4">
              <Skeleton className="h-4 w-3/4 motion-reduce:animate-none" />
              <Skeleton className="h-4 w-1/2 motion-reduce:animate-none" />
            </div>
          </div>
        ))}
      </div>
    );
  }
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
