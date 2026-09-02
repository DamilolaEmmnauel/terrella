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

/** Which map is drawn, and how the sphere is laid out on the screen. */
export type ProjectionName = "orthographic" | "equirectangular" | "naturalEarth";

/** The built-in looks. Pass a StylePainter instead to write your own. */
export type StyleName = "solid" | "dots" | "wireframe";

/**
 * A group of countries treated as one thing.
 *
 * Countries are ISO 3166-1 numeric ids, given as numbers or strings. The world
 * atlas uses zero-padded strings ("004"), callers usually have plain numbers
 * (4), and both are accepted.
 */
export interface Region {
  id: string;
  /** Shown in the default accessible label. */
  name?: string;
  countries?: Array<string | number>;
  /** A subset of `countries` painted in `highlightColor` instead. */
  highlight?: Array<string | number>;
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
  /** ISO 3166-1 numeric id, used to decide which region owns this marker. */
  country?: string | number;
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
  /** TopoJSON with a `countries` object, e.g. world-atlas countries-110m. */
  world: Topology;

  /** Which look to draw. Defaults to "solid". */
  style?: StyleName | StylePainter;
  /** Which map projection. Defaults to "orthographic". */
  projection?: ProjectionName;

  regions?: Region[];
  markers?: Marker[];
  arcs?: Arc[];

  palette?: Partial<Palette>;

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

  /** Dot spacing in degrees for the "dots" style. Lower is denser. */
  dotSpacing?: number;
  /** Dot radius in CSS pixels for the "dots" style. */
  dotSize?: number;

  /** Overrides the generated aria-label on the canvas. */
  label?: string;
  /** Locale for marker clock formatting. Defaults to the browser's. */
  locale?: string;

  onMarkerHover?: (marker: Marker | null) => void;
  onMarkerClick?: (marker: Marker, event: MouseEvent) => void;
}

/** What `createGlobe` returns. */
export interface GlobeInstance {
  /** The canvas, if you need to size or screenshot it. */
  readonly canvas: HTMLCanvasElement;
  /** Current longitude at the centre, in degrees. */
  readonly longitude: number;
  /**
   * Parks the globe on a region and stops ambient rotation. Pass null to
   * release it back to drifting.
   */
  focus: (regionId: string | null) => void;
  /** Swaps the render style without rebuilding the globe. */
  setStyle: (style: StyleName | StylePainter) => void;
  /** Swaps the projection without rebuilding the globe. */
  setProjection: (projection: ProjectionName) => void;
  /** Merges new colours into the palette. */
  setPalette: (palette: Partial<Palette>) => void;
  /** Changes ambient rotation without touching anything else. */
  setSpin: (degreesPerSecond: number) => void;
  /** Replaces the markers. */
  setMarkers: (markers: Marker[]) => void;
  /** Stops the loop and removes everything this added to the DOM. */
  destroy: () => void;
}
