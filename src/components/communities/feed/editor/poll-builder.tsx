"use client";

import { useEffect, useId, useRef } from "react";
import { useTranslations } from "next-intl";
import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  MAX_POLL_OPTION_LENGTH,
  MAX_POLL_OPTIONS,
  MIN_POLL_OPTIONS,
  POLL_DAYS,
  pollProblem,
  type FeedPollView,
  type PollChoice,
  type PollDays,
} from "@/lib/poll-rules";

/** The answer counter appears once this few characters are left. */
const COUNTER_FROM = 15;

/** A new poll: two empty answers, open for the default number of days. */
export function emptyPoll(days: PollDays = 3): PollChoice {
  return { options: ["", ""], days };
}

/**
 * Setting up a poll while writing a post: the post's text is the question,
 * and here go its answers (2 to 4) and how long it stays open. Two answers
 * are always there; more can be added and removed. Two answers that are
 * the same are pointed out as they are typed. The first answer takes the
 * focus when the poll is added (`autoFocus`).
 */
export function PollBuilder({
  value,
  onChange,
  onRemove,
  autoFocus,
  disabled,
}: {
  value: PollChoice;
  onChange: (poll: PollChoice) => void;
  /** Takes the poll off the post. */
  onRemove: () => void;
  autoFocus?: boolean;
  disabled?: boolean;
}) {
  const t = useTranslations("communities.feed.editor");
  const id = useId();
  const inputs = useRef(new Map<number, HTMLInputElement>());
  const focusNext = useRef<number | null>(autoFocus ? 0 : null);

  useEffect(() => {
    const index = focusNext.current;
    if (index === null) return;
    focusNext.current = null;
    inputs.current.get(index)?.focus();
  }, [value.options.length]);

  const setOption = (index: number, label: string) =>
    onChange({
      ...value,
      options: value.options.map((option, i) => (i === index ? label : option)),
    });

  const addOption = () => {
    focusNext.current = value.options.length;
    onChange({ ...value, options: [...value.options, ""] });
  };

  const removeOption = (index: number) => {
    focusNext.current = Math.min(index, value.options.length - 2);
    onChange({
      ...value,
      options: value.options.filter((_, i) => i !== index),
    });
  };

  const duplicate = pollProblem(value.options) === "duplicate";

  return (
    <div
      role="group"
      aria-labelledby={`${id}-kicker`}
      className="border-border space-y-2 rounded-lg border p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <p
          id={`${id}-kicker`}
          className="text-muted-foreground font-mono text-xs uppercase"
        >
          {t("pollKicker")}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onRemove}
          disabled={disabled}
          aria-label={t("removePoll")}
        >
          <X aria-hidden="true" className="size-4" />
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">{t("pollHelp")}</p>
      <ol className="space-y-2">
        {value.options.map((option, index) => {
          const inputId = `${id}-answer-${index}`;
          const left = MAX_POLL_OPTION_LENGTH - option.length;
          return (
            <li key={index} className="space-y-1">
              <div className="flex items-center gap-1.5">
                <label htmlFor={inputId} className="sr-only">
                  {t("pollAnswerLabel", { number: index + 1 })}
                </label>
                <Input
                  ref={(el) => {
                    if (el) inputs.current.set(index, el);
                    else inputs.current.delete(index);
                  }}
                  id={inputId}
                  value={option}
                  onChange={(e) => setOption(index, e.target.value)}
                  maxLength={MAX_POLL_OPTION_LENGTH}
                  placeholder={t("pollAnswerLabel", { number: index + 1 })}
                  disabled={disabled}
                  className="h-9"
                />
                {index >= MIN_POLL_OPTIONS ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => removeOption(index)}
                    disabled={disabled}
                    aria-label={t("removePollAnswer", { number: index + 1 })}
                  >
                    <X aria-hidden="true" className="size-4" />
                  </Button>
                ) : null}
              </div>
              {left <= COUNTER_FROM ? (
                <p className="text-muted-foreground text-right font-mono text-xs tabular-nums">
                  {t("charactersLeft", { count: left })}
                </p>
              ) : null}
            </li>
          );
        })}
      </ol>
      {duplicate ? (
        <p role="alert" className="text-destructive text-xs">
          {t("pollDuplicate")}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {value.options.length < MAX_POLL_OPTIONS ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={addOption}
            disabled={disabled}
          >
            <Plus aria-hidden="true" className="size-4" />
            {t("addPollAnswer")}
          </Button>
        ) : (
          <span />
        )}
        <label className="text-muted-foreground flex items-center gap-2 text-xs">
          {t("pollClosesIn")}
          <select
            value={value.days}
            onChange={(e) =>
              onChange({ ...value, days: Number(e.target.value) as PollDays })
            }
            disabled={disabled}
            className="border-input bg-background text-foreground focus-visible:border-ring focus-visible:ring-ring/50 h-8 rounded-md border px-2 text-base outline-none focus-visible:ring-[3px] disabled:opacity-50 md:text-sm"
          >
            {POLL_DAYS.map((days) => (
              <option key={days} value={days}>
                {t("pollDays", { count: days })}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}

/**
 * The poll a post already carries, in the edit form: its answers and votes,
 * a way to change the answers while no one has voted (`onChange`, absent
 * once there are votes or it has closed: votes were cast for those words),
 * and one to take it off. Nothing changes until the post is saved.
 */
export function CurrentPoll({
  poll,
  onChange,
  onRemove,
  disabled,
}: {
  poll: FeedPollView;
  onChange?: () => void;
  onRemove: () => void;
  disabled?: boolean;
}) {
  const t = useTranslations("communities.feed.editor");
  const tp = useTranslations("communities.feed.poll");
  const id = useId();
  return (
    <div
      role="group"
      aria-labelledby={`${id}-kicker`}
      className="border-border space-y-2 rounded-lg border p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <p
          id={`${id}-kicker`}
          className="text-muted-foreground font-mono text-xs uppercase"
        >
          {t("currentPoll")}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onRemove}
          disabled={disabled}
          aria-label={t("removePoll")}
        >
          <X aria-hidden="true" className="size-4" />
        </Button>
      </div>
      <ol className="list-decimal space-y-0.5 pl-5 text-sm">
        {poll.options.map((option) => (
          <li key={option.id}>{option.label}</li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground font-mono text-xs">
          {tp("votes", { count: poll.totalVotes })}
        </p>
        {onChange ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onChange}
            disabled={disabled}
          >
            {t("changePollAnswers")}
          </Button>
        ) : (
          <p className="text-muted-foreground text-xs">
            {poll.closed ? t("pollClosedKeep") : t("pollVotedKeep")}
          </p>
        )}
      </div>
    </div>
  );
}
