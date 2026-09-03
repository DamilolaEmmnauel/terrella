/**
 * A canvas context that writes SVG.
 *
 * Every style paints through the small part of `CanvasRenderingContext2D`
 * that d3's `geoPath` and the overlays use: paths, fills, strokes, a clip, a
 * radial gradient, some text. This implements exactly that subset and
 * records each operation as an element, so the same painters that draw the
 * live globe can produce a static SVG on a server, with no canvas and no DOM.
 *
 * It is not a general canvas. Anything a custom style calls beyond this
 * subset is a type error, which is the point: the contract is visible.
 */

/** What a style may call. `Frame.ctx` is typed as the real thing; this satisfies it structurally. */
export type PaintContext = Pick<
  CanvasRenderingContext2D,
  | "fillStyle"
  | "strokeStyle"
  | "lineWidth"
  | "globalAlpha"
  | "font"
  | "textAlign"
  | "textBaseline"
  | "lineJoin"
  | "lineCap"
  | "beginPath"
  | "moveTo"
  | "lineTo"
  | "arc"
  | "closePath"
  | "rect"
  | "fill"
  | "stroke"
  | "fillRect"
  | "clearRect"
  | "fillText"
  | "strokeText"
  | "save"
  | "restore"
  | "clip"
  | "createRadialGradient"
  | "setTransform"
>;

interface Gradient {
  id: string;
  cx: number;
  cy: number;
  r: number;
  inner: number;
  stops: Array<[number, string]>;
  addColorStop: (offset: number, color: string) => void;
}

const n = (value: number): string => {
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? "0" : String(rounded);
};

const escapeText = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Parses the size and family out of a CSS font shorthand. */
function parseFont(font: string): { size: string; family: string; weight: string } {
  const match = font.match(/(\d+(?:\.\d+)?)px\s+(.+)$/);
  const weight = font.match(/\b(bold|[1-9]00)\b/)?.[1] ?? "normal";
  return { size: match?.[1] ?? "12", family: match?.[2] ?? "sans-serif", weight };
}

export class SvgContext implements PaintContext {
  fillStyle: string | CanvasGradient | CanvasPattern = "#000";
  strokeStyle: string | CanvasGradient | CanvasPattern = "#000";
  lineWidth = 1;
  globalAlpha = 1;
  font = "10px sans-serif";
  textAlign: CanvasTextAlign = "start";
  textBaseline: CanvasTextBaseline = "alphabetic";
  lineJoin: CanvasLineJoin = "miter";
  lineCap: CanvasLineCap = "butt";

  private path: string[] = [];
  private body: string[] = [];
  private defs: string[] = [];
  private gradients = 0;
  private clips = 0;
  /** Open <g> elements per save() level, so restore() can close them. */
  private groupsPerSave: number[] = [];
  private openGroups = 0;

  beginPath(): void {
    this.path = [];
  }

  moveTo(x: number, y: number): void {
    this.path.push(`M${n(x)} ${n(y)}`);
  }

  lineTo(x: number, y: number): void {
    this.path.push(`L${n(x)} ${n(y)}`);
  }

  closePath(): void {
    this.path.push("Z");
  }

  rect(x: number, y: number, w: number, h: number): void {
    this.path.push(`M${n(x)} ${n(y)}h${n(w)}v${n(h)}h${n(-w)}Z`);
  }

  arc(x: number, y: number, r: number, start: number, end: number, anticlockwise = false): void {
    const sweep = end - start;
    if (Math.abs(sweep) >= Math.PI * 2 - 1e-9) {
      // A full circle cannot be one SVG arc; two halves can.
      this.path.push(
        `M${n(x + r)} ${n(y)}A${n(r)} ${n(r)} 0 1 1 ${n(x - r)} ${n(y)}A${n(r)} ${n(r)} 0 1 1 ${n(x + r)} ${n(y)}`,
      );
      return;
    }
    const sx = x + r * Math.cos(start);
    const sy = y + r * Math.sin(start);
    const ex = x + r * Math.cos(end);
    const ey = y + r * Math.sin(end);
    const large = Math.abs(sweep) > Math.PI ? 1 : 0;
    const direction = anticlockwise ? 0 : 1;
    this.path.push(
      `${this.path.length === 0 ? "M" : "L"}${n(sx)} ${n(sy)}A${n(r)} ${n(r)} 0 ${large} ${direction} ${n(ex)} ${n(ey)}`,
    );
  }

  private paint(style: string | CanvasGradient | CanvasPattern): string {
    if (typeof style === "string") return style;
    const gradient = style as unknown as Gradient;
    if (gradient.id) return `url(#${gradient.id})`;
    return "none";
  }

