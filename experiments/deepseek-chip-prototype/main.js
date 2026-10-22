import * as THREE from 'three';
import { createScene, HOME_CAMERA, HOME_TARGET, OPEN_CAMERA, OPEN_TARGET } from './src/scene.js';
import { CHIP_SPEC, createChipModel } from './src/chip.js';
import { startCaptureMode } from './src/capture.js';
import { createModelDebug } from './src/debug.js';
import { clamp, easeInOutCubic, smootherstep } from './src/utils.js';

const params = new URLSearchParams(window.location.search);
const captureMode = params.get('capture') === '1';
const debugMode = params.get('debug') === '1' && !captureMode;

const stage = document.querySelector('#stage');
const loader = document.querySelector('#loader');
const fallback = document.querySelector('#webglFallback');
const explodeButton = document.querySelector('#explodeButton');
const explodeLabel = document.querySelector('#explodeLabel');
const explodeSub = document.querySelector('#explodeSub');
const resetButton = document.querySelector('#resetButton');
const statusPill = document.querySelector('#statusPill');
const statusText = document.querySelector('#statusText');
const stateZh = document.querySelector('#stateZh');
const stateEn = document.querySelector('#stateEn');
const moduleCn = document.querySelector('#moduleCn');
const moduleEn = document.querySelector('#moduleEn');
const moduleDesc = document.querySelector('#moduleDesc');
const moduleList = document.querySelector('#moduleList');
const indexCount = document.querySelector('#indexCount');
const panelHint = document.querySelector('#panelHint');

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let world;
let chip;

try {
  world = createScene(stage);
  chip = createChipModel();
  chip.root.position.y = CHIP_SPEC.worldLift;
  world.scene.add(chip.root);
} catch (error) {
  console.error('[Silicon Life] Failed to initialize the 3D prototype.', error);
  showFallback();
}

if (world && chip) {
  if (captureMode) {
    startCaptureMode({ world, model: chip, params });
  } else {
    init();
  }
}

function showFallback() {
  if (loader) loader.style.display = 'none';
  if (fallback) fallback.hidden = false;
  document.body.classList.add('has-webgl-error');
}

function init() {
  const { renderer, scene, camera, controls } = world;

  const state = {
    exploded: false,
    progress: 0,
    velocity: 0,
    selectedId: null,
    hoveredId: null,
    exposed: false,
    modulesReady: false,
    uiMode: 'complete',
    hintMode: 'closed',
    intro: {
      active: !reduceMotion,
      startedAt: performance.now(),
      duration: 2050,
      from: HOME_CAMERA.clone().multiplyScalar(1.16).add(new THREE.Vector3(0, 0.45, 0)),
      to: HOME_CAMERA.clone(),
    },
    reset: null,
    cameraTween: null,
    pointerDown: null,
    modulesById: new Map(chip.modules.map((module) => [module.id, module])),
    moduleButtons: new Map(),
  };

  const raycaster = new THREE.Raycaster();
  const pointerNdc = new THREE.Vector2(10, 10);

  camera.position.copy(state.intro.active ? state.intro.from : HOME_CAMERA);
  camera.lookAt(HOME_TARGET);
  controls.target.copy(HOME_TARGET);
  controls.update();

  buildModuleIndex(state);
  indexCount.textContent = String(chip.modules.length).padStart(2, '0');
  updateSelectionUI(state);
  refreshUI(state, true);

  // Release the loader only after the first fully composed frame exists.
  renderer.render(scene, camera);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      document.body.classList.add('is-loaded');
      window.dispatchEvent(new CustomEvent('siliconlife:ready'));
    });
  });

  controls.addEventListener('start', () => {
    if (state.intro.active) {
      state.intro.active = false;
    }
    if (state.reset) {
      state.reset = null;
      controls.enabled = true;
    }
    if (state.cameraTween) {
      state.cameraTween = null;
      controls.enabled = true;
    }
  });

  bindPointerEvents(state, camera, renderer, raycaster, pointerNdc);
  bindControls(state);
  bindKeyboard(state);

  const debugTools = debugMode
    ? createModelDebug({ model: chip, scene, camera, controls })
    : null;

  let previousTime = performance.now();

  function frame(now) {
    const delta = Math.min(0.2, Math.max(0.0001, (now - previousTime) / 1000));
    previousTime = now;

    updateExplosion(state, delta);
    updateIntro(state, camera, controls, now);
    updateReset(state, camera, controls, now);
    updateCameraTween(state, camera, controls, now);
    chip.setExplodeProgress(state.progress);
    updateFraming(camera, state);
    updateUiFromMotion(state);
    updateHighlights(state, delta);
    debugTools?.update();

    if (!state.intro.active && !state.reset && !state.cameraTween) {
      controls.update();
    }

    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);

  exposeDebugApi(state, camera, controls, scene, renderer);
}

