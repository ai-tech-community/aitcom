import { EmptyState } from "@/components/ui/empty-state";

/**
 * What an empty profile section says. The owner gets an EmptyState that
 * teaches the next step (with an action when there is one); a visitor gets
 * one quiet line, since there is nothing for them to do about it.
 */
export function ProfileEmpty({
  isOwner,
  title,
  description,
  action,
  visitorText,
}: {
  isOwner: boolean;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  visitorText: React.ReactNode;
}) {
  if (!isOwner) {
    return <p className="text-muted-foreground py-2 text-sm">{visitorText}</p>;
  }
  return (
    <EmptyState
      className="items-start px-0 py-4 text-left [&_p]:mx-0"
      title={title}
      description={description}
      action={action}
    />
  );
}
