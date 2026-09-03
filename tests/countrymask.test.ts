import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Topology } from "topojson-specification";
import { createCountryTest } from "../src/countrymask";
import { readWorld } from "../src/geo";

/**
 * Which country is under a coordinate.
 *
 * Node has no canvas, so this exercises the geometric fallback. The bitmap
 * path is checked in the browser, where what matters is that the two agree.
 */

const world = JSON.parse(
  readFileSync(fileURLToPath(new URL("../data/countries-110m.json", import.meta.url)), "utf8"),
) as Topology;

const countryAt = createCountryTest(readWorld(world).countries);

describe("createCountryTest", () => {
  it("names the country under a city", () => {
    expect(countryAt([3.4, 6.5])).toBe("566"); // Lagos
    expect(countryAt([121.0, 14.6])).toBe("608"); // Manila
    expect(countryAt([-46.6, -23.5])).toBe("076"); // Sao Paulo
  });

  it("answers null over open ocean", () => {
    expect(countryAt([-30, 0])).toBeNull();
    expect(countryAt([-150, -50])).toBeNull();
  });
});
