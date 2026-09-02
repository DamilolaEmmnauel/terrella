import { geoDistance, geoInterpolate, type GeoProjection } from "d3-geo";
import type { Arc, Frame, LngLat, Marker } from "./types";

/**
 * What is drawn on top of every style: markers and arcs.
 *
 * Kept out of the styles because a marker means the same thing whichever way
 * the land is drawn, and a caller writing a custom style should not have to
 * reimplement them to get them.
 */

/** How far from the facing point a feature stays visible, in radians. */
const HORIZON = Math.PI / 2;

/**
 * True when a point is on the visible half of the sphere.
 *
 * Orthographic projects far-side coordinates too rather than returning null,
 * so without this markers appear mirrored on the wrong side of the globe.
 */
function onNearSide(at: LngLat, projection: GeoProjection, flat: boolean): boolean {
  if (flat) return true;
  const [lambda = 0, phi = 0] = projection.rotate();
  return geoDistance(at, [-lambda, -phi]) < HORIZON;
}

/**
 * Draws the markers and returns their screen positions.
 *
 * The positions come back so hit-testing uses exactly what was drawn, rather
 * than a second projection that could disagree with it.
 */
export function paintMarkers(
  frame: Frame,
  markers: Marker[],
  pulseMs: number,
): Array<[number, number] | null> {
  const { ctx, projection, palette, flat, time } = frame;
  const positions: Array<[number, number] | null> = [];
  const pulse = pulseMs > 0 ? (time % pulseMs) / pulseMs : 0;

  for (const marker of markers) {
    if (!onNearSide(marker.coords, projection, flat)) {
      positions.push(null);
      continue;
    }

    const xy = projection(marker.coords);
    if (!xy) {
      positions.push(null);
      continue;
    }
    positions.push([xy[0], xy[1]]);

    const color = marker.color ?? palette.marker;

    if (pulseMs > 0) {
      // Expanding ring that fades as it grows, so attention is drawn without
      // the marker itself moving.
      ctx.beginPath();
      ctx.arc(xy[0], xy[1], 6 + pulse * 10, 0, Math.PI * 2);
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.5 * (1 - pulse);
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    ctx.beginPath();
    ctx.arc(xy[0], xy[1], marker.size ?? 4.5, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = palette.markerRing;
    ctx.stroke();
  }

  return positions;
}

/**
 * Draws great-circle arcs between pairs of points.
 *
 * Interpolated along the great circle rather than drawn as a straight line,
 * because a straight screen line between two projected points cuts through the
 * sphere instead of following its surface.
 */
export function paintArcs(frame: Frame, arcs: Arc[]): void {
  const { ctx, projection, palette, flat } = frame;
  const STEPS = 48;

  for (const arc of arcs) {
    const along = geoInterpolate(arc.from, arc.to);

    ctx.beginPath();
    ctx.strokeStyle = arc.color ?? palette.arc;
    ctx.lineWidth = arc.width ?? 1.4;

    let drawing = false;
    for (let i = 0; i <= STEPS; i++) {
      const at = along(i / STEPS) as LngLat;

      // Lifting the pen at the horizon keeps an arc that passes behind the
      // globe from being drawn straight across the front of it.
      if (!onNearSide(at, projection, flat)) {
        drawing = false;
        continue;
      }

      const xy = projection(at);
      if (!xy) {
        drawing = false;
        continue;
      }

      if (drawing) ctx.lineTo(xy[0], xy[1]);
      else {
        ctx.moveTo(xy[0], xy[1]);
        drawing = true;
      }
    }

    ctx.stroke();
  }
}
