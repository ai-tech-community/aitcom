/**
 * A spoken pause between groups: a comma only a reader hears, then a plain
 * space (collapsed on screen between blocks) so words never run together.
 */
export function Pause() {
  return (
    <>
      <span className="sr-only">,</span>{" "}
    </>
  );
}

/** The visible "·" between place parts; a reader hears a comma instead. */
export function Dot() {
  return (
    <>
      <span aria-hidden="true"> · </span>
      <Pause />
    </>
  );
}
