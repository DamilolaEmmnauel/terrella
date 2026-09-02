#!/usr/bin/env node
/**
 * Builds the standalone preview page.
 *
 * The two demos under demo/ need an install, a build and a local server before
 * they show anything, which means nobody evaluating the library can simply
 * look at it. This produces one file that opens by double-clicking, works with
 * no network, and runs both renderers.
 *
 * Everything is inlined rather than fetched because the page is meant to be
 * opened from the filesystem: `fetch` of a neighbouring file fails under
 * file://, and ES modules are blocked there too. So the bundle is an IIFE
 * loaded by a classic script tag, and the world atlas is a JS literal rather
 * than JSON on disk.
 *
 * The output is generated and should not be hand-edited. Edit
 * demo/preview.template.html and run `npm run preview`.
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const scratch = mkdtempSync(join(tmpdir(), "terrella-preview-"));

/** Marker comments in the template that get replaced with real content. */
const SLOTS = {
  gsap: "/*__GSAP__*/",
  library: "/*__TERRELLA__*/",
  world: "/*__WORLD__*/",
};

try {
  // One bundle with both renderers and every dependency, as an IIFE so the
  // page needs no import map and no module scripts.
  const entry = join(scratch, "entry.ts");
  writeFileSync(
    entry,
    [
      `export { createGlobe as createGlobe2D } from ${JSON.stringify(join(root, "src/index.ts"))};`,
      `export { createGlobe as createGlobe3D } from ${JSON.stringify(join(root, "src/three/index.ts"))};`,
    ].join("\n"),
  );

  const bundle = join(scratch, "terrella.js");
  execFileSync(
    "npx",
    [
      "esbuild",
      entry,
      "--bundle",
      "--format=iife",
      "--global-name=terrella",
      "--minify",
      "--target=es2020",
      `--outfile=${bundle}`,
    ],
    { cwd: root, stdio: ["ignore", "ignore", "inherit"] },
  );

  const template = readFileSync(join(root, "demo/preview.template.html"), "utf8");
  const css = readFileSync(join(root, "src/terrella.css"), "utf8");

  const parts = {
    gsap: [
      readFileSync(join(root, "node_modules/gsap/dist/gsap.min.js"), "utf8"),
      readFileSync(join(root, "node_modules/gsap/dist/ScrollTrigger.min.js"), "utf8"),
    ].join("\n"),
    library: readFileSync(bundle, "utf8"),
    // A JS literal, not JSON on disk: fetch() cannot read a sibling file when
    // the page is opened from the filesystem.
    world: `window.__WORLD__ = ${readFileSync(join(root, "data/countries-110m.json"), "utf8")};`,
  };

  let output = template;
  for (const [name, slot] of Object.entries(SLOTS)) {
    if (!output.includes(slot)) {
      throw new Error(`preview template is missing the ${name} slot (${slot})`);
    }
    // A function replacer, so a "$&" or "$1" appearing anywhere in a minified
    // bundle is not treated as a substitution pattern.
    output = output.replace(slot, () => parts[name]);
  }

  output = output.replace("/*__TERRELLA_CSS__*/", () => css);

  const target = join(root, "preview.html");
  writeFileSync(target, output);

  const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
  console.log(`preview.html written: ${kb(Buffer.byteLength(output))}`);
  console.log(`  library ${kb(parts.library.length)}  world ${kb(parts.world.length)}  gsap ${kb(parts.gsap.length)}`);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
