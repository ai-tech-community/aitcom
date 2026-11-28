import type { LucideIcon } from "lucide-react";

export type ShellDestination = {
  href: string;
  label: string;
  icon?: LucideIcon;
  exact?: boolean;
  locked?: boolean;
  unread?: number;
};

export type ShellNavGroup = {
  label: string;
  items: ShellDestination[];
};

export function activeDestination(
  pathname: string,
  destinations: readonly ShellDestination[],
): ShellDestination | undefined {
  const path = pathname.replace(/\/$/, "") || "/";
  return destinations.reduce<ShellDestination | undefined>((active, item) => {
    const matches =
      path === item.href || (!item.exact && path.startsWith(`${item.href}/`));
    return matches && item.href.length > (active?.href.length ?? 0)
      ? item
      : active;
  }, undefined);
}
