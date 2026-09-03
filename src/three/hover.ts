import { Raycaster, Vector2, Vector3, Matrix4, type Camera, type Mesh, type Object3D } from "three";
import type { InstancedMesh } from "three";
import { renderTooltip } from "../interaction";
import type { Country, Marker } from "../types";
import { country as lookupCountry } from "../countries";

/**
 * Hovering a marker in 3D.
 *
 * The 2D renderer hit-tests in screen space against the positions it just
 * drew, which it can do because it drew them. Here the markers are geometry in
 * a scene, so the equivalent is a raycast.
 *
 * The part that is easy to get wrong is occlusion. A raycast against the
 * markers alone happily hits one on the *far* side of the planet, so the
 * cursor picks up a city that is behind the globe and the tooltip appears over
 * empty ocean. The globe itself is therefore included in the raycast, and a
 * marker only counts when nothing is in front of it. Sorting by distance is
 * already done for us: `Raycaster.intersectObjects` returns hits nearest
 * first, so the test is simply whether the first hit is a marker.
 */

export interface HoverOptions {
  /** The positioned wrapper the tooltip is appended to. */
  element: HTMLElement;
  canvas: HTMLCanvasElement;
  camera: Camera;
  /** The sphere, so markers behind it are not hoverable. */
  globe: Mesh;
  locale?: string;
  onHover?: (marker: Marker | null) => void;
  onClick?: (marker: Marker, event: MouseEvent) => void;
  /** Names the country at a coordinate. Enables country hover when given. */
  countryAt?: (at: [number, number]) => string | null;
  onCountryHover?: (country: Country | null) => void;
  onCountryClick?: (country: Country, event: MouseEvent) => void;
}

export interface HoverHandle {
  /** Swaps in a new marker set, e.g. after focus() rebuilt them. */
  setTargets: (hitMesh: InstancedMesh, markers: Marker[]) => void;
  /** Call once per frame: the globe turns, so the tooltip has to follow. */
  update: () => void;
  readonly hovered: Marker | null;
  /** Id of the country under the pointer, or null. */
  readonly hoveredCountry: string | null;
  dispose: () => void;
}

