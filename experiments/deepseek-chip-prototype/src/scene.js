import * as THREE from 'three';
import { OrbitControls } from '../vendor/OrbitControls.js';
import { createGlowTexture, createGroundCircuitTexture, createStudioEnvironmentTexture } from './textures.js';

export const HOME_CAMERA = new THREE.Vector3(11.9, 10.4, 14.4);
export const HOME_TARGET = new THREE.Vector3(0.4, 1.35, 0);
export const OPEN_CAMERA = new THREE.Vector3(11.8, 8.2, 14.0);
export const OPEN_TARGET = new THREE.Vector3(0.45, 1.3, 0);

export function createScene(container) {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.16;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.setAttribute('aria-label', '可旋转、可拆解的芯生 RISC-V 芯片');
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x03060a, 0.014);

  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 160);
  camera.position.copy(HOME_CAMERA);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(HOME_TARGET);
  controls.enableDamping = true;
  controls.dampingFactor = 0.055;
  controls.rotateSpeed = 0.5;
  controls.zoomSpeed = 0.72;
  controls.panSpeed = 0.58;
  controls.screenSpacePanning = true;
  controls.minDistance = 10.2;
  controls.maxDistance = 30;
  controls.minPolarAngle = 0.18;
  controls.maxPolarAngle = Math.PI * 0.475;
  controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
  controls.mouseButtons.MIDDLE = THREE.MOUSE.DOLLY;
  controls.mouseButtons.RIGHT = THREE.MOUSE.PAN;
  controls.update();

  // A procedural soft-box environment gives the metals their long, clean reflections.
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const environmentSource = createStudioEnvironmentTexture();
  const environmentTarget = pmrem.fromEquirectangular(environmentSource);
  scene.environment = environmentTarget.texture;
  scene.environmentIntensity = 1.36;
  environmentSource.dispose();
  pmrem.dispose();

  const lights = createLights(scene);
  const ground = createGround(scene);

  function setSize() {
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  setSize();

  const resizeObserver = new ResizeObserver(setSize);
  resizeObserver.observe(container);

  return {
    renderer,
    scene,
    camera,
    controls,
    lights,
    ground,
    setSize,
    resizeObserver,
  };
}

function createLights(scene) {
  const hemisphere = new THREE.HemisphereLight(0x9fc3da, 0x010203, 0.72);
  scene.add(hemisphere);

  const key = new THREE.DirectionalLight(0xf3f7fb, 3.2);
  key.position.set(8, 14, 9);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -9;
  key.shadow.camera.right = 9;
  key.shadow.camera.top = 9;
  key.shadow.camera.bottom = -9;
  key.shadow.camera.near = 2;
  key.shadow.camera.far = 34;
  key.shadow.bias = -0.00025;
  key.shadow.normalBias = 0.022;
  key.shadow.radius = 4;
  scene.add(key);

  const rim = new THREE.DirectionalLight(0x70b9ff, 0.82);
  rim.position.set(-9, 5.5, -7);
  scene.add(rim);

  const fill = new THREE.DirectionalLight(0xc8d5df, 0.68);
  fill.position.set(-6, 4, 9);
  scene.add(fill);

  const frontSoftbox = new THREE.PointLight(0x9fd4ff, 19, 14, 2);
  frontSoftbox.position.set(2, 2.4, 6);
  scene.add(frontSoftbox);

  const underlight = new THREE.PointLight(0x3a9eef, 28, 10, 2);
  underlight.position.set(0, 0.3, 2.7);
  scene.add(underlight);

  const backGlow = new THREE.PointLight(0x2f78bf, 12, 8, 2);
  backGlow.position.set(-3.4, 2.8, -4.4);
  scene.add(backGlow);

  return { hemisphere, key, rim, fill, frontSoftbox, underlight, backGlow };
}

function createGround(scene) {
  const group = new THREE.Group();
  group.name = 'StudioFloor';

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(180, 180),
    new THREE.MeshStandardMaterial({
      color: 0x020408,
      metalness: 0.48,
      roughness: 0.36,
      envMapIntensity: 0.52,
    }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.012;
  ground.receiveShadow = true;
  group.add(ground);

  const circuitTexture = createGroundCircuitTexture();
  const circuit = new THREE.Mesh(
    new THREE.PlaneGeometry(62, 62),
    new THREE.MeshBasicMaterial({
      map: circuitTexture,
      transparent: true,
      opacity: 0.72,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  circuit.rotation.x = -Math.PI / 2;
  circuit.position.y = 0.004;
  circuit.renderOrder = 1;
  group.add(circuit);

  const glowTexture = createGlowTexture();

  const wideGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(24, 17),
    new THREE.MeshBasicMaterial({
      map: glowTexture,
      color: 0x226eb4,
      transparent: true,
      opacity: 0.28,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  wideGlow.rotation.x = -Math.PI / 2;
  wideGlow.position.set(0.2, 0.012, 0.5);
  wideGlow.renderOrder = 2;
  group.add(wideGlow);

  const tightGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(9.8, 6.8),
    new THREE.MeshBasicMaterial({
      map: glowTexture,
      color: 0x3b9ce8,
      transparent: true,
      opacity: 0.2,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  tightGlow.rotation.x = -Math.PI / 2;
  tightGlow.position.set(0, 0.018, 0.2);
  tightGlow.renderOrder = 2;
  group.add(tightGlow);

  scene.add(group);
  return group;
}
