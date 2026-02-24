import { type SVGProps } from "react";

export function AitLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 110 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="AIT."
      role="img"
      {...props}
    >
      {/* A */}
      <path
        d="M0 48L16 0H28L44 48H34L30 35H14L10 48H0ZM17 28L22 12L27 28H17Z"
        fill="currentColor"
        fillRule="evenodd"
      />
      {/* I */}
      <rect x="48" y="0" width="10" height="48" fill="currentColor" />
      {/* T */}
      <path d="M62 0H94V10H83V48H73V10H62V0Z" fill="currentColor" />
      {/* . */}
      <circle cx="102" cy="43" r="5" className="fill-primary" />
    </svg>
  );
}
