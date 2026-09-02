import { geoGraticule10 } from "d3-geo";
import type { StylePainter } from "../types";
import { paintBackdrop, paintRegions } from "./shared";
import { contrastWith } from "../color";

/**
 * Outlines over a graticule: the technical-drawing look.
 *
 * The graticule is drawn first and faintly, so it reads as the grid behind the
 * world rather than competing with the coastlines.
 */
export const wireframe: StylePainter<void> = {
  name: "wireframe",
  paint(frame) {
    const { ctx, palette, path, land } = frame;

    paintBackdrop(frame);

    ctx.beginPath();
    path(geoGraticule10());
    ctx.strokeStyle = palette.border;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 0.5;
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Regions are filled before the coastline so the outline sits on top and
    // stays crisp against a filled country.
    paintRegions(frame, 0);

    // Same problem as the dots: a hairline at the land colour is invisible
    // against the ocean, so it is pushed away from it unless named.
    ctx.beginPath();
    path(land);
    ctx.strokeStyle = palette.outline ?? contrastWith(palette.land, palette.ocean, 0.42);
    ctx.lineWidth = 1;
    ctx.stroke();
  },
};
