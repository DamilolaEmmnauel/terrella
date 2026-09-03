import { geoCircle } from "d3-geo";
import type { Frame, LngLat, TerminatorOptions } from "./types";

/**
 * Where the sun is, and the night it leaves behind.
 *
 * The subsolar point follows a standard low-precision solar position
 * (Astronomical Almanac, good to about a degree, which is a hundred
 * kilometres at the equator and invisible at any size a globe is drawn). The
 * night side is the hemisphere centred on the antisolar point, which d3 can
 * draw as one polygon in any projection.
 */

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

/** Days since J2000.0 (2000-01-01 12:00 UTC). */
const daysSinceJ2000 = (date: Date): number => (date.getTime() - Date.UTC(2000, 0, 1, 12)) / 86_400_000;

const wrap = (degrees: number): number => ((((degrees + 180) % 360) + 360) % 360) - 180;

/** The point on Earth directly under the sun, as [longitude, latitude]. */
export function subsolarPoint(date: Date): LngLat {
  const d = daysSinceJ2000(date);
  const meanLongitude = (280.46 + 0.9856474 * d) % 360;
  const meanAnomaly = (357.528 + 0.9856003 * d) * DEG;
  const eclipticLongitude =
    (meanLongitude + 1.915 * Math.sin(meanAnomaly) + 0.02 * Math.sin(2 * meanAnomaly)) * DEG;
  const obliquity = (23.439 - 0.0000004 * d) * DEG;

  const declination = Math.asin(Math.sin(obliquity) * Math.sin(eclipticLongitude));
  const rightAscension = Math.atan2(
    Math.cos(obliquity) * Math.sin(eclipticLongitude),
    Math.cos(eclipticLongitude),
  );
  // Sidereal time at Greenwich: which longitude currently faces the sun's
  // right ascension.
  const siderealTime = (280.46061837 + 360.98564736629 * d) % 360;

  return [wrap(rightAscension * RAD - siderealTime), declination * RAD];
}

/** The night hemisphere as a GeoJSON polygon. */
export function nightPolygon(date: Date): ReturnType<ReturnType<typeof geoCircle>> {
  const [lng, lat] = subsolarPoint(date);
  return geoCircle().center([lng + 180, -lat]).radius(90)();
}

/** The option as given, normalised to options or nothing. */
export function resolveTerminator(
  option: boolean | TerminatorOptions | undefined,
): TerminatorOptions | null {
  if (option === true) return {};
  if (!option) return null;
  return option;
}

/** Cached per minute: the terminator moves a quarter of a degree in that time. */
let cachedMinute = NaN;
let cachedPolygon: ReturnType<typeof nightPolygon> | null = null;

export function resolveDate(option: TerminatorOptions["date"]): Date {
  return typeof option === "function" ? option() : (option ?? new Date());
}

/** Shades the night side of the frame's world. */
export function paintTerminator(frame: Frame, options: TerminatorOptions): void {
  const date = resolveDate(options.date);
  const minute = Math.floor(date.getTime() / 60_000);
  if (minute !== cachedMinute || !cachedPolygon) {
    cachedMinute = minute;
    cachedPolygon = nightPolygon(date);
  }

  const { ctx, path } = frame;
  ctx.beginPath();
  path(cachedPolygon);
  ctx.fillStyle = options.color ?? "#000000";
  ctx.globalAlpha = options.opacity ?? 0.28;
  ctx.fill();
  ctx.globalAlpha = 1;
}
