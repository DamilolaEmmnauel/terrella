import { describe, it, expect } from "vitest";
import { createTween, nearestLongitude, easeInOutCubic, runTour, viewFacing } from "../src/motion";

describe("nearestLongitude", () => {
  it("turns the short way round", () => {
    expect(nearestLongitude(170, -170)).toBe(190);
    expect(nearestLongitude(-170, 170)).toBe(-190);
    expect(nearestLongitude(0, 90)).toBe(90);
    expect(nearestLongitude(10, 10)).toBe(10);
  });

  it("goes east for exactly half a turn", () => {
    expect(nearestLongitude(0, 180)).toBe(180);
  });
});

describe("createTween", () => {
  it("starts where it started and arrives where it was sent", () => {
    const tween = createTween({ longitude: 0, tilt: 0 }, { longitude: 90, tilt: -20 }, 1000, 500);
    expect(tween.at(1000)).toMatchObject({ longitude: 0, tilt: 0, done: false });
    expect(tween.at(1250)).toMatchObject({ longitude: 45, tilt: -10, done: false });
    expect(tween.at(1500)).toMatchObject({ longitude: 90, tilt: -20, done: true });
  });

  it("eases: slow to leave, slow to arrive", () => {
    expect(easeInOutCubic(0.1)).toBeLessThan(0.1);
    expect(easeInOutCubic(0.9)).toBeGreaterThan(0.9);
    expect(easeInOutCubic(0.5)).toBe(0.5);
  });

  it("resolves when it arrives, and when cancelled", async () => {
    const arrives = createTween({ longitude: 0, tilt: 0 }, { longitude: 1, tilt: 0 }, 0, 10);
    arrives.at(10);
    await expect(arrives.finished).resolves.toBeUndefined();

    const cancelled = createTween({ longitude: 0, tilt: 0 }, { longitude: 1, tilt: 0 }, 0, 10);
    cancelled.cancel();
    await expect(cancelled.finished).resolves.toBeUndefined();
    expect(cancelled.at(5).done).toBe(true);
  });

  it("faces a coordinate by negating its latitude into tilt", () => {
    expect(viewFacing([121, 14.6])).toEqual({ longitude: 121, tilt: -14.6 });
  });
});

describe("runTour", () => {
  it("visits every stop, in order, then finishes", async () => {
    const visited: string[] = [];
    const driver = {
      focus: async (id: string) => { visited.push(id); },
      flyTo: async (at: [number, number]) => { visited.push(at.join(",")); },
    };
    const tour = runTour([{ region: "a" }, { at: [1, 2] }, { region: "b" }], { dwell: 1 }, driver);
    await tour.finished;
    expect(visited).toEqual(["a", "1,2", "b"]);
  });

  it("stops promptly mid-dwell", async () => {
    const visited: string[] = [];
    const driver = {
      focus: async (id: string) => { visited.push(id); },
      flyTo: async () => {},
    };
    const tour = runTour([{ region: "a" }, { region: "b" }], { dwell: 10_000, loop: true }, driver);
    await new Promise((r) => setTimeout(r, 5));
    tour.stop();
    await tour.finished;
    expect(visited).toEqual(["a"]);
  });
});
