"use client";

import { Heart } from "lucide-react";
import { Shimmer } from "./ai-elements/shimmer";

interface HeroTitleProps {
  greeting: string;
  title: string;
}

export function HeroTitle({ greeting, title }: HeroTitleProps) {
  return (
    <h1 className="text-[32px] leading-[0.95] tracking-tighter sm:text-8xl lg:text-[96px]">
      <span className="block font-light">{greeting}</span>
      <span className="block font-extrabold">
        {title}{" "}
        <Shimmer
          as="span"
          cycle={[
            "Netherlands",
            <Heart
              key="heart"
              className="inline h-[0.75em] w-[0.75em] fill-current"
            />,
            "World",
          ]}
          cycleInterval={4}
          duration={2}
          className="text-primary inline-block"
        />
      </span>
    </h1>
  );
}
