/**
 * Send the browser to a signed download link. S3 answers with
 * Content-Disposition: attachment, so the page stays where it is. A separate
 * module so tests can assert the exact link a click hands over.
 */
export function startDownload(url: string): void {
  window.location.assign(url);
}
