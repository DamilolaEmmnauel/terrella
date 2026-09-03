import { geoPath, type GeoPermissibleObjects, type GeoProjection } from "d3-geo";
import { resolveConfig } from "../config";
import { createProjection, isFlat, readWorld, regionColors, valueColors } from "../geo";
import { resolveStyle } from "../styles";
import { paintArcs, paintHover, paintMarkers } from "../overlay";
import { paintLabels, resolveLabels } from "../labels";
import { paintTerminator, resolveTerminator } from "../terminator";
import { presetFor } from "../theme";
import { SvgContext } from "./context";
import type { Frame, GlobeOptions, Palette, ProjectionName, StyleName, StylePainter } from "../types";

export * from "../types";
export { SvgContext, type PaintContext } from "./context";

/**
 * A globe as an SVG string, with no browser.
 *
 *     import { renderSVG } from "terrella/svg";
 *     const svg = renderSVG({ world, regions, markers, longitude: 20 });
 *
 * The same style painters draw it, so it matches the live globe exactly:
 * the server can send the first frame as markup and the client can take
 * over with a canvas, with nothing moving in between. It is also a way to
 * make an Open Graph image or a print figure from the same options.
 *
 * Unlike the live renderers, this ignores `theme: "auto"` (there is no
 * system on a server) and treats it as light.
 */
export interface SvgOptions extends GlobeOptions {
  /** Output width in CSS pixels. Height follows `ratio`. Defaults to 600. */
  width?: number;
  /** A country to paint as hovered, for parity with the live globe. */
  hovered?: string | null;
}

export function renderSVG(options: SvgOptions = {}): string {
  const config = resolveConfig(options);
  const { countries, land } = readWorld(config.world);
  const regions = config.regions ?? [];
  const markers = config.markers ?? [];

  const palette: Palette = { ...presetFor(config.theme === "auto" ? "light" : config.theme), ...options.palette };
  const colors = new Map([
    ...regionColors(regions, palette),
    ...valueColors(config.values, config.scale, palette),
  ]);

  const width = options.width ?? 600;
  const height = Math.round(width * config.ratio);
  const radius = width * config.radius;

  const custom = typeof config.projection !== "string";
  const projection: GeoProjection = custom
    ? (config.projection as GeoProjection)
    : createProjection(config.projection as ProjectionName);
  const flat = custom || isFlat(config.projection as ProjectionName);
  if (flat) {
    const margin = width * (0.5 - config.radius);
    projection.fitExtent(
      [[margin, margin], [width - margin, height - margin]],
      { type: "Sphere" } as GeoPermissibleObjects,
    );
  } else {
    projection.translate([width / 2, height / 2]).scale(radius);
  }
  if (!flat || custom) projection.rotate([-config.longitude, config.tilt]);

  const ctx = new SvgContext();
  // The context is typed as the real canvas one so styles need not know
  // which they are drawing into; SvgContext implements the used subset.
  const path = geoPath(projection, ctx as unknown as CanvasRenderingContext2D);

  const frame: Frame = {
    ctx: ctx as unknown as CanvasRenderingContext2D,
    width,
    height,
    radius,
    centreX: width / 2,
    centreY: height / 2,
    projection,
    path: (object) => path(object),
    countries,
    land,
    regionColors: colors,
    palette,
    time: 0,
    flat,
    hovered: options.hovered ?? null,
  };

  const style = resolveStyle(config.style as StyleName | StylePainter<never>, {
    land,
    countries,
    options: config,
  });
  style.paint(frame);

  const terminator = resolveTerminator(config.terminator);
  if (terminator) paintTerminator(frame, terminator);
  paintHover(frame);
  if (config.arcs?.length) paintArcs(frame, config.arcs);
  // No pulse: a still image has no time for a ring to expand in.
  const positions = paintMarkers(frame, markers, 0);
  const labels = resolveLabels(config.labels, countries, regions);
  if (labels) paintLabels(frame, labels, markers, positions);

  const label =
    config.label ??
    (regions.length > 0
      ? `Globe highlighting ${regions.map((r) => r.name ?? r.id).join(", ")}`
      : "Globe");

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${label.replace(/"/g, "&quot;")}">` +
    ctx.render() +
    `</svg>`
  );
}

export default renderSVG;
