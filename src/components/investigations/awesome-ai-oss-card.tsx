import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AWESOME_CATEGORY_LABELS,
  formatAwesomeAddedDate,
  type AwesomeLocale,
  type AwesomePublicCard,
} from "@/lib/investigations/awesome-ai-oss";

export type AwesomeCardSession = {
  voteCount?: number;
  voted?: boolean;
  saved?: boolean;
};

export function AwesomeAiOssCard({
  card,
  locale,
  signedIn,
  session,
  copy,
  onVote,
  onSave,
}: {
  card: AwesomePublicCard;
  locale: AwesomeLocale;
  signedIn: boolean;
  session?: AwesomeCardSession;
  copy: {
    openRepo: string;
    vote: string;
    voted: string;
    removeVote: string;
    voteTooltip: string;
    save: string;
    saved: string;
  };
  onVote?: (projectId: string) => void;
  onSave?: (projectId: string) => void;
}) {
  const blurb = card.blurb[locale] || card.blurb.en;
  const showCounts = signedIn && typeof session?.voteCount === "number";

  return (
    <Card className="h-full">
      <CardHeader>
        <Badge variant="secondary">
          {AWESOME_CATEGORY_LABELS[card.category][locale]}
        </Badge>
        <CardTitle className="text-base">{card.name}</CardTitle>
        <CardDescription>{blurb}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground font-mono text-xs">
          {formatAwesomeAddedDate(card.addedOn, locale)}
        </p>
      </CardContent>
      <CardFooter className="flex flex-wrap items-center gap-2">
        {signedIn ? (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="sm"
                  variant={session?.voted ? "secondary" : "outline"}
                  onClick={() => onVote?.(card.id)}
                  title={session?.voted ? copy.removeVote : copy.voteTooltip}
                >
                  {session?.voted ? copy.voted : copy.vote}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {session?.voted ? copy.removeVote : copy.voteTooltip}
              </TooltipContent>
            </Tooltip>
            {showCounts ? (
              <span
                data-awesome-vote-count=""
                className="text-muted-foreground font-mono text-xs"
              >
                {session.voteCount}
              </span>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => onSave?.(card.id)}
            >
              {session?.saved ? copy.saved : copy.save}
            </Button>
          </>
        ) : null}
        <Button asChild size="sm" variant="outline">
          <a href={card.repoUrl} rel="noopener noreferrer">
            {copy.openRepo}
          </a>
        </Button>
      </CardFooter>
    </Card>
  );
}
