import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createLandTest } from "../src/landmask";
import { readWorld } from "../src/geo";
import type { Topology } from "topojson-specification";

/**
 * The land test.
 *
 * Node has no canvas, so these exercise the geoContains fallback. That is the
 * point: the two paths must agree, and this is the one that defines what
 * "correct" means for the faster one to match.
 */

const world = JSON.parse(
  readFileSync(fileURLToPath(new URL("../data/countries-110m.json", import.meta.url)), "utf8"),
) as Topology;

const { land } = readWorld(world);
const isLand = createLandTest(land);

describe("createLandTest", () => {
  it("says yes on land", () => {
    expect(isLand([3.4, 6.5])).toBe(true);    // Lagos
    expect(isLand([-99.1, 19.4])).toBe(true); // Mexico City
    expect(isLand([37.6, 55.8])).toBe(true);  // Moscow
  });

  it("says no at sea", () => {
    expect(isLand([-30, 0])).toBe(false);   // mid Atlantic
    expect(isLand([-140, -30])).toBe(false); // south Pacific
    expect(isLand([80, -45])).toBe(false);   // southern Indian Ocean
  });

  it("handles the poles without throwing", () => {
    expect(() => isLand([0, 90])).not.toThrow();
    expect(() => isLand([0, -90])).not.toThrow();
  });
});
