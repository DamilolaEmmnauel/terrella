import type { LngLat, MoveOptions, TourHandle, TourOptions, TourStop } from "./types";

/**
 * Moving the camera on purpose.
 *
 * The globe already glides when flicked; this is the same idea for a call:
 * `focus` and `flyTo` ease from where the globe is to where it is asked to
 * be, over a set time, instead of jumping. One tween drives both longitude
 * and tilt so they arrive together.
 */

export interface View {
  longitude: number;
  tilt: number;
}

export interface Tween {
  /** The view at time `now`. `done` turns true on the frame it arrives. */
  at: (now: number) => View & { done: boolean };
  /** Stops it where it is. */
  cancel: () => void;
  /** Resolves when it arrives, or when cancelled. */
  finished: Promise<void>;
}

/** Ease in and out: slow to leave, slow to arrive, which is how a camera moves. */
export const easeInOutCubic = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/**
 * The target longitude re-expressed so the shortest turn reaches it.
 *
 * Longitudes wrap, and a globe sitting at 170 asked for -170 should turn 20
 * degrees east, not 340 west.
 */
export function nearestLongitude(from: number, to: number): number {
  let delta = ((((to - from) % 360) + 540) % 360) - 180;
  if (delta === -180) delta = 180;
  return from + delta;
}

/** A view that faces a coordinate: the tilt is the negated latitude. */
export const viewFacing = ([longitude, latitude]: LngLat): View => ({
  longitude,
  tilt: -latitude,
});

/** The two calls a tour is made of, as the renderer implements them. */
export interface TourDriver {
  focus: (regionId: string, options?: MoveOptions) => Promise<void>;
  flyTo: (at: LngLat, options?: MoveOptions) => Promise<void>;
}

/**
 * Visits stops in order, waiting at each.
 *
 * Shared by both renderers so a tour behaves identically on either. Stopping
 * resolves the current wait immediately rather than letting it run out, so
 * `stop()` takes effect on the next frame.
 */
export function runTour(stops: TourStop[], options: TourOptions | undefined, driver: TourDriver): TourHandle {
  let stopped = false;
  let wake: (() => void) | null = null;
  const dwell = options?.dwell ?? 2500;

  const sleep = (ms: number) =>
    new Promise<void>((resolve) => {
      wake = resolve;
      setTimeout(resolve, ms);
    });

  const finished = (async () => {
    do {
      for (const stop of stops) {
        if (stopped) return;
        const move: MoveOptions = { duration: stop.duration ?? options?.duration };
        if (stop.region !== undefined) await driver.focus(stop.region, move);
        else if (stop.at) await driver.flyTo(stop.at, move);
        if (stopped) return;
        await sleep(stop.dwell ?? dwell);
      }
    } while (options?.loop && !stopped);
  })();

  return {
    stop() {
      stopped = true;
      wake?.();
    },
    finished,
  };
}

export function createTween(from: View, to: View, start: number, duration: number): Tween {
  const target: View = { longitude: nearestLongitude(from.longitude, to.longitude), tilt: to.tilt };
  let cancelled = false;
  let settle: () => void = () => {};
  const finished = new Promise<void>((resolve) => {
    settle = resolve;
  });

  return {
    at(now) {
      if (cancelled || duration <= 0 || now >= start + duration) {
        settle();
        return { ...target, done: true };
      }
      const t = easeInOutCubic((now - start) / duration);
      return {
        longitude: from.longitude + (target.longitude - from.longitude) * t,
        tilt: from.tilt + (target.tilt - from.tilt) * t,
        done: false,
      };
    },
    cancel() {
      cancelled = true;
      settle();
    },
    finished,
  };
}
