import type { Frame, LngLat, PrepareContext, StylePainter } from "../types";
import { paintBackdrop } from "./shared";
import { contrastWith } from "../color";
import { assignCountries, FADE_BAND, seededRandom, visibility, type Sample } from "./sampled";
import { isoKey, sampleLandGrid } from "../geo";

/**
 * Land as an engraver's stipple: dots of varying size, off the grid.
 *
 * The regular dots read as a screen; jittering each point and varying its
 * weight reads as a hand. The jitter is seeded, so two globes on one page
 * draw the same picture and a redraw never shimmers.
 */

interface Stipple extends Sample {
  weight: number;
}

interface StippleState {
  points: Stipple[];
  size: number;
}

export const stipple: StylePainter<StippleState> = {
  name: "stipple",

  prepare(context: PrepareContext): StippleState {
    const { land, countries, options } = context;
    const spacing = (options.dotSpacing ?? 2.2) * 0.85;
    const random = seededRandom(7);

    const jittered: LngLat[] = sampleLandGrid(land, spacing).map(([lng, lat]) => [
      lng + (random() - 0.5) * spacing * 0.9,
      lat + (random() - 0.5) * spacing * 0.9,
    ]);

    const wanted = new Set<string>();
    for (const region of options.regions ?? []) {
      for (const country of region.countries ?? []) wanted.add(isoKey(country));
    }

    const points = assignCountries(jittered, countries, wanted).map((sample) => ({
      ...sample,
      weight: 0.5 + random() * 1.1,
    }));

    return { points, size: options.dotSize ?? 1.1 };
  },

  paint(frame: Frame, state: StippleState) {
    const { ctx, projection, palette, regionColors } = frame;

    paintBackdrop(frame);

    const ink = palette.dot ?? contrastWith(palette.land, palette.ocean, 0.5);

    for (const point of state.points) {
      const nearness = visibility(frame, point.at);
      if (nearness === null) continue;
      const xy = projection(point.at);
      if (!xy) continue;

      const color = point.country ? regionColors.get(point.country) : undefined;
      ctx.globalAlpha = Math.min(1, nearness * FADE_BAND);
      ctx.beginPath();
      ctx.arc(xy[0], xy[1], state.size * point.weight * (color ? 1.5 : 1), 0, Math.PI * 2);
      ctx.fillStyle = color ?? ink;
      ctx.fill();
    }

    ctx.globalAlpha = 1;
  },
};
