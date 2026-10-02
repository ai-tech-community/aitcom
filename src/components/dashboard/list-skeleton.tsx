import { Skeleton } from "@/components/ui/skeleton";

/**
 * Loading placeholder for a divided list of rows (a line of text, a meta
 * line, and an optional action on the right), the shape most dashboard
 * tabs load into.
 */
export function ListSkeleton({
  rows = 3,
  withAction = true,
}: {
  rows?: number;
  withAction?: boolean;
}) {
  return (
    <ul className="divide-border divide-y" data-slot="list-skeleton">
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="flex items-center gap-4 py-3">
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-24" />
          </div>
          {withAction && <Skeleton className="h-8 w-24" />}
        </li>
      ))}
    </ul>
  );
}