function buildModuleIndex(state) {
  for (const module of chip.modules) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'module-item';
    button.dataset.moduleId = module.id;
    button.setAttribute('aria-label', `${module.cn}，${module.en}`);
    button.setAttribute('aria-pressed', 'false');

    const index = document.createElement('span');
    index.className = 'module-item-index';
    index.textContent = String(module.index + 1).padStart(2, '0');

    const name = document.createElement('span');
    name.className = 'module-item-name';
    name.textContent = module.short;

    button.append(index, name);
    button.addEventListener('click', () => {
      if (!state.exploded) return;
      if (state.selectedId === module.id) {
        selectModule(state, null);
      } else {
        selectModule(state, module.id);
      }
    });
    button.addEventListener('pointerenter', () => {
      if (!state.modulesReady) return;
      state.hoveredId = module.id;
      document.body.classList.add('is-hovering-module');
    });
    button.addEventListener('pointerleave', () => {
      if (state.hoveredId === module.id) {
        state.hoveredId = null;
        document.body.classList.remove('is-hovering-module');
      }
    });
    button.addEventListener('focus', () => {
      if (!state.modulesReady) return;
      state.hoveredId = module.id;
    });
    button.addEventListener('blur', () => {
      if (state.hoveredId === module.id) state.hoveredId = null;
    });

    moduleList.appendChild(button);
    state.moduleButtons.set(module.id, button);
  }
}

function bindControls(state) {
  explodeButton.addEventListener('click', () => {
    setExploded(state, !state.exploded);
  });

  resetButton.addEventListener('click', () => {
    resetView(state);
  });
}

function bindKeyboard(state) {
  window.addEventListener('keydown', (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;

    const key = event.key.toLowerCase();
    if (key === 'e') {
      event.preventDefault();
      setExploded(state, !state.exploded);
    }
    if (key === 'r') {
      event.preventDefault();
      resetView(state);
    }
  });
}

