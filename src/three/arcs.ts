import {
  TubeGeometry,
  CatmullRomCurve3,
  MeshBasicMaterial,
  Mesh,
  Color,
  type Group,
} from "three";
import type { Arc, Palette } from "../types";
import { greatCirclePoints } from "./coords";

/**
 * Arcs as tubes following a great circle.
 *
 * A tube rather than a line, because line width is not reliably supported
 * across platforms in WebGL: `linewidth` is silently ignored on most of them,
 * so a "2px" line renders as 1px and there is nothing to be done about it from
 * the material. Geometry is the only way to control the thickness.
 */

export interface ArcField {
  meshes: Mesh[];
  dispose: () => void;
}

export function createArcs(
  group: Group,
  arcs: Arc[],
  radius: number,
  palette: Palette,
): ArcField {
  const meshes: Mesh[] = [];

  for (const arc of arcs) {
    const points = greatCirclePoints(arc.from, arc.to, radius);
    const curve = new CatmullRomCurve3(points);

    const geometry = new TubeGeometry(
      curve,
      // Segments along the tube. The curve is already sampled at 64 points, so
      // matching it keeps the bow smooth without doubling the vertex count.
      64,
      ((arc.width ?? 1.4) / 500) * radius,
      6,
      false,
    );
    const material = new MeshBasicMaterial({
      color: new Color(arc.color ?? palette.arc),
      toneMapped: false,
    });

    const mesh = new Mesh(geometry, material);
    group.add(mesh);
    meshes.push(mesh);
  }

  return {
    meshes,
    dispose() {
      for (const mesh of meshes) {
        group.remove(mesh);
        mesh.geometry.dispose();
        (mesh.material as MeshBasicMaterial).dispose();
      }
    },
  };
}
