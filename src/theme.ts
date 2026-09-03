import { DEFAULT_PALETTE } from "./config";
import type { Palette } from "./types";

/**
 * Where a globe's colours come from.
 *
 * Three layers, each overriding the last: a theme preset, CSS custom
 * properties on the element, and the `palette` option. A site that sets
 * `--terrella-land` in its stylesheet gets a globe that restyles with the
 * rest of the page, and `theme: "auto"` makes the preset follow the system.
 */

export type ThemeName = "light" | "dark" | "auto";

/** The dark preset: the light palette printed in negative. */
export const DARK_PALETTE: Palette = {
  ocean: "#101820",
  land: "#2b3a4a",
  border: "#101820",
  region: "#3a5876",
  highlight: "#4da3e0",
  marker: "#8fd0ff",
  markerRing: "#101820",
  rim: "rgba(0, 0, 0, 0.45)",
  arc: "#4da3e0",
};

const PALETTE_KEYS = Object.keys(DEFAULT_PALETTE).concat("dot", "outline", "hover", "label") as Array<
  keyof Palette
>;

/** True when the system prefers dark, false otherwise or where unknown. */
export function systemPrefersDark(): boolean {
  return (
    typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches
  );
}

/** The preset a theme name resolves to right now. */
export function presetFor(theme: ThemeName): Palette {
  const dark = theme === "dark" || (theme === "auto" && systemPrefersDark());
  return dark ? DARK_PALETTE : DEFAULT_PALETTE;
}

/**
 * The `--terrella-*` custom properties set on an element, as palette keys.
 *
 * `--terrella-marker-ring` maps to `markerRing`. Empty properties are
 * skipped so a stylesheet can declare only the colours it cares about.
 */
export function cssPalette(readVar: (name: string) => string): Partial<Palette> {
  const found: Partial<Palette> = {};
  for (const key of PALETTE_KEYS) {
    const cssName = `--terrella-${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
    const value = readVar(cssName).trim();
    if (value) found[key] = value;
  }
  return found;
}

/** Reads custom properties off a real element. */
export function elementVars(element: Element): (name: string) => string {
  if (typeof getComputedStyle !== "function") return () => "";
  const style = getComputedStyle(element);
  return (name) => style.getPropertyValue(name);
}

export function resolvePalette(
  theme: ThemeName,
  readVar: (name: string) => string,
  overrides: Partial<Palette> | undefined,
): Palette {
  return { ...presetFor(theme), ...cssPalette(readVar), ...overrides };
}

/** Calls back when the system preference flips, while the theme is "auto". */
export function watchSystemTheme(onChange: () => void): () => void {
  if (typeof matchMedia !== "function") return () => {};
  const query = matchMedia("(prefers-color-scheme: dark)");
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
