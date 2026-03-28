"use client";

import { useCallback, useRef, useState } from "react";

const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#$%&*";

interface ScrambleTextProps {
  text: string;
  className?: string;
  /** Time per character resolve (ms) */
  speed?: number;
}

export function ScrambleText({
  text,
  className,
  speed = 50,
}: ScrambleTextProps) {
  const [display, setDisplay] = useState(text);
  const animating = useRef(false);
  const frameRef = useRef<number>(0);

  const scramble = useCallback(() => {
    if (animating.current) return;
    animating.current = true;

    let resolved = 0;
    const letters = text.split("");

    const tick = () => {
      resolved += 0.5;
      const resolvedCount = Math.floor(resolved);

      const next = letters
        .map((char, i) => {
          if (char === " ") return " ";
          if (i < resolvedCount) return char;
          return CHARS[Math.floor(Math.random() * CHARS.length)];
        })
        .join("");

      setDisplay(next);

      if (resolvedCount < letters.length) {
        frameRef.current = window.requestAnimationFrame(
          () => setTimeout(tick, speed),
        );
      } else {
        setDisplay(text);
        animating.current = false;
      }
    };

    tick();
  }, [text, speed]);

  return (
    <span
      className={className}
      onMouseEnter={scramble}
      style={{ cursor: "default" }}
    >
      {display}
    </span>
  );
}
