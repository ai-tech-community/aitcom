interface HeroTitleProps {
  greeting: string;
  title: string;
}

export function HeroTitle({ greeting, title }: HeroTitleProps) {
  return (
    <h1 className="text-[clamp(2rem,5vw+1rem,4.5rem)] leading-[0.95] tracking-tight">
      <span className="block font-light">{greeting}</span>
      <span className="block font-semibold">{title}</span>
    </h1>
  );
}
