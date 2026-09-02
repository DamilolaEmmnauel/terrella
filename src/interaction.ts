import type { Marker } from "./types";

/**
 * Pointer handling: dragging the globe, and hovering a marker.
 *
 * Separated from the draw loop because the feel of a drag is the part most
 * worth tuning, and it is easier to reason about when it is not interleaved
 * with painting.
 */

export interface DragState {
  /** True while a pointer is down. The loop must not spin the globe then. */
  dragging: boolean;
  /** Degrees per second carried out of a flick. */
  velocity: number;
  /** Current longitude, which a drag writes to directly. */
  longitude: number;
}

export interface DragHandle {
  state: DragState;
  destroy: () => void;
}

/** Fastest a throw can be, in degrees per second. Beyond this it reads as a glitch. */
const MAX_FLICK = 260;

/**
 * Makes the canvas draggable, with momentum on release.
 *
 * The feel comes from three details. The surface tracks the pointer rather
 * than moving by a fixed rate, so the globe stays under the finger. The
 * throw velocity is low-pass filtered, because a single stuttery sample at
 * release otherwise throws the globe across the screen. And a finger held
 * still before lifting is not a throw at all, which is the difference between
 * "put it down here" and "spin it".
 */
export function makeDraggable(
  canvas: HTMLCanvasElement,
  state: DragState,
  getRadius: () => number,
): DragHandle {
  let fromX = 0;
  let fromLongitude = 0;
  let flick = 0;
  let lastX = 0;
  let lastT = 0;

  // pan-y so a vertical swipe still scrolls the page on a phone.
  canvas.style.touchAction = "pan-y";
  canvas.style.cursor = "grab";

  const degreesPerPixel = () => 60 / Math.max(1, getRadius());

  const onDown = (event: PointerEvent) => {
    state.dragging = true;
    fromX = event.clientX;
    fromLongitude = state.longitude;
    flick = 0;
    lastX = event.clientX;
    lastT = performance.now();
    canvas.setPointerCapture(event.pointerId);
    canvas.style.cursor = "grabbing";
  };

  const onMove = (event: PointerEvent) => {
    if (!state.dragging) return;
    state.longitude = fromLongitude - (event.clientX - fromX) * degreesPerPixel();

    const now = performance.now();
    const dt = (now - lastT) / 1000;
    if (dt > 0.004) {
      const instant = (-(event.clientX - lastX) * degreesPerPixel()) / dt;
      flick = flick * 0.7 + instant * 0.3;
      lastX = event.clientX;
      lastT = now;
    }
  };

  const onRelease = () => {
    if (!state.dragging) return;
    state.dragging = false;
    if (performance.now() - lastT > 120) flick = 0;
    state.velocity = Math.max(-MAX_FLICK, Math.min(MAX_FLICK, flick));
    canvas.style.cursor = "grab";
  };

  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onRelease);
  canvas.addEventListener("pointercancel", onRelease);

  return {
    state,
    destroy() {
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onRelease);
      canvas.removeEventListener("pointercancel", onRelease);
    },
  };
}

/** Radius in pixels within which a pointer counts as over a marker. */
const HIT_RADIUS = 14;

/** Index of the marker under the pointer, or -1. */
export function hitTest(
  positions: Array<[number, number] | null>,
  x: number,
  y: number,
): number {
  for (let i = 0; i < positions.length; i++) {
    const at = positions[i];
    if (!at) continue;
    if (Math.hypot(at[0] - x, at[1] - y) < HIT_RADIUS) return i;
  }
  return -1;
}

/**
 * Formats a marker's local time.
 *
 * Returns null when there is no zone or the runtime does not know it, so a bad
 * timezone costs the clock rather than the whole tooltip.
 */
export function localTime(timezone?: string, locale?: string): string | null {
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

/** Fills the tooltip for a marker. */
export function renderTooltip(
  tooltip: HTMLElement,
  marker: Marker,
  locale?: string,
): void {
  // textContent, not innerHTML: marker names are caller data, and this library
  // must not be the reason a place name becomes markup.
  tooltip.textContent = "";

  const name = document.createElement("b");
  name.textContent = marker.name;
  tooltip.appendChild(name);

  const time = localTime(marker.timezone, locale);
  if (time) {
    const clock = document.createElement("span");
    clock.className = "terrella__time";
    clock.textContent = time;
    tooltip.appendChild(clock);
  }
}
