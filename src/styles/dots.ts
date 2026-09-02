import { geoBounds, geoContains, geoDistance } from "d3-geo";
import type { CountryFeature, Frame, LngLat, PrepareContext, StylePainter } from "../types";
import { isoKey, sampleLandGrid } from "../geo";
import { paintBackdrop } from "./shared";
import { contrastWith } from "../color";

/**
 * Land as a field of dots: the halftone look popularised by cobe.
 *
 * Two costs make the naive version of this unusable, and both are paid once in
 * `prepare` rather than every frame.
 *
 * Deciding which grid points are on land means a point-in-polygon test against
 * the whole landmass, thousands of times. Deciding which country a dot belongs
 * to, so it can take a region's colour, is worse: points multiplied by
 * countries. A bounding-box prefilter turns the second one from a few hundred
 * thousand polygon tests into a few thousand.
 */

/** The visible hemisphere, in radians from the point facing the viewer. */
const HORIZON = Math.PI / 2;

/**
 * How sharply dots fade in from the limb. 1 would fade the whole hemisphere;
 * this confines it to roughly the outer quarter.
 */
const FADE_BAND = 4;

interface Dot {
  /** Position in degrees. */
  at: LngLat;
  /** ISO id of the country this dot sits in, or "" if it is in no region. */
  country: string;
}

/** Per-instance, returned by prepare and handed to every paint. */
export interface DotState {
  dots: Dot[];
  size: number;
}

/** Assigns region countries to dots, using bounds to avoid polygon tests. */
function assignCountries(points: LngLat[], countries: CountryFeature[], wanted: Set<string>): Dot[] {
  const assigned: Dot[] = points.map((at) => ({ at, country: "" }));

  for (const country of countries) {
    if (!wanted.has(country.id)) continue;

    const [[west, south], [east, north]] = geoBounds(country.feature as never);
    // A country crossing the antimeridian reports west > east. Rare enough
    // (Russia, Fiji) that widening to the whole range is the safe answer.
    const wraps = west > east;

    for (const dot of assigned) {
      if (dot.country) continue;
      const [lng, lat] = dot.at;
      if (lat < south || lat > north) continue;
      if (!wraps && (lng < west || lng > east)) continue;
      if (geoContains(country.feature as never, dot.at)) dot.country = country.id;
    }
  }

  return assigned;
}

export const dots_: StylePainter<DotState> = {
  name: "dots",

  prepare({ land, countries, options }: PrepareContext): DotState {
    const points = sampleLandGrid(land, options.dotSpacing ?? 2.2);

    const wanted = new Set<string>();
    for (const region of options.regions ?? []) {
      for (const country of region.countries ?? []) wanted.add(isoKey(country));
    }

    return {
      dots: assignCountries(points, countries, wanted),
      size: options.dotSize ?? 1.1,
    };
  },

  paint(frame: Frame, state: DotState) {
    const { ctx, projection, palette, flat, regionColors } = frame;
    const { dots, size } = state;

    paintBackdrop(frame);

    // Dots need more contrast than fills at the same colour, so the land
    // colour is pushed away from the ocean unless the palette names one.
    const landDot = palette.dot ?? contrastWith(palette.land, palette.ocean);

    // The point facing the viewer, derived from the projection's own rotation
    // so this cannot drift out of step with it.
    const [lambda = 0, phi = 0] = projection.rotate();
    const facing: LngLat = [-lambda, -phi];

    for (const dot of dots) {
      // Orthographic projects far-side points too, so the back of the world
      // would draw over the front without an explicit horizon test.
      let nearness = 1;
      if (!flat) {
        const angle = geoDistance(dot.at, facing);
        if (angle > HORIZON) continue;
        // Evenly spread points crowd together as they approach the limb, which
        // draws a hard ring of dots around the edge that reads as fur rather
        // than as a sphere. Fading the outer band both removes the ring and
        // gives the depth cue the flat dots otherwise lack.
        nearness = 1 - angle / HORIZON;
      }

      const xy = projection(dot.at);
      if (!xy) continue;

      const color = dot.country ? regionColors.get(dot.country) : undefined;

      ctx.globalAlpha = Math.min(1, nearness * FADE_BAND);
      ctx.beginPath();
      // Region dots are drawn larger as well as coloured, so they still read
      // when the palette's region colour is close to its land colour.
      ctx.arc(xy[0], xy[1], color ? size * 1.7 : size, 0, Math.PI * 2);
      ctx.fillStyle = color ?? landDot;
      ctx.fill();
    }

    ctx.globalAlpha = 1;
  },
};

export { dots_ as dots };
