import { geoPath, type GeoPermissibleObjects, type GeoProjection } from "d3-geo";
import { resolveConfig, prefersReducedMotion, DEFAULT_PALETTE } from "./config";
import {
  createProjection,
  isFlat,
  readWorld,
  regionColors as buildRegionColors,
  regionCentre,
  valueColors,
  isoKey,
} from "./geo";
import { resolveStyle, type PreparedStyle } from "./styles";
import { paintArcs, paintHover, paintMarkers } from "./overlay";
import { hitTest, makeDraggable, renderTooltip, type DragState } from "./interaction";
import { createCountryTest, type CountryTest } from "./countrymask";
import { country as lookupCountry } from "./countries";
import { createTween, runTour, viewFacing, type Tween, type View } from "./motion";
import { paintLabels, resolveLabels } from "./labels";
import { paintTerminator, resolveTerminator } from "./terminator";
import { renderSVG } from "./svg/index";
import { createAccessibleList, makeKeyboardTurnable } from "./a11y";
import { elementVars, resolvePalette, watchSystemTheme, type ThemeName } from "./theme";
import type {
  Country,
  Frame,
  LngLat,
  GlobeInstance,
  GlobeOptions,
  Marker,
  Palette,
  ProjectionName,
  StyleName,
  StylePainter,
} from "./types";

