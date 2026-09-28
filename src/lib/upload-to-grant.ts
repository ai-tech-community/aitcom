/** A presigned S3 POST: where to send the form, and the fields S3 signed. */
export type UploadGrant = { url: string; fields: Record<string, string> };

/** The abort reason as an Error (it is an `AbortError` unless one was given). */
function abortError(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new DOMException("The upload was cancelled.", "AbortError");
}

/**
 * POSTs a blob to a presigned S3 form. Uses XHR because fetch has no upload
 * progress. Settles on success, HTTP failure, network failure, or abort.
 * Shared by Reels video posts and classroom file uploads.
 */
export function uploadToGrant(
  grant: UploadGrant,
  blob: Blob,
  onProgress: (share: number) => void,
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError(signal));
      return;
    }
    const form = new FormData();
    for (const [name, value] of Object.entries(grant.fields)) {
      form.append(name, value);
    }
    form.append("file", blob); // S3 requires the file field last.

    const xhr = new XMLHttpRequest();
    const onAbort = () => xhr.abort();
    const settle = (error?: Error) => {
      signal.removeEventListener("abort", onAbort);
      if (error === undefined) resolve();
      else reject(error);
    };
    xhr.open("POST", grant.url);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? settle()
        : settle(new Error(`upload failed with HTTP ${xhr.status}`));
    xhr.onerror = () => settle(new Error("upload network error"));
    xhr.onabort = () => settle(abortError(signal));
    signal.addEventListener("abort", onAbort, { once: true });
    xhr.send(form);
  });
}
