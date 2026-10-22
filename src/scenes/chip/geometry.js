// Derived from frozen DeepSeek V2 asset (69d8113). Geometry/assembly retained;
// demo CPU modules and their invented routes are deliberately excluded.
// Production uses the installed Three.js, never the prototype vendor bundle.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import {
  createBrandTexture,
  createDeckCircuitTexture,
  createSerialTexture,
  createStripGlowTexture,
} from './textures.js';
import { clamp, smootherstep } from './utils.js';

/**
 * Unified chip-local coordinate system.
 *
 *   +X ... chip right
 *   +Y ... up / cover side
 *   +Z ... chip front
 *   (0, 0, 0) is the geometric center of the finished package, including pins.
 *
 * Every persistent part stores a fixed assembled transform. Exploded poses are
 * derived once from those transforms; animation only interpolates between the
 * two, so repeating open/close cycles cannot accumulate drift.
 */
const CHIP_WIDTH = 11.2;
const CHIP_DEPTH = 8.4;
const DECK_TOP = -0.02;
const COVER_Y = 0.68;
// The brand carrier rests directly on the cover seat lip:
//   cover group Y .......... 0.680
//   seat lip top ........... -0.0875 (local to cover)
//   carrier bottom ......... -0.075  (local to brand group)
// => 0.680 - 0.0875 + 0.075 = 0.6675
const BRAND_Y = 0.6675;
const PIN_ORIGIN_Y = -0.52;

const TOP_COVER_ASSEMBLED = Object.freeze({
  position: new THREE.Vector3(0, COVER_Y, 0),
  quaternion: new THREE.Quaternion(),
});

const BRAND_PLATE_ASSEMBLED = Object.freeze({
  position: new THREE.Vector3(0, BRAND_Y, 0),
  quaternion: new THREE.Quaternion(),
});

const TOP_COVER_EXPLODE_OFFSET = Object.freeze(new THREE.Vector3(0.4, 1.58, -0.24));
const BRAND_PLATE_EXPLODE_OFFSET = Object.freeze(new THREE.Vector3(-0.28, 2.5, 0.32));

const TOP_COVER_EXPLODE_TILT = Object.freeze(new THREE.Euler(0.02, -0.035, 0.015, 'XYZ'));
const BRAND_PLATE_EXPLODE_TILT = Object.freeze(new THREE.Euler(0.14, 0.055, -0.012, 'XYZ'));

export const CHIP_SPEC = Object.freeze({
  width: CHIP_WIDTH,
  depth: CHIP_DEPTH,
  pinSpanWidth: 12.068,
  pinSpanDepth: 9.268,
  packageHeight: 1.746,
  worldLift: 1.36,
  modelOrigin: 'geometric-center',
});

function createMaterials() {
  return {
    metal: new THREE.MeshPhysicalMaterial({
      color: 0xbec6cd,
      metalness: 0.86,
      roughness: 0.34,
      clearcoat: 0.3,
      clearcoatRoughness: 0.28,
      envMapIntensity: 1.55,
    }),
    metalBright: new THREE.MeshPhysicalMaterial({
      color: 0xe1e6ea,
      metalness: 0.92,
      roughness: 0.22,
      clearcoat: 0.45,
      clearcoatRoughness: 0.16,
      envMapIntensity: 1.7,
    }),
    metalDark: new THREE.MeshStandardMaterial({
      color: 0x47505a,
      metalness: 0.86,
      roughness: 0.44,
      envMapIntensity: 1.1,
    }),
    metalShadow: new THREE.MeshStandardMaterial({
      color: 0x1b2229,
      metalness: 0.8,
      roughness: 0.48,
      envMapIntensity: 0.9,
    }),
    ceramic: new THREE.MeshPhysicalMaterial({
      color: 0x070a0e,
      metalness: 0.55,
      roughness: 0.18,
      clearcoat: 0.68,
      clearcoatRoughness: 0.2,
      envMapIntensity: 1.12,
    }),
    brandGlass: new THREE.MeshPhysicalMaterial({
      color: 0x05070a,
      metalness: 0.55,
      roughness: 0.15,
      clearcoat: 0.9,
      clearcoatRoughness: 0.12,
      envMapIntensity: 1.25,
    }),
    substrate: new THREE.MeshStandardMaterial({
      color: 0x030506,
      metalness: 0.35,
      roughness: 0.53,
      envMapIntensity: 0.55,
    }),
    deck: new THREE.MeshStandardMaterial({
      color: 0x0a1015,
      metalness: 0.64,
      roughness: 0.42,
      envMapIntensity: 1.05,
    }),
    deckDetail: new THREE.MeshStandardMaterial({
      color: 0x202830,
      metalness: 0.8,
      roughness: 0.38,
      envMapIntensity: 1,
    }),
    pin: new THREE.MeshStandardMaterial({
      color: 0xdde4e9,
      metalness: 0.88,
      roughness: 0.3,
      envMapIntensity: 1.75,
    }),
    screw: new THREE.MeshStandardMaterial({
      color: 0xc8d0d6,
      metalness: 0.92,
      roughness: 0.26,
      envMapIntensity: 1.55,
    }),
    accent: new THREE.MeshBasicMaterial({
      color: 0x62c2ff,
      transparent: true,
      opacity: 0.1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }),
    blueLight: new THREE.MeshBasicMaterial({
      color: 0x439fdf,
      transparent: true,
      opacity: 0.68,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }),
    blueLightCore: new THREE.MeshBasicMaterial({
      color: 0x8ad7ff,
      transparent: true,
      opacity: 0.9,
      toneMapped: false,
    }),
    darkSlot: new THREE.MeshBasicMaterial({
      color: 0x010203,
      transparent: true,
      opacity: 0.9,
      toneMapped: false,
    }),
  };
}

