import { describe, it, expect } from "vitest";
import { subsolarPoint, nightPolygon } from "../src/terminator";

describe("subsolarPoint", () => {
  it("puts the sun over the equator at the equinox", () => {
    const [, lat] = subsolarPoint(new Date(Date.UTC(2024, 2, 20, 3, 6)));
    expect(Math.abs(lat)).toBeLessThan(0.5);
  });

  it("puts the sun at the tropic at the solstice", () => {
    const [, lat] = subsolarPoint(new Date(Date.UTC(2024, 5, 20, 20, 51)));
    expect(lat).toBeCloseTo(23.44, 0);
    const [, winter] = subsolarPoint(new Date(Date.UTC(2024, 11, 21, 9, 20)));
    expect(winter).toBeCloseTo(-23.44, 0);
  });

  it("puts the sun near Greenwich at noon UTC", () => {
    // The equation of time moves solar noon by up to a quarter of an hour,
    // which is under four degrees of longitude.
    const [lng] = subsolarPoint(new Date(Date.UTC(2024, 2, 20, 12, 0)));
    expect(Math.abs(lng)).toBeLessThan(4);
  });
});

describe("nightPolygon", () => {
  it("is a hemisphere opposite the sun", () => {
    const polygon = nightPolygon(new Date(Date.UTC(2024, 2, 20, 12, 0)));
    expect(polygon.type).toBe("Polygon");
    expect(polygon.coordinates[0]?.length).toBeGreaterThan(10);
  });
});
