import type { Frame, PrepareContext, StyleName, StylePainter } from "../types";
import { solid } from "./solid";
import { dots } from "./dots";
import { wireframe } from "./wireframe";

/**
 * The style registry.
 *
 * Styles have different prepared-state types, so they cannot sit in one map
 * without erasing that type somewhere. Rather than erase it with a cast, each
 * entry is a function that prepares its own style and returns a painter with
 * the state already closed over. The state type stays known inside the entry
 * and is simply not visible outside it, which is what we actually want.
 */

/** A style with its prepared state bound in. Ready to draw frames. */
export interface PreparedStyle {
  name: string;
  paint: (frame: Frame) => void;
}

/** Runs a style's one-off preparation and binds the result to its painter. */
export function prepare<State>(
  style: StylePainter<State>,
  context: PrepareContext,
): PreparedStyle {
  const state = style.prepare?.(context) as State;
  return {
    name: style.name,
    paint: (frame) => style.paint(frame, state),
  };
}

type StyleEntry = (context: PrepareContext) => PreparedStyle;

const STYLE_ENTRIES: Record<StyleName, StyleEntry> = {
  solid: (context) => prepare(solid, context),
  dots: (context) => prepare(dots, context),
  wireframe: (context) => prepare(wireframe, context),
};

/** Every built-in style name, for building a picker. */
export const STYLE_NAMES = Object.keys(STYLE_ENTRIES) as StyleName[];

/**
 * Resolves a built-in name or a caller's own painter into something drawable.
 */
export function resolveStyle<State>(
  style: StyleName | StylePainter<State>,
  context: PrepareContext,
): PreparedStyle {
  if (typeof style !== "string") return prepare(style, context);

  const entry = STYLE_ENTRIES[style];
  if (!entry) {
    throw new Error(
      `terrella: unknown style "${style}". Known styles: ${STYLE_NAMES.join(", ")}`,
    );
  }
  return entry(context);
}

export { solid, dots, wireframe };
