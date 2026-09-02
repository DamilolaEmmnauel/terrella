import { Scene, PerspectiveCamera, Color, Timer, Group } from "three";
import { WebGPURenderer } from "three/webgpu";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

import { resolveConfig, prefersReducedMotion } from "../config";
import { readWorld, regionColors as buildRegionColors, regionCentre, isoKey } from "../geo";
import { resolveStyle, type PreparedStyle } from "../styles";
import { createMapTexture, type MapTexture } from "./texture";
import { createGlobeScene, type GlobeScene } from "./scene";
import { createMarkers, type MarkerField } from "./markers";
import { createArcs, type ArcField } from "./arcs";
import type {
  GlobeInstance,
  GlobeOptions,
  Marker,
  Palette,
  StyleName,
  StylePainter,
} from "../types";

export * from "../types";
export { lngLatToVector3, greatCirclePoints } from "./coords";
export { createMapTexture } from "./texture";

/**
 * The WebGL/WebGPU renderer.
 *
 * A separate entry point (`terrella/three`) so three.js stays optional: the 2D
 * renderer is 7KB and most pages want that, while this one brings a few
 * hundred KB for lighting, depth and a camera you can orbit.
 *
 * The API is deliberately the same as the 2D one. Swapping the import should
 * be the whole change, which is only possible because both renderers drive the
 * same style painters: the 2D one paints to the visible canvas, and this one
 * paints the identical thing into an equirectangular texture and wraps it
 * around a sphere.
 *
 *     import { createGlobe } from "terrella/three";
 *
 *     const globe = await createGlobe(element, { world, regions, markers });
 *
 * It is async because `WebGPURenderer` needs `await renderer.init()` before it
 * can be used for anything beyond plain rendering. Awaiting it unconditionally
 * keeps that from becoming a device-specific bug later.
 */

export interface ThreeGlobeOptions extends GlobeOptions {
  /** Colour behind the globe. Transparent when omitted. */
  background?: string;
  /** Rim colour. Set `atmosphere: 0` to remove it. */
  atmosphereColor?: string;
  /** 0 to 1. Above about 1.5 the map goes milky. */
  atmosphere?: number;
  /** Shade the globe with a light, rather than showing the map flat. */
  lit?: boolean;
  /** Let the viewer zoom with the wheel. */
  zoom?: boolean;
  /** Texture width in pixels; height is half. Higher is crisper and heavier. */
  textureSize?: number;
  /** Force the WebGL2 backend, to reproduce a fallback-only problem. */
  forceWebGL?: boolean;
}

/** The 2D instance plus the three.js objects, for anyone who needs them. */
export interface ThreeGlobeInstance extends GlobeInstance {
  scene: Scene;
  camera: PerspectiveCamera;
  renderer: WebGPURenderer;
  controls: OrbitControls;
  /** True when it fell back to WebGL2 because WebGPU was unavailable. */
  readonly usingWebGL: boolean;
}

const RADIUS = 1;

