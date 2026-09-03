/**
 * The public shape of the library.
 *
 * Everything a caller can pass or receive is declared here, so the API can be
 * read in one file without following it through the implementation.
 */

import type { GeoPermissibleObjects, GeoProjection } from "d3-geo";
import type { Topology } from "topojson-specification";

/** Longitude then latitude, in degrees. The order d3 and GeoJSON use. */
export type LngLat = [number, number];

/**
 * Any way of naming a country: ISO 3166-1 numeric (566, "566", "004"),
 * alpha-2 ("NG") or alpha-3 ("NGA"). Case does not matter.
 */
export type CountryId = string | number;

/** What the library knows about a country. `id` is the padded numeric code. */
export interface Country {
  id: string;
  alpha2: string;
  alpha3: string;
  name: string;
  /** UN M49 region, e.g. "Africa". */
  region: string;
  /** UN M49 sub-region, e.g. "Sub-Saharan Africa". */
  subRegion: string;
  /** UN M49 intermediate region, e.g. "Western Africa". Often empty. */
  intermediateRegion: string;
}

/** Which map is drawn, and how the sphere is laid out on the screen. */
export type ProjectionName = "orthographic" | "equirectangular" | "naturalEarth";

/** The built-in looks. Pass a StylePainter instead to write your own. */
export type StyleName = "solid" | "dots" | "wireframe" | "hatched" | "pixel" | "ascii" | "stipple";

/**
 * A group of countries treated as one thing.
 *
 * Countries are named by any ISO 3166-1 code: numeric as 4, "4" or "004",
 * alpha-2 as "NG", alpha-3 as "NGA". `countriesIn("Africa")` produces a list
 * for a whole continent or sub-region.
 */
export interface Region {
  id: string;
  /** Shown in the default accessible label. */
  name?: string;
  countries?: CountryId[];
  /** A subset of `countries` painted in `highlightColor` instead. */
  highlight?: CountryId[];
  color?: string;
  highlightColor?: string;
  /** Where `focus(id)` parks the globe. Defaults to the region's centroid. */
  longitude?: number;
  tilt?: number;
  /** Marker names to show when focused. Defaults to markers inside `countries`. */
  markers?: string[];
}

/** A labelled point on the surface. */
export interface Marker {
  name: string;
  coords: LngLat;
  /** Any ISO 3166-1 code, used to decide which region owns this marker. */
  country?: CountryId;
  /** IANA zone, e.g. "Asia/Manila". Adds local time to the tooltip. */
  timezone?: string;
  color?: string;
  /** Radius in CSS pixels. */
  size?: number;
}

/** A great-circle line between two points. */
export interface Arc {
  from: LngLat;
  to: LngLat;
  color?: string;
  width?: number;
}

/**
 * How a number becomes a colour.
 *
 * A ramp of stops spread evenly across the domain, or a function for
 * anything else (thresholds, categorical, a d3 scale). The domain defaults
 * to the smallest and largest value given.
 */
export type ColorScale =
  | { domain?: [number, number]; range: readonly string[] }
  | ((value: number) => string);

/** A number per country, keyed by any ISO 3166-1 code. */
export type CountryValues = Record<string, number>;

export interface LabelOptions {
  /** Name every marker beside its dot. */
  markers?: boolean;
  /** Which countries to name: a list, "regions" for those in a region, or "all". */
  countries?: CountryId[] | "regions" | "all";
  /** CSS font shorthand. Size is scaled to the globe when omitted. */
  font?: string;
  color?: string;
}

export interface TerminatorOptions {
  /** The moment to draw. Defaults to now, re-read every minute. */
  date?: Date | (() => Date);
  /** Night colour. Defaults to black. */
  color?: string;
  /** 0 to 1. Defaults to 0.28. */
  opacity?: number;
}

/** Every colour the renderers use. Any subset can be overridden. */
export interface Palette {
  ocean: string;
  /** Countries outside every region. */
  land: string;
  /** Seams between countries, and the graticule in the wireframe style. */
  border: string;
  /** A region with no colour of its own. */
  region: string;
  /** Countries listed in a region's `highlight`. */
  highlight: string;
  marker: string;
  markerRing: string;
  /** Shading around the edge of the sphere, which is what reads as curvature. */
  rim: string;
  arc: string;
  /**
   * Land dots in the "dots" style. Optional: when unset it is derived from
   * `land`, pushed away from `ocean` so small marks stay legible. A colour
   * that reads well as a filled continent disappears as scattered dots.
   */
  dot?: string;
  /** Coastline in the "wireframe" style. Derived from `land` when unset. */
  outline?: string;
  /** The country under the pointer when `hoverCountries` is on. Derived when unset. */
  hover?: string;
  /** Country label text. Derived from `land` when unset. */
  label?: string;
}

