import * as THREE from 'three';

const PART_NAMES = [
  'Substrate',
  'OuterFrame',
  'PinArray',
  'DecorativeDetails',
  'DemoModules',
  'TopCover',
  'BrandPlate',
];

const PART_COLORS = {
  Substrate: 0x4d8dff,
  OuterFrame: 0x49d6a1,
  PinArray: 0xd6e2eb,
  DecorativeDetails: 0x7f8c99,
  DemoModules: 0xd58cff,
  TopCover: 0x5bc8ff,
  BrandPlate: 0xffc65c,
};

const SYMMETRIC_PARTS = ['Substrate', 'OuterFrame', 'PinArray', 'TopCover', 'BrandPlate'];
const VECTOR_EPSILON = 1e-9;

function createPanel() {
  const panel = document.createElement('aside');
  panel.className = 'debug-panel';
  panel.setAttribute('aria-label', '三维模型调试数据');
  panel.innerHTML = `
    <div class="debug-head">
      <span>MODEL AUDIT</span>
      <span class="debug-live"><i></i>DEV</span>
    </div>
    <div class="debug-row debug-progress-row">
      <span>EXPLODE</span>
      <strong data-debug="progress">0.000</strong>
    </div>
    <div class="debug-grid">
      <div class="debug-check"><span>XZ CENTER MAX</span><b data-debug="center">—</b></div>
      <div class="debug-check"><span>INNER CLEARANCE</span><b data-debug="clearance">—</b></div>
      <div class="debug-check"><span>COVER SEAT</span><b data-debug="seat">—</b></div>
      <div class="debug-check"><span>BRAND SEAT</span><b data-debug="brandSeat">—</b></div>
      <div class="debug-check"><span>CYCLE DRIFT 8×</span><b data-debug="drift">—</b></div>
    </div>
    <div class="debug-parts" data-debug="parts"></div>
    <div class="debug-actions">
      <button type="button" data-view="iso">ISO</button>
      <button type="button" data-view="top">TOP</button>
      <button type="button" data-view="side">SIDE</button>
      <button type="button" data-debug-cycle>RUN 8× CYCLE</button>
    </div>
    <div class="debug-foot">AXES + BOUNDS + CENTERS · ?debug=1</div>
  `;
  document.body.appendChild(panel);
  return panel;
}

function compareTransforms(a, b) {
  let maxDelta = 0;
  for (const part of Object.keys(a)) {
    for (let i = 0; i < a[part].position.length; i += 1) {
      maxDelta = Math.max(maxDelta, Math.abs(a[part].position[i] - b[part].position[i]));
    }
    for (let i = 0; i < a[part].quaternion.length; i += 1) {
      maxDelta = Math.max(maxDelta, Math.abs(a[part].quaternion[i] - b[part].quaternion[i]));
    }
  }
  return maxDelta;
}

/**
 * Development-only visual audit overlay. It exposes axes, per-part bounding
 * boxes, geometric centers, alignment measurements and a repeat-cycle drift
 * test. Nothing here is loaded unless the page URL contains ?debug=1.
 */
