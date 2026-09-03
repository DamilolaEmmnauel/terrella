import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: [
      "src/index.ts",
      "src/three/index.ts",
      "src/svg/index.ts",
      "src/element/index.ts",
      "src/react/index.tsx",
      "src/world/index.ts",
      "src/world/register.ts",
    ],
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    clean: true,
    // d3-geo and topojson-client stay external for the module builds so a host
    // app that already depends on them does not ship a second copy.
    external: [
      "d3-geo",
      "topojson-client",
      "three",
      "three/webgpu",
      "three/tsl",
      /^three\/addons\//,
      "react",
      "react/jsx-runtime",
    ],
  },
  {
    // Only the 2D renderer gets a standalone browser build. Bundling three.js
    // into it would be a few hundred KB for a file whose whole point is that a
    // plain HTML page can drop it in.
    // The browser build is the opposite trade: one file that works from a CDN
    // with no install and no import map, so everything is bundled in.
    entry: { terrella: "src/global.ts" },
    format: ["iife"],
    globalName: "terrella",
    outExtension: () => ({ js: ".global.js" }),
    minify: true,
    sourcemap: true,
    noExternal: ["d3-geo", "topojson-client"],
  },
]);
