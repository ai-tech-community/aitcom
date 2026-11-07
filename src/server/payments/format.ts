export function paymentCsvCell(value: string | number) {
  const text = String(value);
  return `"${(/^[=+@\-\t\r\n]/.test(text) ? "'" : "") + text.replace(/"/g, '""')}"`;
}
export function escapePaymentHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ]!,
  );
}
