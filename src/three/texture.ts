import { geoEquirectangular, geoPath, type GeoPermissibleObjects } from "d3-geo";
import type { Frame, Palette } from "../types";
import type { PreparedStyle } from "../styles";
import type { CountryFeature } from "../types";

/**
 * Turning a 2D style into the sphere's texture.
 *
 * This is what lets the 3D renderer reuse the whole style system rather than
 * reimplementing it. A style paints into a canvas through a `Frame`, and it
 * never learns what that canvas is for. So the 3D renderer hands it an
 * equirectangular projection fitted to a 2:1 canvas, and wraps the result
 * around a sphere.
 *
 * Every style therefore works in 3D the day it is written, including one a
 * caller wrote themselves, and the two renderers cannot drift apart in how
 * they draw a country.
 *
 * The projection has to be equirectangular specifically: it is the one where
 * longitude and latitude map linearly to x and y, which is exactly what a
 * sphere's UV unwrap expects.
 */

export interface MapTextureOptions {
  style: PreparedStyle;
  countries: CountryFeature[];
  land: GeoPermissibleObjects;
  regionColors: Map<string, string>;
  palette: Palette;
  /** Texture width in pixels. Height is always half of it. */
  size?: number;
}

/**
 * Default texture width.
 *
 * 2048x1024 is about 0.18 degrees per pixel, which keeps coastlines crisp at
 * the sizes a globe is usually shown at without spending 16MB of GPU memory.
 */
const DEFAULT_SIZE = 2048;

export interface MapTexture {
  canvas: HTMLCanvasElement;
  /** Redraws in place, for a palette or region change. */
  update: (next: Partial<MapTextureOptions>) => void;
}

/** Draws a style into an equirectangular canvas, ready to wrap onto a sphere. */
export function createMapTexture(options: MapTextureOptions): MapTexture {
  const width = options.size ?? DEFAULT_SIZE;
  const height = width / 2;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("terrella/three: could not get a 2d context for the map texture");
  }
  // Bound to a new const so the null check survives into the closure below.
  const ctx = context;

  let current = options;

  function draw(): void {
    // fitSize on a 2:1 canvas makes the projection fill it exactly, so there
    // is no margin and the texture wraps seamlessly at the antimeridian.
    const projection = geoEquirectangular().fitSize([width, height], {
      type: "Sphere",
    } as GeoPermissibleObjects);
    const path = geoPath(projection, ctx);

    ctx.clearRect(0, 0, width, height);

    const frame: Frame = {
      ctx,
      width,
      height,
      // A flat projection has no sphere radius or centre on screen. They are
      // part of the Frame contract, so they are filled with the values that
      // describe this canvas rather than left undefined.
      radius: width / 2,
      centreX: width / 2,
      centreY: height / 2,
      projection,
      path: (object) => path(object),
      countries: current.countries,
      land: current.land,
      regionColors: current.regionColors,
      palette: current.palette,
      // The texture is drawn on demand rather than per frame, so an animated
      // style gets a stable time rather than a jittering one.
      time: 0,
      flat: true,
    };

    current.style.paint(frame);
  }

  draw();

  return {
    canvas,
    update(next) {
      current = { ...current, ...next };
      draw();
    },
  };
}
