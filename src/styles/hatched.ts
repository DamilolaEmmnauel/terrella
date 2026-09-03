import type { StylePainter } from "../types";
import { paintBackdrop, paintRegions } from "./shared";
import { contrastWith } from "../color";

/**
 * Land as diagonal hatching: the engraved-map look.
 *
 * The land shape becomes a clip, and lines are ruled across it. Regions are
 * filled solid on top so they read as the thing the hatching is not.
 */

/** Distance between rules, in CSS pixels. */
const GAP = 5;

export const hatched: StylePainter<void> = {
  name: "hatched",
  paint(frame) {
    const { ctx, palette, path, land, width, height } = frame;

    paintBackdrop(frame);

    const ink = palette.outline ?? contrastWith(palette.land, palette.ocean, 0.45);

    ctx.save();
    ctx.beginPath();
    path(land);
    ctx.clip();

    // Rules at 45 degrees, spanning the whole canvas so the clip decides
    // where they show. Drawn as one path: hundreds of separate strokes cost
    // far more than one.
    ctx.beginPath();
    const reach = width + height;
    for (let offset = -height; offset < reach; offset += GAP) {
      ctx.moveTo(offset, 0);
      ctx.lineTo(offset - height, height);
    }
    ctx.strokeStyle = ink;
    ctx.lineWidth = 0.7;
    ctx.stroke();
    ctx.restore();

    paintRegions(frame, 0.6);

    ctx.beginPath();
    path(land);
    ctx.strokeStyle = ink;
    ctx.lineWidth = 0.8;
    ctx.stroke();
  },
};