function createRounded(width, height, depth, radius = 0.05, segments = 3) {
  return new RoundedBoxGeometry(width, height, depth, segments, radius);
}

function addRoundedMesh(group, geometry, material, x, y, z, options = {}) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  if (options.rotationY) mesh.rotation.y = options.rotationY;
  if (options.rotationZ) mesh.rotation.z = options.rotationZ;
  mesh.castShadow = options.castShadow ?? true;
  mesh.receiveShadow = options.receiveShadow ?? true;
  if (options.renderOrder !== undefined) mesh.renderOrder = options.renderOrder;
  group.add(mesh);
  return mesh;
}

function addBeam(group, width, height, depth, x, y, z, material, rotationY = 0) {
  return addRoundedMesh(
    group,
    createRounded(width, height, depth, 0.05, 2),
    material,
    x,
    y,
    z,
    { rotationY },
  );
}

function addScrew(group, materials, x, y, z, radius = 0.052) {
  const geometry = new THREE.CylinderGeometry(radius, radius, 0.018, 12);
  const screw = new THREE.Mesh(geometry, materials.screw);
  screw.position.set(x, y, z);
  screw.castShadow = true;
  screw.receiveShadow = true;
  group.add(screw);

  const inner = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.18, radius * 0.18, 0.022, 8),
    materials.darkSlot,
  );
  inner.position.set(x, y + 0.012, z);
  group.add(inner);
  return screw;
}

function buildSubstrate(materials) {
  const group = new THREE.Group();
  group.name = 'Substrate';

  // Lower package. The three layers are centered on X/Z and stacked on a shared
  // local Y axis so every later part can reference the same package datum.
  addRoundedMesh(
    group,
    createRounded(CHIP_WIDTH - 0.12, 0.2, CHIP_DEPTH - 0.12, 0.2, 3),
    materials.substrate,
    0,
    -0.55,
    0,
  );
  addRoundedMesh(
    group,
    createRounded(CHIP_WIDTH - 0.24, 0.3, CHIP_DEPTH - 0.24, 0.22, 3),
    materials.ceramic,
    0,
    -0.3,
    0,
  );

  // A subtle silver seam band around the package. Its four rails share the same
  // half-extents, which keeps the body visually symmetric in top and side views.
  const bandY = -0.33;
  const bandHeight = 0.11;
  addBeam(group, 10.84, bandHeight, 0.12, 0, bandY, CHIP_DEPTH / 2 - 0.19, materials.metalDark);
  addBeam(group, 10.84, bandHeight, 0.12, 0, bandY, -CHIP_DEPTH / 2 + 0.19, materials.metalDark);
  addBeam(group, 0.12, bandHeight, 7.9, CHIP_WIDTH / 2 - 0.19, bandY, 0, materials.metalDark);
  addBeam(group, 0.12, bandHeight, 7.9, -CHIP_WIDTH / 2 + 0.19, bandY, 0, materials.metalDark);

  const deck = addRoundedMesh(
    group,
    createRounded(10.14, 0.14, 7.38, 0.14, 3),
    materials.deck,
    0,
    DECK_TOP - 0.07,
    0,
  );
  deck.name = 'InternalDeck';

  return group;
}

