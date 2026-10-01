"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
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
/** The list's tallest; it opens above the "@" when there is no room below. */
const LIST_HEIGHT = 264;

type Typed = { start: number; query: string };
type Placement = { top: number; left: number; above: boolean };

/** What `useMentionPicker` hands the post editor. */
export type MentionPicker = ReturnType<typeof useMentionPicker>;

/** The bottom of what the member can see (above an on-screen keyboard). */
function visibleBottom(): number {
  const viewport = window.visualViewport;
  return viewport ? viewport.offsetTop + viewport.height : window.innerHeight;
}

/**
 * Where the list goes for an "@" at `start`, on screen: under the "@", or
 * above it when there is more room there, kept inside the window.
 */
function placeAt(field: HTMLTextAreaElement, start: number): Placement {
  const caret = caretPosition(field, start);
  const box = field.getBoundingClientRect();
  const atTop = box.top + caret.top;
  const atBottom = atTop + caret.height;
  const roomBelow = visibleBottom() - atBottom;
  const above = roomBelow < LIST_HEIGHT && atTop > roomBelow;
  const left = Math.min(
    box.left + caret.left,
    box.right - LIST_WIDTH - 8,
    window.innerWidth - LIST_WIDTH - 8,
  );
  return {
    top: above ? atTop - 4 : atBottom + 4,
    left: Math.max(8, left),
    above,
  };
}

/**
 * Mentions while typing: an "@" at the start of a word opens a list of the
 * community's members matching what follows, at the "@" (below it, or
 * above when there is no room). The text area keeps the focus the whole
 * time (the list is its popup, linked by `aria-activedescendant`, and a
 * live status names the highlighted member): the arrow keys move through
 * the list, Enter or Tab writes "@Name ", Escape closes it until the next
 * "@". Clicking a member works too.
 *
 * Only members whose name holds what is typed now are offered, even while
 * the results for it are still loading, so Enter never picks someone the
 * text no longer matches; with no one to offer, Enter is a new line. Right
 * after a finished mention, or while typing words after an "@" that match
 * no one, the list stays away.
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
  // The member moved to with the arrow keys, for the status line.
  const [moved, setMoved] = useState(false);
  const [placement, setPlacement] = useState<Placement>({
    top: 0,
    left: 0,
    above: false,
  });
  const typedQuery = typed?.query ?? "";
  const query = useDebouncedValue(typedQuery, SEARCH_DELAY_MS);
  const finished =
    typed !== null && text.mentions.some((m) => m.name === typed.query);
  const open = typed !== null && typed.start !== closedAt && !finished;

  const results = api.feed.mentionCandidates.useQuery(
    { communitySlug, query },
    {
      enabled: open,
      placeholderData: keepPreviousData,
      staleTime: 30_000,
      retry: false,
    },
  );
  const needle = typedQuery.trim().toLocaleLowerCase();
  const members = open
    ? (results.data ?? []).filter((member) =>
        member.name.toLocaleLowerCase().includes(needle),
      )
    : [];
  const activeIndex = Math.min(active, Math.max(0, members.length - 1));
  const searching =
    !results.isFetched || results.isPlaceholderData || query !== typedQuery;
  // Words after an "@" that match no one: the member is just writing.
  const noMatch =
    members.length === 0 && !searching && !typedQuery.includes(" ");
  const showing = open && (members.length > 0 || noMatch || results.isError);

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
      setMoved(false);
    }
    setTyped(next);
    if (!next) {
      setClosedAt(null);
      return;
    }
    setPlacement(placeAt(field, next.start));
  }, [text.textareaRef, typed]);

  // The list sits on top of the page, so it follows the "@" when the page
  // or the text area scrolls, or the window (or on-screen keyboard) resizes.
  const followFrom = showing ? (typed?.start ?? null) : null;
  useEffect(() => {
    const field = text.textareaRef.current;
    if (followFrom === null || !field) return;
    const follow = () => setPlacement(placeAt(field, followFrom));
    window.addEventListener("scroll", follow, { capture: true, passive: true });
    window.addEventListener("resize", follow);
    window.visualViewport?.addEventListener("resize", follow);
    return () => {
      window.removeEventListener("scroll", follow, { capture: true });
      window.removeEventListener("resize", follow);
      window.visualViewport?.removeEventListener("resize", follow);
    };
  }, [followFrom, text.textareaRef]);

  const pick = (index: number) => {
    const member = members[index];
    if (!typed || !member) return;
    text.mention(typed.start, member);
    setClosedAt(typed.start);
  };

  /** Handles the list's keys; true when the key was for the list. */
  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter that finishes a word in an input method is not a pick.
    if (!open || !typed || e.nativeEvent.isComposing) return false;
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
      setMoved(true);
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
  const activeMember = members[activeIndex];

  const status = !showing
    ? ""
    : results.isError
      ? t("mentionFailed")
      : moved && activeMember
        ? t("mentionActive", {
            name: activeMember.name,
            position: activeIndex + 1,
            count: members.length,
          })
        : members.length > 0
          ? t("mentionCount", { count: members.length })
          : t("mentionNone", { query: typedQuery.trim() });

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
    /**
     * The status line, and the list on top of the page (in a portal, so no
     * sticky bar or clipping parent can hide it), placed at the "@".
     */
    list: (
      <>
        {/* Says how many members match, and which one is highlighted
            (WCAG 4.1.3). */}
        <p role="status" className="sr-only">
          {status}
        </p>
        {showing
          ? createPortal(
              <div
                className={cn(
                  "bg-popover text-popover-foreground fixed z-50 w-64 max-w-[calc(100vw-1rem)] overflow-hidden rounded-lg border shadow-md",
                  placement.above && "-translate-y-full",
                )}
                style={{ top: placement.top, left: placement.left }}
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
                          // Fill, weight and an outline: more than colour alone.
                          index === activeIndex &&
                            "bg-accent text-accent-foreground ring-ring/60 font-medium ring-1 ring-inset",
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
                      : t("mentionNone", { query: typedQuery.trim() })}
                  </p>
                )}
              </div>,
              document.body,
            )
          : null}
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
