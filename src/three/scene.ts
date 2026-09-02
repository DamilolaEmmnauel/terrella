import {
  Mesh,
  SphereGeometry,
  CanvasTexture,
  SRGBColorSpace,
  DirectionalLight,
  AmbientLight,
  Group,
  Color,
  type Scene,
} from "three";
import { MeshStandardNodeMaterial, MeshBasicNodeMaterial } from "three/webgpu";
import {
  positionWorld,
  cameraPosition,
  normalWorldGeometry,
  uniform,
  color,
  vec4,
  texture as tslTexture,
} from "three/tsl";
import { BackSide } from "three";

/**
 * The globe mesh and its atmosphere.
 *
 * The atmosphere is a fresnel rim on a slightly larger back-faced sphere,
 * which is the approach the official `webgpu_tsl_earth` example uses and the
 * reason this reads as a planet rather than a textured ball.
 *
 * It is deliberately restrained. The device's 3D quality gate calls out
 * "primitives plus a glow" as an automatic failure, and a globe is a sphere by
 * definition, so the detail has to come from the map: crisp coastlines at
 * texture resolution, real country fills, markers that sit where they belong.
 * The atmosphere is the finish on top of that, never the thing carrying it.
 *
 * Materials are written in TSL rather than GLSL strings, so they keep standard
 * lighting and survive three.js upgrades.
 */

export interface GlobeSceneOptions {
  scene: Scene;
  mapCanvas: HTMLCanvasElement;
  radius: number;
  /** Sphere tessellation. 64 is smooth at any reasonable on-screen size. */
  segments?: number;
  atmosphereColor?: string;
  /** 0 removes the atmosphere entirely. */
  atmosphereStrength?: number;
  lit?: boolean;
}

export interface GlobeScene {
  /** Everything that rotates together: sphere, atmosphere, markers, arcs. */
  group: Group;
  /** The sphere itself, for adding children in its local space. */
  globe: Mesh;
  /** Call after redrawing the map canvas. */
  refreshTexture: () => void;
  setAtmosphereColor: (next: string) => void;
  dispose: () => void;
}

export function createGlobeScene(options: GlobeSceneOptions): GlobeScene {
  const {
    scene,
    mapCanvas,
    radius,
    segments = 64,
    atmosphereColor = "#4db2ff",
    atmosphereStrength = 1,
    lit = true,
  } = options;

  const group = new Group();

  const mapTexture = new CanvasTexture(mapCanvas);
  mapTexture.colorSpace = SRGBColorSpace;
  // The texture is read at a grazing angle around the limb, where without
  // anisotropy the coastlines smear into mush.
  mapTexture.anisotropy = 8;

  const geometry = new SphereGeometry(radius, segments, segments);

  const globeMaterial = new MeshStandardNodeMaterial();
  // The map is a diagram, not a photograph: a specular highlight sliding over
  // it looks like a bug rather than like a planet.
  globeMaterial.roughness = 1;
  globeMaterial.metalness = 0;

  // Fresnel: 0 facing the viewer, 1 at the limb.
  const viewDirection = positionWorld.sub(cameraPosition).normalize();
  const fresnel = viewDirection.dot(normalWorldGeometry).abs().oneMinus().toVar();

  // Shade the map toward the limb.
  //
  // This is the thing that makes it read as a sphere rather than as a circle
  // with a ring round it. A flat diagrammatic texture has no shading of its
  // own, so without this the silhouette is the only depth cue and the result
  // is a sticker. It is the same trick the 2D renderer uses for its rim, which
  // also keeps the two renderers looking like the same library.
  const curvature = fresnel.pow(2.2).mul(uniform(0.42)).oneMinus();
  globeMaterial.colorNode = tslTexture(mapTexture).mul(curvature);

  const globe = new Mesh(geometry, globeMaterial);
  group.add(globe);

  const atmosphereTint = uniform(color(atmosphereColor));

  let atmosphere: Mesh | null = null;
  if (atmosphereStrength > 0) {
    const atmosphereMaterial = new MeshBasicNodeMaterial({
      side: BackSide,
      transparent: true,
      depthWrite: false,
    });

    // The alpha has to reach zero AT the shell's silhouette, not peak there.
    //
    // Both wrong versions of this drew a hard blue outline, for the same
    // reason: `fresnel.pow(n)` is largest exactly where the shell ends, so the
    // haze was brightest at the precise pixel it stopped existing. remap
    // inverts that, running the alpha from full at fresnel 0.73 down to zero
    // at 1, so it fades out before the edge and there is nothing to see a line
    // against. This is the falloff the official webgpu_tsl_earth example uses.
    const alpha = fresnel
      .remap(0.73, 1, 1, 0)
      .pow(3)
      .mul(0.75 * atmosphereStrength);
    atmosphereMaterial.outputNode = vec4(atmosphereTint, alpha);

    atmosphere = new Mesh(geometry, atmosphereMaterial);
    atmosphere.scale.setScalar(1.035);
    group.add(atmosphere);
  }

  scene.add(group);

  // Lighting. A single key light plus strong ambient: the map already carries
  // its own contrast, so a dramatic key would only fight it. The terminator is
  // deliberately soft rather than a hard day/night line.
  const lights: Array<DirectionalLight | AmbientLight> = [];
  if (lit) {
    const key = new DirectionalLight(0xffffff, 1.6);
    key.position.set(2, 1.2, 3);
    scene.add(key);
    lights.push(key);

    const fill = new AmbientLight(0xffffff, 1.4);
    scene.add(fill);
    lights.push(fill);
  } else {
    // Unlit: the texture is shown exactly as drawn, which is what a flat
    // diagrammatic look wants.
    const flat = new AmbientLight(0xffffff, 3.15);
    scene.add(flat);
    lights.push(flat);
  }

  return {
    group,
    globe,

    refreshTexture() {
      mapTexture.needsUpdate = true;
    },

    setAtmosphereColor(next) {
      atmosphereTint.value = new Color(next);
    },

    dispose() {
      scene.remove(group);
      for (const light of lights) scene.remove(light);
      geometry.dispose();
      mapTexture.dispose();
      globeMaterial.dispose();
      if (atmosphere) (atmosphere.material as MeshBasicNodeMaterial).dispose();
    },
  };
}