function buildOuterFrame(materials) {
  const group = new THREE.Group();
  group.name = 'OuterFrame';

  // Fixed lower chassis collar. It is deliberately inset from the outer pins
  // and visually keys into the substrate side band.
  const collarY = -0.25;
  addBeam(group, 10.52, 0.1, 0.16, 0, collarY, 4.01, materials.metalDark);
  addBeam(group, 10.52, 0.1, 0.16, 0, collarY, -4.01, materials.metalDark);
  addBeam(group, 0.16, 0.1, 7.8, 5.26, collarY, 0, materials.metalDark);
  addBeam(group, 0.16, 0.1, 7.8, -5.26, collarY, 0, materials.metalDark);

  addBeam(group, 10.32, 0.02, 0.04, 0, collarY + 0.061, 4.01, materials.metalBright);
  addBeam(group, 10.32, 0.02, 0.04, 0, collarY + 0.061, -4.01, materials.metalBright);
  addBeam(group, 0.04, 0.02, 7.6, 5.26, collarY + 0.061, 0, materials.metalBright);
  addBeam(group, 0.04, 0.02, 7.6, -5.26, collarY + 0.061, 0, materials.metalBright);

  // Four machined support pylons sit directly under the cover's contact pads.
  // They remain fixed when the cover lifts, making the assembled relationship
  // legible without any horizontal staging.
  for (const x of [-5.07, 5.07]) {
    for (const z of [-3.66, 3.66]) {
      addRoundedMesh(
        group,
        createRounded(0.38, 0.035, 0.38, 0.04, 2),
        materials.metalDark,
        x,
        -0.145,
        z,
      );
      addRoundedMesh(
        group,
        createRounded(0.22, 0.61, 0.22, 0.035, 2),
        materials.metal,
        x,
        0.195,
        z,
      );
      addRoundedMesh(
        group,
        createRounded(0.31, 0.035, 0.31, 0.03, 2),
        materials.metalBright,
        x,
        0.515,
        z,
      );
      addScrew(group, materials, x, 0.537, z, 0.03);
    }
  }

  // Small, symmetric corner blocks join the collar to the pylons.
  for (const x of [-5.07, 5.07]) {
    for (const z of [-3.66, 3.66]) {
      addRoundedMesh(
        group,
        createRounded(0.34, 0.09, 0.34, 0.04, 2),
        materials.metalDark,
        x,
        -0.22,
        z,
      );
    }
  }

  return group;
}

function buildPinArray(materials) {
  const group = new THREE.Group();
  group.name = 'PinArray';
  group.add(buildPinField(materials));
  return group;
}

