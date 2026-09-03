import type { Topology } from "topojson-specification";
import atlas from "../../data/countries-110m.json";
import { setDefaultWorld } from "../config";

/**
 * The bundled atlas: world-atlas countries-110m, 39 KB gzipped.
 *
 *     import { world } from "terrella/world";
 *     createGlobe(el, { world });
 *
 * or, once for the whole app,
 *
 *     import "terrella/world/register";
 *
 * Kept as its own entry so the core stays small for anyone who ships their
 * own atlas.
 */
export const world: Topology = atlas as unknown as Topology;

/** Makes the bundled atlas the default for every globe created afterwards. */
export function registerWorld(): Topology {
  setDefaultWorld(world);
  return world;
}

export default world;
