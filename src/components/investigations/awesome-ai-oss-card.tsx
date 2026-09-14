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
import {
  AWESOME_LEARN_MORE,
  AWESOME_SOURCE_LABELS,
  displayAwesomeSources,
} from "@/lib/investigations/awesome-ai-oss-sources";
import {
  AWESOME_STAR_TOOLTIP,
  visibleAwesomeStarLine,
} from "@/lib/investigations/awesome-ai-oss-stars";

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
    starTooltip?: string;
    learnMore?: string;
  };
  onVote?: (projectId: string) => void;
  onSave?: (projectId: string) => void;
}) {
  const blurb = card.blurb[locale] || card.blurb.en;
  const showCounts = signedIn && typeof session?.voteCount === "number";
  const starLine = visibleAwesomeStarLine(card);
  const sources = displayAwesomeSources(card.sources);
  const starTooltip = copy.starTooltip ?? AWESOME_STAR_TOOLTIP;
  const learnMore = copy.learnMore ?? AWESOME_LEARN_MORE;

  return (
    <Card className="h-full">
      <CardHeader>
        <Badge variant="secondary">
          {AWESOME_CATEGORY_LABELS[card.category][locale]}
        </Badge>
        <CardTitle className="text-base">{card.name}</CardTitle>
        <CardDescription>{blurb}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-muted-foreground font-mono text-xs">
          {formatAwesomeAddedDate(card.addedOn, locale)}
        </p>
        {starLine ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <p
                data-awesome-star-count=""
                title={starTooltip}
                tabIndex={0}
                className="text-muted-foreground font-mono text-xs"
              >
                {starLine}
              </p>
            </TooltipTrigger>
            <TooltipContent>{starTooltip}</TooltipContent>
          </Tooltip>
        ) : null}
        {sources.length > 0 ? (
          <div>
            <p className="text-foreground text-sm font-medium">{learnMore}</p>
            <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
              {sources.map((source) => (
                <li key={`${source.kind}-${source.href}`}>
                  <a
                    href={source.href}
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-foreground text-sm underline-offset-4 hover:underline"
                  >
                    {AWESOME_SOURCE_LABELS[source.kind]}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
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