export * from "./types";
export {
  STYLE_NAMES,
  solid,
  dots,
  wireframe,
  hatched,
  pixel,
  ascii,
  stipple,
  prepare,
  type PreparedStyle,
} from "./styles";
export { DEFAULT_PALETTE, setDefaultWorld, getDefaultWorld } from "./config";
export { DARK_PALETTE, type ThemeName } from "./theme";
export { readWorld, sampleLandGrid, createProjection, isFlat, regionCentre, MAX_DOTS } from "./geo";
export { isoKey, country, countryName, countriesIn, allCountries, REGION_NAMES } from "./countries";
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
  options: GlobeOptions = {},
): GlobeInstance {
  if (!element) throw new Error("terrella: no element given");

  const config = resolveConfig(options ?? {});
  const still = config.respectReducedMotion && prefersReducedMotion();

  const { countries, land } = readWorld(config.world);
  const allRegions = config.regions ?? [];
  const allMarkers = config.markers ?? [];
  const arcs = config.arcs ?? [];

  let theme: ThemeName = config.theme;
  let palette: Palette = resolvePalette(theme, elementVars(element), options.palette);
  let projectionName: ProjectionName = config.projection;
  let projection: GeoProjection = createProjection(projectionName);
  let flat = isFlat(projectionName);

  // Prepared lazily below, once the world shapes and layout exist.
  let style: PreparedStyle;
  let currentStyle: StyleName | StylePainter = config.style;

  let markers: Marker[] = allMarkers;
  let values = config.values ?? null;
  let scale = config.scale;
  /** Which regions are painted right now: all of them, or the focused one. */
  let paintedRegions = allRegions;

  /** Region colours with the values laid over them. */
  function buildColors(): Map<string, string> {
    return new Map([
      ...buildRegionColors(paintedRegions, palette),
      ...valueColors(values, scale, palette),
    ]);
  }
  let colors = buildColors();

  const hoverCountries =
    config.hoverCountries ?? Boolean(config.onCountryHover || config.onCountryClick);
  // Built on first use: the mask costs a rasterisation nobody hovering
  // nothing should pay for.
  let countryAt: CountryTest | null = null;

  let labels = resolveLabels(config.labels, countries, allRegions);
  let terminator = resolveTerminator(config.terminator);

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
  let tween: Tween | null = null;
  const defaultDuration = still ? 0 : 900;

  let markerPositions: Array<[number, number] | null> = [];
  let hovered = -1;
  let hoveredCountry: string | null = null;
  let frameId: number | null = null;
  let lastTs: number | null = null;
  let startTs = 0;

  const dragHandle =
    config.draggable && !still ? makeDraggable(canvas, drag, () => radius) : null;

  // --- accessibility ----------------------------------------------------------

  const accessible = config.accessible ?? true;
  let removeKeyboard: (() => void) | null = null;
  let spoken: HTMLElement | null = null;

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

  /** The country under a canvas point, or null for ocean and off-globe. */
  function countryUnder(x: number, y: number): string | null {
    if (!flat && Math.hypot(x - centreX, y - centreY) > radius) return null;
    const at = projection.invert?.([x, y]);
    if (!at || !Number.isFinite(at[0]) || !Number.isFinite(at[1])) return null;
    countryAt ??= createCountryTest(countries);
    return countryAt(at as [number, number]);
  }

  function setHoveredCountry(id: string | null, x: number, y: number): void {
    // Shapes with no ISO code cannot be named, so they do not hover.
    const resolved: Country | null = id ? lookupCountry(id) : null;
    const next = resolved ? id : null;

    // The country tooltip follows the pointer rather than a fixed anchor.
    if (next && hovered === -1 && config.tooltips) {
      tooltip.style.left = `${x}px`;
      tooltip.style.top = `${y}px`;
    }
    if (hoveredCountry === next) return;
    hoveredCountry = next;

    if (hovered === -1) {
      if (resolved && config.tooltips) {
        renderTooltip(tooltip, { name: resolved.name });
        tooltip.classList.add("is-on");
      } else {
        tooltip.classList.remove("is-on");
      }
      canvas.style.cursor = resolved ? "pointer" : dragHandle ? "grab" : "";
    }
    config.onCountryHover?.(resolved);
    redraw();
  }

  const onMouseMove = (event: MouseEvent) => {
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    setHover(hitTest(markerPositions, x, y));
    // A marker wins over the country beneath it.
    if (hoverCountries) setHoveredCountry(hovered === -1 ? countryUnder(x, y) : null, x, y);
  };
  const onMouseLeave = () => {
    setHover(-1);
    if (hoverCountries) setHoveredCountry(null, 0, 0);
  };
  const onClick = (event: MouseEvent) => {
    const marker = hovered === -1 ? null : markers[hovered];
    if (marker) {
      config.onMarkerClick?.(marker, event);
      return;
    }
    if (config.onCountryClick) {
      const rect = canvas.getBoundingClientRect();
      const id = countryUnder(event.clientX - rect.left, event.clientY - rect.top);
      const resolved = id ? lookupCountry(id) : null;
      if (resolved) config.onCountryClick(resolved, event);
    }
  };

  if (config.tooltips || hoverCountries) {
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

    // A hand on the globe beats a call: dragging cancels a glide in progress.
    if (tween && drag.dragging) {
      tween.cancel();
      tween = null;
    }
    if (tween) {
      const view = tween.at(ts);
      drag.longitude = view.longitude;
      tilt = view.tilt;
      if (view.done) tween = null;
    }

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
      hovered: hoveredCountry,
    };

    style.paint(frame);
    if (terminator) paintTerminator(frame, terminator);
    paintHover(frame);
    if (arcs.length > 0) paintArcs(frame, arcs);
    markerPositions = paintMarkers(frame, markers, config.pulseMs);
    if (labels) paintLabels(frame, labels, markers, markerPositions);

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

  /** Glides to a view and holds there. Instant when the loop is not running. */
  function moveTo(target: View, duration = defaultDuration): Promise<void> {
    tween?.cancel();
    ambientSpin = 0;
    drag.velocity = 0;
    setHover(-1);

    if (duration <= 0 || frameId === null) {
      tween = null;
      drag.longitude = target.longitude;
      tilt = target.tilt;
      redraw();
      return Promise.resolve();
    }
    tween = createTween({ longitude: drag.longitude, tilt }, target, performance.now(), duration);
    return tween.finished;
  }

  function viewOf(target: LngLat | { longitude: number; tilt?: number }): View {
    return Array.isArray(target)
      ? viewFacing(target)
      : { longitude: target.longitude, tilt: target.tilt ?? tilt };
  }

  if (accessible) {
    removeKeyboard = makeKeyboardTurnable({
      canvas,
      onTurn(dLongitude, dTilt) {
        tween?.cancel();
        tween = null;
        ambientSpin = 0;
        drag.velocity = 0;
        drag.longitude += dLongitude;
        tilt = Math.max(-90, Math.min(90, tilt + dTilt));
        redraw();
      },
      onHome() {
        void moveTo({ longitude: config.longitude, tilt: config.tilt });
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

  // --- theme ----------------------------------------------------------------

  let unwatchTheme: (() => void) | null = null;

  function applyTheme(next: ThemeName): void {
    theme = next;
    palette = resolvePalette(theme, elementVars(element), options.palette);
    colors = buildColors();
    unwatchTheme?.();
    unwatchTheme = theme === "auto" ? watchSystemTheme(() => applyTheme("auto")) : null;
    redraw();
  }
  if (theme === "auto") unwatchTheme = watchSystemTheme(() => applyTheme("auto"));

  const onResize = () => {
    layout();
    redraw();
  };
  globalThis.addEventListener?.("resize", onResize);

  /**
   * Follow the container, not just the window.
   *
   * A window listener alone is wrong whenever the element is resized by
   * something other than the viewport: a sibling being inserted into the same
   * grid, a sidebar collapsing, a details element opening. The preview page
   * exposed this by creating four globes in a row, each measuring itself
   * before the next one narrowed the column it was in, so they ended up 1038,
   * 501, 322 and 233 pixels wide instead of equal.
   */
  const observer =
    typeof ResizeObserver === "function"
      ? new ResizeObserver(() => {
          layout();
          redraw();
        })
      : null;
  observer?.observe(element);

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

    focus(regionId, moveOptions) {
      if (regionId === null) {
        tween?.cancel();
        tween = null;
        paintedRegions = allRegions;
        colors = buildColors();
        markers = allMarkers;
        ambientSpin = still ? 0 : config.spin;
        drag.velocity = ambientSpin;
        setHover(-1);
        redraw();
        return Promise.resolve();
      }

      const region = allRegions.find((r) => r.id === regionId);
      if (!region) throw new Error(`terrella: no region with id "${regionId}"`);

      // Only the focused region stays painted. Leaving the others lit reads as
      // "these are highlighted too" when the caller has just said to
      // concentrate on one.
      paintedRegions = [region];
      colors = buildColors();

      const named = region.markers;
      const inRegion = new Set((region.countries ?? []).map(isoKey));
      const picked = named
        ? allMarkers.filter((m) => named.includes(m.name))
        : allMarkers.filter((m) => m.country !== undefined && inRegion.has(isoKey(m.country)));
      markers = picked.length > 0 ? picked : allMarkers;

      const centre = regionCentre(region, countries);
      if (!centre) {
        ambientSpin = 0;
        drag.velocity = 0;
        redraw();
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
        focus: (id, o) => this.focus(id, o),
        flyTo: (at, o) => this.flyTo(at, o),
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
        projection: projectionName,
        palette,
        theme: "light",
        regions: paintedRegions,
        markers,
        values: values ?? undefined,
        scale,
        longitude: drag.longitude,
        tilt,
        hovered: hoveredCountry,
        width: svgOptions?.width ?? width,
      });
    },

    setStyle(next) {
      currentStyle = next;
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
      colors = buildColors();
      redraw();
    },

    setValues(next, nextScale) {
      values = next;
      if (nextScale) scale = nextScale;
      colors = buildColors();
      redraw();
    },

    setLabels(next) {
      labels = resolveLabels(next, countries, allRegions);
      redraw();
    },

    setTerminator(next) {
      terminator = resolveTerminator(next);
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
      tween?.cancel();
      unwatchTheme?.();
      removeKeyboard?.();
      spoken?.remove();
      if (frameId !== null) cancelAnimationFrame(frameId);
      frameId = null;
      globalThis.removeEventListener?.("resize", onResize);
      observer?.disconnect();
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
