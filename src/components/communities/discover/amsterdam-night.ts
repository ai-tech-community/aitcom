"use client";

import { useEffect, useState } from "react";

/** The square keeps Amsterdam time, where the community was born. */
export const SQUARE_TIME_ZONE = "Europe/Amsterdam";

/** Lights-on hours on the square: from 20:00 until 07:00. */
const NIGHT_FROM_HOUR = 20;
const DAY_FROM_HOUR = 7;

/** How often the page looks at the clock again. */
const CHECK_EVERY_MS = 5 * 60 * 1000;

/** Whether it is night on the square at `date` (Amsterdam time). */
export function isSquareNight(date: Date): boolean {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      hour: "numeric",
      hourCycle: "h23",
      timeZone: SQUARE_TIME_ZONE,
    }).format(date),
  );
  return hour >= NIGHT_FROM_HOUR || hour < DAY_FROM_HOUR;
}

/**
 * Night on the square, kept current while the page is open. Starts as day
 * on the server and the first paint (the street is drawn on the client
 * anyway), then follows the Amsterdam clock.
 */
export function useSquareNight(): boolean {
  const [night, setNight] = useState(false);
  useEffect(() => {
    const check = () => setNight(isSquareNight(new Date()));
    check();
    const id = window.setInterval(check, CHECK_EVERY_MS);
    return () => window.clearInterval(id);
  }, []);
  return night;
}
