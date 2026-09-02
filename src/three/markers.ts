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
  /**
   * A larger invisible copy, used only for hit-testing.
   *
   * The visible markers are about 0.011 of the globe's radius, which is a few
   * pixels on screen and near-impossible to put a cursor on. Raycasting a
   * bigger sphere gives the same generous target the 2D renderer gets from its
   * 14-pixel hit radius.
   *
   * Invisible objects are still raycastable: three's `intersect()` tests
   * `object.layers` and never `object.visible`, which is what makes this work
   * rather than needing a transparent material.
   */
  hitMesh: InstancedMesh;
  /** Positions in the group's local space, for placing labels. */
  positions: Vector3[];
  dispose: () => void;
}

/** How much larger the invisible hit spheres are than the visible markers. */
const HIT_SCALE = 3.2;

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

  // The hit target. Its own geometry is coarse on purpose: it is never seen,
  // and a raycast against it only needs to be approximately marker-shaped.
  const hitGeometry = new SphereGeometry(1, 8, 8);
  const hitMaterial = new MeshBasicMaterial();
  const hitMesh = new InstancedMesh(hitGeometry, hitMaterial, Math.max(1, markers.length));
  hitMesh.count = markers.length;
  hitMesh.visible = false;

  const dummy = new Object3D();
  const positions: Vector3[] = [];

  markers.forEach((marker, i) => {
    const at = lngLatToVector3(marker.coords, radius * LIFT);
    positions.push(at.clone());

    dummy.position.copy(at);
    // Radius is in the 2D renderer's CSS pixels, so it is scaled relative to
    // the sphere here rather than used directly.
    const size = ((marker.size ?? 4.5) / 400) * radius;
    dummy.scale.setScalar(size);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    mesh.setColorAt(i, new Color(marker.color ?? palette.marker));

    dummy.scale.setScalar(size * HIT_SCALE);
    dummy.updateMatrix();
    hitMesh.setMatrixAt(i, dummy.matrix);
  });

  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  hitMesh.instanceMatrix.needsUpdate = true;

  group.add(mesh);
  group.add(hitMesh);

  return {
    mesh,
    hitMesh,
    positions,
    dispose() {
      group.remove(mesh);
      group.remove(hitMesh);
      geometry.dispose();
      material.dispose();
      hitGeometry.dispose();
      hitMaterial.dispose();
      mesh.dispose();
      hitMesh.dispose();
    },
  };
}
