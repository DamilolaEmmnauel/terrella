import type { GlobeOptions, Palette } from "./types";

/**
 * Defaults, and the merge that turns caller options into a complete config.
 *
 * Kept apart from the globe itself so the answer to "what happens if I pass
 * nothing" is one readable object rather than a trail of `??` through the
 * implementation.
 */

export const DEFAULT_PALETTE: Palette = {
  ocean: "#edf4fb",
  land: "#cdd8e3",
  border: "#ffffff",
  region: "#a9cdec",
  highlight: "#2ea6f5",
  marker: "#1769a8",
  markerRing: "#ffffff",
  rim: "rgba(43, 69, 95, 0.10)",
  arc: "#2ea6f5",
};

/**
 * Declared with an explicit type rather than `as const`: `as const` narrows
 * `tilt` to the literal `-14`, which then makes every later assignment to it a
 * type error.
 */
export const DEFAULTS: GlobeDefaults = {
  style: "solid",
  projection: "orthographic",
  spin: 3.2,
  tilt: -14,
  longitude: 18,
  ratio: 1,
  radius: 0.46,
  draggable: true,
  tooltips: true,
  pulseMs: 1600,
  respectReducedMotion: true,
  dotSpacing: 2.2,
  dotSize: 1.1,
};

/** The options that always have a value once resolved. */
export interface GlobeDefaults {
  style: NonNullable<GlobeOptions["style"]>;
  projection: NonNullable<GlobeOptions["projection"]>;
  spin: number;
  tilt: number;
  longitude: number;
  ratio: number;
  radius: number;
  draggable: boolean;
  tooltips: boolean;
  pulseMs: number;
  respectReducedMotion: boolean;
  dotSpacing: number;
  dotSize: number;
}

/** Everything resolved: no optional fields left for the renderers to guess at. */
export type ResolvedConfig = Omit<GlobeOptions, "palette" | "style" | "projection"> &
  GlobeDefaults & { palette: Palette };

export function resolveConfig(options: GlobeOptions): ResolvedConfig {
  return {
    ...DEFAULTS,
    ...options,
    // Spread after the merge: a caller passing two palette colours should keep
    // the other seven rather than lose them.
    palette: { ...DEFAULT_PALETTE, ...options.palette },
    style: options.style ?? DEFAULTS.style,
    projection: options.projection ?? DEFAULTS.projection,
  } as ResolvedConfig;
}

/** True when the user has asked their machine to stop animating things. */
export function prefersReducedMotion(): boolean {
  return (
    typeof matchMedia === "function" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}
