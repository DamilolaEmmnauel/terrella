import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type CSSProperties,
  type ReactElement,
} from "react";
import { createGlobe } from "../index";
import type { GlobeInstance, GlobeOptions } from "../types";

export type { GlobeInstance, GlobeOptions } from "../types";

/**
 * `<Globe>`: the globe as a React component.
 *
 *     import { Globe } from "terrella/react";
 *     import { world } from "terrella/world";
 *
 *     <Globe world={world} regions={regions} markers={markers} focus="sea" />
 *
 * Every option is a prop, except that the render style is `globeStyle`,
 * since `style` is the element's CSS in React. Props with a setter
 * (globeStyle, projection, palette, theme, spin, markers, values, focus) are
 * applied in place when they change; the rest rebuild the globe, which is
 * what they would do in any framework because they shape it at construction.
 *
 * On the server, pass `fallback` (the output of `renderSVG` from
 * `terrella/svg`) and the same picture is in the HTML before any script
 * runs. The canvas replaces it on mount.
 */
export interface GlobeProps extends Omit<GlobeOptions, "style"> {
  className?: string;
  /** CSS for the host element. */
  style?: CSSProperties;
  /** The render style: a built-in name or your own painter. */
  globeStyle?: GlobeOptions["style"];
  /** Region to focus, or null to drift. */
  focus?: string | null;
  /** Server-rendered markup shown until the canvas takes over. */
  fallback?: string;
  onReady?: (globe: GlobeInstance) => void;
}

/** The props that change the globe in place. Everything else rebuilds it. */
const LIVE_PROPS = new Set<keyof GlobeProps>([
  "style",
  "globeStyle",
  "className",
  "fallback",
  "onReady",
  "focus",
  "projection",
  "palette",
  "theme",
  "spin",
  "markers",
  "values",
  "scale",
  "onMarkerHover",
  "onMarkerClick",
  "onCountryHover",
  "onCountryClick",
]);

/** A key that changes when any structural prop does, so the effect reruns. */
function structuralKey(props: GlobeProps): string {
  const structural = Object.entries(props).filter(
    ([key, value]) => !LIVE_PROPS.has(key as keyof GlobeProps) && typeof value !== "function",
  );
  return JSON.stringify(structural.map(([key, value]) => [key, key === "world" ? "world" : value]));
}

export const Globe = forwardRef<GlobeInstance | null, GlobeProps>(function Globe(props, ref): ReactElement {
  const { className, style, globeStyle, focus, fallback, ...options } = props;
  const host = useRef<HTMLDivElement>(null);
  const globe = useRef<GlobeInstance | null>(null);
  // Callbacks are read through a ref so a new closure each render does not
  // rebuild the globe.
  const latest = useRef(props);
  latest.current = props;

  useImperativeHandle(ref, () => globe.current as GlobeInstance, []);

  const key = structuralKey(props);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    // The server-rendered picture is replaced by the live one.
    element.innerHTML = "";

    const { style: _css, globeStyle: renderStyle, ...current } = latest.current;
    const instance = createGlobe(element, {
      ...current,
      style: renderStyle,
      onMarkerHover: (m) => latest.current.onMarkerHover?.(m),
      onMarkerClick: (m, e) => latest.current.onMarkerClick?.(m, e),
      onCountryHover: (c) => latest.current.onCountryHover?.(c),
      onCountryClick: (c, e) => latest.current.onCountryClick?.(c, e),
    });
    globe.current = instance;
    if (latest.current.focus) void instance.focus(latest.current.focus, { duration: 0 });
    latest.current.onReady?.(instance);

    return () => {
      instance.destroy();
      globe.current = null;
    };
    // `key` stands in for every structural prop.
  }, [key, options.world]);

  useEffect(() => {
    if (globeStyle) globe.current?.setStyle(globeStyle);
  }, [globeStyle]);
  useEffect(() => {
    if (options.projection) globe.current?.setProjection(options.projection);
  }, [options.projection]);
  useEffect(() => {
    if (options.palette) globe.current?.setPalette(options.palette);
  }, [options.palette]);
  useEffect(() => {
    if (options.theme) globe.current?.setTheme(options.theme);
  }, [options.theme]);
  useEffect(() => {
    if (options.spin !== undefined) globe.current?.setSpin(options.spin);
  }, [options.spin]);
  useEffect(() => {
    if (options.markers) globe.current?.setMarkers(options.markers);
  }, [options.markers]);
  useEffect(() => {
    globe.current?.setValues(options.values ?? null, options.scale);
  }, [options.values, options.scale]);
  useEffect(() => {
    if (focus !== undefined) void globe.current?.focus(focus);
  }, [focus]);

  return (
    <div
      ref={host}
      className={className}
      style={{ position: "relative", ...style }}
      dangerouslySetInnerHTML={fallback ? { __html: fallback } : undefined}
    />
  );
});

export default Globe;