function buildDecorativeDetails(materials, textures) {
  const group = new THREE.Group();
  group.name = 'DecorativeDetails';

  const deckTexture = createDeckCircuitTexture();
  const deckSilkscreen = new THREE.Mesh(
    new THREE.PlaneGeometry(9.92, 7.2),
    new THREE.MeshBasicMaterial({
      map: deckTexture,
      transparent: true,
      opacity: 0.58,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  deckSilkscreen.rotation.x = -Math.PI / 2;
  deckSilkscreen.position.y = DECK_TOP + 0.002;
  deckSilkscreen.renderOrder = 1;
  group.add(deckSilkscreen);

  addCornerHardware(group, materials);
  addDeckComponents(group, materials);

  // Cold-blue package lighting. It is attached to the fixed substrate, not the
  // removable cover, so the light line stays put through the whole teardown.
  const frontLight = new THREE.Mesh(
    new THREE.BoxGeometry(CHIP_WIDTH * 0.76, 0.016, 0.016),
    materials.blueLightCore,
  );
  frontLight.position.set(0, -0.31, CHIP_DEPTH / 2 + 0.008);
  frontLight.renderOrder = 2;
  group.add(frontLight);

  const leftLight = new THREE.Mesh(
    new THREE.BoxGeometry(0.016, 0.016, CHIP_DEPTH * 0.66),
    materials.blueLightCore,
  );
  leftLight.position.set(-CHIP_WIDTH / 2 - 0.008, -0.31, 0);
  leftLight.renderOrder = 2;
  group.add(leftLight);

  const glowTexture = textures.stripGlow;
  const frontGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(CHIP_WIDTH * 0.86, 0.5),
    new THREE.MeshBasicMaterial({
      map: glowTexture,
      color: 0x3b9fe4,
      transparent: true,
      opacity: 0.32,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    }),
  );
  frontGlow.position.set(0, -0.3, CHIP_DEPTH / 2 + 0.035);
  frontGlow.renderOrder = 2;
  group.add(frontGlow);

  const sideGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(CHIP_DEPTH * 0.72, 0.42),
    new THREE.MeshBasicMaterial({
      map: glowTexture,
      color: 0x2e8fd2,
      transparent: true,
      opacity: 0.2,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    }),
  );
  sideGlow.position.set(-CHIP_WIDTH / 2 - 0.038, -0.3, 0);
  sideGlow.rotation.y = -Math.PI / 2;
  sideGlow.renderOrder = 2;
  group.add(sideGlow);

  return group;
}

function buildPinField(materials) {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0.105);
  shape.lineTo(0.31, 0.105);
  shape.lineTo(0.455, -0.025);
  shape.lineTo(0.455, -0.36);
  shape.lineTo(0.382, -0.36);
  shape.lineTo(0.382, -0.085);
  shape.lineTo(0, 0.032);
  shape.closePath();

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.068,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 0.011,
    bevelThickness: 0.011,
    curveSegments: 3,
    steps: 1,
  });
  geometry.translate(0, 0, -0.034);
  geometry.computeVertexNormals();

  const longCount = 52;
  const shortCount = 38;
  const total = longCount * 2 + shortCount * 2;
  const mesh = new THREE.InstancedMesh(geometry, materials.pin, total);
  mesh.name = 'GullWingPins';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;

  const dummy = new THREE.Object3D();
  let index = 0;

  const place = (x, z, rotationY) => {
    dummy.position.set(x, PIN_ORIGIN_Y, z);
    dummy.rotation.set(0, rotationY, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
    index += 1;
  };

  for (let i = 0; i < longCount; i += 1) {
    const t = (i + 0.5) / longCount;
    const x = THREE.MathUtils.lerp(-4.93, 4.93, t);
    place(x, CHIP_DEPTH / 2 - 0.032, -Math.PI / 2);
    place(x, -CHIP_DEPTH / 2 + 0.032, Math.PI / 2);
  }

  for (let i = 0; i < shortCount; i += 1) {
    const t = (i + 0.5) / shortCount;
    const z = THREE.MathUtils.lerp(-3.66, 3.66, t);
    place(CHIP_WIDTH / 2 - 0.032, z, 0);
    place(-CHIP_WIDTH / 2 + 0.032, z, Math.PI);
  }

  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

function addCornerHardware(group, materials) {
  for (const x of [-4.62, 4.62]) {
    for (const z of [-3.18, 3.18]) {
      addRoundedMesh(
        group,
        createRounded(0.38, 0.07, 0.38, 0.04, 2),
        materials.deckDetail,
        x,
        DECK_TOP + 0.035,
        z,
        { castShadow: false },
      );
      addScrew(group, materials, x, DECK_TOP + 0.078, z, 0.036);
    }
  }
}

function addDeckComponents(group, materials) {
  const componentMaterial = new THREE.MeshStandardMaterial({
    color: 0x0a1015,
    metalness: 0.45,
    roughness: 0.48,
    envMapIntensity: 0.8,
  });
  const capMaterial = new THREE.MeshStandardMaterial({
    color: 0x9ba5ad,
    metalness: 0.98,
    roughness: 0.32,
    envMapIntensity: 1.1,
  });
  const positions = [
    [-4.48, -2.7, 0],
    [-4.48, -1.9, 0],
    [-4.48, -1.1, 0],
    [-4.48, 0.75, 0],
    [-4.48, 2.1, 0],
    [4.47, -2.58, 0],
    [4.47, -1.75, 0],
    [4.47, -0.9, 0],
    [4.47, 2.15, 0],
    [-3.55, 3.06, Math.PI / 2],
    [-2.78, 3.06, Math.PI / 2],
    [-1.98, 3.06, Math.PI / 2],
    [1.0, -3.08, Math.PI / 2],
    [1.7, -3.08, Math.PI / 2],
    [3.65, 3.04, Math.PI / 2],
  ];

  positions.forEach(([x, z, rotationY], index) => {
    const length = index % 4 === 0 ? 0.33 : 0.24;
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(length, 0.055, 0.14),
      componentMaterial,
    );
    body.position.set(x, DECK_TOP + 0.028, z);
    body.rotation.y = rotationY;
    body.castShadow = false;
    body.receiveShadow = true;
    group.add(body);

    for (const side of [-1, 1]) {
      const cap = new THREE.Mesh(
        new THREE.BoxGeometry(0.032, 0.062, 0.148),
        capMaterial,
      );
      cap.position.set(0, 0, side * (length / 2 - 0.018));
      cap.castShadow = false;
      body.add(cap);
    }
  });

  // Two slightly taller electrolytic-style parts break up the flat deck.
  for (const [x, z] of [[-4.45, 3.04], [4.45, -3.08]]) {
    const can = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 0.15, 18),
      capMaterial,
    );
    can.position.set(x, DECK_TOP + 0.075, z);
    can.castShadow = true;
    can.receiveShadow = true;
    group.add(can);

    const top = new THREE.Mesh(
      new THREE.CylinderGeometry(0.065, 0.065, 0.012, 18),
      materials.metalShadow,
    );
    top.position.set(x, DECK_TOP + 0.156, z);
    top.castShadow = false;
    group.add(top);
  }
}