export function createModelDebug({ model, scene, camera, controls }) {
  document.body.classList.add('debug-mode');
  const panel = createPanel();
  const panelParts = panel.querySelector('[data-debug="parts"]');
  const values = {
    progress: panel.querySelector('[data-debug="progress"]'),
    center: panel.querySelector('[data-debug="center"]'),
    clearance: panel.querySelector('[data-debug="clearance"]'),
    seat: panel.querySelector('[data-debug="seat"]'),
    brandSeat: panel.querySelector('[data-debug="brandSeat"]'),
    drift: panel.querySelector('[data-debug="drift"]'),
  };

  const axes = new THREE.AxesHelper(3.1);
  axes.name = 'DebugAxes';
  axes.material.depthTest = false;
  axes.material.transparent = true;
  axes.material.opacity = 0.9;
  axes.renderOrder = 80;
  scene.add(axes);

  const helpers = new Map();
  const centerMarkers = new Map();
  const markerGeometry = new THREE.SphereGeometry(0.065, 12, 8);

  for (const name of PART_NAMES) {
    const part = model.getPart(name);
    if (!part) continue;

    const helper = new THREE.Box3Helper(new THREE.Box3(), PART_COLORS[name]);
    helper.name = `DebugBounds_${name}`;
    helper.material.depthTest = false;
    helper.material.transparent = true;
    helper.material.opacity = 0.6;
    helper.renderOrder = 79;
    scene.add(helper);
    helpers.set(name, helper);

    const marker = new THREE.Mesh(
      markerGeometry,
      new THREE.MeshBasicMaterial({
        color: PART_COLORS[name],
        depthTest: false,
        transparent: true,
        opacity: 0.95,
        toneMapped: false,
      }),
    );
    marker.name = `DebugCenter_${name}`;
    marker.renderOrder = 82;
    scene.add(marker);
    centerMarkers.set(name, marker);
  }

  function getRootWorldPosition() {
    return model.root.getWorldPosition(new THREE.Vector3());
  }

  function measureAssembled() {
    const current = model.getExplodeProgress();
    model.setExplodeProgress(0);
    model.root.updateMatrixWorld(true);
    const rootWorld = getRootWorldPosition();
    const bounds = new Map();
    for (const name of PART_NAMES) {
      const part = model.getPart(name);
      if (!part) continue;
      bounds.set(name, new THREE.Box3().setFromObject(part));
    }

    const centers = new Map();
    for (const [name, box] of bounds) {
      const center = box.getCenter(new THREE.Vector3());
      const local = model.root.worldToLocal(center.clone());
      centers.set(name, { world: center, local });
    }

    const centerError = SYMMETRIC_PARTS.reduce((max, name) => {
      const center = centers.get(name)?.local;
      if (!center) return max;
      return Math.max(max, Math.abs(center.x), Math.abs(center.z));
    }, 0);

    const reference = model.assemblyReference;
    const modulesTop = bounds.get('DemoModules')?.max.y ?? 0;
    const coverUnderside = rootWorld.y + reference.coverInnerUndersideY;
    const coverClearance = coverUnderside - modulesTop;
    const pylonTop = rootWorld.y + reference.pylonTopY;
    const coverSeat = rootWorld.y + reference.coverPadBottomY;
    const seatGap = coverSeat - pylonTop;
    const brandSeatTop = rootWorld.y + reference.coverSeatLipTopY;
    const brandBottom = bounds.get('BrandPlate')?.min.y ?? 0;
    const brandSeatGap = brandBottom - brandSeatTop;

    model.setExplodeProgress(current);
    return {
      centerError,
      coverClearance,
      seatGap,
      brandSeatGap,
      rootWorld,
      centers,
    };
  }

  function runCycleTest(iterations = 8) {
    const previous = model.getExplodeProgress();
    model.setExplodeProgress(0);
    const initial = model.getAnimatedTransforms();
    for (let i = 0; i < iterations; i += 1) {
      model.setExplodeProgress(1);
      model.setExplodeProgress(0);
    }
    const completed = model.getAnimatedTransforms();
    model.setExplodeProgress(previous);
    const drift = compareTransforms(initial, completed);
    return {
      iterations,
      drift,
      stable: drift <= VECTOR_EPSILON,
    };
  }

  const assembled = measureAssembled();
  let cycle = runCycleTest(8);
  values.drift.textContent = cycle.stable ? 'PASS' : cycle.drift.toExponential(2);
  values.drift.classList.toggle('is-bad', !cycle.stable);
  values.center.textContent = assembled.centerError < 0.0005 ? 'PASS' : assembled.centerError.toFixed(4);
  values.clearance.textContent = `${assembled.coverClearance.toFixed(3)} u`;
  values.clearance.classList.toggle('is-bad', assembled.coverClearance < 0.01);
  values.seat.textContent = `${assembled.seatGap >= -0.01 && assembled.seatGap <= 0.01 ? 'CONTACT' : assembled.seatGap.toFixed(3)}`;
  values.seat.classList.toggle('is-bad', assembled.seatGap < -0.02 || assembled.seatGap > 0.04);
  values.center.classList.toggle('is-good', assembled.centerError < 0.0005);
  values.seat.classList.toggle('is-good', assembled.seatGap >= -0.01 && assembled.seatGap <= 0.01);
  values.brandSeat.textContent = `${Math.abs(assembled.brandSeatGap) <= 0.001 ? 'CONTACT' : assembled.brandSeatGap.toFixed(4)}`;
  values.brandSeat.classList.toggle('is-good', Math.abs(assembled.brandSeatGap) <= 0.001);
  values.brandSeat.classList.toggle('is-bad', Math.abs(assembled.brandSeatGap) > 0.01);

  const partLabels = new Map();
  for (const name of PART_NAMES) {
    const row = document.createElement('div');
    row.className = 'debug-part';
    const dot = document.createElement('i');
    dot.style.background = `#${PART_COLORS[name].toString(16).padStart(6, '0')}`;
    const label = document.createElement('span');
    label.textContent = name;
    const coordinates = document.createElement('b');
    coordinates.textContent = '—';
    row.append(dot, label, coordinates);
    panelParts.appendChild(row);
    partLabels.set(name, coordinates);
  }

  function setView(viewName) {
    const box = new THREE.Box3().setFromObject(model.root);
    const center = box.getCenter(new THREE.Vector3());
    const distance = 25;
    const views = {
      iso: new THREE.Vector3(1, 0.9, 1).normalize(),
      top: new THREE.Vector3(0, 1, 0.0001).normalize(),
      side: new THREE.Vector3(0, 0, 1),
    };
    const direction = views[viewName] || views.iso;
    if (viewName === 'top') camera.up.set(0, 0, -1);
    else camera.up.set(0, 1, 0);
    controls.target.copy(center);
    camera.position.copy(center).addScaledVector(direction, distance);
    camera.lookAt(center);
    controls.update();
  }

  const buttons = panel.querySelectorAll('[data-view]');
  buttons.forEach((button) => {
    button.addEventListener('click', () => setView(button.dataset.view));
  });

  const cycleButton = panel.querySelector('[data-debug-cycle]');
  cycleButton.addEventListener('click', () => {
    cycle = runCycleTest(8);
    values.drift.textContent = cycle.stable ? 'PASS' : cycle.drift.toExponential(2);
    values.drift.classList.toggle('is-bad', !cycle.stable);
    cycleButton.textContent = 'CYCLE PASS';
    window.setTimeout(() => {
      cycleButton.textContent = 'RUN 8× CYCLE';
    }, 900);
  });

  let lastPanelUpdate = 0;
  function update(force = false) {
    if (!model.root.parent) return;
    model.root.updateMatrixWorld(true);
    model.root.getWorldPosition(axes.position);

    for (const [name, helper] of helpers) {
      const part = model.getPart(name);
      if (!part) continue;
      const box = new THREE.Box3().setFromObject(part);
      helper.box.copy(box);
      helper.updateMatrixWorld(true);
      const center = box.getCenter(new THREE.Vector3());
      const marker = centerMarkers.get(name);
      if (marker) marker.position.copy(center);
    }

    const now = performance.now();
    if (!force && now - lastPanelUpdate < 180) return;
    lastPanelUpdate = now;
    const progress = model.getExplodeProgress();
    values.progress.textContent = progress.toFixed(3);

    for (const [name, label] of partLabels) {
      const box = new THREE.Box3().setFromObject(model.getPart(name));
      const center = box.getCenter(new THREE.Vector3());
      const local = model.root.worldToLocal(center.clone());
      label.textContent = `${local.x.toFixed(2)} ${local.y.toFixed(2)} ${local.z.toFixed(2)}`;
    }
  }

  update(true);

  const api = {
    model,
    axes,
    helpers,
    centerMarkers,
    runCycleTest,
    setView,
    getReport: () => ({
      assembled: {
        centerError: assembled.centerError,
        coverClearance: assembled.coverClearance,
        seatGap: assembled.seatGap,
        brandSeatGap: assembled.brandSeatGap,
      },
      cycle,
    }),
    update,
    dispose() {
      panel.remove();
      axes.removeFromParent();
      axes.geometry?.dispose();
      axes.material?.dispose();
      for (const helper of helpers.values()) {
        helper.removeFromParent();
        helper.geometry?.dispose();
        helper.material?.dispose();
      }
      for (const marker of centerMarkers.values()) {
        marker.removeFromParent();
        marker.material?.dispose();
      }
      markerGeometry.dispose();
      document.body.classList.remove('debug-mode');
    },
  };

  window.__CHIP_DEBUG__ = api;
  return api;
}
