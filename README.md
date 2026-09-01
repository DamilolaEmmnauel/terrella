# region-globe

An interactive orthographic globe that highlights groups of countries and puts
markers on them. Drag to spin, flick to throw, hover a marker for its local time.

Drawn on a canvas rather than as SVG, so a few hundred country paths animate at
60fps without a thousand DOM nodes. No build step, no framework, about 400 lines.

![A globe with Africa highlighted and markers on Lagos, Nairobi and Johannesburg](docs/screenshot.png)

## Why this exists

Every "countries we operate in" globe gets rebuilt from scratch, and the fiddly
parts are always the same: which country ids the atlas actually uses, hiding
markers once they pass the horizon, making a drag feel like a throw rather than
a jump, and not animating when someone has asked their machine to stop moving.

This is those parts, solved once.

## Install

```sh
npm install region-globe d3-geo d3-array topojson-client
```

`d3-geo` and `topojson-client` are peer dependencies rather than bundled, so a
page already using d3 does not ship it twice. `d3-geo` needs `d3-array` at
runtime.

Or use it straight from a CDN with no install at all — see `demo/index.html`.

## Use

```js
import { createGlobe } from "region-globe";
import "region-globe/globe.css";

const world = await fetch("/countries-110m.json").then((r) => r.json());

const globe = createGlobe(document.querySelector("#globe"), {
  world,
  regions: [
    {
      id: "africa",
      name: "Africa",
      countries: ["566", "404", "710", "231", "288"],  // ISO 3166-1 numeric
      highlight: ["566", "404", "710"],                 // a stronger colour
      markers: ["Lagos", "Nairobi", "Johannesburg"],    // shown when focused
      longitude: 20,                                    // where to park it
    },
  ],
  markers: [
    { name: "Lagos", coords: [3.38, 6.52], timezone: "Africa/Lagos" },
    { name: "Nairobi", coords: [36.8, -1.3], timezone: "Africa/Nairobi" },
    { name: "Johannesburg", coords: [28.0, -26.2], timezone: "Africa/Johannesburg" },
  ],
});
```

The wrapper needs to be positioned and have a width. The canvas takes its height
from that width, so give the wrapper a width and nothing else.

```css
#globe { position: relative; width: 100%; max-width: 560px; }
```

## Country ids

Regions are lists of **ISO 3166-1 numeric** codes, as strings, because that is
what the world-atlas topojson uses. Nigeria is `"566"`, not `"NG"` and not `566`.
Leading zeros matter: Algeria is `"012"`.

The library pads what you pass, so `12`, `"12"` and `"012"` all work.

`data/countries-110m.json` is included. It is the 1:110m Natural Earth atlas via
[world-atlas](https://github.com/topojson/world-atlas), public domain. Swap in
`countries-50m.json` for more coastline detail at about four times the size.

## Options

| Option | Default | What it does |
| --- | --- | --- |
| `world` | required | The topojson atlas |
| `regions` | `[]` | `{ id, name, countries, highlight, markers, color, highlightColor, longitude, tilt }` |
| `markers` | `[]` | `{ name, coords: [lon, lat], timezone, color, size }` |
| `spin` | `3.2` | Ambient rotation, degrees per second. `0` holds still |
| `tilt` | `-14` | Axial tilt in degrees |
| `longitude` | `18` | Starting longitude at the centre |
| `ratio` | `1` | Canvas height as a multiple of width |
| `radius` | `0.46` | Sphere radius as a fraction of width |
| `draggable` | `true` | Drag to rotate, with momentum |
| `tooltips` | `true` | Hover a marker for its name and local time |
| `pulseMs` | `1600` | Marker pulse period. `0` disables it |
| `respectReducedMotion` | `true` | Draw one frame instead of animating |
| `palette` | see below | Colours |
| `locale` | system | Passed to `Intl.DateTimeFormat` for marker times |
| `onMarkerHover` | — | `(marker \| null) => void` |
| `onMarkerClick` | — | `(marker, event) => void` |

### Palette

```js
palette: {
  ocean: "#edf4fb",
  land: "#cdd8e3",        // countries in no region
  border: "#ffffff",      // seams
  region: "#a9cdec",      // a region's countries
  highlight: "#2ea6f5",   // that region's `highlight` list
  marker: "#1769a8",
  markerRing: "#ffffff",
  rim: "rgba(43, 69, 95, 0.10)",   // the shading that reads as curvature
}
```

## Methods

```js
globe.focus("africa");   // park that region facing the viewer, paint only it,
                         // show only its markers, stop the ambient spin
globe.focus(null);       // release it back to drifting

globe.setSpin(0);        // change rotation without touching anything else
globe.longitude;         // current centre longitude, degrees
globe.canvas;            // the canvas element
globe.destroy();         // stop the loop and remove what it added
```

## Accessibility

The canvas gets `role="img"` and a label naming the regions; pass `label` to
write your own. With `prefers-reduced-motion: reduce` the globe draws one frame
and stays put, rather than spinning behind someone who asked it not to.

A canvas globe is a picture, not a data table. If the regions carry information
a reader needs, put it in the page as text too.

## Run the demo

```sh
npm run demo      # then open http://localhost:8080/demo/
```

## Notes on the fiddly parts

**Markers past the horizon.** An orthographic projection happily returns
coordinates for a point on the far side of the sphere, so markers appear to
float over the wrong continent. They are hidden by great-circle distance from
the point facing the viewer, not by checking whether the projection returned
something.

**Flick, glide, drift.** On release the throw velocity decays exponentially back
to the ambient spin, so the three phases are one motion. The pointer velocity is
low-passed, or a single stuttery sample sends the globe flying.

**Land drawn twice.** All countries are merged into one shape for the base fill,
then only the countries in a region are drawn individually. Filling 170 separate
paths every frame is the easy way to make this expensive.

## Licence

MIT. The atlas data is public domain.
