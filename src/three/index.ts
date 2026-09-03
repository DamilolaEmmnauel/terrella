import { Scene, PerspectiveCamera, Color, Timer, Group } from "three";
import { WebGPURenderer } from "three/webgpu";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

import { resolveConfig, prefersReducedMotion } from "../config";
import { readWorld, regionColors as buildRegionColors, regionCentre, valueColors, isoKey } from "../geo";
import { resolveStyle, type PreparedStyle } from "../styles";
import { createMapTexture, type MapTexture } from "./texture";
import { createGlobeScene, type GlobeScene } from "./scene";
import { createMarkers, type MarkerField } from "./markers";
import { createArcs, type ArcField } from "./arcs";
import { createHover, type HoverHandle } from "./hover";
import { createCountryTest, type CountryTest } from "../countrymask";
import { createTween, runTour, viewFacing, type Tween, type View } from "../motion";
import { resolveLabels } from "../labels";
import { resolveTerminator } from "../terminator";
import { renderSVG } from "../svg/index";
import { createAccessibleList, makeKeyboardTurnable } from "../a11y";
import { elementVars, resolvePalette, watchSystemTheme, type ThemeName } from "../theme";
import type {
  GlobeInstance,
  GlobeOptions,
  LngLat,
  Marker,
  Palette,
  StyleName,
  StylePainter,
} from "../types";

