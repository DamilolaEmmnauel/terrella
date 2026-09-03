/**
 * Side-effect entry: importing it makes the bundled atlas the default.
 *
 *     import "terrella/world/register";
 *     createGlobe(el, { regions });
 */
import { registerWorld } from "./index";

registerWorld();
