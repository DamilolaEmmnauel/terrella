import { describe, it, expect } from "vitest";
import { parseColor, darken, lighten, luminance, contrastWith } from "../src/color";

describe("parseColor", () => {
  it("reads every hex form", () => {
    expect(parseColor("#fff")).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseColor("#ffffff")).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseColor("#e3d3c1")).toEqual({ r: 227, g: 211, b: 193, a: 1 });
    expect(parseColor("#ffffff80")?.a).toBeCloseTo(0.5, 1);
  });

  it("reads rgb and rgba", () => {
    expect(parseColor("rgb(10, 20, 30)")).toEqual({ r: 10, g: 20, b: 30, a: 1 });
    expect(parseColor("rgba(43, 69, 95, 0.1)")).toEqual({ r: 43, g: 69, b: 95, a: 0.1 });
  });

  it("returns null rather than guessing at what it cannot read", () => {
    expect(parseColor("rebeccapurple")).toBeNull();
    expect(parseColor("#12345")).toBeNull();
    expect(parseColor("")).toBeNull();
  });
});

describe("darken and lighten", () => {
  it("moves toward black and white", () => {
    expect(luminance(darken("#888888", 0.5))).toBeLessThan(luminance("#888888"));
    expect(luminance(lighten("#888888", 0.5))).toBeGreaterThan(luminance("#888888"));
  });

  it("preserves alpha", () => {
    expect(darken("rgba(200, 200, 200, 0.4)", 0.5)).toContain("0.4");
  });

  it("returns an unparseable colour untouched rather than breaking the render", () => {
    // A valid but exotic CSS colour should cost the contrast boost, not the frame.
    expect(darken("rebeccapurple", 0.4)).toBe("rebeccapurple");
  });
});

describe("contrastWith", () => {
  it("darkens a light colour on a light background", () => {
    // The warm palette: land #e3d3c1 on ocean #fbf5ee was invisible as dots.
    const adjusted = contrastWith("#e3d3c1", "#fbf5ee");
    expect(luminance(adjusted)).toBeLessThan(luminance("#e3d3c1"));
  });

  it("lightens on a dark background instead of vanishing into it", () => {
    // The direction has to follow the background, or a dark palette gets a
    // contrast "boost" that makes its dots less visible, not more.
    const adjusted = contrastWith("#33404d", "#0b1017");
    expect(luminance(adjusted)).toBeGreaterThan(luminance("#33404d"));
  });

  it("produces a real separation from the background", () => {
    const background = "#fbf5ee";
    const adjusted = contrastWith("#e3d3c1", background);
    expect(Math.abs(luminance(adjusted) - luminance(background))).toBeGreaterThan(0.2);
  });
});

describe("mix and ramp", async () => {
  const { mix, ramp } = await import("../src/color");

  it("blends two colours linearly", () => {
    expect(mix("#000000", "#ffffff", 0)).toBe("rgb(0, 0, 0)");
    expect(mix("#000000", "#ffffff", 1)).toBe("rgb(255, 255, 255)");
    expect(mix("#000000", "#ffffff", 0.5)).toBe("rgb(128, 128, 128)");
  });

  it("reads a multi-stop ramp piecewise", () => {
    const stops = ["#000000", "#ff0000", "#ffffff"];
    // The middle stop sits exactly at the middle value.
    expect(ramp(stops, 0.5)).toBe("rgb(255, 0, 0)");
    expect(ramp(stops, 0.25)).toBe("rgb(128, 0, 0)");
    expect(ramp(stops, 2)).toBe("rgb(255, 255, 255)");
  });
});
