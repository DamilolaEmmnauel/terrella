import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  isoKey,
  isFlat,
  createProjection,
  readWorld,
  regionColors,
  regionCentre,
  sampleLandGrid,
  MAX_DOTS,
} from "../src/geo";
import { DEFAULT_PALETTE } from "../src/config";
import type { Topology } from "topojson-specification";

/**
 * The geographic layer, tested against the real atlas rather than a fixture.
 *
 * A hand-made topology would pass tests that the actual world-atlas data
 * fails, and the country-id mismatch these tests exist to catch is precisely
 * the kind of thing a fixture would paper over.
 */

const world = JSON.parse(
  readFileSync(fileURLToPath(new URL("../data/countries-110m.json", import.meta.url)), "utf8"),
) as Topology;

describe("isoKey", () => {
  it("normalises the three ways a country id arrives", () => {
    // The atlas stores "004"; callers have 4 or "4". All three must match, and
    // when they do not, regions silently highlight nothing.
    expect(isoKey(4)).toBe("004");
    expect(isoKey("4")).toBe("004");
    expect(isoKey("004")).toBe("004");
  });

  it("leaves three-digit ids alone", () => {
    expect(isoKey(566)).toBe("566");
    expect(isoKey("826")).toBe("826");
  });
});

describe("projections", () => {
  it("knows which projections are flat", () => {
    expect(isFlat("orthographic")).toBe(false);
    expect(isFlat("equirectangular")).toBe(true);
    expect(isFlat("naturalEarth")).toBe(true);
  });

  it("clips the orthographic projection to the near hemisphere", () => {
    // Without clipAngle the back of the world draws over the front.
    expect(createProjection("orthographic").clipAngle()).toBe(90);
  });

  it("refuses an unknown projection by name", () => {
    // @ts-expect-error deliberately wrong, to prove it fails loudly
    expect(() => createProjection("mercator-ish")).toThrow(/unknown projection/);
  });
});

describe("readWorld", () => {
  it("reads every country out of the atlas", () => {
    const { countries } = readWorld(world);
    expect(countries.length).toBeGreaterThan(150);
    // Every id must be the padded form the rest of the library compares against.
    expect(countries.every((c) => /^\d{3}$/.test(c.id))).toBe(true);
  });

  it("produces one merged land shape", () => {
    const { land } = readWorld(world);
    expect(land).toBeTruthy();
    expect((land as { type: string }).type).toBe("MultiPolygon");
  });

  it("explains itself when the topology has no countries", () => {
    const empty = { type: "Topology", objects: {}, arcs: [] } as unknown as Topology;
    expect(() => readWorld(empty)).toThrow(/no "countries" object/);
  });
});

describe("regionColors", () => {
  const palette = DEFAULT_PALETTE;

  it("colours a region's countries", () => {
    const colors = regionColors([{ id: "a", countries: [4, 8] }], palette);
    expect(colors.get("004")).toBe(palette.region);
    expect(colors.get("008")).toBe(palette.region);
  });

  it("gives highlighted countries the highlight colour", () => {
    const colors = regionColors([{ id: "a", countries: [4, 8], highlight: [8] }], palette);
    expect(colors.get("004")).toBe(palette.region);
    expect(colors.get("008")).toBe(palette.highlight);
  });

  it("prefers the region's own colours over the palette", () => {
    const colors = regionColors(
      [{ id: "a", countries: [4], highlight: [4], highlightColor: "#abcdef" }],
      palette,
    );
    expect(colors.get("004")).toBe("#abcdef");
  });

  it("accepts unpadded ids, which is how callers usually have them", () => {
    const colors = regionColors([{ id: "a", countries: ["4"] }], palette);
    expect(colors.get("004")).toBe(palette.region);
  });
});

describe("regionCentre", () => {
  const { countries } = readWorld(world);

  it("uses an explicit longitude when the region gives one", () => {
    const centre = regionCentre({ id: "a", longitude: 120, tilt: -20 }, countries);
    expect(centre?.longitude).toBe(120);
    expect(centre?.latitude).toBe(20);
  });

  it("finds a sane centre for a real region without one", () => {
    // Nigeria, Kenya, South Africa. The centre should land in Africa: roughly
    // positive longitude, and south of the equator given South Africa's pull.
    const centre = regionCentre({ id: "africa", countries: [566, 404, 710] }, countries);
    expect(centre).not.toBeNull();
    expect(centre!.longitude).toBeGreaterThan(5);
    expect(centre!.longitude).toBeLessThan(40);
    expect(centre!.latitude).toBeGreaterThan(-30);
    expect(centre!.latitude).toBeLessThan(15);
  });

  it("averages across the antimeridian without landing in the wrong ocean", () => {
    // Averaging degrees numerically would put the centre of Fiji and Samoa at
    // roughly zero longitude, which is the Atlantic. Vector averaging keeps it
    // in the Pacific.
    const centre = regionCentre({ id: "pacific", countries: [242, 882] }, countries);
    expect(centre).not.toBeNull();
    expect(Math.abs(centre!.longitude)).toBeGreaterThan(150);
  });

  it("returns null when no country matches", () => {
    expect(regionCentre({ id: "a", countries: [999] }, countries)).toBeNull();
  });
});

describe("sampleLandGrid", () => {
  const { land } = readWorld(world);

  // Node has no canvas, so the real land test falls back to geoContains, which
  // is the slow path this library exists to avoid. A cheap stand-in keeps the
  // suite fast; the geometry of the grid is what these tests are about, and
  // landmask.test.ts covers the real test separately.
  const northernLand = ([lng, lat]: [number, number]) => lat > 0 && lng > -100 && lng < 100;

  it("samples points that are on land", () => {
    const points = sampleLandGrid(land, 6, northernLand);
    expect(points.length).toBeGreaterThan(100);
    expect(points.every(([, lat]) => lat > 0)).toBe(true);
  });

  it("gets denser as the spacing shrinks", () => {
    expect(sampleLandGrid(land, 4, northernLand).length).toBeGreaterThan(
      sampleLandGrid(land, 10, northernLand).length,
    );
  });

  it("does not bunch dots at the poles", () => {
    // A plain lat/lon grid puts as many points on a narrow circle near the pole
    // as around the equator, which shows as a dense cap. Longitude spacing is
    // scaled by latitude to prevent it.
    const points = sampleLandGrid(land, 4, () => true);
    const highLatitude = points.filter(([, lat]) => Math.abs(lat) > 70).length;
    expect(highLatitude / points.length).toBeLessThan(0.25);
  });

  it("caps the total rather than returning a quarter of a million dots", () => {
    // Without the cap, a small spacing produces more dots than can be drawn at
    // 60fps, and a spacing of 0 loops forever. Both are caller mistakes that
    // must degrade rather than hang: this exact case took 65 seconds before.
    const points = sampleLandGrid(land, 0, () => true);
    expect(points.length).toBe(MAX_DOTS);
  });

  it("stays fast enough to run when a style is selected", () => {
    // The whole point of the raster mask. A budget rather than an exact time,
    // since CI machines vary, but 2.4 seconds was the number that made the
    // dotted style unusable.
    const started = performance.now();
    sampleLandGrid(land, 2.2, northernLand);
    expect(performance.now() - started).toBeLessThan(500);
  });
});
