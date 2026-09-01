/**
 * region-globe
 *
 * An interactive orthographic globe that highlights groups of countries and
 * puts markers on them. Canvas, not SVG, so a few hundred country paths at
 * 60fps costs almost nothing.
 *
 * Everything specific to a use case is configuration. The library knows about
 * regions, markers, colours and motion; it knows nothing about what your
 * regions mean.
 *
 * Peer dependencies, expected as globals or imports: d3-geo and
 * topojson-client. They are not bundled so that a page already using d3 does
 * not ship it twice.
 *
 *   import { createGlobe } from "region-globe";
 *
 *   const globe = createGlobe(document.querySelector("#globe"), {
 *     world,                       // topojson, e.g. world-atlas countries-110m
 *     regions: [
 *       { id: "sea", name: "Southeast Asia", countries: ["608", "360", "704"] },
 *     ],
 *     markers: [
 *       { name: "Manila", coords: [121.0, 14.6], timezone: "Asia/Manila" },
 *     ],
 *   });
 *
 *   globe.focus("sea");   // park that region facing the viewer
 *   globe.destroy();
 */

/** Sensible defaults. Every one can be overridden per instance. */
const DEFAULTS = {
  /** Degrees per second of ambient rotation. 0 holds still. */
  spin: 3.2,
  /** Degrees of axial tilt. Negative leans the northern hemisphere forward. */
  tilt: -14,
  /** Starting longitude at the centre of the disc. */
  longitude: 18,
  /** Canvas height as a multiple of its width. 1 shows the whole sphere. */
  ratio: 1,
  /** Sphere radius as a fraction of width. Below 0.5 leaves a margin. */
  radius: 0.46,
  /** Drag to rotate, with momentum on release. */
  draggable: true,
  /** Hover a marker for a tooltip. */
  tooltips: true,
  /** Marker pulse period in milliseconds. 0 disables the pulse. */
  pulseMs: 1600,
  /** Honour prefers-reduced-motion by not animating. */
  respectReducedMotion: true,
  palette: {
    ocean: "#edf4fb",
    /** Countries outside every region. */
    land: "#cdd8e3",
    /** The seams between countries. */
    border: "#ffffff",
    /** A region with no colour of its own. */
    region: "#a9cdec",
    /** Countries listed in a region's `highlight`. */
    highlight: "#2ea6f5",
    marker: "#1769a8",
    markerRing: "#ffffff",
    /** The shading around the edge of the sphere. */
    rim: "rgba(43, 69, 95, 0.10)",
  },
};

/** ISO 3166-1 numeric ids arrive as 4 or "4"; the atlas uses "004". */
const isoKey = (id) => String(id).padStart(3, "0");

