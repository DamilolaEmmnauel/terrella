import { geoEquirectangular, geoPath, geoContains, type GeoPermissibleObjects } from "d3-geo";
import type { LngLat } from "./types";

/**
 * Deciding whether a coordinate is on land.
 *
 * The obvious way is `geoContains` against the merged landmass, and it is
 * unusably slow: it walks every ring of a multipolygon covering the whole
 * world, per point. Sampling the grid the dotted style needs took 2.4 seconds
 * at the default spacing and 65 seconds at a tight one, all of it blocking the
 * main thread.
 *
 * So the land is drawn once into a small offscreen bitmap in equirectangular
 * projection, where longitude and latitude map linearly to x and y. After that
 * every test is one array read. The cost becomes a single rasterisation, and
 * accuracy is bounded by the bitmap resolution rather than the geometry, which
 * is the right trade for placing dots that are a pixel wide.
 *
 * `geoContains` remains the fallback for environments with no canvas, such as
 * the test runner, so behaviour is the same everywhere and only the speed
 * differs.
 */

/** Answers whether a coordinate is on land. */
export type LandTest = (at: LngLat) => boolean;

/** Bitmap size. 2:1 matches the equirectangular aspect; ~0.35 degrees per pixel. */
const MASK_WIDTH = 1024;
const MASK_HEIGHT = 512;

/** Creates a canvas in whichever environment we are in, or null if we cannot. */
function makeCanvas(width: number, height: number): HTMLCanvasElement | null {
  if (typeof OffscreenCanvas === "function") {
    // Cast: OffscreenCanvas has the 2d context and drawing surface we use, and
    // typing the whole module for both surfaces would obscure the logic.
    return new OffscreenCanvas(width, height) as unknown as HTMLCanvasElement;
  }
  if (typeof document !== "undefined" && typeof document.createElement === "function") {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }
  return null;
}

/**
 * Builds a fast land test by rasterising the landmass.
 *
 * Falls back to `geoContains` when there is no canvas to draw into.
 */
export function createLandTest(land: GeoPermissibleObjects): LandTest {
  const canvas = makeCanvas(MASK_WIDTH, MASK_HEIGHT);
  const ctx = canvas?.getContext("2d", { willReadFrequently: true }) as
    | CanvasRenderingContext2D
    | null
    | undefined;

  if (!canvas || !ctx) {
    return (at) => geoContains(land as never, at);
  }

  const projection = geoEquirectangular().fitSize([MASK_WIDTH, MASK_HEIGHT], {
    type: "Sphere",
  } as GeoPermissibleObjects);

  ctx.fillStyle = "#000";
  ctx.beginPath();
  geoPath(projection, ctx)(land);
  ctx.fill();

  const { data } = ctx.getImageData(0, 0, MASK_WIDTH, MASK_HEIGHT);

  // Only the alpha channel is needed, so it is unpacked into a flat byte array
  // once rather than indexed by stride on every lookup.
  const mask = new Uint8Array(MASK_WIDTH * MASK_HEIGHT);
  for (let i = 0; i < mask.length; i++) mask[i] = data[i * 4 + 3] ?? 0;

  return ([lng, lat]) => {
    const xy = projection([lng, lat]);
    if (!xy) return false;
    const x = Math.floor(xy[0]);
    const y = Math.floor(xy[1]);
    if (x < 0 || y < 0 || x >= MASK_WIDTH || y >= MASK_HEIGHT) return false;
    // Antialiased edges give partial alpha; half is the natural cut.
    return (mask[y * MASK_WIDTH + x] ?? 0) > 128;
  };
}