/**
 * What a style is handed on every frame.
 *
 * This is deliberately a plain data object rather than the globe instance: a
 * painter should be able to draw a frame and nothing else, so a custom style
 * cannot accidentally drive the globe from inside the draw loop.
 */
export interface Frame {
  ctx: CanvasRenderingContext2D;
  /** CSS pixels. The context is already scaled for device pixel ratio. */
  width: number;
  height: number;
  /** Sphere radius in CSS pixels. Meaningful for orthographic only. */
  radius: number;
  centreX: number;
  centreY: number;
  projection: GeoProjection;
  /** Draws a GeoJSON object into `ctx` using the current projection. */
  path: (object: GeoPermissibleObjects) => void;
  /** Every country as a feature, for per-country painting. */
  countries: CountryFeature[];
  /** All land merged into one shape. Cheaper than filling each country. */
  land: GeoPermissibleObjects;
  /** Country id to the colour it should be painted, if any. */
  regionColors: Map<string, string>;
  palette: Palette;
  /** Milliseconds since the loop started. For anything that animates. */
  time: number;
  /** True when the projection wraps the whole world into a rectangle. */
  flat: boolean;
  /** Id of the country under the pointer, when country hover is on. */
  hovered?: string | null;
}

export interface CountryFeature {
  id: string;
  feature: GeoPermissibleObjects;
}

/**
 * A render style.
 *
 * `prepare` runs once when the style is selected, for work too expensive to do
 * per frame such as sampling the land grid for the dotted style. Whatever it
 * returns is handed back to every `paint` call.
 *
 * State is returned rather than kept in the style's own scope on purpose: a
 * style is a shared value, so two globes on one page would otherwise overwrite
 * each other's prepared data.
 */
export interface StylePainter<State = unknown> {
  name: string;
  prepare?: (context: PrepareContext) => State;
  paint: (frame: Frame, state: State) => void;
}

export interface PrepareContext {
  land: GeoPermissibleObjects;
  countries: CountryFeature[];
  options: GlobeOptions;
}

export interface GlobeOptions {
  /**
   * TopoJSON with a `countries` object, e.g. world-atlas countries-110m.
   *
   * Optional once a default has been registered with `setDefaultWorld`, which
   * the browser build and `terrella/world` do for you.
   */
  world?: Topology;

  /** Which look to draw. Defaults to "solid". */
  style?: StyleName | StylePainter;
  /**
   * Which map projection. Defaults to "orthographic". A d3 projection object
   * is accepted too, such as one from `projectionBetween`; it is fitted to the
   * canvas with the same margin as a flat map and turned with the globe.
   */
  projection?: ProjectionName | GeoProjection;

  regions?: Region[];
  markers?: Marker[];
  arcs?: Arc[];

  /**
   * A number per country, painted through `scale`: a choropleth.
   *
   *     values: { NG: 12, KE: 4, ZA: 9 }
   *
   * Countries with a value are coloured by it, over any region colour.
   */
  values?: CountryValues;
  /** How `values` map to colour. Defaults to a ramp from `land` to `highlight`. */
  scale?: ColorScale;

  palette?: Partial<Palette>;
  /**
   * Which preset the palette starts from. "auto" follows the system and
   * updates when it changes. Colours set as `--terrella-*` custom properties
   * on the element sit between the preset and `palette`.
   */
  theme?: "light" | "dark" | "auto";

  /** Degrees per second of ambient rotation. 0 holds still. */
  spin?: number;
  /** Degrees of axial tilt. Negative leans the north pole toward the viewer. */
  tilt?: number;
  /** Starting longitude at the centre. */
  longitude?: number;
  /** Canvas height as a multiple of its width. 1 shows the whole sphere. */
  ratio?: number;
  /** Sphere radius as a fraction of width. Below 0.5 leaves a margin. */
  radius?: number;

