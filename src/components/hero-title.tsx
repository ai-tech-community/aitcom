"use client";

import { ScrambleText } from "./scramble-text";

interface HeroTitleProps {
  greeting: string;
  title: string;
}

export function HeroTitle({ greeting, title }: HeroTitleProps) {
  const words = title.split(" ");
  const lastWord = words.pop()!;
  const rest = words.join(" ");

  return (
    <h1 className="text-[32px] leading-[0.95] tracking-tighter sm:text-8xl lg:text-[96px]">
      <span className="block font-light">{greeting}</span>
      <span className="block font-extrabold">
        {rest}{" "}
        <ScrambleText
          text={lastWord}
          className="text-primary inline-block"
        />
      </span>
    </h1>
  );
}
