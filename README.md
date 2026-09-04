# terrella

An interactive globe for the web. Highlight countries and regions, place
markers, draw arcs, colour countries by number, and choose how it looks. One
API, three outputs: a small 2D canvas, a real sphere with WebGPU, and static
SVG from a server.

A terrella is a small model of the Earth. William Gilbert built one in 1600 to
study magnetism, which is roughly what this is.

See it running at [terrella.damilolaemmanuel.com](https://terrella.damilolaemmanuel.com).

<p align="center">
  <img src="docs/screenshot.png" alt="A globe with Africa highlighted and markers on Lagos, Nairobi and Johannesburg" width="45%">
  <img src="docs/screenshot-dots.png" alt="The same globe in the dotted style" width="45%">
</p>

```sh
npm install terrella
```

```js
import { createGlobe } from "terrella";
import { world } from "terrella/world";

const globe = createGlobe(document.querySelector("#globe"), {
  world,
  regions: [{ id: "sea", name: "Southeast Asia", countries: ["PH", "ID", "VN"] }],
  markers: [{ name: "Manila", coords: [121.0, 14.6], timezone: "Asia/Manila" }],
  onCountryClick: (country) => console.log(country.name),
});

globe.focus("sea");
```

Drag to spin, flick to throw, hover a marker for its local time, hover a
country for its name, arrow keys to turn.

## Why this exists

Most lightweight globe libraries do markers and arcs but cannot highlight a
country. The ones that can are built on three.js and cost hundreds of
kilobytes. terrella is the middle: countries, regions, choropleths and labels
on a 2D canvas with d3-geo doing the projection maths, and the same options
on a sphere when you want one.

The fiddly parts are the same in every hand-rolled globe, and they are what
this actually solves:

- Country ids. The atlas uses ISO numeric codes; you have "NG". Both work.
- Markers that hide as they pass the horizon, because an orthographic
  projection happily draws the far side onto the near side.
- A drag that feels like a throw rather than a jump, and a camera that
  glides rather than cuts.
- Not animating at all when someone has asked their machine to stop moving.
- A globe that reads on a dark page as well as a light one.

## Sizes

| Build | Gzipped |
| --- | --- |
| `terrella` (ESM, d3-geo external) | 20 KB |
| `terrella/world` (the bundled atlas) | 39 KB |
| `terrella/three` | three.js is a peer dependency, on top |
| `dist/terrella.global.js` (everything, one script tag) | 70 KB |

## Naming countries

Anywhere a country is named, use an ISO 3166-1 numeric code (4, "4" or
"004"), an alpha-2 code ("NG") or an alpha-3 code ("NGA"). Case does not
matter. Whole continents and UN sub-regions come from `countriesIn`:

```js
import { countriesIn, country, countryName } from "terrella";

countriesIn("Africa");                 // 60 numeric ids
countriesIn("South-eastern Asia");
country("NG");                         // { id: "566", alpha2: "NG", name: "Nigeria", region: "Africa", ... }
countryName(566);                      // "Nigeria"
```

## The atlas

Pass any TopoJSON with a `countries` object, or use the bundled one
(world-atlas countries-110m, 39 KB gzipped):

```js
import { world } from "terrella/world";
createGlobe(el, { world });

// or once, for every globe afterwards
import "terrella/world/register";
createGlobe(el, { regions });
```

The browser build registers it for you, so a page with one script tag needs
nothing else.

## Regions and countries

```js
regions: [
  {
    id: "africa",
    name: "Africa",
    countries: countriesIn("Africa"),
    highlight: ["NG", "KE", "ZA"],   // painted in the highlight colour
    color: "#a9cdec",                // optional, else the palette's region colour
  },
]
```

`focus("africa")` glides the camera to the region's centroid and shows only
that region. `focus(null)` releases it. Countries under the pointer are
reported and lit:

```js
createGlobe(el, {
  world,
  hoverCountries: true,                  // implied by either callback
  onCountryHover: (country) => ...,      // null when the pointer leaves land
  onCountryClick: (country, event) => ...,
});
```

## Values

A number per country becomes a choropleth. The default ramp runs from the
land colour to the highlight; give a `scale` for anything else.

```js
createGlobe(el, {
  world,
  values: { NG: 213, ET: 120, EG: 109, CD: 99 },
  scale: { range: ["#edf4fb", "#1769a8"] },     // or (value) => colour
});

globe.setValues({ NG: 220 });
```

## Markers, arcs, labels

```js
markers: [{ name: "Manila", coords: [121, 14.6], timezone: "Asia/Manila", color, size }],
arcs: [{ from: [3.4, 6.5], to: [-46.6, -23.5] }],
labels: true,   // or { markers: true, countries: "regions" | "all" | ["NG", "KE"] }
```

Labels sit at each country's centroid, hide past the horizon, fade toward
the limb, and are drawn with a halo so they read on any palette.

## The camera

```js
await globe.focus("sea");                     // glides over 900 ms
await globe.focus("sea", { duration: 0 });    // jumps
await globe.flyTo([121, 14.6]);               // face a coordinate
await globe.flyTo({ longitude: 20, tilt: -10 });

const tour = globe.tour(
  [{ region: "africa" }, { at: [121, 14.6] }, { region: "latam", dwell: 4000 }],
  { dwell: 2500, loop: true },
);
tour.stop();
```

Dragging cancels a glide in progress. Under reduced motion every move is a
cut.

## Styles

Seven built in. Pass `style` at construction or call `setStyle` later.

| Style | What it draws |
| --- | --- |
| `solid` | Flat country fills with hairline seams. The default. |
| `dots` | Land as a field of dots, fading toward the limb. |
| `wireframe` | Coastlines over a graticule. |
| `hatched` | Diagonal rules clipped to the land: the engraved map. |
| `pixel` | Blocks on a coarse grid. |
| `ascii` | Characters, solid at the centre and dissolving at the limb. |
| `stipple` | Jittered dots of varying weight: the engraver's hand. |

Write your own by passing an object. `prepare` runs once and whatever it
returns is handed to every `paint`:

```js
globe.setStyle({
  name: "my-style",
  prepare: ({ land, countries }) => ({ /* expensive work, once */ }),
  paint: (frame, state) => {
    frame.ctx.fillStyle = frame.palette.land;
    frame.ctx.beginPath();
    frame.path(frame.land);
    frame.ctx.fill();
  },
});
```

A style written once works in every output: the 2D canvas, the sphere's
texture, and the SVG renderer.

## Colour and theme

Nine colours, any subset. Three layers, each overriding the last: a theme
preset, `--terrella-*` custom properties on the element, and `palette`.

```js
createGlobe(el, { world, theme: "auto" });   // follows the system, live
globe.setTheme("dark");
globe.setPalette({ highlight: "#d9481b" });
```

```css
#globe { --terrella-land: #d3d0c5; --terrella-highlight: #d9481b; }
```

Palette keys: `ocean`, `land`, `border`, `region`, `highlight`, `marker`,
`markerRing`, `rim`, `arc`, and optionally `dot`, `outline`, `hover`, `label`.

## Day and night

```js
createGlobe(el, { world, terminator: true });
createGlobe(el, { world, terminator: { date: new Date("2026-06-21T12:00Z"), opacity: 0.4 } });
```

The night side follows the real sun and moves once a minute.

## Projections

```js
globe.setProjection("naturalEarth");   // "orthographic" | "naturalEarth" | "equirectangular"
```

## Three renderers, one API

```js
import { createGlobe } from "terrella";          // 2D canvas
import { createGlobe } from "terrella/three";    // a sphere: WebGPU, WebGL2 elsewhere
import { renderSVG } from "terrella/svg";        // a string, anywhere
```

The three.js renderer takes the same options plus `atmosphere`,
`atmosphereColor`, `background`, `zoom` and `textureSize`, and returns the
same instance plus `scene`, `camera`, `renderer` and `controls`. Every style
is drawn into an equirectangular texture by the same painters, so a style
written for one works on the other. It cannot change projection: a sphere is
the projection.

`renderSVG` needs no browser:

```js
const svg = renderSVG({ world, regions, markers, labels: true, longitude: 20, width: 800 });
```

Every live instance also has `toSVG()`, which renders exactly what is on
screen.

## React

```jsx
import { Globe } from "terrella/react";
import { world } from "terrella/world";

<Globe world={world} regions={regions} markers={markers} globeStyle="dots" focus="sea" />
```

Every option is a prop; the render style is `globeStyle` because `style` is
CSS in React. Props with a setter change the globe in place, the rest rebuild
it. For server rendering, pass the SVG as `fallback` and the canvas replaces
it on mount:

```jsx
<Globe world={world} regions={regions} fallback={renderSVG({ world, regions })} />
```

## HTML element

For pages with no build step, or tools where an element is the only thing you
can write:

```html
<script src="https://unpkg.com/terrella/dist/terrella.global.js"></script>

<terrella-globe
  style-name="dots" theme="auto" labels terminator
  regions='[{ "id": "sea", "countries": ["PH", "ID", "VN"] }]'
  markers='[{ "name": "Manila", "coords": [121, 14.6] }]'
></terrella-globe>

<script>
  document.querySelector("terrella-globe")
    .addEventListener("terrella:countryclick", (e) => console.log(e.detail.name));
</script>
```

Arrays are JSON in attributes or properties set from a script. Events:
`terrella:markerhover`, `terrella:markerclick`, `terrella:countryhover`,
`terrella:countryclick`. The instance is on `.globe`.

## Accessibility

On by default. The canvas takes focus and the arrow keys turn it (shift for
bigger steps, Home to reset). A visually hidden block lists every region's
countries and gives every marker a button that turns the globe to it. Set
`accessible: false` if the page describes the globe itself.

## Instance

| Call | What it does |
| --- | --- |
| `focus(id, { duration })` | Glide to a region and hold. `null` releases. |
| `flyTo(coords \| { longitude, tilt }, { duration })` | Face a point and hold. |
| `tour(stops, { dwell, loop })` | Visit stops in turn. Returns `{ stop, finished }`. |
| `setStyle(style)` | A name, or your own painter. |
| `setProjection(name)` | 2D only. |
| `setPalette(colors)` | Merge new colours in. |
| `setTheme(theme)` | Swap the preset and re-read CSS custom properties. |
| `setMarkers(list)` | Replace the markers. |
| `setValues(values, scale)` | Replace the choropleth. `null` clears. |
| `setLabels(options)` | Switch labels on, off, or change them. |
| `setTerminator(options)` | Switch the night side on, off, or move it. |
| `setSpin(degreesPerSecond)` | Ambient rotation. Zero holds still. |
| `longitude` | The longitude at the centre now. |
| `toSVG({ width })` | What is on screen, as SVG. |
| `destroy()` | Stop the loop and remove everything. |

## Options

| Option | Default | |
| --- | --- | --- |
| `world` | the registered default | TopoJSON with a `countries` object |
| `style` | `"solid"` | |
| `projection` | `"orthographic"` | |
| `theme` | `"light"` | `"light"`, `"dark"`, `"auto"` |
| `palette` | | any subset of the nine colours |
| `regions`, `markers`, `arcs`, `values`, `scale` | | see above |
| `labels`, `terminator` | off | |
| `hoverCountries` | on when a country callback is given | |
| `spin` | `3.2` | degrees per second |
| `tilt`, `longitude` | `-14`, `18` | the starting view |
| `ratio` | `1` | canvas height as a multiple of width |
| `radius` | `0.46` | sphere radius as a fraction of width |
| `draggable`, `tooltips`, `accessible` | on | |
| `pulseMs` | `1600` | marker pulse period; 0 disables |
| `respectReducedMotion` | on | |
| `dotSpacing`, `dotSize` | `2.2`, `1.1` | for the sampled styles |
| `label`, `locale` | | aria-label override; clock locale |
| `onMarkerHover`, `onMarkerClick`, `onCountryHover`, `onCountryClick` | | |

## Data

`data/countries-110m.json` is world-atlas 110m (Natural Earth, public
domain). `data/iso3166.csv` is the ISO 3166-1 table with UN M49 regions;
`npm run iso3166` regenerates `src/data/iso3166.ts` from it.

## Seeing it without installing anything

`preview.html` at the repo root is a single self-contained file: open it in a
browser and it runs, with no server, no build and no network. One globe is
pinned on the page and each step of the copy drives it with a real call.

It is generated. Edit `demo/preview.template.html` and run:

```sh
npm run preview
```

The page chrome lives in `demo/demo.css` and the regions, markers and palettes
in `demo/demo-data.js`; both are inlined by the build and shared with the two
development pages under `demo/`, which do need a build and a local server.
Fonts are the one thing fetched from the network; offline, the page falls back
to the system fonts and everything else still works.

## Development

```sh
npm install
npm test          # vitest
npm run typecheck
npm run lint
npm run build
npm run demo      # then open http://localhost:8080/demo/
```

## Licence

MIT. Country data is public domain (Natural Earth) and CC BY-SA 4.0 (the ISO
table's regional codes).
