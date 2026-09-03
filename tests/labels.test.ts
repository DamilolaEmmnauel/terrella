import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Topology } from "topojson-specification";
import { resolveLabels } from "../src/labels";
import { readWorld } from "../src/geo";

const world = JSON.parse(
  readFileSync(fileURLToPath(new URL("../data/countries-110m.json", import.meta.url)), "utf8"),
) as Topology;
const { countries } = readWorld(world);
const regions = [{ id: "sea", countries: ["PH", "ID", 704] }];

describe("resolveLabels", () => {
  it("is off by default", () => {
    expect(resolveLabels(undefined, countries, regions)).toBeNull();
    expect(resolveLabels(false, countries, regions)).toBeNull();
  });

  it("labels the region's countries and the markers for `true`", () => {
    const state = resolveLabels(true, countries, regions);
    expect(state?.markers).toBe(true);
    expect(state?.countries.map((c) => c.name).sort()).toEqual(["Indonesia", "Philippines", "Vietnam"]);
  });

  it("places a label at the country's centroid", () => {
    const state = resolveLabels({ countries: ["NG"] }, countries, regions);
    const nigeria = state?.countries[0];
    expect(nigeria?.name).toBe("Nigeria");
    expect(nigeria?.at[0]).toBeCloseTo(8, 0);
    expect(nigeria?.at[1]).toBeCloseTo(9.6, 0);
  });

  it("can label every country", () => {
    expect(resolveLabels({ countries: "all" }, countries, regions)?.countries.length).toBe(
      countries.length,
    );
  });
});
