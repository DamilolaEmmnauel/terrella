import type { Frame } from "../types";

/**
 * Painting every style needs.
 *
 * The backdrop and the graticule are here rather than duplicated into each
 * style, so a change to how the sphere reads as curved happens once.
 */

/**
 * Fills the ocean and shades the limb.
 *
 * The radial shading is what makes a flat disc read as a sphere. Without it
 * the globe looks like a circular sticker, which is the single most common
 * giveaway of a hand-rolled orthographic globe.
 */
export function paintBackdrop(frame: Frame): void {
  const { ctx, palette, centreX, centreY, radius, flat } = frame;

  if (flat) {
    // The projected sphere, not the whole canvas: a flat projection rarely
    // fills its box, and painting the box makes the empty margin above and
    // below the map look like ocean that is part of the world.
    ctx.beginPath();
    frame.path({ type: "Sphere" } as never);
    ctx.fillStyle = palette.ocean;
    ctx.fill();
    return;
  }

  ctx.beginPath();
  ctx.arc(centreX, centreY, radius, 0, Math.PI * 2);
  ctx.fillStyle = palette.ocean;
  ctx.fill();

  const rim = ctx.createRadialGradient(
    centreX,
    centreY,
    radius * 0.82,
    centreX,
    centreY,
    radius,
  );
  rim.addColorStop(0, "rgba(0,0,0,0)");
  rim.addColorStop(1, palette.rim);
  ctx.beginPath();
  ctx.arc(centreX, centreY, radius, 0, Math.PI * 2);
  ctx.fillStyle = rim;
  ctx.fill();
}

/** Draws the countries that belong to a region, in their region's colour. */
export function paintRegions(frame: Frame, strokeWidth = 0.5): void {
  const { ctx, countries, regionColors, palette, path } = frame;
  if (regionColors.size === 0) return;

  for (const country of countries) {
    const color = regionColors.get(country.id);
    if (!color) continue;

    ctx.beginPath();
    path(country.feature);
    ctx.fillStyle = color;
    ctx.fill();
    if (strokeWidth > 0) {
      ctx.strokeStyle = palette.border;
      ctx.lineWidth = strokeWidth;
      ctx.stroke();
    }
  }
}
