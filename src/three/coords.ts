import { Vector3 } from "three";
import type { LngLat } from "../types";

/**
 * Putting a coordinate on the sphere.
 *
 * The conversion has to agree with how `SphereGeometry` lays out its UVs, or
 * markers drift away from the countries they belong to. Its vertices are
 *
 *     x = -r * cos(phiStart + u * phiLength) * sin(theta)
 *     y =  r * cos(theta)
 *     z =  r * sin(phiStart + u * phiLength) * sin(theta)
 *
 * so the u seam sits at longitude -180 and u = 0.5 is the prime meridian.
 * Working the same mapping backwards gives what is below: at (0, 0) both this
 * and the geometry land on (r, 0, 0), which is the check that they agree.
 *
 * This is the kind of thing that looks right in code and is wrong on screen,
 * so there is a test asserting a handful of known cities, and the demo puts a
 * marker on Lagos precisely so a drift shows up immediately.
 */

const DEG2RAD = Math.PI / 180;

/** Where a longitude and latitude sits on a sphere of the given radius. */
export function lngLatToVector3(at: LngLat, radius: number, target = new Vector3()): Vector3 {
  const [lng, lat] = at;
  const phi = (90 - lat) * DEG2RAD;
  const theta = (lng + 180) * DEG2RAD;
  const sinPhi = Math.sin(phi);

  return target.set(
    -radius * sinPhi * Math.cos(theta),
    radius * Math.cos(phi),
    radius * sinPhi * Math.sin(theta),
  );
}

/** The outward surface normal at a coordinate. Used to stand markers upright. */
export function lngLatToNormal(at: LngLat, target = new Vector3()): Vector3 {
  return lngLatToVector3(at, 1, target);
}

/**
 * Samples a great-circle arc between two coordinates, bowed out from the
 * surface.
 *
 * The height scales with the angular distance, so a short hop stays low and a
 * transcontinental line lifts clear of the globe. A fixed height makes short
 * arcs look like spikes and long ones look like they cut through the planet.
 */
export function greatCirclePoints(
  from: LngLat,
  to: LngLat,
  radius: number,
  segments = 64,
  lift = 0.18,
): Vector3[] {
  const start = lngLatToVector3(from, 1);
  const end = lngLatToVector3(to, 1);

  const angle = start.angleTo(end);
  const peak = radius * (1 + lift * (angle / Math.PI));

  const points: Vector3[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;

    // Spherical interpolation keeps the line on the great circle; lerping the
    // cartesian points would cut a chord straight through the sphere.
    const direction = slerp(start, end, t, angle);

    // A sine bow: zero lift at both ends, most in the middle.
    const height = radius + (peak - radius) * Math.sin(t * Math.PI);
    points.push(direction.multiplyScalar(height));
  }

  return points;
}

/** Spherical linear interpolation between two unit vectors. */
function slerp(a: Vector3, b: Vector3, t: number, angle: number): Vector3 {
  // Nearly coincident points make sin(angle) vanish, so fall back to a plain
  // lerp where the two are indistinguishable anyway.
  if (angle < 1e-6) return a.clone().lerp(b, t).normalize();

  const sin = Math.sin(angle);
  const wa = Math.sin((1 - t) * angle) / sin;
  const wb = Math.sin(t * angle) / sin;

  return new Vector3(
    a.x * wa + b.x * wb,
    a.y * wa + b.y * wb,
    a.z * wa + b.z * wb,
  );
}
