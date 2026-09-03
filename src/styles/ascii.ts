import type { Frame, PrepareContext, StylePainter } from "../types";
import { paintBackdrop } from "./shared";
import { contrastWith } from "../color";
import { sampleLand, visibility, type Sample } from "./sampled";

/**
 * Land as characters: the terminal look.
 *
 * A glyph per grid point, chosen by how squarely it faces the viewer, so the
 * limb dissolves into dots and the centre is solid. Region countries take a
 * different glyph as well as a colour, which keeps them legible on a
 * monochrome palette.
 */

interface AsciiState {
  cells: Sample[];
  spacing: number;
}

/** From the limb inward. */
const RAMP = [".", ":", "+", "#"];
const REGION_GLYPH = "@";
const DEG = Math.PI / 180;

export const ascii: StylePainter<AsciiState> = {
  name: "ascii",

  prepare(context: PrepareContext): AsciiState {
    const spacing = (context.options.dotSpacing ?? 2.2) * 1.6;
    return { cells: sampleLand(context, spacing), spacing };
  },

  paint(frame: Frame, state: AsciiState) {
    const { ctx, projection, palette, regionColors, radius, flat, width } = frame;

    paintBackdrop(frame);

    const cell = flat ? (width / 360) * state.spacing : radius * state.spacing * DEG;
    const ink = palette.dot ?? contrastWith(palette.land, palette.ocean, 0.45);

    ctx.font = `${Math.max(6, cell * 1.15)}px ui-monospace, Menlo, Consolas, monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for (const point of state.cells) {
      const nearness = visibility(frame, point.at);
      if (nearness === null) continue;
      const xy = projection(point.at);
      if (!xy) continue;

      const color = point.country ? regionColors.get(point.country) : undefined;
      const glyph = color
        ? REGION_GLYPH
        : RAMP[Math.min(RAMP.length - 1, Math.floor(nearness * RAMP.length))] ?? ".";

      ctx.fillStyle = color ?? ink;
      ctx.fillText(glyph, xy[0], xy[1]);
    }
  },
};
