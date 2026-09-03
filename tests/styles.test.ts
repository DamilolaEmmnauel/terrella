import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Topology } from "topojson-specification";
import { STYLE_NAMES, resolveStyle } from "../src/styles";
import { seededRandom } from "../src/styles/sampled";
import { readWorld } from "../src/geo";
import { resolveConfig } from "../src/config";

const world = JSON.parse(
  readFileSync(fileURLToPath(new URL("../data/countries-110m.json", import.meta.url)), "utf8"),
) as Topology;

describe("styles", () => {
  it("registers every built-in", () => {
    expect(STYLE_NAMES).toEqual(["solid", "dots", "wireframe", "hatched", "pixel", "ascii", "stipple"]);
  });

  it("prepares each one without a canvas", () => {
    // Coarse spacing keeps the geometric land test, the only one Node has,
    // from taking seconds per style.
    const { countries, land } = readWorld(world);
    const options = resolveConfig({ world, dotSpacing: 12, regions: [{ id: "ng", countries: ["NG"] }] });
    for (const name of STYLE_NAMES) {
      const style = resolveStyle(name, { land, countries, options });
      expect(style.name).toBe(name);
      expect(typeof style.paint).toBe("function");
    }
  });

  it("refuses an unknown style by name", () => {
    const { countries, land } = readWorld(world);
    const options = resolveConfig({ world });
    // @ts-expect-error deliberately wrong
    expect(() => resolveStyle("neon", { land, countries, options })).toThrow(/unknown style/);
  });

  it("jitters the same way every time", () => {
    const a = seededRandom(7);
    const b = seededRandom(7);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    expect(a()).toBeGreaterThanOrEqual(0);
    expect(a()).toBeLessThan(1);
  });
});