function bindPointerEvents(state, camera, renderer, raycaster, pointerNdc) {
  const canvas = renderer.domElement;

  const updateNdc = (event) => {
    const rect = canvas.getBoundingClientRect();
    pointerNdc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointerNdc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  };

  const moduleIdAtPointer = () => {
    chip.root.updateMatrixWorld(true);
    raycaster.setFromCamera(pointerNdc, camera);
    const hits = raycaster.intersectObjects(chip.moduleMeshes, false);
    if (!hits.length) return null;
    let object = hits[0].object;
    while (object && !object.userData.moduleId) object = object.parent;
    return object?.userData.moduleId ?? null;
  };

  const chipHitAtPointer = () => {
    chip.root.updateMatrixWorld(true);
    raycaster.setFromCamera(pointerNdc, camera);
    const hits = raycaster.intersectObject(chip.root, true);
    return hits.some((hit) => hit.object.isMesh || hit.object.isInstancedMesh);
  };

  canvas.addEventListener('pointermove', (event) => {
    if (event.pointerType === 'touch') return;
    updateNdc(event);

    if (state.pointerDown) {
      const dx = event.clientX - state.pointerDown.x;
      const dy = event.clientY - state.pointerDown.y;
      if (Math.hypot(dx, dy) > 4) {
        state.pointerDown.moved = true;
        document.body.classList.add('is-dragging');
      }
      if (state.modulesReady) {
        state.hoveredId = null;
        document.body.classList.remove('is-hovering-module');
      }
      return;
    }

    if (!state.modulesReady) {
      if (state.hoveredId) {
        state.hoveredId = null;
        document.body.classList.remove('is-hovering-module');
      }
      return;
    }

    const hovered = moduleIdAtPointer();
    if (hovered !== state.hoveredId) {
      state.hoveredId = hovered;
      document.body.classList.toggle('is-hovering-module', Boolean(hovered));
    }
  });

  canvas.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    state.pointerDown = {
      x: event.clientX,
      y: event.clientY,
      time: performance.now(),
      moved: false,
    };
    if (state.intro.active) state.intro.active = false;
  });

  const endPointer = (event) => {
    if (event.button !== 0 && event.type === 'pointerup') {
      state.pointerDown = null;
      return;
    }

    const pressed = state.pointerDown;
    state.pointerDown = null;
    document.body.classList.remove('is-dragging');
    if (!pressed) return;

    const distance = Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y);
    const duration = performance.now() - pressed.time;
    if (pressed.moved || distance > 5 || duration > 700) return;

    updateNdc(event);
    if (!state.exploded) {
      if (state.progress < 0.08 && chipHitAtPointer()) {
        setExploded(state, true);
      }
      return;
    }

    if (!state.modulesReady) return;
    const moduleId = moduleIdAtPointer();
    if (moduleId) {
      selectModule(state, moduleId);
    } else if (state.selectedId) {
      selectModule(state, null);
    }
  };

  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', () => {
    state.pointerDown = null;
    document.body.classList.remove('is-dragging');
  });
  canvas.addEventListener('pointerleave', () => {
    if (state.pointerDown) return;
    if (state.hoveredId) {
      state.hoveredId = null;
      document.body.classList.remove('is-hovering-module');
    }
  });

  // Keep right-drag panning from opening a browser context menu.
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());
}

function setExploded(state, next) {
  state.exploded = Boolean(next);
  document.body.classList.toggle('is-exploded', state.exploded);
  explodeButton.setAttribute('aria-pressed', String(state.exploded));
  explodeLabel.textContent = state.exploded ? '合拢芯片' : '拆解芯片';
  explodeSub.textContent = state.exploded ? 'RECOMPOSE STRUCTURE' : 'EXPLODE STRUCTURE';

  if (!state.exploded) {
    state.hoveredId = null;
    document.body.classList.remove('is-hovering-module');
  }

  startCameraTween(state, state.exploded ? 'open' : 'home');
  state.uiMode = '';
  refreshUI(state);
}

function selectModule(state, moduleId) {
  if (moduleId && !state.modulesReady) return;
  state.selectedId = moduleId;
  updateSelectionUI(state);

  for (const [id, button] of state.moduleButtons) {
    const active = id === state.selectedId;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  }

  refreshUI(state);
}

function resetView(state) {
  state.intro.active = false;
  state.cameraTween = null;
  const open = state.exploded;
  state.reset = {
    startedAt: performance.now(),
    duration: 920,
    fromPosition: world.camera.position.clone(),
    fromTarget: world.controls.target.clone(),
    toPosition: (open ? OPEN_CAMERA : HOME_CAMERA).clone(),
    toTarget: (open ? OPEN_TARGET : HOME_TARGET).clone(),
  };
  world.controls.enabled = false;
}

function startCameraTween(state, pose) {
  const open = pose === 'open';
  state.intro.active = false;
  state.reset = null;
  state.cameraTween = {
    startedAt: performance.now(),
    duration: 1380,
    fromPosition: world.camera.position.clone(),
    fromTarget: world.controls.target.clone(),
    toPosition: (open ? OPEN_CAMERA : HOME_CAMERA).clone(),
    toTarget: (open ? OPEN_TARGET : HOME_TARGET).clone(),
  };
  world.controls.enabled = false;
}