export async function createGlobe(
  element: HTMLElement,
  options: ThreeGlobeOptions,
): Promise<ThreeGlobeInstance> {
  if (!element) throw new Error("terrella/three: no element given");
  if (!options?.world) throw new Error("terrella/three: `world` topojson is required");

  const config = resolveConfig(options);
  const still = config.respectReducedMotion && prefersReducedMotion();

  const { countries, land } = readWorld(config.world);
  const allRegions = config.regions ?? [];
  const allMarkers = config.markers ?? [];
  const arcs = config.arcs ?? [];

  let palette: Palette = config.palette;
  let colors = buildRegionColors(allRegions, palette);
  let markers: Marker[] = allMarkers;

  // --- renderer -------------------------------------------------------------

  const renderer = new WebGPURenderer({
    antialias: true,
    alpha: options.background === undefined,
    forceWebGL: options.forceWebGL ?? false,
  });
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
  element.appendChild(renderer.domElement);

  // Required before compute or PMREM work. Unconditional so a device that
  // happens to take a different path does not fail in a way we never see.
  await renderer.init();

  const scene = new Scene();
  if (options.background) scene.background = new Color(options.background);

  const camera = new PerspectiveCamera(30, 1, 0.1, 100);
  camera.position.set(0, 0.8, 4.2);

  // --- content --------------------------------------------------------------

  let style: PreparedStyle = resolveStyle(
    config.style as StyleName | StylePainter<never>,
    { land, countries, options: config },
  );

  let map: MapTexture = createMapTexture({
    style,
    countries,
    land,
    regionColors: colors,
    palette,
    size: options.textureSize,
  });

  const globeScene: GlobeScene = createGlobeScene({
    scene,
    mapCanvas: map.canvas,
    radius: RADIUS,
    atmosphereColor: options.atmosphereColor ?? "#4db2ff",
    atmosphereStrength: options.atmosphere ?? 1,
    lit: options.lit ?? false,
  });

  const group: Group = globeScene.group;
  group.rotation.x = (config.tilt * Math.PI) / 180;

  let markerField: MarkerField = createMarkers(group, markers, RADIUS, palette);
  let arcField: ArcField = createArcs(group, arcs, RADIUS, palette);

  // --- controls -------------------------------------------------------------

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.enableZoom = options.zoom ?? false;
  controls.minDistance = 1.6;
  controls.maxDistance = 8;
  controls.enabled = config.draggable && !still;
  // Rotating the camera rather than the globe means the light stays put while
  // the world turns under it, which is what a planet does.
  controls.autoRotate = false;

  // --- loop -----------------------------------------------------------------

  const timer = new Timer();
  timer.connect(document);

  let ambientSpin = still ? 0 : config.spin;
  let longitude = config.longitude;
  let running = true;

  function layout(): void {
    const width = element.clientWidth || 1;
    const height = Math.round(width * config.ratio);
    renderer.setSize(width, height);
    camera.aspect = width / Math.max(1, height);
    camera.updateProjectionMatrix();
  }

  function frame(): void {
    if (!running) return;

    timer.update();
    const dt = timer.getDelta();

    // The globe drifts whether or not the controls are on: OrbitControls moves
    // the camera, and this turns the world, so the two compose rather than
    // fight.
    if (ambientSpin !== 0) longitude += ambientSpin * dt;
    group.rotation.y = (longitude * Math.PI) / 180;

    controls.update();
    renderer.render(scene, camera);
  }

  layout();
  const onResize = () => layout();
  globalThis.addEventListener?.("resize", onResize);

  if (still) {
    // One frame, no loop.
    timer.update();
    renderer.render(scene, camera);
  } else {
    renderer.setAnimationLoop(frame);
  }

  function rebuildTexture(): void {
    map.update({ style, regionColors: colors, palette });
    globeScene.refreshTexture();
  }

  function rebuildMarkers(): void {
    markerField.dispose();
    markerField = createMarkers(group, markers, RADIUS, palette);
  }

  // --- public surface -------------------------------------------------------

  return {
    scene,
    camera,
    renderer,
    controls,

    get usingWebGL() {
      // The backend reports itself, which beats guessing from feature
      // detection that may not match what the renderer actually chose.
      //
      // `isWebGLBackend` is genuinely there at runtime, and three's own source
      // branches on it (Renderer.js, Background.js). It is simply missing from
      // @types/three, so the shape is declared here rather than widened away.
      const backend = renderer.backend as { isWebGLBackend?: boolean } | undefined;
      return backend?.isWebGLBackend === true;
    },

    get canvas() {
      return renderer.domElement as HTMLCanvasElement;
    },

    get longitude() {
      return longitude;
    },

    focus(regionId) {
      if (regionId === null) {
        colors = buildRegionColors(allRegions, palette);
        markers = allMarkers;
        ambientSpin = still ? 0 : config.spin;
        rebuildTexture();
        rebuildMarkers();
        return;
      }

      const region = allRegions.find((r) => r.id === regionId);
      if (!region) throw new Error(`terrella/three: no region with id "${regionId}"`);

      colors = buildRegionColors([region], palette);

      const named = region.markers;
      const inRegion = new Set((region.countries ?? []).map(isoKey));
      const picked = named
        ? allMarkers.filter((m) => named.includes(m.name))
        : allMarkers.filter((m) => m.country !== undefined && inRegion.has(isoKey(m.country)));
      markers = picked.length > 0 ? picked : allMarkers;

      const centre = regionCentre(region, countries);
      if (centre) {
        // The sphere turns to bring the region to the front, and the camera
        // stays put. Turning the camera instead would drag the lighting round
        // with it and the terminator would follow the viewer.
        longitude = -centre.longitude - 90;
        group.rotation.x = ((region.tilt ?? -centre.latitude) * Math.PI) / 180;
      }

      ambientSpin = 0;
      rebuildTexture();
      rebuildMarkers();
    },

    setStyle(next) {
      style = resolveStyle(next as StyleName | StylePainter<never>, {
        land,
        countries,
        options: config,
      });
      rebuildTexture();
    },

    setProjection() {
      // A sphere is the projection. Rather than silently do nothing, say so:
      // the 2D renderer is the one that can show a flat map.
      throw new Error(
        "terrella/three: the 3D renderer always draws a sphere. Use the 2D renderer for flat projections.",
      );
    },

    setPalette(next) {
      palette = { ...palette, ...next };
      colors = buildRegionColors(allRegions, palette);
      rebuildTexture();
      rebuildMarkers();
    },

    setSpin(degreesPerSecond) {
      ambientSpin = degreesPerSecond;
    },

    setMarkers(next) {
      markers = next;
      rebuildMarkers();
    },

    destroy() {
      running = false;
      renderer.setAnimationLoop(null);
      globalThis.removeEventListener?.("resize", onResize);
      timer.disconnect();
      controls.dispose();
      markerField.dispose();
      arcField.dispose();
      globeScene.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}

export default createGlobe;
