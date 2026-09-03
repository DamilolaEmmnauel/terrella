import { createGlobe } from "../index";
import type {
  Arc,
  ColorScale,
  Country,
  CountryValues,
  GlobeInstance,
  GlobeOptions,
  Marker,
  Palette,
  ProjectionName,
  Region,
  StyleName,
} from "../types";

/**
 * `<terrella-globe>`: the globe as an HTML element.
 *
 *     <terrella-globe
 *       style-name="dots"
 *       theme="auto"
 *       regions='[{ "id": "sea", "countries": ["PH", "ID", "VN"] }]'
 *       markers='[{ "name": "Manila", "coords": [121, 14.6] }]'
 *       labels terminator hover-countries
 *     ></terrella-globe>
 *
 * For pages with no build step, and for tools (Webflow, Framer, a CMS) where
 * an element with attributes is the only thing that can be written. Simple
 * values are attributes; arrays and objects are JSON in attributes, or set
 * as properties from a script. The instance is on `.globe`.
 *
 * Interaction is reported as DOM events (`terrella:markerhover` and so on)
 * with the marker or country in `detail`, so a page listens the way it
 * listens to anything else.
 */

const TAG = "terrella-globe";

/** Attributes whose change is applied with a setter rather than a rebuild. */
const LIVE = [
  "style-name",
  "projection",
  "theme",
  "spin",
  "palette",
  "markers",
  "values",
  "focus",
  "labels",
  "terminator",
];
/** Attributes that shape the globe at construction. */
const STRUCTURAL = [
  "regions",
  "arcs",
  "hover-countries",
  "tilt",
  "longitude",
  "ratio",
  "scale",
  "dot-spacing",
  "label",
];

function readJson<T>(value: string | null): T | undefined {
  if (value === null || value === "") return undefined;
  try {
    return JSON.parse(value) as T;
  } catch {
    throw new Error(`terrella-globe: attribute is not valid JSON: ${value.slice(0, 40)}`);
  }
}

const readNumber = (value: string | null): number | undefined =>
  value === null || value === "" ? undefined : Number(value);

/** `labels` and `terminator` accept a bare attribute or JSON options. */
function readFlag<T>(value: string | null): boolean | T | undefined {
  if (value === null) return undefined;
  if (value === "" || value === "true") return true;
  if (value === "false") return false;
  return readJson<T>(value);
}

export class TerrellaGlobeElement extends HTMLElement {
  static get observedAttributes(): string[] {
    return [...LIVE, ...STRUCTURAL];
  }

  /** The live instance, once connected. */
  globe: GlobeInstance | null = null;

  /** Object options set as properties take precedence over attributes. */
  private props: Partial<GlobeOptions> = {};

  get regions(): Region[] | undefined {
    return this.props.regions;
  }
  set regions(value: Region[] | undefined) {
    this.props.regions = value;
    this.rebuild();
  }

  get markers(): Marker[] | undefined {
    return this.props.markers;
  }
  set markers(value: Marker[] | undefined) {
    this.props.markers = value;
    this.globe?.setMarkers(value ?? []);
  }

  get arcs(): Arc[] | undefined {
    return this.props.arcs;
  }
  set arcs(value: Arc[] | undefined) {
    this.props.arcs = value;
    this.rebuild();
  }

  get values(): CountryValues | undefined {
    return this.props.values;
  }
  set values(value: CountryValues | undefined) {
    this.props.values = value;
    this.globe?.setValues(value ?? null, this.props.scale);
  }

  get scale(): ColorScale | undefined {
    return this.props.scale;
  }
  set scale(value: ColorScale | undefined) {
    this.props.scale = value;
    this.globe?.setValues(this.props.values ?? null, value);
  }

  get palette(): Partial<Palette> | undefined {
    return this.props.palette;
  }
  set palette(value: Partial<Palette> | undefined) {
    this.props.palette = value;
    if (value) this.globe?.setPalette(value);
  }

