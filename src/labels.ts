import { geoCentroid, geoDistance, type GeoProjection } from "d3-geo";
import type { CountryFeature, Frame, LabelOptions, LngLat, Marker, Region } from "./types";
import { isoKey, countryName } from "./countries";
import { contrastWith } from "./color";

/**
 * Text on the globe.
 *
 * Labels are the thing most globe libraries leave to the caller, and the
 * thing most callers get wrong: names float over the back of the world, sit
 * at the wrong place, or vanish against the land. These are placed at each
 * country's centroid, hidden past the horizon, faded toward the limb, and
 * drawn with a halo so they read on any palette.
 */

/** Resolved once: the countries to label and where to put the text. */
export interface LabelState {
  markers: boolean;
  countries: Array<{ id: string; name: string; at: LngLat }>;
  font?: string;
  color?: string;
}

const HORIZON = Math.PI / 2;

export function resolveLabels(
  option: boolean | LabelOptions | undefined,
  countries: CountryFeature[],
  regions: Region[],
): LabelState | null {
  if (!option) return null;
  const options: LabelOptions = option === true ? { markers: true, countries: "regions" } : option;

  let wanted: Set<string>;
  if (options.countries === "all") {
    wanted = new Set(countries.map((c) => c.id));
  } else if (options.countries === "regions") {
    wanted = new Set(regions.flatMap((r) => (r.countries ?? []).map(isoKey)));
  } else {
    wanted = new Set((options.countries ?? []).map(isoKey));
  }

  return {
    markers: options.markers ?? false,
    countries: countries
      .filter((c) => wanted.has(c.id))
      .map((c) => ({
        id: c.id,
        name: countryName(c.id),
        at: geoCentroid(c.feature as never) as LngLat,
      })),
    font: options.font,
    color: options.color,
  };
}

/** Visibility of a point: 0 beyond the horizon, rising to 1 facing the viewer. */
function nearness(at: LngLat, projection: GeoProjection, flat: boolean): number {
  if (flat) return 1;
  const [lambda = 0, phi = 0] = projection.rotate();
  const angle = geoDistance(at, [-lambda, -phi]);
  if (angle >= HORIZON) return 0;
  // Fade over the outer third so a name never sits foreshortened on the limb.
  return Math.min(1, (1 - angle / HORIZON) * 3);
}

function haloText(frame: Frame, text: string, x: number, y: number, color: string): void {
  const { ctx, palette } = frame;
  ctx.lineJoin = "round";
  ctx.lineWidth = 3;
  ctx.strokeStyle = palette.ocean;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

/** Draws country names, and marker names beside their dots. */
export function paintLabels(
  frame: Frame,
  state: LabelState,
  markers: Marker[],
  markerPositions: Array<[number, number] | null>,
): void {
  const { ctx, projection, palette, flat, radius } = frame;
  const size = Math.max(10, Math.min(14, radius / 28));
  ctx.font = state.font ?? `500 ${size}px system-ui, sans-serif`;
  ctx.textBaseline = "middle";

  const color = state.color ?? palette.label ?? contrastWith(palette.land, palette.ocean, 0.75);

  ctx.textAlign = "center";
  for (const label of state.countries) {
    const visible = nearness(label.at, projection, flat);
    if (visible <= 0) continue;
    const xy = projection(label.at);
    if (!xy) continue;
    ctx.globalAlpha = visible;
    haloText(frame, label.name, xy[0], xy[1], color);
  }

  if (state.markers) {
    ctx.textAlign = "left";
    markers.forEach((marker, i) => {
      const at = markerPositions[i];
      if (!at) return;
      ctx.globalAlpha = nearness(marker.coords, projection, flat);
      haloText(frame, marker.name, at[0] + (marker.size ?? 4.5) + 5, at[1], marker.color ?? palette.marker);
    });
  }

  ctx.globalAlpha = 1;
}
