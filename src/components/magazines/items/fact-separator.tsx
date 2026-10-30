/** A visual divider with a spoken pause between adjacent facts. */
export function FactSeparator() {
  return (
    <>
      <span aria-hidden="true"> · </span>
      <span className="sr-only">, </span>
    </>
  );
}