function updateSelectionUI(state) {
  if (!state.selectedId) {
    moduleCn.textContent = state.exploded ? '未选择模块' : '结构待展开';
    moduleEn.textContent = state.exploded ? 'SELECT A MODULE' : 'NO MODULE SELECTED';
    moduleDesc.textContent = state.exploded
      ? '点击芯片上的模块，或使用右侧模块索引，查看它的职责。'
      : '展开芯片，查看内部模块与结构层次。';
    return;
  }

  const module = state.modulesById.get(state.selectedId);
  if (!module) return;
  moduleCn.textContent = module.cn;
  moduleEn.textContent = module.en;
  moduleDesc.textContent = module.desc;
}

function updateExplosion(state, delta) {
  const target = state.exploded ? 1 : 0;
  const stiffness = 36;
  const damping = 12.2;

  // Fixed substeps keep the spring stable and preserve the intended timing when
  // a slower device drops below 20 fps.
  let remaining = Math.min(0.2, delta);
  const step = 1 / 90;
  while (remaining > 0) {
    const h = Math.min(step, remaining);
    const acceleration = (target - state.progress) * stiffness - state.velocity * damping;
    state.velocity += acceleration * h;
    state.progress += state.velocity * h;
    remaining -= h;
  }

  if (Math.abs(target - state.progress) < 0.0004 && Math.abs(state.velocity) < 0.003) {
    state.progress = target;
    state.velocity = 0;
  }
}

function updateFraming(camera, state) {
  const aspectBoost = camera.aspect < 0.7 ? 14 : camera.aspect < 1 ? 8 : 0;
  const targetFov = 32 + aspectBoost + 8 * smootherstep(0.12, 0.94, clamp(state.progress, 0, 1));
  if (Math.abs(camera.fov - targetFov) < 0.002) return;
  camera.fov = targetFov;
  camera.updateProjectionMatrix();
}

function updateIntro(state, camera, controls, now) {
  if (!state.intro.active) return;
  const t = clamp((now - state.intro.startedAt) / state.intro.duration, 0, 1);
  const eased = 1 - Math.pow(1 - t, 3);

  camera.position.lerpVectors(state.intro.from, state.intro.to, eased);
  controls.target.copy(HOME_TARGET);
  camera.lookAt(HOME_TARGET);

  if (t >= 1) {
    state.intro.active = false;
    camera.position.copy(HOME_CAMERA);
    controls.update();
  }
}

function updateReset(state, camera, controls, now) {
  if (!state.reset) return;
  const t = clamp((now - state.reset.startedAt) / state.reset.duration, 0, 1);
  const eased = easeInOutCubic(t);

  camera.position.lerpVectors(state.reset.fromPosition, state.reset.toPosition, eased);
  controls.target.lerpVectors(state.reset.fromTarget, state.reset.toTarget, eased);
  camera.lookAt(controls.target);

  if (t >= 1) {
    camera.position.copy(state.reset.toPosition);
    controls.target.copy(state.reset.toTarget);
    state.reset = null;
    controls.enabled = true;
    controls.update();
  }
}

function updateCameraTween(state, camera, controls, now) {
  if (!state.cameraTween) return;
  const tween = state.cameraTween;
  const t = clamp((now - tween.startedAt) / tween.duration, 0, 1);
  const eased = easeInOutCubic(t);

  camera.position.lerpVectors(tween.fromPosition, tween.toPosition, eased);
  controls.target.lerpVectors(tween.fromTarget, tween.toTarget, eased);
  camera.lookAt(controls.target);

  if (t >= 1) {
    camera.position.copy(tween.toPosition);
    controls.target.copy(tween.toTarget);
    state.cameraTween = null;
    controls.enabled = true;
    controls.update();
  }
}