export function createHover(options: HoverOptions): HoverHandle {
  const { element, canvas, camera, globe, locale } = options;

  const tooltip = document.createElement("div");
  tooltip.className = "terrella__tip";
  element.appendChild(tooltip);

  const raycaster = new Raycaster();
  const pointer = new Vector2();
  const worldPosition = new Vector3();
  const instanceMatrix = new Matrix4();

  let hitMesh: InstancedMesh | null = null;
  let markers: Marker[] = [];
  let hoveredIndex = -1;
  let hoveredCountry: string | null = null;
  let pointerCss: [number, number] = [0, 0];
  // Null when the pointer has left the canvas, so a stale position cannot keep
  // a tooltip alive after the cursor is gone.
  let pointerInside = false;

  function setHover(index: number): void {
    if (hoveredIndex === index) return;
    hoveredIndex = index;

    if (index === -1) {
      tooltip.classList.remove("is-on");
      canvas.style.cursor = "";
      options.onHover?.(null);
      return;
    }

    const marker = markers[index];
    if (!marker) return;
    renderTooltip(tooltip, marker, locale);
    tooltip.classList.add("is-on");
    canvas.style.cursor = "pointer";
    options.onHover?.(marker);
  }

  /** Where a marker instance currently is, in world space. */
  function instanceWorldPosition(index: number, target: Vector3): Vector3 | null {
    if (!hitMesh) return null;
    hitMesh.getMatrixAt(index, instanceMatrix);
    target.setFromMatrixPosition(instanceMatrix);
    // The instance matrix is local to the mesh, which is inside the rotating
    // group, so it has to be taken through the mesh's world matrix.
    return target.applyMatrix4(hitMesh.matrixWorld);
  }

  /**
   * The sphere's UV unwrap runs linearly in longitude and latitude, in the
   * same convention `lngLatToVector3` uses, so a hit's uv is a coordinate.
   */
  function countryAtUv(uv: { x: number; y: number } | undefined): string | null {
    if (!uv || !options.countryAt) return null;
    return options.countryAt([uv.x * 360 - 180, uv.y * 180 - 90]);
  }

  function setHoveredCountry(id: string | null): void {
    const resolved: Country | null = id ? lookupCountry(id) : null;
    const next = resolved ? id : null;
    if (hoveredCountry === next) return;
    hoveredCountry = next;

    if (hoveredIndex === -1) {
      if (resolved) {
        renderTooltip(tooltip, { name: resolved.name });
        tooltip.classList.add("is-on");
        tooltip.style.left = `${pointerCss[0]}px`;
        tooltip.style.top = `${pointerCss[1]}px`;
      } else {
        tooltip.classList.remove("is-on");
      }
      canvas.style.cursor = resolved ? "pointer" : "";
    }
    options.onCountryHover?.(resolved);
  }

  function pick(): void {
    if (!pointerInside) {
      setHover(-1);
      setHoveredCountry(null);
      return;
    }

    raycaster.setFromCamera(pointer, camera);

    // Both, in one query: nearest-first ordering is what decides whether a
    // marker is in front of the globe or behind it.
    const targets: Object3D[] = hitMesh && markers.length > 0 ? [globe, hitMesh] : [globe];
    const hits = raycaster.intersectObjects(targets, false);

    const first = hits[0];
    if (first && first.object === hitMesh && first.instanceId !== undefined) {
      setHover(first.instanceId);
      setHoveredCountry(null);
      return;
    }

    setHover(-1);
    setHoveredCountry(first && first.object === globe ? countryAtUv(first.uv) : null);
  }

  function positionTooltip(): void {
    if (hoveredIndex === -1) return;

    const at = instanceWorldPosition(hoveredIndex, worldPosition);
    if (!at) return;

    // World space to normalised device coordinates to CSS pixels within the
    // wrapper, which is what the tooltip is positioned against.
    const projected = at.clone().project(camera);
    const rect = canvas.getBoundingClientRect();

    tooltip.style.left = `${((projected.x + 1) / 2) * rect.width}px`;
    tooltip.style.top = `${((1 - projected.y) / 2) * rect.height}px`;
  }

  const onPointerMove = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    pointerCss = [event.clientX - rect.left, event.clientY - rect.top];
    pointer.x = (pointerCss[0] / rect.width) * 2 - 1;
    pointer.y = -(pointerCss[1] / rect.height) * 2 + 1;
    pointerInside = true;
    pick();
    if (hoveredCountry && hoveredIndex === -1) {
      tooltip.style.left = `${pointerCss[0]}px`;
      tooltip.style.top = `${pointerCss[1]}px`;
    }
  };

  const onPointerLeave = () => {
    pointerInside = false;
    setHover(-1);
  };

  const onClick = (event: MouseEvent) => {
    const marker = hoveredIndex === -1 ? null : markers[hoveredIndex];
    if (marker) {
      options.onClick?.(marker, event);
      return;
    }
    const resolved = hoveredCountry ? lookupCountry(hoveredCountry) : null;
    if (resolved) options.onCountryClick?.(resolved, event);
  };

  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerleave", onPointerLeave);
  canvas.addEventListener("click", onClick);

  return {
    get hovered() {
      return hoveredIndex === -1 ? null : (markers[hoveredIndex] ?? null);
    },

    get hoveredCountry() {
      return hoveredCountry;
    },

    setTargets(nextMesh, nextMarkers) {
      hitMesh = nextMesh;
      markers = nextMarkers;
      // The index referred to the old set, so it means nothing now.
      setHover(-1);
    },

    update() {
      // Re-picking every frame rather than only on pointer move: the globe
      // turns under a stationary cursor, so a marker can arrive at or leave
      // the pointer without the pointer moving at all.
      pick();
      positionTooltip();
    },

    dispose() {
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      canvas.removeEventListener("click", onClick);
      tooltip.remove();
    },
  };
}
