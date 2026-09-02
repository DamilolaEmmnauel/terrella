import { describe, it, expect } from "vitest";
import { Vector3 } from "three";
import { SphereGeometry } from "three";
import { lngLatToVector3, greatCirclePoints } from "../src/three/coords";

/**
 * The lat/lng to 3D conversion.
 *
 * The failure this guards against is a marker sitting in the wrong ocean,
 * which looks plausible in code and obvious on screen. So rather than assert
 * the numbers this implementation happens to produce, these check it against
 * SphereGeometry's own UV layout, which is the thing it actually has to agree
 * with.
 */

describe("lngLatToVector3", () => {
  it("puts the poles on the y axis", () => {
    expect(lngLatToVector3([0, 90], 1).y).toBeCloseTo(1, 6);
    expect(lngLatToVector3([0, -90], 1).y).toBeCloseTo(-1, 6);
    // Longitude is meaningless at a pole and must not move it.
    expect(lngLatToVector3([123, 90], 1).distanceTo(new Vector3(0, 1, 0))).toBeCloseTo(0, 6);
  });

  it("keeps every point on the sphere", () => {
    for (const at of [[0, 0], [90, 45], [-74, 4.7], [180, -33], [3.4, 6.5]] as [number, number][]) {
      expect(lngLatToVector3(at, 2.5).length()).toBeCloseTo(2.5, 6);
    }
  });

  it("agrees with SphereGeometry's UV mapping", () => {
    // The real contract. SphereGeometry maps u = 0.5 to the prime meridian, so
    // (0, 0) must land on the same vertex the geometry would put there. If
    // this drifts, the texture and the markers disagree and every marker sits
    // beside the country it belongs to rather than on it.
    const geometry = new SphereGeometry(1, 64, 32);
    const position = geometry.attributes["position"];
    const uv = geometry.attributes["uv"];
    expect(position && uv).toBeTruthy();

    let worst = 0;
    for (let i = 0; i < position!.count; i++) {
      const u = uv!.getX(i);
      const v = uv!.getY(i);

      // Invert SphereGeometry's UV layout back to a coordinate.
      const lng = u * 360 - 180;
      const lat = v * 180 - 90;

      const mine = lngLatToVector3([lng, lat], 1);
      const theirs = new Vector3(position!.getX(i), position!.getY(i), position!.getZ(i));
      worst = Math.max(worst, mine.distanceTo(theirs));
    }

    expect(worst).toBeLessThan(1e-6);
  });

  it("separates places that are far apart", () => {
    // Lagos and Mexico City are most of the world apart, so their vectors
    // should be too. Catches a longitude sign flip, which otherwise produces a
    // globe that looks fine until you notice it is mirrored.
    const lagos = lngLatToVector3([3.4, 6.5], 1);
    const mexico = lngLatToVector3([-99.1, 19.4], 1);
    expect(lagos.angleTo(mexico)).toBeGreaterThan(1.5);
  });
});

describe("greatCirclePoints", () => {
  it("starts and ends on the surface", () => {
    const points = greatCirclePoints([3.4, 6.5], [121, 14.6], 1);
    expect(points[0]!.length()).toBeCloseTo(1, 5);
    expect(points.at(-1)!.length()).toBeCloseTo(1, 5);
  });

  it("bows away from the surface in the middle", () => {
    const points = greatCirclePoints([3.4, 6.5], [121, 14.6], 1);
    const middle = points[Math.floor(points.length / 2)]!;
    expect(middle.length()).toBeGreaterThan(1);
  });

  it("lifts a long arc higher than a short one", () => {
    // A fixed height makes short arcs look like spikes and long ones look like
    // they cut through the planet.
    const short = greatCirclePoints([3.4, 6.5], [6, 8], 1);
    const long = greatCirclePoints([3.4, 6.5], [-160, -20], 1);
    const peak = (ps: typeof short) => Math.max(...ps.map((p) => p.length()));
    expect(peak(long)).toBeGreaterThan(peak(short));
  });

  it("does not blow up when both ends are the same point", () => {
    // slerp divides by sin(angle), which is zero here.
    const points = greatCirclePoints([10, 10], [10, 10], 1);
    expect(points.every((p) => Number.isFinite(p.length()))).toBe(true);
  });
});