function updateUiFromMotion(state) {
  const exposed = state.progress > 0.56;
  if (exposed !== state.exposed) {
    state.exposed = exposed;
    document.body.classList.toggle('is-exposed', exposed);
    updateSelectionUI(state);
  }

  state.modulesReady = state.progress > 0.64;

  if (!state.modulesReady && state.hoveredId) {
    state.hoveredId = null;
    document.body.classList.remove('is-hovering-module');
  }

  if (!state.exploded && state.selectedId && state.progress < 0.32) {
    selectModule(state, null);
  }

  let mode = 'complete';
  if (state.exploded && state.progress > 0.993) mode = 'exploded';
  else if (state.exploded) mode = 'opening';
  else if (state.progress > 0.007) mode = 'closing';

  if (mode !== state.uiMode) {
    state.uiMode = mode;
    applyStatus(state, mode);
  }

  const hintMode = state.selectedId ? 'selected' : exposed ? 'open' : state.exploded ? 'opening' : 'closed';
  if (hintMode !== state.hintMode) {
    state.hintMode = hintMode;
    applyHint(state, hintMode);
  }
}

function refreshUI(state, force = false) {
  if (force || !state.uiMode) {
    let mode = 'complete';
    if (state.exploded && state.progress > 0.993) mode = 'exploded';
    else if (state.exploded) mode = 'opening';
    else if (state.progress > 0.007) mode = 'closing';
    state.uiMode = mode;
    applyStatus(state, mode);
  }

  const hintMode = state.selectedId ? 'selected' : state.progress > 0.56 ? 'open' : state.exploded ? 'opening' : 'closed';
  state.hintMode = hintMode;
  applyHint(state, hintMode);
}

function applyStatus(state, mode) {
  let cn = '完整';
  let zh = '完整芯片';
  let en = 'ASSEMBLED';

  if (mode === 'opening') {
    cn = '拆解中';
    zh = '结构分离';
    en = 'SEPARATING';
  } else if (mode === 'exploded') {
    cn = '拆解';
    zh = '拆解结构';
    en = 'EXPLODED';
  } else if (mode === 'closing') {
    cn = '合拢中';
    zh = '结构合拢';
    en = 'RECOMPOSING';
  }

  statusText.textContent = cn;
  stateZh.textContent = zh;
  stateEn.textContent = en;
  statusPill.classList.toggle('is-transitioning', mode === 'opening' || mode === 'closing');
}

function applyHint(state, mode) {
  if (mode === 'closed') {
    panelHint.textContent = '点击芯片或下方按钮，开始结构拆解';
  } else if (mode === 'opening') {
    panelHint.textContent = '结构运动中 · 可随时反向';
  } else if (mode === 'selected') {
    panelHint.textContent = '再次点击空白处，取消模块选择';
  } else {
    panelHint.textContent = state.exploded ? '点击模块查看职责说明' : '再次点击按钮，合拢结构';
  }
}

function updateHighlights(state, delta) {
  const allowSelection = state.progress > 0.5;
  for (const module of chip.modules) {
    const hovered = state.hoveredId === module.id && state.modulesReady;
    const selected = state.selectedId === module.id && allowSelection;
    module.setHighlight(hovered, selected, delta);
  }
}

function exposeDebugApi(state, camera, controls, scene, renderer) {
  window.__SILICON_LIFE_CHIP__ = {
    state,
    chip,
    model: chip,
    camera,
    controls,
    scene,
    renderer,
    toggle: () => setExploded(state, !state.exploded),
    setExploded: (value) => setExploded(state, Boolean(value)),
    setModelExplodeProgress: (value) => chip.setExplodeProgress(value),
    selectModule: (id) => selectModule(state, id),
    resetView: () => resetView(state),
    getProgress: () => state.progress,
    snapProgress: (value) => {
      state.progress = clamp(value, 0, 1);
      state.velocity = 0;
      state.exploded = state.progress > 0.5;
      state.intro.active = false;
      state.reset = null;
      state.cameraTween = null;
      document.body.classList.toggle('is-exploded', state.exploded);
      chip.setExplodeProgress(state.progress);
      const open = state.progress > 0.5;
      camera.position.copy(open ? OPEN_CAMERA : HOME_CAMERA);
      controls.target.copy(open ? OPEN_TARGET : HOME_TARGET);
      camera.lookAt(controls.target);
      camera.fov = 32 + 8 * smootherstep(0.12, 0.94, state.progress);
      camera.updateProjectionMatrix();
      controls.enabled = true;
      controls.update();
    },
  };
}
