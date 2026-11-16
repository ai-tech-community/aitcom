import type { TextEdit } from "@/lib/post-format";

/**
 * Writes `next` into the text field the way typing would, so the
 * browser's undo (Ctrl/Cmd+Z) can take it back: only the part that
 * changed is replaced, through the browser's own insert command, which
 * also fires the input event the form listens to. Where that command is
 * missing the value is set directly (no undo step, same result).
 */
export function applyEdit(
  field: HTMLTextAreaElement | null,
  next: TextEdit,
  setValue: (value: string) => void,
) {
  if (field) {
    const current = field.value;
    let head = 0;
    while (
      head < current.length &&
      head < next.value.length &&
      current[head] === next.value[head]
    ) {
      head++;
    }
    let tail = 0;
    while (
      tail < current.length - head &&
      tail < next.value.length - head &&
      current[current.length - 1 - tail] ===
        next.value[next.value.length - 1 - tail]
    ) {
      tail++;
    }
    const inserted = next.value.slice(head, next.value.length - tail);
    field.focus();
    field.setSelectionRange(head, current.length - tail);
    const typed =
      typeof document.execCommand === "function" &&
      (inserted
        ? document.execCommand("insertText", false, inserted)
        : document.execCommand("delete"));
    if (!typed || field.value !== next.value) setValue(next.value);
  } else {
    setValue(next.value);
  }
  // After React writes the value, put the selection where the edit says,
  // unless the member has typed on since (the caret is theirs then).
  requestAnimationFrame(() => {
    if (field?.value !== next.value) return;
    field.focus();
    field.setSelectionRange(next.start, next.end);
  });
}

/**
 * Puts `text` where the caret is, replacing any selected text, and leaves
 * the caret just after it. Undoable, like typing (see `applyEdit`). With
 * no field to write into, `text` becomes the whole value.
 */
export function insertAtCaret(
  field: HTMLTextAreaElement | null,
  text: string,
  setValue: (value: string) => void,
) {
  const current = field?.value ?? "";
  const start = field?.selectionStart ?? current.length;
  const end = field?.selectionEnd ?? start;
  const caret = start + text.length;
  applyEdit(
    field,
    {
      value: current.slice(0, start) + text + current.slice(end),
      start: caret,
      end: caret,
    },
    setValue,
  );
}