function prefersReducedMotion() {
  return (
    typeof matchMedia === "function" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Formats a marker's local time. Returns null when no timezone is given or the
 * runtime does not recognise it, so a bad zone loses the clock rather than the
 * tooltip.
 */
function localTime(timezone, locale) {
  if (!timezone) return null;
  try {
    return new Intl.DateTimeFormat(locale || undefined, {
      hour: "numeric",
      minute: "2-digit",
      timeZone: timezone,
    }).format(new Date());
  } catch {
    return null;
  }
}

/**
 * Builds a lookup from country id to the region that claims it, so the draw
 * loop is a map read per country rather than a scan of every region.
 */
function indexRegions(regions, palette) {
  const byCountry = new Map();
  const byId = new Map();

  for (const region of regions) {
    byId.set(region.id, region);
    const highlight = new Set((region.highlight ?? []).map(isoKey));
    for (const country of region.countries ?? []) {
      byCountry.set(isoKey(country), {
        region,
        color: highlight.has(isoKey(country))
          ? region.highlightColor ?? palette.highlight
          : region.color ?? palette.region,
      });
    }
  }
  return { byCountry, byId };
}

export function createGlobe(element, options = {}) {
  if (!element) throw new Error("region-globe: no element given");

  const d3 = options.d3 ?? globalThis.d3;
  const topojson = options.topojson ?? globalThis.topojson;
  if (!d3?.geoOrthographic) throw new Error("region-globe: d3-geo is required");
  if (!topojson?.feature) throw new Error("region-globe: topojson-client is required");
  if (!options.world) throw new Error("region-globe: `world` topojson is required");

  const config = { ...DEFAULTS, ...options, palette: { ...DEFAULTS.palette, ...options.palette } };
  const still = config.respectReducedMotion && prefersReducedMotion();

  const regions = config.regions ?? [];
  const markers = config.markers ?? [];
  const allCountries = indexRegions(regions, config.palette);
  let { byCountry } = allCountries;
  const { byId } = allCountries;

  const world = config.world;
  const countries = topojson.feature(world, world.objects.countries).features;
  const land = topojson.merge(world, world.objects.countries.geometries);

  // --- elements -------------------------------------------------------------

  const canvas = document.createElement("canvas");
  canvas.className = "region-globe__canvas";
  canvas.setAttribute("role", "img");
  canvas.setAttribute(
    "aria-label",
    config.label ?? `Globe highlighting ${regions.map((r) => r.name ?? r.id).join(", ")}`,
  );
  element.appendChild(canvas);

  const tooltip = document.createElement("div");
  tooltip.className = "region-globe__tip";
  if (config.tooltips) element.appendChild(tooltip);

  const ctx = canvas.getContext("2d");
  const projection = d3.geoOrthographic().clipAngle(90);
  const path = d3.geoPath(projection, ctx);

  let width = 0, height = 0, radius = 0, cx = 0, cy = 0;

  function resize() {
    // Cap the device ratio: beyond 2 the extra pixels cost more than they show.
    const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
    width = element.clientWidth;
    height = Math.round(width * config.ratio);
    radius = width * config.radius;
    cx = width / 2;
    cy = height / 2;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = "100%";
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    projection.translate([cx, cy]).scale(radius);
  }
  resize();

  // --- state ----------------------------------------------------------------

  let longitude = config.longitude;
  let tilt = config.tilt;
  let ambientSpin = still ? 0 : config.spin;
  let velocity = ambientSpin;
  let visibleMarkers = markers;
  let markerXY = new Array(markers.length).fill(null);
  let hovered = -1;
  let frame = null;
  let lastTs = null;

  // --- drag with momentum ---------------------------------------------------

  let dragging = false, dragFromX = 0, dragFromLon = 0;
  let flick = 0, lastX = 0, lastT = 0;

  if (config.draggable && !still) {
    // pan-y so a vertical swipe still scrolls the page on a phone.
    canvas.style.touchAction = "pan-y";
    canvas.style.cursor = "grab";

    canvas.addEventListener("pointerdown", (event) => {
      dragging = true;
      dragFromX = event.clientX;
      dragFromLon = longitude;
      flick = 0;
      lastX = event.clientX;
      lastT = performance.now();
      canvas.setPointerCapture(event.pointerId);
      canvas.style.cursor = "grabbing";
    });

    canvas.addEventListener("pointermove", (event) => {
      if (!dragging) return;
      // 60 degrees across the sphere's width keeps the surface under the finger.
      longitude = dragFromLon - (event.clientX - dragFromX) * (60 / radius);

      const now = performance.now();
      const dt = (now - lastT) / 1000;
      if (dt > 0.004) {
        const instant = -(event.clientX - lastX) * (60 / radius) / dt;
        // Low-pass the pointer jitter, or a single stuttery sample throws it.
        flick = flick * 0.7 + instant * 0.3;
        lastX = event.clientX;
        lastT = now;
      }
    });

    const release = () => {
      if (!dragging) return;
      dragging = false;
      // A finger held still before lifting is not a throw.
      if (performance.now() - lastT > 120) flick = 0;
      velocity = Math.max(-260, Math.min(260, flick));
      canvas.style.cursor = "grab";
    };
    canvas.addEventListener("pointerup", release);
    canvas.addEventListener("pointercancel", release);
  }

  // --- tooltips -------------------------------------------------------------

  function setHover(index) {
    if (hovered === index) return;
    hovered = index;

    if (index === -1) {
      tooltip.classList.remove("is-on");
      canvas.style.cursor = config.draggable && !still ? "grab" : "";
    } else {
      const marker = visibleMarkers[index];
      const time = localTime(marker.timezone, config.locale);
      // textContent, not innerHTML: marker names are caller data and this
      // library must not be the reason a name becomes markup.
      tooltip.textContent = "";
      const name = document.createElement("b");
      name.textContent = marker.name;
      tooltip.appendChild(name);
      if (time) {
        const clock = document.createElement("span");
        clock.className = "region-globe__time";
        clock.textContent = time;
        tooltip.appendChild(clock);
      }
      tooltip.classList.add("is-on");
      canvas.style.cursor = "pointer";
    }
    config.onMarkerHover?.(index === -1 ? null : visibleMarkers[index]);
  }

  if (config.tooltips) {
    canvas.addEventListener("mousemove", (event) => {
      const rect = canvas.getBoundingClientRect();
      const mx = event.clientX - rect.left;
      const my = event.clientY - rect.top;

      let hit = -1;
      for (let i = 0; i < markerXY.length; i++) {
        const xy = markerXY[i];
        if (!xy) continue;
        if (Math.hypot(xy[0] - mx, xy[1] - my) < 14) { hit = i; break; }
      }
      setHover(hit);
    });
    canvas.addEventListener("mouseleave", () => setHover(-1));
  }

  canvas.addEventListener("click", (event) => {
    if (hovered !== -1) config.onMarkerClick?.(visibleMarkers[hovered], event);
  });

  // --- drawing --------------------------------------------------------------

  function draw(ts) {
    if (lastTs !== null && !dragging) {
      const dt = (ts - lastTs) / 1000;
      longitude += velocity * dt;
      // Glide from the flick velocity back to the ambient drift, so
      // flick -> glide -> drift reads as one motion rather than three.
      velocity = ambientSpin + (velocity - ambientSpin) * Math.exp(-dt / 1.1);
    }
    lastTs = ts;

    projection.rotate([-longitude, tilt]);
    ctx.clearRect(0, 0, width, height);

    // Ocean disc, with a shaded rim that reads as curvature.
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = config.palette.ocean;
    ctx.fill();

    const rim = ctx.createRadialGradient(cx, cy, radius * 0.82, cx, cy, radius);
    rim.addColorStop(0, "rgba(0,0,0,0)");
    rim.addColorStop(1, config.palette.rim);
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = rim;
    ctx.fill();

    // Land as one merged shape: far cheaper than filling each country, and the
    // seams are drawn only where a region needs them.
    ctx.beginPath();
    path(land);
    ctx.fillStyle = config.palette.land;
    ctx.fill();
    ctx.strokeStyle = config.palette.border;
    ctx.lineWidth = 0.6;
    ctx.stroke();

    for (const feature of countries) {
      const match = byCountry.get(isoKey(feature.id));
      if (!match) continue;
      ctx.beginPath();
      path(feature);
      ctx.fillStyle = match.color;
      ctx.fill();
      ctx.strokeStyle = config.palette.border;
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }

    const pulse = config.pulseMs ? (ts % config.pulseMs) / config.pulseMs : 0;

    for (let i = 0; i < visibleMarkers.length; i++) {
      const marker = visibleMarkers[i];
      // Past the horizon: geoDistance from the point facing the viewer.
      if (d3.geoDistance(marker.coords, [longitude, -tilt]) > 1.45) {
        markerXY[i] = null;
        if (hovered === i) setHover(-1);
        continue;
      }

      const xy = projection(marker.coords);
      markerXY[i] = xy;

      if (config.pulseMs) {
        ctx.beginPath();
        ctx.arc(xy[0], xy[1], 6 + pulse * 10, 0, Math.PI * 2);
        ctx.strokeStyle = marker.color ?? config.palette.marker;
        ctx.globalAlpha = 0.5 * (1 - pulse);
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      ctx.beginPath();
      ctx.arc(xy[0], xy[1], marker.size ?? 4.5, 0, Math.PI * 2);
      ctx.fillStyle = marker.color ?? config.palette.marker;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = config.palette.markerRing;
      ctx.stroke();

      if (hovered === i && config.tooltips) {
        tooltip.style.left = `${xy[0]}px`;
        tooltip.style.top = `${xy[1]}px`;
      }
    }

    // Read by headless tests to prove the globe is actually turning.
    canvas.dataset.longitude = longitude.toFixed(2);

    if (frame !== null) frame = requestAnimationFrame(draw);
  }

  // --- lifecycle ------------------------------------------------------------

  const onResize = () => { resize(); if (frame === null) draw(performance.now()); };
  globalThis.addEventListener?.("resize", onResize);

  function start() {
    if (frame !== null) return;
    frame = requestAnimationFrame(draw);
  }

  if (still) {
    // One frame, no loop: the globe is drawn and stays put.
    draw(performance.now());
  } else {
    start();
  }

  return {
    /** The canvas, if you need to size or screenshot it. */
    canvas,

    /**
     * Parks the globe on a region: its countries stay in view and ambient
     * rotation stops, which is what a page about one region usually wants.
     * Pass null to release it back to drifting.
     */
    focus(regionId) {
      const region = regionId === null ? null : byId.get(regionId);
      if (regionId !== null && !region) {
        throw new Error(`region-globe: no region with id "${regionId}"`);
      }

      if (!region) {
        byCountry = allCountries.byCountry;
        visibleMarkers = markers;
        ambientSpin = still ? 0 : config.spin;
        velocity = ambientSpin;
      } else {
        // Paint only the focused region. Otherwise the other regions stay lit
        // at the limbs, which reads as "these are highlighted too" when the
        // caller has just said to concentrate on one.
        byCountry = indexRegions([region], config.palette).byCountry;
        visibleMarkers = region.markers
          ? markers.filter((m) => region.markers.includes(m.name))
          : markers.filter((m) => (region.countries ?? []).map(isoKey).includes(isoKey(m.country ?? "")));
        if (visibleMarkers.length === 0) visibleMarkers = markers;

        longitude = region.longitude ?? longitude;
        tilt = region.tilt ?? tilt;
        ambientSpin = 0;
        velocity = 0;
      }
      markerXY = new Array(visibleMarkers.length).fill(null);
      setHover(-1);
      if (frame === null) draw(performance.now());
    },

    /** Changes the ambient rotation without touching anything else. */
    setSpin(degreesPerSecond) {
      ambientSpin = degreesPerSecond;
      velocity = degreesPerSecond;
    },

    /** Current longitude at the centre of the disc, in degrees. */
    get longitude() {
      return longitude;
    },

    /** Stops the loop and removes everything this added to the DOM. */
    destroy() {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      globalThis.removeEventListener?.("resize", onResize);
      canvas.remove();
      tooltip.remove();
    },
  };
}

export default createGlobe;
