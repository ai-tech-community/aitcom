/** One presigned POST as the fake saw it. */
export type SentForm = {
  url: string;
  fields: Record<string, string>;
  file: { type: string; size: number };
  /** Form field names in the order they were appended. */
  order: string[];
};

/**
 * How the fake answers a POST: `ok` (204 after half-way progress),
 * `http-error` (`FakeXHR.errorStatus`), `network-error`, or `hang` (never
 * answers until aborted).
 */
export type FakeXHRMode = "ok" | "http-error" | "network-error" | "hang";

/**
 * A stand-in for XMLHttpRequest that records every presigned form POST and
 * answers according to `FakeXHR.mode`. Install with
 * `vi.stubGlobal("XMLHttpRequest", FakeXHR)` after `FakeXHR.reset()`.
 */
export class FakeXHR {
  static sent: SentForm[] = [];
  static mode: FakeXHRMode = "ok";
  static errorStatus = 403;

  static reset(): void {
    FakeXHR.sent = [];
    FakeXHR.mode = "ok";
    FakeXHR.errorStatus = 403;
  }

  status = 0;
  url = "";
  upload: { onprogress: ((e: ProgressEvent) => void) | null } = {
    onprogress: null,
  };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;

  open(_method: string, url: string): void {
    this.url = url;
  }

  send(form: FormData): void {
    const fields: Record<string, string> = {};
    const order: string[] = [];
    let file = { type: "", size: -1 };
    for (const [name, value] of form.entries()) {
      order.push(name);
      if (typeof value === "string") fields[name] = value;
      else file = { type: value.type, size: value.size };
    }
    FakeXHR.sent.push({ url: this.url, fields, file, order });
    if (FakeXHR.mode === "hang") return;
    queueMicrotask(() => {
      this.upload.onprogress?.({
        lengthComputable: true,
        loaded: 5,
        total: 10,
      } as ProgressEvent);
      if (FakeXHR.mode === "network-error") {
        this.onerror?.();
        return;
      }
      this.status = FakeXHR.mode === "http-error" ? FakeXHR.errorStatus : 204;
      this.onload?.();
    });
  }

  abort(): void {
    this.onabort?.();
  }
}
