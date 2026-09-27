interface HeroTitleProps {
  title: string;
  tagline: string;
}

/**
 * Homepage headline: the display-size name (DESIGN.md display, capped at
 * 3.5rem) with the tagline as its subheading, grouped in an <hgroup>.
 */
export function HeroTitle({ title, tagline }: HeroTitleProps) {
  return (
    <hgroup>
      <h1 className="text-[clamp(2rem,5vw,3.5rem)] leading-[1.05] font-semibold tracking-[-0.02em] text-balance">
        {title}
      </h1>
      <p className="text-foreground mt-3 text-xl leading-snug tracking-[-0.01em] text-balance sm:text-2xl">
        {tagline}
      </p>
    </hgroup>
  );
}
