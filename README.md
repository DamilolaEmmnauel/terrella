# terrella

An interactive globe for the web. Highlight countries and regions, place
markers, and choose how it looks.

A terrella is a small model of the Earth. William Gilbert built one in 1600 to
study magnetism, which is roughly what this is.

<p align="center">
  <img src="docs/screenshot.png" alt="A globe with Africa highlighted and markers on Lagos, Nairobi and Johannesburg" width="45%">
  <img src="docs/screenshot-dots.png" alt="The same globe in the dotted style" width="45%">
</p>

```sh
npm install terrella
```

```js
import { createGlobe } from "terrella";
import world from "world-atlas/countries-110m.json";

const globe = createGlobe(document.querySelector("#globe"), {
  world,
  regions: [
    { id: "sea", name: "Southeast Asia", countries: [608, 360, 704] },
  ],
  markers: [
    { name: "Manila", coords: [121.0, 14.6], country: 608, timezone: "Asia/Manila" },
  ],
});

globe.focus("sea");
```

Drag to spin, flick to throw, hover a marker for its local time.

## Why this exists

Most lightweight globe libraries do markers and arcs but cannot highlight
countries. The ones that can are built on three.js and cost hundreds of
kilobytes. terrella is the middle: country and region highlighting on a 2D
canvas, with d3-geo doing the projection maths.

The fiddly parts are the same in every hand-rolled globe, and they are what
this actually solves:

- Which country ids the atlas uses, and the fact that yours are probably not
  padded the same way.
- Hiding markers once they pass the horizon, because an orthographic
  projection happily projects the far side of the world onto the near side.
- Making a drag feel like a throw rather than a jump.
- Not animating at all when someone has asked their machine to stop moving.
- Aiming the camera at a region without working the angle out by hand.

## Styles

Three built in. Pass `style` at construction or call `setStyle` later.

| Style | What it draws |
| --- | --- |
| `solid` | Flat country fills with hairline seams. The default. |
| `dots` | Land as a field of dots, fading toward the limb. |
| `wireframe` | Coastlines over a graticule. |

```js
globe.setStyle("dots");
```

Write your own by passing an object instead of a name. `prepare` runs once and
whatever it returns is handed to every `paint`:

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

## Projections

`orthographic` (a globe, the default), `equirectangular` and `naturalEarth`
(flat maps). Everything else works the same in all three.

```js
globe.setProjection("naturalEarth");
```

## Regions

A region is a group of ISO 3166-1 numeric country ids treated as one thing.
Ids can be numbers or strings, padded or not.

```js
{
  id: "africa",
  name: "Africa",
  countries: [566, 404, 710, 818],
  highlight: [566],          // a subset, painted in highlightColor
  color: "#a9cdec",
  highlightColor: "#2ea6f5",
}
```

`focus(id)` parks that region facing the viewer and stops the drift. If the
region has no `longitude`, the camera aims at the centroid of its countries,
computed as a vector average so a region spanning the antimeridian does not end
up centred on the Atlantic. `focus(null)` releases it.

## Colours

Every colour is in one palette object, and any subset can be overridden.

```js
globe.setPalette({ ocean: "#f1f4f7", land: "#c6ced8", highlight: "#3c5570" });
```

Two entries are derived rather than required. A colour that reads well as a
filled continent disappears as scattered dots, so the `dots` style pushes
`land` away from `ocean` unless you set `dot` yourself, and `wireframe` does
the same for its coastline unless you set `outline`. The direction follows the
background's luminance, so this works on a dark palette too.

## API

```ts
createGlobe(element, options) => GlobeInstance
```

| Option | Default | |
| --- | --- | --- |
| `world` | required | TopoJSON with a `countries` object |
| `style` | `"solid"` | Name or your own painter |
| `projection` | `"orthographic"` | |
| `regions` | `[]` | |
| `markers` | `[]` | |
| `arcs` | `[]` | Great-circle lines between two points |
| `palette` | see above | Any subset |
| `spin` | `3.2` | Degrees per second; 0 holds still |
| `tilt` | `-14` | Degrees of axial tilt |
| `longitude` | `18` | Starting longitude at the centre |
| `ratio` | `1` | Canvas height as a multiple of its width |
| `radius` | `0.46` | Sphere radius as a fraction of width |
| `draggable` | `true` | |
| `tooltips` | `true` | |
| `pulseMs` | `1600` | Marker pulse period; 0 disables |
| `respectReducedMotion` | `true` | Draw one still frame instead of animating |
| `dotSpacing` | `2.2` | Degrees between dots in the `dots` style |
| `dotSize` | `1.1` | Dot radius in pixels |
| `label` | derived | Overrides the canvas aria-label |
| `locale` | browser | For marker clock formatting |
| `onMarkerHover` | | `(marker \| null) => void` |
| `onMarkerClick` | | `(marker, event) => void` |

The instance exposes `focus`, `setStyle`, `setProjection`, `setPalette`,
`setSpin`, `setMarkers`, `longitude`, `canvas` and `destroy`.

## Data

Any TopoJSON with a `countries` object works. `world-atlas`'s `countries-110m`
is the usual one, and a copy is in `data/` so the demo runs without a network.

## From a CDN

`dist/terrella.global.js` bundles d3-geo and topojson-client into one file that
defines `window.terrella`, so a plain HTML page needs no build step. The `npm`
build keeps them external so an app already using d3 does not ship it twice.

## Accessibility

The canvas carries `role="img"` and a generated label naming the regions.
`prefers-reduced-motion` draws a single still frame and disables dragging.
Nothing here is keyboard-operable yet, which is the main gap.

## Performance

The land dots need to know which grid points are on land. Doing that with
`geoContains` took 2.4 seconds at the default spacing and 65 seconds at a tight
one, all on the main thread. The land is instead rasterised once into a small
offscreen bitmap, after which each test is one array read: the same work is now
about 6ms. Total dots are capped at 40,000, because past that it stops reading
as a globe and starts costing frames.

Countries are drawn from one merged land shape rather than 177 separate fills,
and only the countries belonging to a region are painted individually.

## Known gaps

- No keyboard control.
- Antarctica can overflow the ocean shape slightly in flat projections.
- Zoom is not implemented; the sphere is a fixed size.
- No WebGL renderer yet. The plan is a `terrella/three` entry point behind this
  same API, for textures and lighting.

## Development

```sh
npm install
npm test          # vitest
npm run typecheck
npm run build
npm run demo      # then open http://localhost:8080/demo/
```

## Licence

MIT.