  connectedCallback(): void {
    if (!this.style.display) this.style.display = "block";
    if (!this.style.position) this.style.position = "relative";
    this.build();
  }

  disconnectedCallback(): void {
    this.globe?.destroy();
    this.globe = null;
  }

  attributeChangedCallback(name: string, previous: string | null, value: string | null): void {
    if (!this.globe || previous === value) return;

    switch (name) {
      case "style-name":
        this.globe.setStyle((value as StyleName) ?? "solid");
        return;
      case "projection":
        this.globe.setProjection((value as ProjectionName) ?? "orthographic");
        return;
      case "theme":
        this.globe.setTheme((value as GlobeOptions["theme"]) ?? "light");
        return;
      case "spin":
        this.globe.setSpin(readNumber(value) ?? 0);
        return;
      case "palette":
        this.globe.setPalette(readJson<Partial<Palette>>(value) ?? {});
        return;
      case "markers":
        this.globe.setMarkers(readJson<Marker[]>(value) ?? []);
        return;
      case "values":
        this.globe.setValues(readJson<CountryValues>(value) ?? null);
        return;
      case "focus":
        void this.globe.focus(value || null);
        return;
      case "labels":
        this.globe.setLabels(readFlag(value) ?? false);
        return;
      case "terminator":
        this.globe.setTerminator(readFlag(value) ?? false);
        return;
      default:
        this.rebuild();
    }
  }

  private options(): GlobeOptions {
    const attribute = (name: string) => this.getAttribute(name);
    const fromAttributes: GlobeOptions = {
      style: (attribute("style-name") as StyleName | null) ?? undefined,
      projection: (attribute("projection") as ProjectionName | null) ?? undefined,
      theme: (attribute("theme") as GlobeOptions["theme"]) ?? undefined,
      spin: readNumber(attribute("spin")),
      tilt: readNumber(attribute("tilt")),
      longitude: readNumber(attribute("longitude")),
      ratio: readNumber(attribute("ratio")),
      dotSpacing: readNumber(attribute("dot-spacing")),
      label: attribute("label") ?? undefined,
      regions: readJson<Region[]>(attribute("regions")),
      markers: readJson<Marker[]>(attribute("markers")),
      arcs: readJson<Arc[]>(attribute("arcs")),
      values: readJson<CountryValues>(attribute("values")),
      scale: readJson<ColorScale>(attribute("scale")),
      palette: readJson<Partial<Palette>>(attribute("palette")),
      labels: readFlag(attribute("labels")),
      terminator: readFlag(attribute("terminator")),
      hoverCountries: attribute("hover-countries") !== null ? true : undefined,
      onMarkerHover: (marker) => this.emit("markerhover", marker),
      onMarkerClick: (marker) => this.emit("markerclick", marker),
      onCountryHover: (country) => this.emit("countryhover", country),
      onCountryClick: (country) => this.emit("countryclick", country),
    };

    // Undefined attributes must not override the defaults.
    const defined = Object.fromEntries(
      Object.entries(fromAttributes).filter(([, v]) => v !== undefined),
    ) as GlobeOptions;
    return { ...defined, ...this.props };
  }

  private emit(name: string, detail: Marker | Country | null): void {
    this.dispatchEvent(new CustomEvent(`terrella:${name}`, { detail, bubbles: true }));
  }

  private build(): void {
    if (!this.isConnected) return;
    this.globe = createGlobe(this, this.options());
    const focus = this.getAttribute("focus");
    if (focus) void this.globe.focus(focus, { duration: 0 });
  }

  private rebuild(): void {
    if (!this.globe) return;
    this.globe.destroy();
    this.build();
  }
}

/** Registers the element. Safe to call more than once. */
export function defineGlobeElement(tag = TAG): void {
  if (typeof customElements === "undefined") return;
  if (!customElements.get(tag)) customElements.define(tag, TerrellaGlobeElement);
}

export default defineGlobeElement;
