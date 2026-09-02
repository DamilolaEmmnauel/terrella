import { geoPath, type GeoPermissibleObjects, type GeoProjection } from "d3-geo";
import { resolveConfig, prefersReducedMotion, DEFAULT_PALETTE } from "./config";
import {
  createProjection,
  isFlat,
  readWorld,
  regionColors as buildRegionColors,
  regionCentre,
  isoKey,
} from "./geo";
import { resolveStyle, type PreparedStyle } from "./styles";
import { paintArcs, paintMarkers } from "./overlay";
import { hitTest, makeDraggable, renderTooltip, type DragState } from "./interaction";
import type {
  Frame,
  GlobeInstance,
  GlobeOptions,
  Marker,
  Palette,
  ProjectionName,
  StyleName,
  StylePainter,
} from "./types";

export * from "./types";
export { STYLE_NAMES, solid, dots, wireframe, prepare, type PreparedStyle } from "./styles";
export { DEFAULT_PALETTE } from "./config";
export { isoKey, readWorld, sampleLandGrid, createProjection, isFlat, regionCentre, MAX_DOTS } from "./geo";
export { createLandTest, type LandTest } from "./landmask";

/**
 * Creates an interactive globe inside `element`.
 *
 * The element is expected to be a positioned block with a width; the canvas
 * fills it and its height follows from `ratio`.
 *
 *     const globe = createGlobe(document.querySelector("#globe"), {
 *       world,
 *       style: "dots",
 *       regions: [{ id: "eu", name: "Europe", countries: [250, 276, 380] }],
 *       markers: [{ name: "Lagos", coords: [3.4, 6.5], timezone: "Africa/Lagos" }],
 *     });
 *
 *     globe.focus("eu");
 */
