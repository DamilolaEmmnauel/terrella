import type { StylePainter } from "../types";
import { paintBackdrop, paintRegions } from "./shared";

/**
 * Flat country fills with hairline seams. The default, and the look most
 * "countries we operate in" globes want.
 */
export const solid: StylePainter<void> = {
  name: "solid",
  paint(frame) {
    const { ctx, palette, path, land } = frame;

    paintBackdrop(frame);

    ctx.beginPath();
    path(land);
    ctx.fillStyle = palette.land;
    ctx.fill();
    ctx.strokeStyle = palette.border;
    ctx.lineWidth = 0.6;
    ctx.stroke();

    paintRegions(frame);
  },
};