  draggable?: boolean;
  tooltips?: boolean;
  /** Marker pulse period in milliseconds. 0 disables the pulse. */
  pulseMs?: number;
  /** Draw a single still frame when the user has asked for reduced motion. */
  respectReducedMotion?: boolean;
  /** Stop the render loop while the canvas is off screen. On by default. */
  pauseOffscreen?: boolean;

  /**
   * Names on the globe. `true` labels every marker and every country in a
   * region; an object chooses.
   */
  labels?: boolean | LabelOptions;
  /** Shade the night side of the world, for the current moment or a given one. */
  terminator?: boolean | TerminatorOptions;

  /** Dot spacing in degrees for the "dots" style. Lower is denser. */
  dotSpacing?: number;
  /** Dot radius in CSS pixels for the "dots" style. */
  dotSize?: number;

  /** Overrides the generated aria-label on the canvas. */
  label?: string;
  /**
   * Keyboard turning and a hidden spoken list of regions and markers.
   * On by default; turn off if the page describes the globe itself.
   */
  accessible?: boolean;
  /** Locale for marker clock formatting. Defaults to the browser's. */
  locale?: string;

  onMarkerHover?: (marker: Marker | null) => void;
  onMarkerClick?: (marker: Marker, event: MouseEvent) => void;

  /**
   * Light up the country under the pointer and name it in the tooltip.
   * Defaults to on when either country callback is given.
   */
  hoverCountries?: boolean;
  onCountryHover?: (country: Country | null) => void;
  onCountryClick?: (country: Country, event: MouseEvent) => void;
}

export interface MoveOptions {
  /** Milliseconds. Defaults to 900, or 0 under reduced motion. */
  duration?: number;
}

export interface TourStop {
  /** A region id to focus, or a coordinate to face. One of the two. */
  region?: string;
  at?: LngLat;
  /** Milliseconds to stay before moving on. Defaults to the tour's `dwell`. */
  dwell?: number;
  duration?: number;
}

export interface TourOptions {
  /** Milliseconds at each stop. Defaults to 2500. */
  dwell?: number;
  duration?: number;
  /** Start again from the first stop after the last. */
  loop?: boolean;
}

export interface TourHandle {
  /** Ends the tour where it is. */
  stop: () => void;
  /** Resolves when the tour completes or is stopped. Never, if looping. */
  finished: Promise<void>;
}

/** What `createGlobe` returns. */
export interface GlobeInstance {
  /** The canvas, if you need to size or screenshot it. */
  readonly canvas: HTMLCanvasElement;
  /** Current longitude at the centre, in degrees. */
  readonly longitude: number;
  /**
   * Parks the globe on a region and stops ambient rotation. Pass null to
   * release it back to drifting. Glides there over `duration` milliseconds;
   * 0 jumps.
   */
  focus: (regionId: string | null, options?: MoveOptions) => Promise<void>;
  /**
   * Turns the globe to face a coordinate, or an explicit longitude and tilt,
   * and holds there.
   */
  flyTo: (target: LngLat | { longitude: number; tilt?: number }, options?: MoveOptions) => Promise<void>;
  /** Visits each stop in turn, pausing at each. Returns a handle to stop it. */
  tour: (stops: TourStop[], options?: TourOptions) => TourHandle;
  /** Swaps the theme preset and re-reads the element's `--terrella-*` colours. */
  setTheme: (theme: "light" | "dark" | "auto") => void;
  /** The globe as it is right now, as an SVG string. */
  toSVG: (options?: { width?: number }) => string;
  /** Swaps the render style without rebuilding the globe. */
  setStyle: (style: StyleName | StylePainter) => void;
  /** Swaps the projection without rebuilding the globe. */
  setProjection: (projection: ProjectionName | GeoProjection) => void;
  /** Merges new colours into the palette. */
  setPalette: (palette: Partial<Palette>) => void;
  /** Changes ambient rotation without touching anything else. */
  setSpin: (degreesPerSecond: number) => void;
  /** Replaces the markers. */
  setMarkers: (markers: Marker[]) => void;
  /** Replaces the per-country values, and optionally the scale. Null clears them. */
  setValues: (values: CountryValues | null, scale?: ColorScale) => void;
  /** Switches labels on, off, or to different options. */
  setLabels: (labels: boolean | LabelOptions) => void;
  /** Switches the day/night shading on, off, or to a different moment. */
  setTerminator: (terminator: boolean | TerminatorOptions) => void;
  /** Stops the loop and removes everything this added to the DOM. */
  destroy: () => void;
}
