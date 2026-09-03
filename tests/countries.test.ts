import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Topology } from "topojson-specification";
import { isoKey, country, countryName, countriesIn, REGION_NAMES, allCountries } from "../src/countries";
import { readWorld } from "../src/geo";

/**
 * Country identity, checked against the real atlas.
 *
 * The point of the table is that every country the atlas draws can be named
 * by a code a person actually knows, so that is what is asserted.
 */

const world = JSON.parse(
  readFileSync(fileURLToPath(new URL("../data/countries-110m.json", import.meta.url)), "utf8"),
) as Topology;

describe("isoKey", () => {
  it("pads numeric ids however they arrive", () => {
    expect(isoKey(4)).toBe("004");
    expect(isoKey("4")).toBe("004");
    expect(isoKey("004")).toBe("004");
    expect(isoKey(566)).toBe("566");
  });

  it("resolves alpha-2 and alpha-3 in any case", () => {
    expect(isoKey("NG")).toBe("566");
    expect(isoKey("ng")).toBe("566");
    expect(isoKey("NGA")).toBe("566");
    expect(isoKey(" gb ")).toBe("826");
  });

  it("refuses a code that is not a country", () => {
    expect(() => isoKey("XX")).toThrow(/not a country/);
    expect(() => isoKey("Nigeria")).toThrow(/not a country/);
  });
});

describe("the table", () => {
  it("has unique codes", () => {
    const all = allCountries();
    for (const key of ["id", "alpha2", "alpha3"] as const) {
      expect(new Set(all.map((c) => c[key])).size).toBe(all.length);
    }
  });

  it("names every country the atlas draws", () => {
    const missing = readWorld(world).countries.filter((c) => !country(c.id));
    // The atlas has three shapes with no ISO code (Kosovo, Somaliland and
    // Northern Cyprus), which arrive with no id at all and pad to "000".
    expect(missing).toHaveLength(3);
    expect(missing.every((c) => c.id === "000")).toBe(true);
  });

  it("uses names people put on maps", () => {
    expect(countryName("GB")).toBe("United Kingdom");
    expect(countryName("KR")).toBe("South Korea");
    expect(countryName("BO")).toBe("Bolivia");
    expect(countryName(566)).toBe("Nigeria");
    expect(countryName("XX")).toBe("XX");
  });

  it("carries region and sub-region", () => {
    expect(country("NG")).toMatchObject({
      region: "Africa",
      subRegion: "Sub-Saharan Africa",
      intermediateRegion: "Western Africa",
    });
  });
});

describe("countriesIn", () => {
  it("lists a continent or a sub-region, case-insensitively", () => {
    expect(countriesIn("Africa")).toContain("566");
    expect(countriesIn("africa").length).toBeGreaterThan(50);
    expect(countriesIn("Western Africa")).toContain("566");
    expect(countriesIn("South-eastern Asia")).toContain(isoKey("PH"));
    expect(countriesIn("South-eastern Asia")).not.toContain(isoKey("JP"));
  });

  it("explains an unknown region", () => {
    expect(() => countriesIn("Atlantis")).toThrow(/Known regions/);
    expect(REGION_NAMES).toContain("Western Africa");
  });
});
