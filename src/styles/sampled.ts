import { geoBounds, geoContains, geoDistance } from "d3-geo";
import type { CountryFeature, Frame, LngLat, PrepareContext } from "../types";
import { isoKey, sampleLandGrid } from "../geo";

/**
 * What the sampled styles share: dots, pixels, characters and stipple all
 * start from a grid of points on land, each tagged with the region country it
 * falls in so it can take that region's colour.
 *
 * Deciding which country a point belongs to is points multiplied by
 * countries, so a bounding-box prefilter turns a few hundred thousand polygon
 * tests into a few thousand. Both costs are paid once, in `prepare`.
 */

/** The visible hemisphere, in radians from the point facing the viewer. */
export const HORIZON = Math.PI / 2;

/**
 * How sharply points fade in from the limb. 1 would fade the whole
 * hemisphere; this confines it to roughly the outer quarter.
 */
export const FADE_BAND = 4;

export interface Sample {
  /** Position in degrees. */
  at: LngLat;
  /** ISO id of the country this point sits in, or "" if it is in no region. */
  country: string;
}

/** Assigns region countries to points, using bounds to avoid polygon tests. */
export function assignCountries(
  points: LngLat[],
  countries: CountryFeature[],
  wanted: Set<string>,
): Sample[] {
  const assigned: Sample[] = points.map((at) => ({ at, country: "" }));

  for (const country of countries) {
    if (!wanted.has(country.id)) continue;

    const [[west, south], [east, north]] = geoBounds(country.feature as never);
    // A country crossing the antimeridian reports west > east. Rare enough
    // (Russia, Fiji) that widening to the whole range is the safe answer.
    const wraps = west > east;

    for (const sample of assigned) {
      if (sample.country) continue;
      const [lng, lat] = sample.at;
      if (lat < south || lat > north) continue;
      if (!wraps && (lng < west || lng > east)) continue;
      if (geoContains(country.feature as never, sample.at)) sample.country = country.id;
    }
  }

  return assigned;
}

/** The land grid at a spacing, tagged with region countries. */
export function sampleLand(context: PrepareContext, spacing: number): Sample[] {
  const { land, countries, options } = context;
  const points = sampleLandGrid(land, spacing);

  const wanted = new Set<string>();
  for (const region of options.regions ?? []) {
    for (const country of region.countries ?? []) wanted.add(isoKey(country));
  }

  return assignCountries(points, countries, wanted);
}

/**
 * Visibility of a sample: null beyond the horizon, otherwise 0 at the limb
 * rising to 1 facing the viewer. Always 1 on a flat map.
 */
export function visibility(frame: Frame, at: LngLat): number | null {
  if (frame.flat) return 1;
  const [lambda = 0, phi = 0] = frame.projection.rotate();
  const angle = geoDistance(at, [-lambda, -phi]);
  if (angle > HORIZON) return null;
  return 1 - angle / HORIZON;
}

/**
 * A small deterministic random source, so a jittered style draws the same
 * picture every time it is prepared. Mulberry32.
 */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
