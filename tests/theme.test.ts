import { describe, it, expect } from "vitest";
import { cssPalette, presetFor, resolvePalette, DARK_PALETTE } from "../src/theme";
import { DEFAULT_PALETTE } from "../src/config";

describe("theme", () => {
  it("maps --terrella-* properties onto palette keys, camel-cased", () => {
    const vars: Record<string, string> = {
      "--terrella-land": " #123456 ",
      "--terrella-marker-ring": "#abcdef",
    };
    expect(cssPalette((name) => vars[name] ?? "")).toEqual({
      land: "#123456",
      markerRing: "#abcdef",
    });
  });

  it("layers preset, then CSS, then the explicit palette", () => {
    const palette = resolvePalette("dark", (name) => (name === "--terrella-land" ? "#111" : ""), {
      ocean: "#222",
    });
    expect(palette.land).toBe("#111");
    expect(palette.ocean).toBe("#222");
    expect(palette.highlight).toBe(DARK_PALETTE.highlight);
  });

  it("falls back to light where the system preference is unknown", () => {
    // No matchMedia in Node, so "auto" cannot see a preference.
    expect(presetFor("auto")).toBe(DEFAULT_PALETTE);
    expect(presetFor("dark")).toBe(DARK_PALETTE);
  });
});
