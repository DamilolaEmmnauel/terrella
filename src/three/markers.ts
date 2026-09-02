import {
  InstancedMesh,
  SphereGeometry,
  MeshBasicMaterial,
  Object3D,
  Color,
  Vector3,
  type Group,
} from "three";
import type { Marker, Palette } from "../types";
import { lngLatToVector3 } from "./coords";

/**
 * Markers as one instanced mesh.
 *
 * One draw call however many there are, which is the rule the device's
 * performance guidance sets for "many transforms, one material". A hundred
 * separate meshes would be a hundred draw calls for a few hundred triangles
 * each, which is the wrong way round.
 *
 * They sit fractionally above the surface. Exactly on it and they z-fight with
 * the sphere; any higher and they visibly float when the globe is turned so
 * they sit near the limb.
 */

const LIFT = 1.008;

export interface MarkerField {
  mesh: InstancedMesh;
  /** World positions, so the host can hit-test or place labels. */
  positions: Vector3[];
  dispose: () => void;
}

export function createMarkers(
  group: Group,
  markers: Marker[],
  radius: number,
  palette: Palette,
): MarkerField {
  const geometry = new SphereGeometry(1, 12, 12);
  const material = new MeshBasicMaterial({ toneMapped: false });
  const mesh = new InstancedMesh(geometry, material, Math.max(1, markers.length));
  mesh.count = markers.length;

  const dummy = new Object3D();
  const positions: Vector3[] = [];

  markers.forEach((marker, i) => {
    const at = lngLatToVector3(marker.coords, radius * LIFT);
    positions.push(at.clone());

    dummy.position.copy(at);
    // Radius is in the 2D renderer's CSS pixels, so it is scaled relative to
    // the sphere here rather than used directly.
    dummy.scale.setScalar(((marker.size ?? 4.5) / 400) * radius);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    mesh.setColorAt(i, new Color(marker.color ?? palette.marker));
  });

  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

  group.add(mesh);

  return {
    mesh,
    positions,
    dispose() {
      group.remove(mesh);
      geometry.dispose();
      material.dispose();
      mesh.dispose();
    },
  };
}
