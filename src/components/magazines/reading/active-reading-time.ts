import {
  MAX_READING_SECONDS,
  READING_IDLE_SECONDS,
  READING_REPORT_SECONDS,
  READING_TIME_PATH,
} from "@/lib/magazines/reading-time";

export type ReadingSession = { id: string; activeMs: number };

/** Starts one timer; the caller retains session state across effect restarts. */
export function startActiveReadingTime(
  page: { issueId: number; articleId?: number },
  session: ReadingSession,
) {
  let previous = performance.now();
  let lastActivity = previous;
  let eligible = document.visibilityState === "visible" && document.hasFocus();
  let pageHidden = false;
  let lastAcknowledged = -1;
  let lastReportAt = previous;
  const advance = () => {
    const now = performance.now();
    // Sleep, frozen tabs and long blocked frames are not proof of reading.
    if (eligible && now - previous <= 5000) {
      session.activeMs = Math.min(
        MAX_READING_SECONDS * 1000,
        session.activeMs +
          Math.max(
            0,
            Math.min(now, lastActivity + READING_IDLE_SECONDS * 1000) -
              previous,
          ),
      );
    }
    previous = now;
    return now;
  };
  const flush = () => {
    const activeSeconds = Math.floor(session.activeMs / 1000);
    if (activeSeconds === lastAcknowledged) return;
    // Keepalive permits a best-effort final report during page navigation.
    void fetch(READING_TIME_PATH, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...page, sessionId: session.id, activeSeconds }),
      keepalive: true,
    })
      .then(async (response) => {
        if (response.ok && (await response.json()).recorded === true) {
          lastAcknowledged = Math.max(lastAcknowledged, activeSeconds);
        }
      })
      .catch(() => undefined);
  };
  const activity = () => {
    const now = advance();
    if (document.visibilityState === "visible" && document.hasFocus())
      lastActivity = now;
  };
  const visibility = () => {
    const now = advance();
    eligible =
      !pageHidden &&
      document.visibilityState === "visible" &&
      document.hasFocus();
    if (eligible) lastActivity = now;
    else flush();
  };
  const blur = () => {
    advance();
    eligible = false;
    flush();
  };
  const pageshow = () => {
    pageHidden = false;
    visibility();
  };
  const pagehide = () => {
    advance();
    pageHidden = true;
    eligible = false;
    flush();
  };
  const events = [
    "pointerdown",
    "pointermove",
    "keydown",
    "scroll",
    "touchstart",
  ] as const;
  for (const name of events)
    window.addEventListener(name, activity, { passive: true, capture: true });
  document.addEventListener("visibilitychange", visibility);
  window.addEventListener("focus", visibility);
  window.addEventListener("blur", blur);
  window.addEventListener("pagehide", pagehide);
  window.addEventListener("pageshow", pageshow);
  flush();
  const timer = window.setInterval(() => {
    const now = advance();
    // Also enforce current browser state if a focus/visibility event was missed.
    eligible =
      !pageHidden &&
      document.visibilityState === "visible" &&
      document.hasFocus();
    if (now - lastReportAt >= READING_REPORT_SECONDS * 1000) {
      lastReportAt = now;
      flush();
    }
  }, 1000);
  return () => {
    advance();
    flush();
    window.clearInterval(timer);
    for (const name of events) window.removeEventListener(name, activity, true);
    document.removeEventListener("visibilitychange", visibility);
    window.removeEventListener("focus", visibility);
    window.removeEventListener("blur", blur);
    window.removeEventListener("pagehide", pagehide);
    window.removeEventListener("pageshow", pageshow);
  };
}
