/**
 * Colour arithmetic, for the one thing the renderers genuinely need it for.
 *
 * A dot a pixel wide does not read at the same colour as a filled continent.
 * The same light grey that looks right as a landmass disappears entirely as a
 * scattering of dots, which is exactly what happened to the warm palette: land
 * `#e3d3c1` on ocean `#fbf5ee` was invisible.
 *
 * So the dotted style darkens the palette's land colour rather than asking
 * every caller to supply a second one. A palette that was tuned for fills then
 * works for dots without being touched, and `palette.dot` is there for anyone
 * who wants to override it.
 */

interface Rgb {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** Parses #rgb, #rrggbb, #rrggbbaa, rgb() and rgba(). Returns null otherwise. */
export function parseColor(input: string): Rgb | null {
  const value = input.trim();

  if (value.startsWith("#")) {
    const hex = value.slice(1);
    const expand = (s: string) => parseInt(s.length === 1 ? s + s : s, 16);

    if (hex.length === 3 || hex.length === 4) {
      const [r, g, b, a] = [hex[0], hex[1], hex[2], hex[3]];
      if (r === undefined || g === undefined || b === undefined) return null;
      return {
        r: expand(r),
        g: expand(g),
        b: expand(b),
        a: a === undefined ? 1 : expand(a) / 255,
      };
    }
    if (hex.length === 6 || hex.length === 8) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        a: hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1,
      };
    }
    return null;
  }

  const match = value.match(/^rgba?\(([^)]+)\)$/i);
  if (!match?.[1]) return null;
  const parts = match[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  const [r, g, b, a] = parts;
  if (r === undefined || g === undefined || b === undefined) return null;
  if ([r, g, b].some(Number.isNaN)) return null;
  return { r, g, b, a: a === undefined || Number.isNaN(a) ? 1 : a };
}

const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));

const toCss = ({ r, g, b, a }: Rgb): string =>
  a >= 1 ? `rgb(${clamp(r)}, ${clamp(g)}, ${clamp(b)})` : `rgba(${clamp(r)}, ${clamp(g)}, ${clamp(b)}, ${a})`;

/**
 * Moves a colour toward black by `amount` (0 to 1).
 *
 * Returns the input unchanged when it cannot be parsed, so an exotic but valid
 * CSS colour costs the contrast boost rather than the whole render.
 */
export function darken(color: string, amount: number): string {
  const rgb = parseColor(color);
  if (!rgb) return color;
  const k = 1 - Math.max(0, Math.min(1, amount));
  return toCss({ r: rgb.r * k, g: rgb.g * k, b: rgb.b * k, a: rgb.a });
}

/**
 * Relative luminance, 0 for black and 1 for white.
 *
 * Used to decide which way to push a colour for contrast: darkening a dark
 * palette makes it less visible, not more.
 */
export function luminance(color: string): number {
  const rgb = parseColor(color);
  if (!rgb) return 0.5;
  // The sRGB coefficients. Good enough for choosing a direction.
  return (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
}

/** Moves a colour toward white by `amount` (0 to 1). */
export function lighten(color: string, amount: number): string {
  const rgb = parseColor(color);
  if (!rgb) return color;
  const k = Math.max(0, Math.min(1, amount));
  return toCss({
    r: rgb.r + (255 - rgb.r) * k,
    g: rgb.g + (255 - rgb.g) * k,
    b: rgb.b + (255 - rgb.b) * k,
    a: rgb.a,
  });
}

/** Blends two colours: 0 gives `a`, 1 gives `b`. Unparseable input returns `a`. */
export function mix(a: string, b: string, t: number): string {
  const from = parseColor(a);
  const to = parseColor(b);
  if (!from || !to) return a;
  const k = Math.max(0, Math.min(1, t));
  return toCss({
    r: from.r + (to.r - from.r) * k,
    g: from.g + (to.g - from.g) * k,
    b: from.b + (to.b - from.b) * k,
    a: from.a + (to.a - from.a) * k,
  });
}

/**
 * Reads a colour off a ramp of two or more stops at `t` in 0 to 1.
 *
 * Piecewise linear, which is what a legend implies: the middle stop of a
 * three-colour ramp sits exactly at the middle value.
 */
export function ramp(stops: readonly string[], t: number): string {
  if (stops.length === 0) return "#000000";
  if (stops.length === 1) return stops[0] ?? "#000000";
  const k = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const index = Math.min(stops.length - 2, Math.floor(k));
  return mix(stops[index] ?? "#000000", stops[index + 1] ?? "#000000", k - index);
}

/**
 * Pushes a colour away from its background so small marks stay legible.
 *
 * Direction is chosen from the background's luminance rather than fixed, so
 * this works on a dark palette as well as a light one.
 */
export function contrastWith(color: string, background: string, amount = 0.34): string {
  return luminance(background) > 0.5 ? darken(color, amount) : lighten(color, amount);
}
