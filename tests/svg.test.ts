import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Topology } from "topojson-specification";
import { renderSVG } from "../src/svg/index";
import { SvgContext } from "../src/svg/context";

/**
 * The server-side render. No canvas, no DOM: this is the whole point.
 */

const world = JSON.parse(
  readFileSync(fileURLToPath(new URL("../data/countries-110m.json", import.meta.url)), "utf8"),
) as Topology;

describe("SvgContext", () => {
  it("records a filled and a stroked path", () => {
    const ctx = new SvgContext();
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(10, 0);
    ctx.closePath();
    ctx.fillStyle = "red";
    ctx.fill();
    ctx.strokeStyle = "blue";
    ctx.lineWidth = 2;
    ctx.stroke();
    expect(ctx.render()).toBe(
      '<path d="M0 0L10 0Z" fill="red"/><path d="M0 0L10 0Z" fill="none" stroke="blue" stroke-width="2"/>',
    );
  });

  it("turns a full-circle arc into two SVG arcs", () => {
    const ctx = new SvgContext();
    ctx.beginPath();
    ctx.arc(5, 5, 2, 0, Math.PI * 2);
    ctx.fill();
    expect(ctx.render()).toContain('d="M7 5A2 2 0 1 1 3 5A2 2 0 1 1 7 5"');
  });

  it("closes clips on restore and defines gradients", () => {
    const ctx = new SvgContext();
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, 4, 4);
    ctx.clip();
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(1, 1);
    const gradient = ctx.createRadialGradient(2, 2, 1, 2, 2, 2);
    gradient.addColorStop(0, "#fff");
    gradient.addColorStop(1, "#000");
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.restore();
    const svg = ctx.render();
    expect(svg).toMatch(/<defs><clipPath id="clip1">.*<radialGradient id="gradient1".*<\/defs>/);
    expect(svg).toMatch(/<g clip-path="url\(#clip1\)"><path d="M0 0L1 1" fill="url\(#gradient1\)"\/><\/g>$/);
    // The canvas gradient starts at radius 1 of 2, so its first stop lands halfway.
    expect(svg).toContain('<stop offset="0.5" stop-color="#fff"/>');
  });

  it("escapes text", () => {
    const ctx = new SvgContext();
    ctx.font = "500 12px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("<Côte> & co", 1, 2);
    expect(ctx.render()).toContain('text-anchor="middle"');
    expect(ctx.render()).toContain(">&lt;Côte&gt; &amp; co</text>");
  });
});

describe("renderSVG", () => {
  it("draws a globe with regions, markers, arcs and labels", () => {
    const svg = renderSVG({
      world,
      regions: [{ id: "sea", name: "Southeast Asia", countries: ["PH", "ID"] }],
      markers: [{ name: "Manila", coords: [121, 14.6] }],
      arcs: [{ from: [121, 14.6], to: [3.4, 6.5] }],
      labels: true,
      longitude: 110,
      width: 300,
    });
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300"')).toBe(true);
    expect(svg).toContain('aria-label="Globe highlighting Southeast Asia"');
    expect(svg).toContain(">Manila</text>");
    expect(svg).toContain(">Philippines</text>");
    expect((svg.match(/<path /g) ?? []).length).toBeGreaterThan(5);
  });

  it("renders a flat projection across the width", () => {
    const svg = renderSVG({ world, projection: "naturalEarth", ratio: 0.5, width: 400 });
    expect(svg).toContain('viewBox="0 0 400 200"');
  });

  it("paints a choropleth", () => {
    const svg = renderSVG({ world, values: { NG: 1 }, scale: { range: ["#000000", "#ff0000"] }, width: 200 });
    expect(svg).toContain('fill="rgb(255, 0, 0)"');
  });
});
