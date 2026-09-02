import { describe, it, expect } from "vitest";
import { Group, Matrix4, Vector3, Color } from "three";
import { createMarkers } from "../src/three/markers";
import { DEFAULT_PALETTE } from "../src/config";
import { lngLatToVector3 } from "../src/three/coords";
import type { Marker } from "../src/types";

/**
 * The 3D marker field.
 *
 * three.js constructs meshes fine without a GPU, so everything except the
 * actual raycast can be checked here. The raycast itself is verified in a
 * browser, because what matters there is that a marker behind the globe is
 * not hoverable, and that needs a real render.
 */

const markers: Marker[] = [
  { name: "Lagos", coords: [3.4, 6.5], country: 566 },
  { name: "Manila", coords: [121.0, 14.6], country: 608, color: "#ff0000" },
  { name: "Bogota", coords: [-74.1, 4.7], country: 170, size: 9 },
];

function build() {
  const group = new Group();
  const field = createMarkers(group, markers, 1, DEFAULT_PALETTE);
  return { group, field };
}

describe("createMarkers", () => {
  it("makes one instance per marker in both meshes", () => {
    const { field } = build();
    expect(field.mesh.count).toBe(3);
    expect(field.hitMesh.count).toBe(3);
  });

  it("keeps the hit mesh invisible but present in the scene", () => {
    // Invisible rather than transparent, because three's raycaster tests
    // layers and never `visible`. If this ever flips to being removed from the
    // group instead, hovering silently stops working.
    const { group, field } = build();
    expect(field.hitMesh.visible).toBe(false);
    expect(group.children).toContain(field.hitMesh);
  });

  it("gives the hit target a bigger radius than the visible marker", () => {
    // The visible markers are a few pixels across. Without a larger target,
    // hovering one is a pixel-hunt.
    const { field } = build();
    const visible = new Matrix4();
    const hit = new Matrix4();
    field.mesh.getMatrixAt(0, visible);
    field.hitMesh.getMatrixAt(0, hit);

    const scaleOf = (m: Matrix4) => new Vector3().setFromMatrixScale(m).x;
    expect(scaleOf(hit)).toBeGreaterThan(scaleOf(visible) * 2);
  });

  it("puts each instance where its coordinate says, just above the surface", () => {
    const { field } = build();
    const m = new Matrix4();

    markers.forEach((marker, i) => {
      field.mesh.getMatrixAt(i, m);
      const at = new Vector3().setFromMatrixPosition(m);
      const expected = lngLatToVector3(marker.coords, 1);

      // Same direction from the centre...
      expect(at.clone().normalize().distanceTo(expected)).toBeLessThan(1e-6);
      // ...and just clear of the surface, so it neither z-fights nor floats.
      expect(at.length()).toBeGreaterThan(1);
      expect(at.length()).toBeLessThan(1.02);
    });
  });

  it("honours a marker's own colour and falls back to the palette", () => {
    const { field } = build();
    const c = new Color();

    field.mesh.getColorAt(1, c);
    expect(c.getHexString()).toBe("ff0000");

    field.mesh.getColorAt(0, c);
    expect(c.getHexString()).toBe(new Color(DEFAULT_PALETTE.marker).getHexString());
  });

  it("scales a marker that asked to be bigger", () => {
    const { field } = build();
    const a = new Matrix4();
    const b = new Matrix4();
    field.mesh.getMatrixAt(0, a);  // default size
    field.mesh.getMatrixAt(2, b);  // size: 9
    const scaleOf = (m: Matrix4) => new Vector3().setFromMatrixScale(m).x;
    expect(scaleOf(b)).toBeGreaterThan(scaleOf(a));
  });

  it("takes everything back out of the scene when disposed", () => {
    // focus() rebuilds the markers on every change, so a leak here grows
    // without bound rather than being a one-off.
    const { group, field } = build();
    expect(group.children).toHaveLength(2);
    field.dispose();
    expect(group.children).toHaveLength(0);
  });
});
