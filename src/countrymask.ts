import { geoBounds, geoContains, geoEquirectangular, geoPath, type GeoPermissibleObjects } from "d3-geo";
import type { CountryFeature, LngLat } from "./types";

/**
 * Which country is at a coordinate.
 *
 * The same trick as the land mask: every country is drawn once into an
 * offscreen equirectangular bitmap, in a colour that encodes its index, and
 * after that a lookup is one pixel read. Hover has to answer on every mouse
 * move, and a point-in-polygon test against 177 countries is too slow for
 * that, while a pixel read is free.
 *
 * Boundary pixels are antialiased between two neighbours' colours, so a
 * pointer exactly on a border can name the wrong side for a pixel's width.
 * At 0.18 degrees per pixel that is well under the width of a cursor.
 *
 * Without a canvas (a test runner, a server) it falls back to geometry, with
 * a bounding-box prefilter so the fallback is merely slow rather than glacial.
 */

/** Answers which country id sits at a coordinate, or null for ocean. */
export type CountryTest = (at: LngLat) => string | null;

const MASK_WIDTH = 2048;
const MASK_HEIGHT = 1024;

function makeCanvas(width: number, height: number): HTMLCanvasElement | null {
  if (typeof OffscreenCanvas === "function") {
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

/** Index to a colour and back. Index 0 is reserved for "nothing here". */
const encode = (index: number): string => {
  const n = index + 1;
  return `rgb(${n & 0xff}, ${(n >> 8) & 0xff}, 0)`;
};
const decode = (r: number, g: number): number => (r | (g << 8)) - 1;

function geometricTest(countries: CountryFeature[]): CountryTest {
  const boxed = countries.map((country) => {
    const [[west, south], [east, north]] = geoBounds(country.feature as never);
    return { country, west, south, east, north, wraps: west > east };
  });

  return ([lng, lat]) => {
    for (const { country, west, south, east, north, wraps } of boxed) {
      if (lat < south || lat > north) continue;
      if (!wraps && (lng < west || lng > east)) continue;
      if (geoContains(country.feature as never, [lng, lat])) return country.id;
    }
    return null;
  };
}

export function createCountryTest(countries: CountryFeature[]): CountryTest {
  const canvas = makeCanvas(MASK_WIDTH, MASK_HEIGHT);
  const ctx = canvas?.getContext("2d", { willReadFrequently: true }) as
    | CanvasRenderingContext2D
    | null
    | undefined;

  if (!canvas || !ctx) return geometricTest(countries);

  const projection = geoEquirectangular().fitSize([MASK_WIDTH, MASK_HEIGHT], {
    type: "Sphere",
  } as GeoPermissibleObjects);
  const path = geoPath(projection, ctx);

  countries.forEach((country, index) => {
    ctx.beginPath();
    path(country.feature);
    ctx.fillStyle = encode(index);
    ctx.fill();
  });

  const { data } = ctx.getImageData(0, 0, MASK_WIDTH, MASK_HEIGHT);

  return (at) => {
    const xy = projection(at);
    if (!xy) return null;
    const x = Math.floor(xy[0]);
    const y = Math.floor(xy[1]);
    if (x < 0 || y < 0 || x >= MASK_WIDTH || y >= MASK_HEIGHT) return null;
    const offset = (y * MASK_WIDTH + x) * 4;
    if ((data[offset + 3] ?? 0) < 128) return null;
    const index = decode(data[offset] ?? 0, data[offset + 1] ?? 0);
    return countries[index]?.id ?? null;
  };
}
