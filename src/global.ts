/**
 * The browser build: one script tag, no install, no atlas to load.
 *
 *     <script src="https://unpkg.com/terrella/dist/terrella.global.js"></script>
 *     <script>terrella.createGlobe(document.querySelector("#globe"), { regions });</script>
 *
 * The atlas is bundled and registered as the default, which is what "no
 * build step" has to mean for a page that cannot import anything.
 */
export * from "./index";
export { world } from "./world/index";
export { renderSVG } from "./svg/index";
export { TerrellaGlobeElement, defineGlobeElement } from "./element/index";
import { registerWorld } from "./world/index";
import { defineGlobeElement } from "./element/index";

registerWorld();
// <terrella-globe> works the moment the script has loaded.
defineGlobeElement();
