"use client";

interface HeroTitleProps {
  greeting: string;
  title: string;
}

export function HeroTitle({ greeting, title }: HeroTitleProps) {
  return (
    <h1 className="text-[32px] leading-[0.95] tracking-tighter sm:text-8xl lg:text-[96px]">
      <span className="block font-light">{greeting}</span>
      <span className="block font-extrabold">
        {title}
      </span>
    </h1>
  );
}