function buildTopCover(materials) {
  const group = new THREE.Group();
  group.name = 'TopCover';

  const outerWidth = 10.9;
  const outerDepth = 8.1;
  const railWidth = 0.48;
  const outerX = outerWidth / 2 - railWidth / 2;
  const outerZ = outerDepth / 2 - railWidth / 2;

  const openingWidth = 5.5;
  const openingDepth = 4.95;
  const ringWidth = 0.42;
  const innerX = openingWidth / 2 + ringWidth / 2;
  const innerZ = openingDepth / 2 + ringWidth / 2;

  // A dark structural under-rail gives the silver perimeter a readable section
  // when viewed from the side or from below during explosion.
  addBeam(group, outerWidth - 0.18, 0.08, 0.36, 0, -0.16, outerZ, materials.metalShadow);
  addBeam(group, outerWidth - 0.18, 0.08, 0.36, 0, -0.16, -outerZ, materials.metalShadow);
  addBeam(group, 0.36, 0.08, outerDepth - 0.18, outerX, -0.16, 0, materials.metalShadow);
  addBeam(group, 0.36, 0.08, outerDepth - 0.18, -outerX, -0.16, 0, materials.metalShadow);

  // Main perimeter: every rail shares the same outer footprint and the exact
  // same center. This is the single reference outline for the upper assembly.
  addBeam(group, outerWidth, 0.24, railWidth, 0, 0, outerZ, materials.metal);
  addBeam(group, outerWidth, 0.24, railWidth, 0, 0, -outerZ, materials.metal);
  addBeam(group, railWidth, 0.24, outerDepth, outerX, 0, 0, materials.metal);
  addBeam(group, railWidth, 0.24, outerDepth, -outerX, 0, 0, materials.metal);

  // Reinforced corner blocks tie the four perimeter rails together.
  for (const x of [-outerX, outerX]) {
    for (const z of [-outerZ, outerZ]) {
      addRoundedMesh(
        group,
        createRounded(0.66, 0.27, 0.66, 0.05, 2),
        materials.metalBright,
        x,
        0.018,
        z,
      );
    }
  }

  // Inner bezel around the brand plate.
  addBeam(group, openingWidth + ringWidth * 2, 0.24, ringWidth, 0, 0.012, innerZ, materials.metal);
  addBeam(group, openingWidth + ringWidth * 2, 0.24, ringWidth, 0, 0.012, -innerZ, materials.metal);
  addBeam(group, ringWidth, 0.24, openingDepth + ringWidth * 2, innerX, 0.012, 0, materials.metal);
  addBeam(group, ringWidth, 0.24, openingDepth + ringWidth * 2, -innerX, 0.012, 0, materials.metal);

  // Structural side bridges. Their span is calculated from the two frames, so
  // they terminate inside the rails instead of protruding into open space.
  const sideBridgeLength = outerX - railWidth / 2 - (innerX + ringWidth / 2);
  const frontBridgeLength = outerZ - railWidth / 2 - (innerZ + ringWidth / 2);
  addBeam(
    group,
    sideBridgeLength,
    0.21,
    0.28,
    (outerX - railWidth / 2 + innerX + ringWidth / 2) / 2,
    0,
    0,
    materials.metal,
  );
  addBeam(
    group,
    sideBridgeLength,
    0.21,
    0.28,
    -(outerX - railWidth / 2 + innerX + ringWidth / 2) / 2,
    0,
    0,
    materials.metal,
  );
  addBeam(
    group,
    0.28,
    0.2,
    frontBridgeLength,
    0,
    0,
    (outerZ - railWidth / 2 + innerZ + ringWidth / 2) / 2,
    materials.metal,
  );
  addBeam(
    group,
    0.28,
    0.2,
    frontBridgeLength,
    0,
    0,
    -(outerZ - railWidth / 2 + innerZ + ringWidth / 2) / 2,
    materials.metal,
  );

  // Diagonal corner braces terminate under the corner blocks and inner bezel.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const startX = sx * (innerX + ringWidth / 2 - 0.05);
      const startZ = sz * (innerZ + ringWidth / 2 - 0.05);
      const endX = sx * (outerX - 0.04);
      const endZ = sz * (outerZ - 0.04);
      const dx = endX - startX;
      const dz = endZ - startZ;
      const length = Math.hypot(dx, dz);
      const angle = -Math.atan2(dz, dx);
      addBeam(
        group,
        length,
        0.21,
        0.24,
        (startX + endX) / 2,
        0,
        (startZ + endZ) / 2,
        materials.metal,
        angle,
      );
    }
  }

  // A recessed seat lip gives the brand plate a precise, visible installation
  // datum. It belongs to the removable cover and moves with it.
  addBeam(group, openingWidth + 0.14, 0.035, 0.07, 0, -0.105, openingDepth / 2 - 0.035, materials.metalBright);
  addBeam(group, openingWidth + 0.14, 0.035, 0.07, 0, -0.105, -openingDepth / 2 + 0.035, materials.metalBright);
  addBeam(group, 0.07, 0.035, openingDepth + 0.14, openingWidth / 2 - 0.035, -0.105, 0, materials.metalBright);
  addBeam(group, 0.07, 0.035, openingDepth + 0.14, -openingWidth / 2 + 0.035, -0.105, 0, materials.metalBright);

  // Four contact pads align with the fixed pylons below.
  for (const x of [-5.07, 5.07]) {
    for (const z of [-3.66, 3.66]) {
      addRoundedMesh(
        group,
        createRounded(0.32, 0.03, 0.32, 0.025, 2),
        materials.metalDark,
        x,
        -0.135,
        z,
        { castShadow: false },
      );
    }
  }

  // Machined edge highlights on all four sides.
  addBeam(group, outerWidth - 0.95, 0.016, 0.026, 0, 0.13, outerZ - 0.06, materials.metalBright);
  addBeam(group, outerWidth - 0.95, 0.016, 0.026, 0, 0.13, -outerZ + 0.06, materials.metalBright);
  addBeam(group, 0.026, 0.016, outerDepth - 0.95, outerX - 0.06, 0.13, 0, materials.metalBright);
  addBeam(group, 0.026, 0.016, outerDepth - 0.95, -outerX + 0.06, 0.13, 0, materials.metalBright);

  // Symmetric machining slots replace the earlier one-sided marks.
  const slotY = 0.128;
  for (const zSign of [-1, 1]) {
    for (let i = 0; i < 3; i += 1) {
      const x = -2.35 + i * 2.35;
      const slot = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.005, 0.022), materials.darkSlot);
      slot.position.set(x, slotY, zSign * (outerZ - 0.12));
      slot.castShadow = false;
      group.add(slot);
    }
  }
  for (const xSign of [-1, 1]) {
    for (let i = 0; i < 2; i += 1) {
      const z = -1.55 + i * 3.1;
      const slot = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.005, 0.22), materials.darkSlot);
      slot.position.set(xSign * (outerX - 0.12), slotY, z);
      slot.castShadow = false;
      group.add(slot);
    }
  }

  // Screw heads follow the same four-fold symmetry as the structural nodes.
  for (const x of [-outerX, outerX]) {
    for (const z of [-outerZ, outerZ]) {
      addScrew(group, materials, x, 0.152, z, 0.052);
    }
  }
  for (const [x, z] of [[-innerX, -innerZ], [innerX, -innerZ], [-innerX, innerZ], [innerX, innerZ]]) {
    addScrew(group, materials, x, 0.145, z, 0.038);
  }

  const serialTexture = createSerialTexture();
  for (const zSign of [-1, 1]) {
    const serial = new THREE.Mesh(
      new THREE.PlaneGeometry(0.8, 0.19),
      new THREE.MeshBasicMaterial({
        map: serialTexture,
        transparent: true,
        opacity: 0.4,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    serial.rotation.x = -Math.PI / 2;
    serial.position.set(3.55, 0.146, zSign * outerZ);
    serial.renderOrder = 4;
    serial.castShadow = false;
    group.add(serial);
  }

  const pinOne = new THREE.Mesh(
    new THREE.BoxGeometry(0.09, 0.012, 0.09),
    materials.blueLightCore,
  );
  pinOne.position.set(-4.93, 0.151, 3.66);
  pinOne.rotation.y = Math.PI / 4;
  group.add(pinOne);

  return group;
}

function buildBrandPlate(materials) {
  const group = new THREE.Group();
  group.name = 'BrandPlate';

  // The carrier and glass plate are both centered on the group origin. This
  // lets an external system lift and rotate the entire sub-assembly without
  // having to compensate for an offset pivot.
  addRoundedMesh(
    group,
    createRounded(5.1, 0.06, 4.66, 0.06, 2),
    materials.metalShadow,
    0,
    -0.045,
    0,
    { castShadow: false },
  );

  addBeam(group, 5.02, 0.08, 0.08, 0, -0.005, 2.29, materials.metalBright);
  addBeam(group, 5.02, 0.08, 0.08, 0, -0.005, -2.29, materials.metalBright);
  addBeam(group, 0.08, 0.08, 4.5, 2.47, -0.005, 0, materials.metalBright);
  addBeam(group, 0.08, 0.08, 4.5, -2.47, -0.005, 0, materials.metalBright);

  const plate = addRoundedMesh(
    group,
    createRounded(4.82, 0.13, 4.42, 0.075, 3),
    materials.brandGlass,
    0,
    0.025,
    0,
  );
  plate.name = 'BrandDie';

  const brandTexture = createBrandTexture();
  const brandPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(4.32, 4.32),
    new THREE.MeshBasicMaterial({
      map: brandTexture,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      color: 0xdde8f0,
      toneMapped: false,
    }),
  );
  brandPlane.rotation.x = -Math.PI / 2;
  brandPlane.position.y = 0.092;
  brandPlane.renderOrder = 5;
  brandPlane.castShadow = false;
  brandPlane.receiveShadow = false;
  group.add(brandPlane);

  for (const [x, z] of [[-2.32, -2.12], [2.32, -2.12], [-2.32, 2.12], [2.32, 2.12]]) {
    addScrew(group, materials, x, 0.102, z, 0.035);
  }

  const brandEdge = new THREE.LineSegments(
    new THREE.EdgesGeometry(plate.geometry, 30),
    new THREE.LineBasicMaterial({
      color: 0x76a6c4,
      transparent: true,
      opacity: 0.16,
      toneMapped: false,
    }),
  );
  brandEdge.position.y = 0.025;
  brandEdge.renderOrder = 4;
  group.add(brandEdge);

  return group;
}

export function createChipModel() {
  const materials = createMaterials();
  const textures = {
    stripGlow: createStripGlowTexture(),
  };

  const root = new THREE.Group();
  root.name = 'ChipRoot';

  const substrate = buildSubstrate(materials);
  const pinArray = buildPinArray(materials);
  const outerFrame = buildOuterFrame(materials);
  const decorativeDetails = buildDecorativeDetails(materials, textures);
  const topCover = buildTopCover(materials);
  const brandPlate = buildBrandPlate(materials);

  const parts = {
    ChipRoot: root,
    Substrate: substrate,
    OuterFrame: outerFrame,
    PinArray: pinArray,
    DecorativeDetails: decorativeDetails,
    TopCover: topCover,
    BrandPlate: brandPlate,
  };

  for (const [name, part] of Object.entries(parts)) {
    if (name === 'ChipRoot') continue;
    part.name = name;
    part.userData.chipPart = name;
    root.add(part);
  }

  topCover.position.copy(TOP_COVER_ASSEMBLED.position);
  topCover.quaternion.copy(TOP_COVER_ASSEMBLED.quaternion);
  brandPlate.position.copy(BRAND_PLATE_ASSEMBLED.position);
  brandPlate.quaternion.copy(BRAND_PLATE_ASSEMBLED.quaternion);

  // Normalize the asset so ChipRoot's own origin is the geometric center of the
  // completed package. This removes the small vertical bias introduced by the
  // pins and underside details, and gives external consumers a predictable pivot.
  root.updateMatrixWorld(true);
  const authoredCenter = new THREE.Box3().setFromObject(root).getCenter(new THREE.Vector3());
  const modelCenterOffset = authoredCenter.clone().negate();
  for (const child of root.children) {
    child.position.add(modelCenterOffset);
  }
  root.updateMatrixWorld(true);

  const assembledPoses = {
    TopCover: {
      position: topCover.position.clone(),
      quaternion: topCover.quaternion.clone(),
    },
    BrandPlate: {
      position: brandPlate.position.clone(),
      quaternion: brandPlate.quaternion.clone(),
    },
  };

  const explodedPoses = {
    TopCover: {
      position: assembledPoses.TopCover.position.clone().add(TOP_COVER_EXPLODE_OFFSET),
      quaternion: assembledPoses.TopCover.quaternion
        .clone()
        .multiply(new THREE.Quaternion().setFromEuler(TOP_COVER_EXPLODE_TILT)),
    },
    BrandPlate: {
      position: assembledPoses.BrandPlate.position.clone().add(BRAND_PLATE_EXPLODE_OFFSET),
      quaternion: assembledPoses.BrandPlate.quaternion
        .clone()
        .multiply(new THREE.Quaternion().setFromEuler(BRAND_PLATE_EXPLODE_TILT)),
    },
  };

  const assemblyReference = {
    modelCenterOffset: modelCenterOffset.toArray(),
    coverSeatLipTopY: modelCenterOffset.y + COVER_Y - 0.0875,
    coverInnerUndersideY: modelCenterOffset.y + COVER_Y - 0.12,
    coverPadBottomY: modelCenterOffset.y + COVER_Y - 0.15,
    brandCarrierBottomY: modelCenterOffset.y + BRAND_Y - 0.075,
    pylonTopY: modelCenterOffset.y + 0.5325,
  };

  let progress = 0;
  let disposed = false;

  function applyPartPose(part, assembled, exploded, t) {
    part.position.lerpVectors(assembled.position, exploded.position, t);
    part.quaternion.slerpQuaternions(assembled.quaternion, exploded.quaternion, t);
    part.updateMatrix();
    part.updateMatrixWorld(true);
  }

  /**
   * Set the entire upper structure from one normalized progress value.
   * This function is idempotent: calling it repeatedly with the same value
   * produces exactly the same transforms and can never accumulate offsets.
   */
  function setExplodeProgress(value) {
    if (disposed) return 0;
    progress = clamp(Number.isFinite(Number(value)) ? Number(value) : 0, 0, 1);

    // Both layers share the same master progress; the brand plate leads and the
    // cover follows so the plate can clear its opening without intersecting it.
    const brandT = smootherstep(0, 0.62, progress);
    const coverT = smootherstep(0.18, 0.92, progress);

    applyPartPose(topCover, assembledPoses.TopCover, explodedPoses.TopCover, coverT);
    applyPartPose(brandPlate, assembledPoses.BrandPlate, explodedPoses.BrandPlate, brandT);
    return progress;
  }

  function getPart(name) {
    return parts[name] ?? null;
  }

  function getParts() {
    return parts;
  }

  function getPoses() {
    return {
      assembled: {
        TopCover: {
          position: assembledPoses.TopCover.position.clone(),
          quaternion: assembledPoses.TopCover.quaternion.clone(),
        },
        BrandPlate: {
          position: assembledPoses.BrandPlate.position.clone(),
          quaternion: assembledPoses.BrandPlate.quaternion.clone(),
        },
      },
      exploded: {
        TopCover: {
          position: explodedPoses.TopCover.position.clone(),
          quaternion: explodedPoses.TopCover.quaternion.clone(),
        },
        BrandPlate: {
          position: explodedPoses.BrandPlate.position.clone(),
          quaternion: explodedPoses.BrandPlate.quaternion.clone(),
        },
      },
    };
  }

  function getAnimatedTransforms() {
    return {
      TopCover: {
        position: topCover.position.toArray(),
        quaternion: topCover.quaternion.toArray(),
      },
      BrandPlate: {
        position: brandPlate.position.toArray(),
        quaternion: brandPlate.quaternion.toArray(),
      },
    };
  }

  function setPartVisible(name, visible) {
    const part = getPart(name);
    if (part) part.visible = Boolean(visible);
  }

  function resetModel() {
    setExplodeProgress(0);
  }

  function getBounds(name = 'ChipRoot', target = new THREE.Box3()) {
    const part = getPart(name);
    if (!part) return target.makeEmpty();
    return target.setFromObject(part);
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    root.updateMatrixWorld(true);

    const geometries = new Set();
    const materialsToDispose = new Set(Object.values(materials));
    const texturesToDispose = new Set(Object.values(textures));
    const textureSlots = [
      'map', 'alphaMap', 'aoMap', 'emissiveMap', 'lightMap', 'metalnessMap',
      'normalMap', 'roughnessMap', 'clearcoatMap', 'clearcoatNormalMap',
      'clearcoatRoughnessMap', 'matcap',
    ];

    root.traverse((object) => {
      if (object.isInstancedMesh) object.dispose();
      if (object.geometry) geometries.add(object.geometry);
      const objectMaterials = Array.isArray(object.material)
        ? object.material
        : object.material
          ? [object.material]
          : [];
      for (const material of objectMaterials) {
        materialsToDispose.add(material);
        for (const slot of textureSlots) {
          if (material[slot]) texturesToDispose.add(material[slot]);
        }
      }
    });

    geometries.forEach((geometry) => geometry.dispose());
    texturesToDispose.forEach((texture) => texture.dispose());
    materialsToDispose.forEach((material) => material.dispose());

    root.removeFromParent();
    root.clear();
  }

  setExplodeProgress(0);

  root.userData.assemblyReference = assemblyReference;

  return {
    root,
    parts,
    materials,
    assemblyReference,
    poses: getPoses(),
    setExplodeProgress,
    getExplodeProgress: () => progress,
    getPart,
    getParts,
    getPoses,
    getAnimatedTransforms,
    setPartVisible,
    resetModel,
    getBounds,
    dispose,
  };
}