export function createGlobe(
  element: HTMLElement,
  options: GlobeOptions,
): GlobeInstance {
  if (!element) throw new Error("terrella: no element given");
  if (!options?.world) throw new Error("terrella: `world` topojson is required");

  const config = resolveConfig(options);
  const still = config.respectReducedMotion && prefersReducedMotion();

  const { countries, land } = readWorld(config.world);
  const allRegions = config.regions ?? [];
  const allMarkers = config.markers ?? [];
  const arcs = config.arcs ?? [];

  let palette: Palette = config.palette;
  let projectionName: ProjectionName = config.projection;
  let projection: GeoProjection = createProjection(projectionName);
  let flat = isFlat(projectionName);

  // Prepared lazily below, once the world shapes and layout exist.
  let style: PreparedStyle;

  let markers: Marker[] = allMarkers;
  let colors = buildRegionColors(allRegions, palette);

  // --- DOM ------------------------------------------------------------------

  const canvas = document.createElement("canvas");
  canvas.className = "terrella__canvas";
  canvas.setAttribute("role", "img");
  canvas.setAttribute(
    "aria-label",
    config.label ??
      (allRegions.length > 0
        ? `Globe highlighting ${allRegions.map((r) => r.name ?? r.id).join(", ")}`
        : "Interactive globe"),
  );
  element.appendChild(canvas);

  const context = canvas.getContext("2d");
  if (!context) throw new Error("terrella: could not get a 2d canvas context");
  const ctx = context;

  const tooltip = document.createElement("div");
  tooltip.className = "terrella__tip";
  if (config.tooltips) element.appendChild(tooltip);

  let path = geoPath(projection, ctx);

  // --- geometry -------------------------------------------------------------

  let width = 0;
  let height = 0;
  let radius = 0;
  let centreX = 0;
  let centreY = 0;

  function layout(): void {
    // Capping the device ratio at 2: beyond that the extra pixels cost more
    // than they show, especially with thousands of dots.
    const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);

    width = element.clientWidth || 1;
    height = Math.round(width * config.ratio);
    radius = width * config.radius;
    centreX = width / 2;
    centreY = height / 2;

    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = "100%";
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (flat) {
      // fitSize lets the projection choose its own scale so the whole world
      // lands inside the canvas whatever its aspect ratio.
      projection.fitSize([width, height], { type: "Sphere" } as GeoPermissibleObjects);
    } else {
      projection.translate([centreX, centreY]).scale(radius);
    }
  }

  // --- motion ---------------------------------------------------------------

  const drag: DragState = {
    dragging: false,
    velocity: still ? 0 : config.spin,
    longitude: config.longitude,
  };
  let tilt = config.tilt;
  let ambientSpin = still ? 0 : config.spin;

  let markerPositions: Array<[number, number] | null> = [];
  let hovered = -1;
  let frameId: number | null = null;
  let lastTs: number | null = null;
  let startTs = 0;

  const dragHandle =
    config.draggable && !still ? makeDraggable(canvas, drag, () => radius) : null;

  // --- hover ----------------------------------------------------------------

  function setHover(index: number): void {
    if (hovered === index) return;
    hovered = index;

    if (index === -1) {
      tooltip.classList.remove("is-on");
      canvas.style.cursor = dragHandle ? "grab" : "";
      config.onMarkerHover?.(null);
      return;
    }

    const marker = markers[index];
    if (!marker) return;
    renderTooltip(tooltip, marker, config.locale);
    tooltip.classList.add("is-on");
    canvas.style.cursor = "pointer";
    config.onMarkerHover?.(marker);
  }

  const onMouseMove = (event: MouseEvent) => {
    const rect = canvas.getBoundingClientRect();
    setHover(hitTest(markerPositions, event.clientX - rect.left, event.clientY - rect.top));
  };
  const onMouseLeave = () => setHover(-1);
  const onClick = (event: MouseEvent) => {
    const marker = hovered === -1 ? null : markers[hovered];
    if (marker) config.onMarkerClick?.(marker, event);
  };

  if (config.tooltips) {
    canvas.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("mouseleave", onMouseLeave);
  }
  canvas.addEventListener("click", onClick);

  // --- drawing --------------------------------------------------------------

  function usePreparedStyle(next: StyleName | StylePainter<never>): void {
    style = resolveStyle(next, { land, countries, options: config });
  }

  function draw(ts: number): void {
    if (startTs === 0) startTs = ts;

    if (lastTs !== null && !drag.dragging) {
      const dt = (ts - lastTs) / 1000;
      drag.longitude += drag.velocity * dt;
      // Ease from the flick velocity back to the ambient drift, so
      // flick, glide and drift read as one motion rather than three.
      drag.velocity = ambientSpin + (drag.velocity - ambientSpin) * Math.exp(-dt / 1.1);
    }
    lastTs = ts;

    if (!flat) projection.rotate([-drag.longitude, tilt]);

    ctx.clearRect(0, 0, width, height);

    const frame: Frame = {
      ctx,
      width,
      height,
      radius,
      centreX,
      centreY,
      projection,
      path: (object) => path(object),
      countries,
      land,
      regionColors: colors,
      palette,
      time: ts - startTs,
      flat,
    };

    style.paint(frame);
    if (arcs.length > 0) paintArcs(frame, arcs);
    markerPositions = paintMarkers(frame, markers, config.pulseMs);

    if (hovered !== -1) {
      const at = markerPositions[hovered];
      if (!at) setHover(-1);
      else {
        tooltip.style.left = `${at[0]}px`;
        tooltip.style.top = `${at[1]}px`;
      }
    }

    // Read by headless tests to prove the globe is actually turning.
    canvas.dataset["longitude"] = drag.longitude.toFixed(2);

    if (frameId !== null) frameId = requestAnimationFrame(draw);
  }

  /** Draws once when the loop is stopped, so a setter still updates the view. */
  function redraw(): void {
    if (frameId === null) draw(performance.now());
  }

  const onResize = () => {
    layout();
    redraw();
  };
  globalThis.addEventListener?.("resize", onResize);

  // --- start ----------------------------------------------------------------

  layout();
  usePreparedStyle(config.style as StyleName | StylePainter<never>);

  if (still) {
    draw(performance.now());
  } else {
    frameId = requestAnimationFrame(draw);
  }

  // --- public surface -------------------------------------------------------

  return {
    canvas,

    get longitude() {
      return drag.longitude;
    },

    focus(regionId) {
      if (regionId === null) {
        colors = buildRegionColors(allRegions, palette);
        markers = allMarkers;
        ambientSpin = still ? 0 : config.spin;
        drag.velocity = ambientSpin;
        setHover(-1);
        redraw();
        return;
      }

      const region = allRegions.find((r) => r.id === regionId);
      if (!region) throw new Error(`terrella: no region with id "${regionId}"`);

      // Only the focused region stays painted. Leaving the others lit reads as
      // "these are highlighted too" when the caller has just said to
      // concentrate on one.
      colors = buildRegionColors([region], palette);

      const named = region.markers;
      const inRegion = new Set((region.countries ?? []).map(isoKey));
      const picked = named
        ? allMarkers.filter((m) => named.includes(m.name))
        : allMarkers.filter((m) => m.country !== undefined && inRegion.has(isoKey(m.country)));
      markers = picked.length > 0 ? picked : allMarkers;

      const centre = regionCentre(region, countries);
      if (centre) {
        drag.longitude = centre.longitude;
        tilt = region.tilt ?? -centre.latitude;
      }

      ambientSpin = 0;
      drag.velocity = 0;
      setHover(-1);
      redraw();
    },

    setStyle(next) {
      usePreparedStyle(next as StyleName | StylePainter<never>);
      redraw();
    },

    setProjection(next) {
      projectionName = next;
      projection = createProjection(next);
      flat = isFlat(next);
      path = geoPath(projection, ctx);
      layout();
      redraw();
    },

    setPalette(next) {
      palette = { ...palette, ...next };
      colors = buildRegionColors(allRegions, palette);
      redraw();
    },

    setSpin(degreesPerSecond) {
      ambientSpin = degreesPerSecond;
      drag.velocity = degreesPerSecond;
      redraw();
    },

    setMarkers(next) {
      markers = next;
      markerPositions = [];
      setHover(-1);
      redraw();
    },

    destroy() {
      if (frameId !== null) cancelAnimationFrame(frameId);
      frameId = null;
      globalThis.removeEventListener?.("resize", onResize);
      dragHandle?.destroy();
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("mouseleave", onMouseLeave);
      canvas.removeEventListener("click", onClick);
      canvas.remove();
      tooltip.remove();
    },
  };
}

export default createGlobe;
export { DEFAULT_PALETTE as defaultPalette };
