/**
 * The regions, markers, arcs and palettes every demo page draws.
 *
 * A plain script that sets one global rather than an ES module, because the
 * standalone preview inlines it into a page that runs from the filesystem,
 * where module scripts are blocked.
 */
window.TERRELLA_DEMO = (() => {
  "use strict";

  /** ISO 3166-1 numeric ids, as world-atlas uses them. */
  const REGIONS = [
    {
      id: "africa",
      name: "Africa",
      countries: [12, 24, 72, 108, 120, 140, 148, 178, 180, 204, 226, 231, 232, 262,
                  266, 270, 288, 324, 384, 404, 426, 430, 434, 450, 454, 466, 478,
                  480, 504, 508, 516, 562, 566, 624, 646, 686, 690, 694, 706, 710,
                  716, 728, 729, 748, 768, 788, 800, 818, 834, 854, 894],
      highlight: [566, 404, 710],
    },
    {
      id: "sea",
      name: "Southeast Asia",
      countries: [96, 104, 116, 360, 418, 458, 608, 626, 702, 704],
      highlight: [608, 360, 704],
    },
    {
      id: "latam",
      name: "Latin America",
      countries: [32, 68, 76, 152, 170, 188, 214, 218, 222, 320, 340, 484, 558,
                  591, 600, 604, 858, 862],
      highlight: [76, 484, 170],
    },
  ];

  const MARKERS = [
    { name: "Lagos", coords: [3.4, 6.5], country: 566, timezone: "Africa/Lagos" },
    { name: "Nairobi", coords: [36.8, -1.3], country: 404, timezone: "Africa/Nairobi" },
    { name: "Johannesburg", coords: [28.0, -26.2], country: 710, timezone: "Africa/Johannesburg" },
    { name: "Manila", coords: [121.0, 14.6], country: 608, timezone: "Asia/Manila" },
    { name: "Jakarta", coords: [106.8, -6.2], country: 360, timezone: "Asia/Jakarta" },
    { name: "Hanoi", coords: [105.8, 21.0], country: 704, timezone: "Asia/Ho_Chi_Minh" },
    { name: "Bogota", coords: [-74.1, 4.7], country: 170, timezone: "America/Bogota" },
    { name: "Sao Paulo", coords: [-46.6, -23.5], country: 76, timezone: "America/Sao_Paulo" },
    { name: "Mexico City", coords: [-99.1, 19.4], country: 484, timezone: "America/Mexico_City" },
  ];

  const ARCS = [
    { from: [3.4, 6.5], to: [-46.6, -23.5] },
    { from: [121.0, 14.6], to: [-99.1, 19.4] },
  ];

  /**
   * `chart` is the globe on the light page and `ink` the globe on the dark
   * one; each is the other's counterpoint. `swatch` is the colour the picker
   * shows and `atmosphere` the rim the three.js renderer draws. `sphere`
   * overrides for the three.js texture, whose rim lifts every colour.
   */
  const PALETTES = {
    chart: {
      label: "Chart",
      swatch: "#d9481b",
      atmosphere: "#9a978c",
      sphere: { ocean: "#e9e7df", land: "#b8b5a7" },
      colors: {
        ocean: "#eeece5", land: "#d3d0c5", border: "#f6f5f0",
        region: "#a39f92", highlight: "#d9481b", marker: "#121212",
        markerRing: "#f6f5f0", rim: "rgba(18, 18, 18, 0.08)", arc: "#d9481b",
        outline: "#8c8a80",
      },
    },
    ink: {
      label: "Ink",
      swatch: "#131311",
      atmosphere: "#4a4943",
      sphere: { ocean: "#22221f", land: "#4d4c45" },
      colors: {
        ocean: "#1c1c19", land: "#3d3c37", border: "#131311",
        region: "#65645c", highlight: "#ff6a33", marker: "#efede6",
        markerRing: "#131311", rim: "rgba(0, 0, 0, 0.45)", arc: "#ff6a33",
        outline: "#8c8a80",
      },
    },
    ocean: {
      label: "Ocean",
      swatch: "#1c5fa8",
      atmosphere: "#4f86c6",
      colors: {
        ocean: "#e7edf4", land: "#c7d2dd", border: "#f6f5f0",
        region: "#8ca6c1", highlight: "#1c5fa8", marker: "#0e2b4d",
        markerRing: "#f6f5f0", rim: "rgba(14, 43, 77, 0.10)", arc: "#1c5fa8",
        outline: "#6f8aa6",
      },
    },
    ember: {
      label: "Ember",
      swatch: "#b4682c",
      atmosphere: "#c58b5a",
      colors: {
        ocean: "#f3ede3", land: "#dfd0bc", border: "#faf6ef",
        region: "#c6a27a", highlight: "#b4682c", marker: "#4a2a12",
        markerRing: "#faf6ef", rim: "rgba(102, 66, 38, 0.12)", arc: "#b4682c",
        outline: "#9a7a5a",
      },
    },
  };

  /**
   * The instrument ring drawn around every globe: a meridian circle with a
   * tick every five degrees and a label every ninety. Built here rather than
   * written into each page, since it is 80 elements of repetition.
   */
  function ringMarkup() {
    const centre = 500;
    const inner = 448;
    const point = (deg, r) => {
      const angle = ((deg - 90) * Math.PI) / 180;
      return [centre + Math.cos(angle) * r, centre + Math.sin(angle) * r];
    };
    const ticks = [];
    for (let deg = 0; deg < 360; deg += 5) {
      // The cardinal points carry a label instead of a tick.
      if (deg % 90 === 0) continue;
      const length = deg % 15 === 0 ? 13 : 7;
      const [x1, y1] = point(deg, inner);
      const [x2, y2] = point(deg, inner + length);
      ticks.push(`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`);
    }
    const labels = [0, 90, 180, 270].map((deg) => {
      const [x, y] = point(deg, inner + 12);
      return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle" dominant-baseline="central">${deg}°</text>`;
    });
    return (
      `<svg class="ring" viewBox="0 0 1000 1000" aria-hidden="true">` +
      `<circle cx="500" cy="500" r="438" fill="none" stroke="currentColor" stroke-opacity="0.35" stroke-width="1"/>` +
      `<g stroke="currentColor" stroke-opacity="0.7" stroke-width="1.5">${ticks.join("")}</g>` +
      labels.join("") +
      `</svg>`
    );
  }

  return { REGIONS, MARKERS, ARCS, PALETTES, ringMarkup };
})();
