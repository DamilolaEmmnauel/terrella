import {
  geoOrthographic,
  geoEquirectangular,
  geoNaturalEarth1,
  geoCentroid,
  type GeoProjection,
  type GeoPermissibleObjects,
} from "d3-geo";
import { feature, merge } from "topojson-client";
import type { Topology, GeometryCollection } from "topojson-specification";
import type {
  ColorScale,
  CountryFeature,
  CountryValues,
  LngLat,
  Palette,
  ProjectionName,
  Region,
} from "./types";
import { createLandTest, type LandTest } from "./landmask";
import { isoKey } from "./countries";
import { ramp } from "./color";

export { isoKey };

/**
 * The geographic parts: identifiers, projections, and turning a topology into
 * the shapes the renderers draw.
 *
 * These are the details that make a globe annoying to build from scratch, so
 * they are isolated here where they can be tested without a canvas.
 */

const PROJECTIONS: Record<ProjectionName, () => GeoProjection> = {
  orthographic: geoOrthographic,
  equirectangular: geoEquirectangular,
  naturalEarth: geoNaturalEarth1,
};

/** Projections that wrap the whole world into a rectangle rather than a disc. */
const FLAT: ReadonlySet<ProjectionName> = new Set<ProjectionName>([
  "equirectangular",
  "naturalEarth",
]);

export const isFlat = (name: ProjectionName): boolean => FLAT.has(name);

export function createProjection(name: ProjectionName): GeoProjection {
  const make = PROJECTIONS[name];
  if (!make) throw new Error(`terrella: unknown projection "${name}"`);
  const projection = make();
  // Orthographic shows one hemisphere, so the far side has to be clipped or
  // the back of the world draws over the front.
  if (name === "orthographic") projection.clipAngle(90);
  return projection;
}

export interface WorldShapes {
  countries: CountryFeature[];
  land: GeoPermissibleObjects;
}

/**
 * Pulls the drawable shapes out of a TopoJSON topology.
 *
 * Land is merged into a single shape rather than drawn country by country:
 * one fill of the whole landmass is far cheaper than 177 fills, and the seams
 * between countries are only wanted where a region needs them.
 */
export function readWorld(world: Topology): WorldShapes {
  const object = world.objects?.["countries"];
  if (!object) {
    throw new Error('terrella: the topology has no "countries" object');
  }

  const collection = feature(world, object) as unknown as {
    features: Array<{ id?: string | number }>;
  };

  // Padded directly rather than through isoKey: the atlas keys a few shapes
  // that have no ISO code (Kosovo, Somaliland) as "-99", and those must still
  // be drawn even though nothing can name them.
  const countries: CountryFeature[] = collection.features.map((f) => ({
    id: String(f.id ?? "").padStart(3, "0"),
    feature: f as unknown as GeoPermissibleObjects,
  }));

  // merge() only accepts polygonal geometries. A topology can legally contain
  // null geometries for territories with no shape, and passing one through
  // fails at runtime rather than at the type level, so they are filtered here.
  const geometries = (object as GeometryCollection).geometries.filter(
    (g): g is Extract<typeof g, { type: "Polygon" | "MultiPolygon" }> =>
      g.type === "Polygon" || g.type === "MultiPolygon",
  );

  const land = merge(world, geometries) as unknown as GeoPermissibleObjects;

  return { countries, land };
}

/**
 * Builds a country-id to colour lookup for the given regions.
 *
 * A map read per country in the draw loop, rather than scanning every region
 * for every country on every frame.
 */
export function regionColors(regions: Region[], palette: Palette): Map<string, string> {
  const colors = new Map<string, string>();

  for (const region of regions) {
    const highlighted = new Set((region.highlight ?? []).map(isoKey));
    for (const country of region.countries ?? []) {
      const key = isoKey(country);
      colors.set(
        key,
        highlighted.has(key)
          ? (region.highlightColor ?? palette.highlight)
          : (region.color ?? palette.region),
      );
    }
  }

  return colors;
}

/**
 * Colours countries by value.
 *
 * Values win over region colours, so a choropleth can sit inside a region
 * outline: the region says which countries matter, the values say how much.
 */
