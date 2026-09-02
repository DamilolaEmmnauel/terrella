import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: ["src/index.ts"],
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    clean: true,
    // d3-geo and topojson-client stay external for the module builds so a host
    // app that already depends on them does not ship a second copy.
    external: ["d3-geo", "topojson-client"],
  },
  {
    // The browser build is the opposite trade: one file that works from a CDN
    // with no install and no import map, so everything is bundled in.
    entry: { terrella: "src/index.ts" },
    format: ["iife"],
    globalName: "terrella",
    outExtension: () => ({ js: ".global.js" }),
    minify: true,
    sourcemap: true,
    noExternal: ["d3-geo", "topojson-client"],
  },
]);