export * from "../types";
export { setDefaultWorld, getDefaultWorld } from "../config";
export { DARK_PALETTE, type ThemeName } from "../theme";
export { isoKey, country, countryName, countriesIn, allCountries, REGION_NAMES } from "../countries";
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
  options: ThreeGlobeOptions = {},
): Promise<ThreeGlobeInstance> {
  if (!element) throw new Error("terrella/three: no element given");

  const config = resolveConfig(options ?? {});
  const still = config.respectReducedMotion && prefersReducedMotion();

  const { countries, land } = readWorld(config.world);
  const allRegions = config.regions ?? [];
  const allMarkers = config.markers ?? [];
  const arcs = config.arcs ?? [];

  let theme: ThemeName = config.theme;
  let palette: Palette = resolvePalette(theme, elementVars(element), options.palette);
  let markers: Marker[] = allMarkers;
  let values = config.values ?? null;
  let scale = config.scale;
  let paintedRegions = allRegions;

  function buildColors(): Map<string, string> {
    return new Map([
      ...buildRegionColors(paintedRegions, palette),
      ...valueColors(values, scale, palette),
    ]);
  }
  let colors = buildColors();

  const hoverCountries =
    config.hoverCountries ?? Boolean(config.onCountryHover || config.onCountryClick);
  let countryAt: CountryTest | null = null;

  let labels = resolveLabels(config.labels, countries, allRegions);
  let terminator = resolveTerminator(config.terminator);

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

  let currentStyle: StyleName | StylePainter = config.style;
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
    labels,
    markers,
    terminator,
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
  const arcField: ArcField = createArcs(group, arcs, RADIUS, palette);

  // The wrapper has to be positioned for the tooltip to sit over the canvas.
  // Setting it here rather than requiring it in the caller's CSS, because a
  // static wrapper puts every tooltip in the top-left of the page and the
  // cause is not obvious.
  if (getComputedStyle(element).position === "static") {
    element.style.position = "relative";
  }

  const hover: HoverHandle | null =
    config.tooltips || hoverCountries
      ? createHover({
          element,
          canvas: renderer.domElement as HTMLCanvasElement,
          camera,
          globe: globeScene.globe,
          locale: config.locale,
          onHover: config.onMarkerHover,
          onClick: config.onMarkerClick,
          countryAt: hoverCountries
            ? (at) => (countryAt ??= createCountryTest(countries))(at)
            : undefined,
          onCountryHover: (c) => {
            // The texture is redrawn on a change, not per frame: a redraw is
            // a few milliseconds and the pointer changes country far less
            // often than sixty times a second.
            hoveredCountry = c?.id ?? null;
            rebuildTexture();
            config.onCountryHover?.(c);
          },
          onCountryClick: config.onCountryClick,
        })
      : null;
  hover?.setTargets(markerField.hitMesh, markers);

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
  let hoveredCountry: string | null = null;
  let tween: Tween | null = null;
  const defaultDuration = still ? 0 : 900;

  /** Tilt in degrees, kept alongside the group's rotation for tweening. */
  let tilt = config.tilt;

  // A hand on the globe beats a call: orbiting cancels a glide in progress.
  controls.addEventListener("start", () => {
    tween?.cancel();
    tween = null;
  });

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
    if (tween) {
      const view = tween.at(performance.now());
      longitude = view.longitude;
      tilt = view.tilt;
      group.rotation.x = (tilt * Math.PI) / 180;
      if (view.done) tween = null;
    }
    group.rotation.y = (longitude * Math.PI) / 180;

    controls.update();
    renderer.render(scene, camera);

    // After the render, so the world matrices the raycast and the tooltip
    // projection both rely on are the ones just drawn rather than last frame's.
    hover?.update();
  }

  layout();
  const onResize = () => layout();
  globalThis.addEventListener?.("resize", onResize);

  // The container can change size without the window doing so: a grid
  // reflowing, a sidebar collapsing. See the note in the 2D renderer.
  const observer =
    typeof ResizeObserver === "function" ? new ResizeObserver(() => layout()) : null;
  observer?.observe(element);

  if (still) {
    // Reduced motion means the globe does not move on its own. It does not
    // mean the page is dead: a hover still has to respond, so the loop runs
    // with the spin at zero rather than being switched off entirely.
    timer.update();
    renderer.render(scene, camera);
    if (hover) renderer.setAnimationLoop(frame);
  } else {
    renderer.setAnimationLoop(frame);
  }

  function rebuildTexture(): void {
    map.update({ style, regionColors: colors, palette, hovered: hoveredCountry, markers, labels, terminator });
    globeScene.refreshTexture();
  }

  // The night side moves a quarter of a degree a minute; the texture is
  // redrawn on that cadence rather than every frame.
  const terminatorClock = terminator && !terminator.date
    ? setInterval(rebuildTexture, 60_000)
    : null;

  /**
   * The sphere turns to bring a view to the front, and the camera stays put.
   * Turning the camera instead would drag the lighting round with it.
   *
   * The sphere's longitude runs the other way from the 2D projection's, and
   * the camera sits at +z, which is what the -90 accounts for.
   */
  const sphereLongitude = (facing: number) => -facing - 90;

  function moveTo(target: View, duration = defaultDuration): Promise<void> {
    tween?.cancel();
    ambientSpin = 0;
    const to: View = { longitude: sphereLongitude(target.longitude), tilt: target.tilt };

    if (duration <= 0 || !running) {
      tween = null;
      longitude = to.longitude;
      tilt = to.tilt;
      group.rotation.x = (tilt * Math.PI) / 180;
      return Promise.resolve();
    }
    tween = createTween({ longitude, tilt }, to, performance.now(), duration);
    return tween.finished;
  }

  function viewOf(target: LngLat | { longitude: number; tilt?: number }): View {
    return Array.isArray(target)
      ? viewFacing(target)
      : { longitude: target.longitude, tilt: target.tilt ?? tilt };
  }

  let removeKeyboard: (() => void) | null = null;
  let spoken: HTMLElement | null = null;
  if (config.accessible ?? true) {
    removeKeyboard = makeKeyboardTurnable({
      canvas: renderer.domElement as HTMLCanvasElement,
      onTurn(dLongitude, dTilt) {
        tween?.cancel();
        tween = null;
        ambientSpin = 0;
        longitude -= dLongitude;
        tilt = Math.max(-90, Math.min(90, tilt + dTilt));
        group.rotation.x = (tilt * Math.PI) / 180;
      },
      onHome() {
        void moveTo({ longitude: -(config.longitude + 90), tilt: config.tilt });
      },
    });
    spoken = createAccessibleList({
      regions: allRegions,
      markers: allMarkers,
      onMarker(marker) {
        void moveTo(viewFacing(marker.coords));
        config.onMarkerClick?.(marker, new MouseEvent("click"));
      },
    });
    element.appendChild(spoken);
  }

  let unwatchTheme: (() => void) | null = null;

  function applyTheme(next: ThemeName): void {
    theme = next;
    palette = resolvePalette(theme, elementVars(element), options.palette);
    colors = buildColors();
    unwatchTheme?.();
    unwatchTheme = theme === "auto" ? watchSystemTheme(() => applyTheme("auto")) : null;
    rebuildTexture();
    rebuildMarkers();
  }
  if (theme === "auto") unwatchTheme = watchSystemTheme(() => applyTheme("auto"));

  function rebuildMarkers(): void {
    markerField.dispose();
    markerField = createMarkers(group, markers, RADIUS, palette);
    if (labels?.markers) rebuildTexture();
    // The hover handle holds the old mesh and the old marker list, and its
    // hovered index refers to a set that no longer exists.
    hover?.setTargets(markerField.hitMesh, markers);
  }

  // --- public surface -------------------------------------------------------

  const instance: ThreeGlobeInstance = {
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

    focus(regionId, moveOptions) {
      if (regionId === null) {
        tween?.cancel();
        tween = null;
        paintedRegions = allRegions;
        colors = buildColors();
        markers = allMarkers;
        ambientSpin = still ? 0 : config.spin;
        rebuildTexture();
        rebuildMarkers();
        return Promise.resolve();
      }

      const region = allRegions.find((r) => r.id === regionId);
      if (!region) throw new Error(`terrella/three: no region with id "${regionId}"`);

      paintedRegions = [region];
      colors = buildColors();

      const named = region.markers;
      const inRegion = new Set((region.countries ?? []).map(isoKey));
      const picked = named
        ? allMarkers.filter((m) => named.includes(m.name))
        : allMarkers.filter((m) => m.country !== undefined && inRegion.has(isoKey(m.country)));
      markers = picked.length > 0 ? picked : allMarkers;

      rebuildTexture();
      rebuildMarkers();

      const centre = regionCentre(region, countries);
      if (!centre) {
        ambientSpin = 0;
        return Promise.resolve();
      }
      return moveTo(
        { longitude: centre.longitude, tilt: region.tilt ?? -centre.latitude },
        moveOptions?.duration,
      );
    },

    flyTo(target, moveOptions) {
      return moveTo(viewOf(target), moveOptions?.duration);
    },

    tour(stops, tourOptions) {
      return runTour(stops, tourOptions, {
        focus: (id, o) => instance.focus(id, o),
        flyTo: (at, o) => instance.flyTo(at, o),
      });
    },

    setTheme(next) {
      applyTheme(next);
    },

    toSVG(svgOptions) {
      return renderSVG({
        ...options,
        world: config.world,
        style: currentStyle,
        palette,
        theme: "light",
        regions: paintedRegions,
        markers,
        values: values ?? undefined,
        scale,
        longitude: -(longitude + 90),
        tilt,
        hovered: hoveredCountry,
        width: svgOptions?.width ?? element.clientWidth ?? 600,
      });
    },

    setStyle(next) {
      currentStyle = next;
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
      colors = buildColors();
      rebuildTexture();
      rebuildMarkers();
    },

    setValues(next, nextScale) {
      values = next;
      if (nextScale) scale = nextScale;
      colors = buildColors();
      rebuildTexture();
    },

    setLabels(next) {
      labels = resolveLabels(next, countries, allRegions);
      rebuildTexture();
    },

    setTerminator(next) {
      terminator = resolveTerminator(next);
      rebuildTexture();
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
      tween?.cancel();
      unwatchTheme?.();
      removeKeyboard?.();
      spoken?.remove();
      if (terminatorClock) clearInterval(terminatorClock);
      renderer.setAnimationLoop(null);
      globalThis.removeEventListener?.("resize", onResize);
      observer?.disconnect();
      timer.disconnect();
      controls.dispose();
      hover?.dispose();
      markerField.dispose();
      arcField.dispose();
      globeScene.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };

  return instance;
}

export default createGlobe;