export function valueColors(
  values: CountryValues | null | undefined,
  scale: ColorScale | undefined,
  palette: Palette,
): Map<string, string> {
  const colors = new Map<string, string>();
  if (!values) return colors;

  const entries = Object.entries(values).filter(([, v]) => Number.isFinite(v));
  if (entries.length === 0) return colors;

  let toColor: (value: number) => string;
  if (typeof scale === "function") {
    toColor = scale;
  } else {
    const numbers = entries.map(([, v]) => v);
    const [low, high] = scale?.domain ?? [Math.min(...numbers), Math.max(...numbers)];
    const stops = scale?.range ?? [palette.land, palette.highlight];
    const span = high - low;
    toColor = (value) => ramp(stops, span === 0 ? 1 : (value - low) / span);
  }

  for (const [id, value] of entries) colors.set(isoKey(id), toColor(value));
  return colors;
}

/**
 * Where to park the globe so a region faces the viewer.
 *
 * Uses the region's own longitude when it gives one, and otherwise the centroid
 * of its countries. Falling back to the centroid means a caller can add a
 * region without working out a camera angle by hand, which is the tedious part
 * of doing this manually.
 */
export function regionCentre(
  region: Region,
  countries: CountryFeature[],
): { longitude: number; latitude: number } | null {
  if (region.longitude !== undefined) {
    return { longitude: region.longitude, latitude: -(region.tilt ?? 0) };
  }

  const wanted = new Set((region.countries ?? []).map(isoKey));
  const members = countries.filter((c) => wanted.has(c.id));
  if (members.length === 0) return null;

  // Averaging centroids rather than merging geometry: good enough to aim a
  // camera, and it avoids a topology merge for something only used on focus.
  let x = 0;
  let y = 0;
  let z = 0;
  for (const member of members) {
    const [lng, lat] = geoCentroid(member.feature as never) as LngLat;
    const rlng = (lng * Math.PI) / 180;
    const rlat = (lat * Math.PI) / 180;
    x += Math.cos(rlat) * Math.cos(rlng);
    y += Math.cos(rlat) * Math.sin(rlng);
    z += Math.sin(rlat);
  }
  x /= members.length;
  y /= members.length;
  z /= members.length;

  return {
    longitude: (Math.atan2(y, x) * 180) / Math.PI,
    latitude: (Math.atan2(z, Math.hypot(x, y)) * 180) / Math.PI,
  };
}

/** Beyond this the dots stop reading as a globe and start costing frames. */
export const MAX_DOTS = 40_000;

/**
 * Samples a grid of points that fall on land.
 *
 * The dotted style needs to know which of thousands of grid points are over
 * land, and `geoContains` is far too slow to run per frame. It is run once
 * here and the surviving points are reused for the life of the style.
 *
 * Spacing is scaled by latitude so the dots stay roughly evenly spread instead
 * of bunching together at the poles, which is what a plain lat/lon grid does.
 */
export function sampleLandGrid(
  land: GeoPermissibleObjects,
  spacingDegrees: number,
  isLand: LandTest = createLandTest(land),
): LngLat[] {
  const points: LngLat[] = [];
  // A floor on spacing and a cap on the total are both needed. The floor stops
  // a spacing of 0 looping forever; the cap stops a merely small one producing
  // a quarter of a million dots, which no longer reads as a globe and cannot
  // be drawn at 60fps whatever the sampling costs.
  const spacing = Math.max(0.5, spacingDegrees);

  for (let lat = -90 + spacing / 2; lat < 90; lat += spacing) {
    const shrink = Math.cos((lat * Math.PI) / 180);
    // Near the poles the circles of latitude are short, so the same angular
    // step would place far more dots per unit of surface.
    const step = shrink > 0.02 ? spacing / shrink : 360;

    for (let lng = -180; lng < 180; lng += step) {
      if (isLand([lng, lat])) {
        points.push([lng, lat]);
        if (points.length >= MAX_DOTS) return points;
      }
    }
  }

  return points;
}
