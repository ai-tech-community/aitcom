"use client";

import { useCallback, useId, useState } from "react";
import { keepPreviousData } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { AtSign } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { getInitials } from "@/lib/avatar";
import { mentionQueryAt } from "@/lib/post-mentions";
import { cn } from "@/lib/utils";
import { api } from "@/trpc/react";

import { caretPosition } from "./caret-position";
import { ToolbarButton } from "./toolbar-button";
import type { usePostText } from "./use-post-text";

const SEARCH_DELAY_MS = 120;
/** The list's width; it moves left to stay inside the field. */
const LIST_WIDTH = 256;

type Typed = { start: number; query: string };

/** What `useMentionPicker` hands the post editor. */
export type MentionPicker = ReturnType<typeof useMentionPicker>;

/**
 * Mentions while typing: an "@" at the start of a word opens a list of the
 * community's members matching what follows, under the caret. The text
 * area keeps the focus the whole time (the list is its popup, linked by
 * `aria-activedescendant`): the arrow keys move through the list, Enter or
 * Tab writes "@Name ", Escape closes it until the next "@". Clicking a
 * member works too.
 */
export function useMentionPicker({
  text,
  communitySlug,
}: {
  text: ReturnType<typeof usePostText>;
  /** The community whose members are offered. */
  communitySlug: string;
}) {
  const t = useTranslations("communities.feed.editor");
  const listId = useId();
  const [typed, setTyped] = useState<Typed | null>(null);
  // Escape (or a pick) closes the list for this "@" until a new one.
  const [closedAt, setClosedAt] = useState<number | null>(null);
  const [active, setActive] = useState(0);
  const [anchor, setAnchor] = useState({ top: 0, left: 0 });
  const query = useDebouncedValue(typed?.query ?? "", SEARCH_DELAY_MS);
  const open = typed !== null && typed.start !== closedAt;

  const results = api.feed.mentionCandidates.useQuery(
    { communitySlug, query },
    {
      enabled: open,
      placeholderData: keepPreviousData,
      staleTime: 30_000,
      retry: false,
    },
  );
  const members = open ? (results.data ?? []) : [];
  const activeIndex = Math.min(active, Math.max(0, members.length - 1));

  /** Reads what is being typed at the caret; call on every change. */
  const update = useCallback(() => {
    const field = text.textareaRef.current;
    if (!field) return;
    const next =
      field.selectionStart === field.selectionEnd
        ? mentionQueryAt(field.value, field.selectionStart)
        : null;
    // A new "@" or new letters start again at the first member.
    if (next?.start !== typed?.start || next?.query !== typed?.query) {
      setActive(0);
    }
    setTyped(next);
    if (!next) {
      setClosedAt(null);
      return;
    }
    const caret = caretPosition(field, next.start);
    const room = field.clientWidth - LIST_WIDTH - 8;
    setAnchor({
      top: caret.top + caret.height + 4,
      left: Math.max(8, Math.min(caret.left, room)),
    });
  }, [text.textareaRef, typed]);

  const pick = (index: number) => {
    const member = members[index];
    if (!typed || !member) return;
    text.mention(typed.start, member);
    setClosedAt(typed.start);
  };

  /** Handles the list's keys; true when the key was for the list. */
  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!open || !typed) return false;
    if (e.key === "Escape") {
      e.preventDefault();
      setClosedAt(typed.start);
      return true;
    }
    if (members.length === 0) return false;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((activeIndex + step + members.length) % members.length);
      return true;
    }
    if ((e.key === "Enter" || e.key === "Tab") && !e.shiftKey) {
      e.preventDefault();
      pick(activeIndex);
      return true;
    }
    return false;
  };

  const optionId = (index: number) => `${listId}-option-${index}`;
  const showing = open && (members.length > 0 || results.isFetched);

  const status = !open
    ? ""
    : results.isError
      ? t("mentionFailed")
      : !results.isFetched
        ? ""
        : members.length === 0
          ? t("mentionNone", { query })
          : t("mentionCount", { count: members.length });

  return {
    update,
    onKeyDown,
    /** The text area lost focus: hide the list (typing on brings it back). */
    onBlur: () => setTyped(null),
    /** For the text area: links it to the list while the list is open. */
    fieldProps: {
      "aria-autocomplete": "list" as const,
      "aria-controls": showing ? listId : undefined,
      "aria-activedescendant":
        showing && members.length > 0 ? optionId(activeIndex) : undefined,
    },
    /** The list, placed under the "@" (render inside the field). */
    list: (
      <>
        {/* Says how many members match (WCAG 4.1.3). */}
        <p role="status" className="sr-only">
          {status}
        </p>
        {showing ? (
          <div
            className="bg-popover text-popover-foreground absolute z-20 w-64 max-w-[calc(100%-1rem)] overflow-hidden rounded-lg border shadow-md"
            style={{ top: anchor.top, left: anchor.left }}
          >
            {members.length > 0 ? (
              <ul
                id={listId}
                role="listbox"
                aria-label={t("mentionList")}
                className="max-h-64 overflow-y-auto p-1"
              >
                {members.map((member, index) => (
                  <li
                    key={member.userId}
                    id={optionId(index)}
                    role="option"
                    aria-selected={index === activeIndex}
                    // Keeps the focus in the text area.
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pick(index)}
                    onMouseMove={() => setActive(index)}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm",
                      index === activeIndex &&
                        "bg-accent text-accent-foreground",
                    )}
                  >
                    <Avatar aria-hidden="true" className="size-6">
                      {member.image ? (
                        <AvatarImage src={member.image} alt="" />
                      ) : null}
                      <AvatarFallback className="text-[10px]">
                        {getInitials(member.name)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="truncate">{member.name}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p
                id={listId}
                className="text-muted-foreground px-3 py-2 text-sm"
              >
                {results.isError
                  ? t("mentionFailed")
                  : t("mentionNone", { query })}
              </p>
            )}
          </div>
        ) : null}
      </>
    ),
  };
}

/**
 * The toolbar's "@" button: types an "@" at the caret (after a space when
 * it would touch a word), which opens the member list like typing it does.
 */
export function MentionButton({
  text,
  disabled,
}: {
  text: ReturnType<typeof usePostText>;
  disabled?: boolean;
}) {
  const t = useTranslations("communities.feed.editor");
  return (
    <ToolbarButton
      label={t("mention")}
      icon={<AtSign aria-hidden="true" />}
      disabled={disabled}
      onClick={() => {
        const field = text.textareaRef.current;
        const at = field?.selectionStart ?? text.value.length;
        const before = text.value.slice(0, at);
        text.insert(before === "" || /\s$/.test(before) ? "@" : " @");
      }}
    />
  );
}
