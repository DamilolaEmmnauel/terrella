import type { Frame, PrepareContext, StylePainter } from "../types";
import { paintBackdrop } from "./shared";
import { contrastWith } from "../color";
import { FADE_BAND, sampleLand, visibility, type Sample } from "./sampled";

/**
 * Land as blocks on a coarse grid: the eight-bit look.
 *
 * The grid is the same one the dots use, coarser, and each point is drawn as
 * a square sized to fill its cell so the blocks touch. They are axis-aligned
 * on screen rather than following the graticule, which is what makes them
 * read as pixels rather than as tiles on a sphere.
 */

interface PixelState {
  pixels: Sample[];
  /** Grid spacing in degrees, for sizing the blocks. */
  spacing: number;
}

const DEG = Math.PI / 180;

export const pixel: StylePainter<PixelState> = {
  name: "pixel",

  prepare(context: PrepareContext): PixelState {
    const spacing = (context.options.dotSpacing ?? 2.2) * 1.8;
    return { pixels: sampleLand(context, spacing), spacing };
  },

  paint(frame: Frame, state: PixelState) {
    const { ctx, projection, palette, regionColors, radius, flat, width } = frame;

    paintBackdrop(frame);

    const landColor = palette.dot ?? contrastWith(palette.land, palette.ocean, 0.2);
    // A cell's width at the centre of the disc; on a flat map the world spans
    // the canvas width, so a degree is a known fraction of it.
    const cell = flat ? (width / 360) * state.spacing : radius * state.spacing * DEG;
    const side = Math.max(2, cell * 0.92);

    for (const point of state.pixels) {
      const nearness = visibility(frame, point.at);
      if (nearness === null) continue;
      const xy = projection(point.at);
      if (!xy) continue;

      const color = point.country ? regionColors.get(point.country) : undefined;
      // Blocks shrink toward the limb instead of fading: the foreshortening
      // of a sphere, expressed in the only vocabulary the style has.
      const size = flat ? side : side * Math.max(0.35, Math.min(1, nearness * FADE_BAND));
      ctx.fillStyle = color ?? landColor;
      ctx.fillRect(Math.round(xy[0] - size / 2), Math.round(xy[1] - size / 2), Math.round(size), Math.round(size));
    }
  },
};
