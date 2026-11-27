/**
 * The shape of a community look. A look re-declares a few of the site's own
 * CSS tokens inside the community frame (token scoping), paints optional cover
 * art, and picks a heading face. Every color is a `#RRGGBB` string so the
 * catalog test can measure it.
 */

export type CommunityThemeId =
  | "plain"
  | "canal"
  | "meadow"
  | "sunset"
  | "night";

/**
 * Overrides of the site's tokens inside the community frame. A token that is
 * not listed keeps its value from the look's scheme (`:root` or `.dark`).
 */
export type CommunityThemeTokens = {
  /** `--background`: the canvas behind the content. */
  background: string;
  /** `--foreground`. */
  foreground: string;
  /** `--muted-foreground`. Used on the canvas and on cards. */
  mutedForeground: string;
  /** `--border`. */
  border: string;
  /** `--input`. */
  input: string;
  /** `--card`. Light looks leave it out and keep white cards. */
  card?: string;
  /** `--card-foreground`. */
  cardForeground?: string;
  /** `--muted`: quiet fills. Text on it is `foreground` or `mutedForeground`. */
  muted?: string;
  /** `--secondary`: the active tab's fill and secondary buttons. */
  secondary?: string;
  /** `--secondary-foreground`. Set together with `secondary`. */
  secondaryForeground?: string;
  /** `--accent`: hover fills in lists and menus. */
  accent?: string;
  /** `--accent-foreground`. Set together with `accent`. */
  accentForeground?: string;
  /**
   * `--success`, `--warning`, `--info`, `--destructive`: status text and
   * its 10% tint. A look sets one only where the house value falls below
   * 4.5:1 on its canvas, cards, pattern or tint; it is the same status,
   * a little deeper (or lighter on a dark look), never a new hue.
   */
  success?: string;
  warning?: string;
  info?: string;
  destructive?: string;
};

/** A CSS `background-image` layered on the canvas. */
export type CommunityCanvasPattern = {
  /** The `background-image` value. Uses only the colors in `colors`. */
  image: string;
  /** The `background-size` value. */
  size: string;
  /** Every color used inside `image`, so tests can check them. */
  colors: string[];
};

/** Cover art shown in place of a missing banner picture. */
export type CommunityThemeCover = {
  /** Every color the art uses, by role. The art takes no other color. */
  palette: Record<string, string>;
  /** The community name's color on the cover. */
  nameColor: string;
  /** The palette color the art paints behind the community name. */
  nameBase: string;
};

export type CommunityHeadingFontId =
  | "fraunces"
  | "nunito"
  | "dm-serif-display"
  | "space-grotesk";

export type CommunityTheme = {
  id: CommunityThemeId;
  /** `dark` makes the frame take the site's `.dark` tokens first. */
  scheme: "light" | "dark";
  tokens: CommunityThemeTokens;
  canvasPattern: CommunityCanvasPattern | null;
  /** null: no art (Plain). */
  cover: CommunityThemeCover | null;
  /** null: the house face, Geist Sans (Plain). */
  headingFont: CommunityHeadingFontId | null;
};
