import type { Frame, PrepareContext, StylePainter } from "../types";
import { paintBackdrop } from "./shared";
import { contrastWith } from "../color";
import { FADE_BAND, sampleLand, visibility, type Sample } from "./sampled";

/**
 * Land as a field of dots: the halftone look popularised by cobe.
 */

export interface DotState {
  dots: Sample[];
  size: number;
}

export const dots: StylePainter<DotState> = {
  name: "dots",

  prepare(context: PrepareContext): DotState {
    return {
      dots: sampleLand(context, context.options.dotSpacing ?? 2.2),
      size: context.options.dotSize ?? 1.1,
    };
  },

  paint(frame: Frame, state: DotState) {
    const { ctx, projection, palette, regionColors } = frame;
    const { dots, size } = state;

    paintBackdrop(frame);

    // Dots need more contrast than fills at the same colour, so the land
    // colour is pushed away from the ocean unless the palette names one.
    const landDot = palette.dot ?? contrastWith(palette.land, palette.ocean);

    for (const dot of dots) {
      // Evenly spread points crowd together as they approach the limb, which
      // draws a hard ring of dots around the edge that reads as fur rather
      // than as a sphere. Fading the outer band both removes the ring and
      // gives the depth cue the flat dots otherwise lack.
      const nearness = visibility(frame, dot.at);
      if (nearness === null) continue;

      const xy = projection(dot.at);
      if (!xy) continue;

      const color = dot.country ? regionColors.get(dot.country) : undefined;

      ctx.globalAlpha = Math.min(1, nearness * FADE_BAND);
      ctx.beginPath();
      // Region dots are drawn larger as well as coloured, so they still read
      // when the palette's region colour is close to its land colour.
      ctx.arc(xy[0], xy[1], color ? size * 1.7 : size, 0, Math.PI * 2);
      ctx.fillStyle = color ?? landDot;
      ctx.fill();
    }

    ctx.globalAlpha = 1;
  },
};