  private opacity(attribute: string): string {
    return this.globalAlpha < 1 ? ` ${attribute}="${n(this.globalAlpha)}"` : "";
  }

  fill(): void {
    if (this.path.length === 0) return;
    this.body.push(
      `<path d="${this.path.join("")}" fill="${this.paint(this.fillStyle)}"${this.opacity("fill-opacity")}/>`,
    );
  }

  stroke(): void {
    if (this.path.length === 0) return;
    const join = this.lineJoin !== "miter" ? ` stroke-linejoin="${this.lineJoin}"` : "";
    const cap = this.lineCap !== "butt" ? ` stroke-linecap="${this.lineCap}"` : "";
    this.body.push(
      `<path d="${this.path.join("")}" fill="none" stroke="${this.paint(this.strokeStyle)}" stroke-width="${n(this.lineWidth)}"${join}${cap}${this.opacity("stroke-opacity")}/>`,
    );
  }

  fillRect(x: number, y: number, w: number, h: number): void {
    this.body.push(
      `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="${this.paint(this.fillStyle)}"${this.opacity("fill-opacity")}/>`,
    );
  }

  clearRect(): void {
    // A fresh context is already clear; a style clearing mid-paint is not
    // something any of ours do, and it has no SVG equivalent.
  }

  private text(text: string, x: number, y: number, attributes: string): void {
    const { size, family, weight } = parseFont(this.font);
    const anchor =
      this.textAlign === "center" ? "middle" : this.textAlign === "right" || this.textAlign === "end" ? "end" : "start";
    const baseline = this.textBaseline === "middle" ? ` dominant-baseline="central"` : "";
    this.body.push(
      `<text x="${n(x)}" y="${n(y)}" font-size="${size}" font-family="${escapeText(family)}" font-weight="${weight}" text-anchor="${anchor}"${baseline}${attributes}${this.opacity("opacity")}>${escapeText(text)}</text>`,
    );
  }

  fillText(text: string, x: number, y: number): void {
    this.text(text, x, y, ` fill="${this.paint(this.fillStyle)}"`);
  }

  strokeText(text: string, x: number, y: number): void {
    this.text(
      text,
      x,
      y,
      ` fill="none" stroke="${this.paint(this.strokeStyle)}" stroke-width="${n(this.lineWidth)}" stroke-linejoin="round"`,
    );
  }

  save(): void {
    this.groupsPerSave.push(0);
  }

  restore(): void {
    const opened = this.groupsPerSave.pop() ?? 0;
    for (let i = 0; i < opened; i++) {
      this.body.push("</g>");
      this.openGroups--;
    }
  }

  clip(): void {
    const id = `clip${++this.clips}`;
    this.defs.push(`<clipPath id="${id}"><path d="${this.path.join("")}"/></clipPath>`);
    this.body.push(`<g clip-path="url(#${id})">`);
    this.openGroups++;
    const depth = this.groupsPerSave.length - 1;
    if (depth >= 0) this.groupsPerSave[depth] = (this.groupsPerSave[depth] ?? 0) + 1;
  }

  createRadialGradient(x0: number, y0: number, r0: number, _x1: number, _y1: number, r1: number): CanvasGradient {
    const gradient: Gradient = {
      id: `gradient${++this.gradients}`,
      cx: x0,
      cy: y0,
      r: r1,
      inner: r0,
      stops: [],
      addColorStop(offset, color) {
        this.stops.push([offset, color]);
      },
    };
    this.defs.push(gradient as unknown as string);
    return gradient as unknown as CanvasGradient;
  }

  setTransform(): void {
    // Device pixel scaling is a raster concern; SVG has none.
  }

  /** The recorded drawing, as the inside of an <svg> element. */
  render(): string {
    while (this.openGroups > 0) {
      this.body.push("</g>");
      this.openGroups--;
    }
    const defs = this.defs
      .map((entry) => {
        if (typeof entry === "string") return entry;
        const g = entry as unknown as Gradient;
        // Canvas gradients run from an inner radius; SVG's run from the centre,
        // so the stops are remapped onto the outer circle.
        const scale = g.r > 0 ? g.inner / g.r : 0;
        const stops = g.stops
          .map(([offset, color]) => {
            const at = scale + offset * (1 - scale);
            return `<stop offset="${n(at)}" stop-color="${escapeText(color)}"/>`;
          })
          .join("");
        return `<radialGradient id="${g.id}" gradientUnits="userSpaceOnUse" cx="${n(g.cx)}" cy="${n(g.cy)}" r="${n(g.r)}">${stops}</radialGradient>`;
      })
      .join("");
    return (defs ? `<defs>${defs}</defs>` : "") + this.body.join("");
  }
}
