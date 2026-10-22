import * as THREE from 'three';

const VIEWS = {
  iso: {
    direction: new THREE.Vector3(1, 1, 1).normalize(),
    up: new THREE.Vector3(0, 1, 0),
    label: 'isometric 45deg',
  },
  top: {
    direction: new THREE.Vector3(0, 1, 0.000001).normalize(),
    up: new THREE.Vector3(0, 0, -1),
    label: 'top',
  },
  side: {
    direction: new THREE.Vector3(0, 0, 1),
    up: new THREE.Vector3(0, 1, 0),
    label: 'side',
  },
};

function fitOrthographicCamera(object, view, width, height) {
  object.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(object);
  const center = bounds.getCenter(new THREE.Vector3());
  const direction = view.direction.clone();
  const up = view.up.clone();

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
  camera.position.copy(center).addScaledVector(direction, 50);
  camera.up.copy(up);
  camera.lookAt(center);
  camera.updateMatrixWorld(true);

  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).normalize();
  const cameraUp = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1).normalize();
  let halfRight = 0;
  let halfUp = 0;

  for (const x of [bounds.min.x, bounds.max.x]) {
    for (const y of [bounds.min.y, bounds.max.y]) {
      for (const z of [bounds.min.z, bounds.max.z]) {
        const point = new THREE.Vector3(x, y, z).sub(center);
        halfRight = Math.max(halfRight, Math.abs(point.dot(right)));
        halfUp = Math.max(halfUp, Math.abs(point.dot(cameraUp)));
      }
    }
  }

  const aspect = width / height;
  const margin = 1.1;
  let halfHeight = Math.max(halfUp, halfRight / aspect) * margin;
  let halfWidth = halfHeight * aspect;

  // Side views are intentionally wide and shallow; keep a little breathing room
  // vertically so the silhouette does not touch the image edge.
  if (view === VIEWS.side) {
    halfHeight = Math.max(halfHeight, 2.6);
    halfWidth = halfHeight * aspect;
  }

  camera.left = -halfWidth;
  camera.right = halfWidth;
  camera.top = halfHeight;
  camera.bottom = -halfHeight;
  camera.near = 0.1;
  camera.far = 200;
  camera.updateProjectionMatrix();

  return {
    camera,
    bounds,
    center,
    framing: {
      halfWidth: Number(halfWidth.toFixed(3)),
      halfHeight: Number(halfHeight.toFixed(3)),
      center: center.toArray().map((value) => Number(value.toFixed(3))),
    },
  };
}

/**
 * Deterministic off-screen capture mode used for model validation screenshots.
 * It uses an orthographic camera and a plain background, with the normal product
 * UI hidden. This is intentionally only reachable via ?capture=1.
 */
export function startCaptureMode({ world, model, params }) {
  const requestedView = params.get('view') || 'iso';
  const requestedState = params.get('state') || 'assembled';
  const view = VIEWS[requestedView] || VIEWS.iso;
  const progress = requestedState === 'exploded' ? 1 : 0;

  document.body.classList.add('capture-mode', 'is-loaded');
  const loader = document.querySelector('#loader');
  if (loader) loader.style.display = 'none';

  world.controls.enabled = false;
  model.setExplodeProgress(progress);
  model.root.updateMatrixWorld(true);

  // The studio floor is intentionally excluded: these are structural audit
  // images, not beauty renders.
  world.ground.visible = false;
  world.scene.fog = null;
  world.scene.background = new THREE.Color(0x05080b);

  const renderer = world.renderer;
  renderer.setPixelRatio(1);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.setClearColor(0x05080b, 1);

  const { camera, bounds, center, framing } = fitOrthographicCamera(
    model.root,
    view,
    window.innerWidth,
    window.innerHeight,
  );

  function render() {
    world.scene.updateMatrixWorld(true);
    renderer.render(world.scene, camera);
  }

  render();

  const captureState = {
    ready: false,
    view: requestedView,
    state: requestedState,
    camera,
    framing,
    bounds: {
      min: bounds.min.toArray(),
      max: bounds.max.toArray(),
      center: center.toArray(),
    },
    render,
    restore() {
      world.ground.visible = true;
      world.controls.enabled = true;
      renderer.setClearColor(0x000000, 0);
      document.body.classList.remove('capture-mode');
    },
  };

  const fontsReady = document.fonts?.ready ?? Promise.resolve();
  fontsReady
    .then(() => {
      render();
      requestAnimationFrame(() => {
        render();
        captureState.ready = true;
        window.dispatchEvent(new CustomEvent('siliconlife:capture-ready'));
      });
    })
    .catch(() => {
      captureState.ready = true;
    });

  window.__CAPTURE__ = captureState;
  return captureState;
}
