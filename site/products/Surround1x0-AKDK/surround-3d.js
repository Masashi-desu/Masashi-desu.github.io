import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ConvexHull } from 'three/examples/jsm/math/ConvexHull.js';
import { createModelInteraction } from './surround-interaction.js';

const visual = document.querySelector('.surround-visual');
const canvas = document.getElementById('surround-canvas');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const compactLayout = window.matchMedia('(max-width: 42rem)');
const MODEL_UNIT_SCALE = 0.001;
const PAIR_MARGIN_PX = Object.freeze({ desktop: 24, mobile: 16 });
// Section 04, landscape only. Edit these XYZ Euler angles in degrees to adjust
// each keyboard's orientation. No additional per-side roll is applied later.
const LANDSCAPE_EXPLODED_ROTATION_DEG = Object.freeze({
  left: Object.freeze({ x: 68.93, y: 8.59, z: 39.74 }),
  right: Object.freeze({ x: 26.35, y: 6.31, z: -40.68 })
});
const EXPLOSION_SIDE_DELAY = 20;
const EXPLOSION_LAYER_DELAYS = Object.freeze({
  bottom_case: 0,
  keycaps: 0,
  trackball: 0,
  switches: 24,
  top_case: 100,
  sockets: 100,
  conthrough: 160,
  pcb: 160,
  controller: 180,
  mouse_sensor: 180
});
const EXPLOSION_ITEM_DELAYS = Object.freeze({
  keycaps: 80,
  switches: 56,
  sockets: 100
});
const EXPLOSION_WAVE_DURATION = 720;
const COMPACT_DESTINATION_SCALE = 1.1;
const TOP_CASE_CLEARANCE_RATIO = 0.78;
const MOBILE_EXPLOSION_SPACING_MIN = 2.45;
const MOBILE_EXPLOSION_SPACING_MAX = 2.85;
const PART_ROTATION_MAX = THREE.MathUtils.degToRad(3.2);
const PART_ROTATION_STAGGER = 0.14;
const PART_ROTATION_LAYER_WEIGHTS = Object.freeze({
  bottom_case: 0.24,
  controller: 0.42,
  mouse_sensor: 0.42,
  conthrough: 0.56,
  sockets: 0.78,
  pcb: 0.32,
  top_case: 0.46,
  switches: 0.88,
  keycaps: 1,
  trackball: 0.58
});
const ITEMIZED_EXPLOSION_LAYERS = new Set(['keycaps', 'switches', 'sockets']);
const TOP_CASE_CONSTRAINED_LAYERS = new Set([
  'controller',
  'mouse_sensor',
  'conthrough',
  'sockets',
  'pcb'
]);
const MODEL_URLS = {
  dark: './assets/Surround1x0-AKDK-Black.glb',
  light: './assets/Surround1x0-AKDK-White.glb'
};
const EXIT_TARGETS = {
  desktop: {
    left: createExitPose('left'),
    right: createExitPose('right')
  },
  mobile: {
    left: createExitPose('left', true),
    right: createExitPose('right', true)
  }
};
const STAGING_TARGETS = {
  desktop: {
    left: createStagingPose('left'),
    right: createStagingPose('right')
  },
  mobile: {
    left: createStagingPose('left', true),
    right: createStagingPose('right', true)
  }
};

const publicState = {
  ready: false,
  failed: false,
  theme: resolveTheme(),
  activeScene: Number(document.body.dataset.surroundScene || 0),
  foregroundSide: null,
  heroSpread: null,
  pairLayout: null,
  featuredLayout: null,
  motionActive: false,
  motionKind: 'cubic-swing-arc',
  motionEasing: 'smootherstep',
  transitSwing: 'travel-scaled-banking',
  transitTwist: 'transient-corner-bell',
  transitStagger: 'lead-follow',
  scaleOvershoot: false,
  settling: 'zero-velocity',
  exitMotion: 'cubic-diagonal-forward-twist',
  exitCurve: 'cubic-bezier',
  exitCorner: 'outer-back',
  twistSpace: 'mirrored-local-diagonal',
  exitFade: 'final-third',
  reentryStaging: 'near-frustum',
  materialFade: true,
  foregroundRendering: 'single-canvas',
  modelHierarchy: 'half-roots-with-exploded-layers',
  modelUnitScale: MODEL_UNIT_SCALE,
  explodedView: 'glb-layer-metadata',
  explosionWave: 'ordered-layer-ripple',
  assembledTransit: 'rigid-half-root',
  collisionAvoidance: 'side-locked-and-top-case-clearance',
  explosionTiming: 'at-segment-motion-start',
  reassemblyTiming: 'during-segment-motion',
  explodedPartRotation: 'motion-lagged-per-item',
  explodedPartRotationMax: PART_ROTATION_MAX,
  topCaseClearanceRatio: TOP_CASE_CLEARANCE_RATIO,
  mobileExplosionSpacingRange: [MOBILE_EXPLOSION_SPACING_MIN, MOBILE_EXPLOSION_SPACING_MAX],
  explosionSpacingScale: 1,
  explosionOrientation: null,
  explodedLayerCount: 0,
  explodedLayerOrders: [],
  explosionAmount: 0,
  explosionTarget: 0,
  explosionLayerAmounts: [],
  explosionItemAmounts: [],
  explosionItemOffsets: [],
  explosionLateralDrift: 0,
  explosionItemRotations: [],
  explosionMaxOffset: 0,
  explodedItemCount: 0,
  explodedItemMetadata: [],
  itemizedExplodedLayers: [],
  modelMetadata: null,
  exitTargets: EXIT_TARGETS,
  stagingTargets: STAGING_TARGETS,
  currentPoses: null,
  modelUrls: { ...MODEL_URLS }
};

window.__SURROUND_3D__ = publicState;

if (!visual || !canvas) {
  publicState.failed = true;
} else {
  start().catch((error) => {
    publicState.failed = true;
    visual.classList.add('is-failed');
    console.error('Surround1x0-AKDK 3D renderer failed to start.', error);
  });
}

function resolveTheme() {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

async function start() {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: false,
    antialias: true,
    powerPreference: 'high-performance'
  });
  renderer.setClearColor(resolveTheme() === 'dark' ? 0x10100e : 0xf4f1ea, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = false;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.01, 20);
  const rig = new THREE.Group();
  scene.add(rig);

  const hemisphere = new THREE.HemisphereLight(0xffffff, 0x8b8376, 2.4);
  const keyLight = new THREE.DirectionalLight(0xffffff, 4.2);
  const fillLight = new THREE.DirectionalLight(0xb8ccff, 2.1);
  const rimLight = new THREE.DirectionalLight(resolveTheme() === 'dark' ? 0xff344a : 0x8c9198, 1.35);
  keyLight.position.set(-2.5, 5, 3.5);
  fillLight.position.set(3, 2.5, 2);
  rimLight.position.set(0, 1, -4);
  scene.add(hemisphere, keyLight, fillLight, rimLight);

  const loader = new GLTFLoader();
  const progress = { dark: 0, light: 0 };
  const setProgress = (theme, event) => {
    if (event.lengthComputable && event.total > 0) {
      progress[theme] = event.loaded / event.total;
      const combined = Math.round(((progress.dark + progress.light) / 2) * 100);
      visual.style.setProperty('--surround-load-progress', `${combined}%`);
    }
  };

  const [darkModel, lightModel] = await Promise.all([
    loader.loadAsync(MODEL_URLS.dark, (event) => setProgress('dark', event)),
    loader.loadAsync(MODEL_URLS.light, (event) => setProgress('light', event))
  ]);

  const models = {
    dark: prepareModel(darkModel.scene, 'Black'),
    light: prepareModel(lightModel.scene, 'White')
  };
  rig.add(models.dark.group, models.light.group);
  publicState.explodedLayerCount = models.dark.explosion.layers.length;
  publicState.explodedLayerOrders = [...new Set(
    models.dark.explosion.layers.map((layer) => layer.order)
  )].sort((a, b) => a - b);
  publicState.explodedItemCount = models.dark.explosion.units.length;
  publicState.explodedItemMetadata = models.dark.explosion.units.map((unit) => ({
    side: unit.side,
    layer: unit.layer.name,
    name: unit.name,
    itemized: unit.layer.itemized,
    waveDelay: unit.waveDelay,
    rotationPhase: unit.rotationPhase,
    rotationWeight: unit.rotationWeight
  }));
  publicState.itemizedExplodedLayers = [...new Set(
    models.dark.explosion.layers.filter((layer) => layer.itemized).map((layer) => layer.name)
  )].sort();
  publicState.explosionMaxOffset = models.dark.explosion.maxOffset;
  publicState.modelMetadata = {
    roots: { left: models.dark.halves.left.sourceName, right: models.dark.halves.right.sourceName },
    colorways: {
      dark: models.dark.metadata.exportedColorway,
      light: models.light.metadata.exportedColorway
    },
    explodedRevision: models.dark.metadata.explodedRevision
  };

  const motion = {
    pointerX: 0,
    pointerY: 0,
    targetPointerX: 0,
    targetPointerY: 0,
    lastTime: performance.now()
  };
  const interaction = createModelInteraction({
    models, camera, state: publicState,
    reset: () => setScene(publicState.activeScene, true)
  });

  function syncTheme() {
    const theme = resolveTheme();
    publicState.theme = theme;
    models.dark.group.visible = theme === 'dark';
    models.light.group.visible = theme === 'light';
    rimLight.color.set(theme === 'dark' ? 0xff344a : 0x8c9198);
    renderer.toneMappingExposure = theme === 'dark' ? 1.16 : 1.02;
    renderer.setClearColor(theme === 'dark' ? 0x10100e : 0xf4f1ea, 1);
  }

  function setScene(index, immediate = false) {
    const normalized = Math.min(3, Math.max(0, Number(index) || 0));
    if (!immediate && normalized === publicState.activeScene) {
      return false;
    }
    interaction.cancel();
    publicState.interaction.modified = false;
    const previous = publicState.activeScene;
    const waveDirection = normalized >= previous ? 1 : -1;
    publicState.activeScene = normalized;
    publicState.foregroundSide = normalized === 1 ? 'right' : (normalized === 2 ? 'left' : null);
    const state = getLayoutState(
      normalized,
      compactLayout.matches,
      window.innerWidth,
      window.visualViewport?.height || window.innerHeight
    );
    publicState.pairLayout = normalized === 0 || normalized === 3
      ? fitPairLayout(state, models, camera)
      : null;
    publicState.featuredLayout = normalized === 1 || normalized === 2
      ? fitFeaturedLayout(state, normalized, models, camera)
      : null;
    publicState.explosionOrientation = state.explosion ? (state.explosionOrientation || 'vertical') : null;
    publicState.heroSpread = normalized === 0 ? Math.abs(state.left.x) : null;
    Object.values(models).forEach((model) => setModelTarget(model, state, immediate, waveDirection));
    publicState.motionActive = !immediate;
    return true;
  }

  function resize() {
    const width = Math.max(1, window.innerWidth);
    const height = Math.max(1, window.visualViewport?.height || window.innerHeight);
    const compact = compactLayout.matches;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, compact ? 1.65 : 2));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.fov = compact ? 36 : 34;
    const position = compact
      ? { x: 0, y: 0.56, z: 0.88 }
      : { x: 0, y: 0.34, z: 0.56 };
    camera.position.set(position.x, position.y, position.z);
    camera.lookAt(0, compact ? 0.045 : 0, 0);
    camera.updateProjectionMatrix();
    setScene(publicState.activeScene, true);
  }

  function handlePointerMove(event) {
    if (reduceMotion.matches || publicState.interaction.dragging) {
      return;
    }
    motion.targetPointerX = (event.clientX / Math.max(1, window.innerWidth) - 0.5) * 2;
    motion.targetPointerY = (event.clientY / Math.max(1, window.innerHeight) - 0.5) * 2;
  }

  function render(time) {
    const delta = Math.min(0.05, Math.max(0.001, (time - motion.lastTime) / 1000));
    motion.lastTime = time;
    const smoothing = reduceMotion.matches ? 1 : 1 - Math.exp(-delta * 6.5);
    motion.pointerX = THREE.MathUtils.lerp(motion.pointerX, motion.targetPointerX, smoothing * 0.65);
    motion.pointerY = THREE.MathUtils.lerp(motion.pointerY, motion.targetPointerY, smoothing * 0.65);

    Object.values(models).forEach((model) => updateModel(model, time));
    publicState.motionActive = Object.values(models).some((model) => (
      Object.values(model.halves).some((half) => Boolean(half.motion)) ||
      Boolean(model.explosion.motion)
    ));

    const compact = compactLayout.matches;
    const baseX = 0;
    const baseY = compact ? 0.56 : 0.34;
    camera.position.x = baseX + motion.pointerX * (compact ? 0.008 : 0.015);
    camera.position.y = baseY - motion.pointerY * (compact ? 0.005 : 0.009);
    camera.lookAt(motion.pointerX * -0.008, compact ? 0.045 : 0, 0);

    if (!document.hidden && !window.__SURROUND_TEST_SKIP_RENDER__) {
      renderer.render(scene, camera);
    }
    publishPoseSnapshot(models[publicState.theme]);
    interaction.update();
    window.requestAnimationFrame(render);
  }

  // Navigation remains available while the GLBs load. Start at the latest
  // selected section, including a hash restored after this module initialized.
  publicState.activeScene = Number(document.body.dataset.surroundScene || 0);
  syncTheme();
  resize();
  visual.style.setProperty('--surround-load-progress', '100%');
  visual.classList.add('is-ready');
  publicState.ready = true;

  const themeObserver = new MutationObserver(syncTheme);
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme']
  });

  const refreshFeaturedLayout = () => {
    if (publicState.activeScene === 1 || publicState.activeScene === 2) {
      setScene(publicState.activeScene, true);
    }
  };
  const languageObserver = new MutationObserver(refreshFeaturedLayout);
  languageObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  document.fonts.ready.then(refreshFeaturedLayout);

  window.addEventListener('surround:segment-change', (event) => {
    interaction.cancel();
    setScene(event.detail?.index);
  });
  window.addEventListener('pointermove', handlePointerMove, { passive: true });
  window.addEventListener('resize', resize, { passive: true });
  window.visualViewport?.addEventListener('resize', resize, { passive: true });
  compactLayout.addEventListener?.('change', resize);
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    publicState.failed = true;
    interaction.cancel();
    visual.classList.remove('is-ready');
    visual.classList.add('is-failed');
  });
  window.requestAnimationFrame(render);
}

function prepareModel(group, colorName) {
  group.name = `Surround1x0-AKDK-${colorName}`;
  const keyboardRoot = group.getObjectByName('Keyboard_Root');
  const leftSource = group.getObjectByName('Left_Half_Root');
  const rightSource = group.getObjectByName('Right_Half_Root');
  if (!keyboardRoot || !leftSource || !rightSource) {
    throw new Error(`The ${colorName} GLB does not contain separate left and right keyboard roots.`);
  }

  const left = createModelControl(group, leftSource, 'left');
  const right = createModelControl(group, rightSource, 'right');

  group.traverse((object) => {
    if (!object.isMesh) {
      return;
    }
    object.frustumCulled = true;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.filter(Boolean).forEach((material) => {
      material.depthWrite = true;
      material.needsUpdate = true;
    });
  });

  const halves = {
    left: createHalfState(left.control, 'left', leftSource.name),
    right: createHalfState(right.control, 'right', rightSource.name)
  };
  const explosion = createExplosionState(halves, keyboardRoot.userData);
  const layoutPoints = createPairLayoutPoints(halves, explosion);
  const featuredLayoutPoints = Object.fromEntries(Object.entries(halves).map(([side, half]) => {
    // A rotated case's bounding-box corners include large empty wedges. The
    // assembled hull keeps the fit tight while enclosing every actual vertex.
    const hull = new ConvexHull().setFromObject(half.object);
    const vertices = new Set();
    for (const face of hull.faces) {
      let edge = face.edge;
      do {
        vertices.add(edge.head().point);
        edge = edge.next;
      } while (edge !== face.edge);
    }
    const inverse = half.object.matrixWorld.clone().invert();
    return [side, [...vertices].map((point) => point.clone().applyMatrix4(inverse))];
  }));
  return {
    group,
    halves,
    explosion,
    layoutPoints,
    featuredLayoutPoints,
    metadata: {
      exportedColorway: keyboardRoot.userData.exported_colorway,
      explodedRevision: keyboardRoot.userData.exploded_view_revision
    }
  };
}

function createModelControl(group, source, side) {
  const sourcePosition = source.position.clone();
  source.removeFromParent();
  source.position.set(0, 0, 0);

  const modelSpace = new THREE.Group();
  modelSpace.name = `${side}-model-space`;
  modelSpace.rotation.x = -Math.PI / 2;
  modelSpace.scale.setScalar(MODEL_UNIT_SCALE);
  modelSpace.add(source);

  const control = new THREE.Group();
  control.name = `${side}-display-control`;
  control.position.copy(
    sourcePosition
      .applyEuler(new THREE.Euler(-Math.PI / 2, 0, 0))
      .multiplyScalar(MODEL_UNIT_SCALE)
  );
  control.add(modelSpace);
  group.add(control);
  return { control, source };
}

function createHalfState(object, side, sourceName) {
  const direction = side === 'left' ? -1 : 1;
  const materialStates = [];
  const clonedMaterials = new Map();
  object.traverse((child) => {
    if (!child.isMesh || !child.material) {
      return;
    }
    const sourceMaterials = Array.isArray(child.material) ? child.material : [child.material];
    const childMaterials = sourceMaterials.map((source) => {
      if (!clonedMaterials.has(source)) {
        const material = source.clone();
        clonedMaterials.set(source, material);
        materialStates.push({
          material,
          baseOpacity: source.opacity,
          baseTransparent: source.transparent,
          baseDepthWrite: source.depthWrite
        });
      }
      return clonedMaterials.get(source);
    });
    child.material = Array.isArray(child.material) ? childMaterials : childMaterials[0];
  });
  return {
    side,
    sourceName,
    object,
    materialStates,
    baseScale: object.scale.clone(),
    baseQuaternion: object.quaternion.clone(),
    rotationEuler: new THREE.Euler(0, 0, 0, 'XYZ'),
    rotationQuaternion: new THREE.Quaternion(),
    cornerTwistAxis: new THREE.Vector3(direction, 0, 1).normalize(),
    cornerTwistQuaternion: new THREE.Quaternion(),
    cornerTwistDirection: direction,
    partMotionProgress: 1,
    partMotionAmplitude: 0,
    partMotionAxis: new THREE.Vector3(0, direction, 0),
    motion: null,
    current: {
      x: object.position.x,
      y: object.position.y,
      z: object.position.z,
      scale: 1,
      opacity: 1,
      rotationX: 0,
      rotationY: 0,
      rotationZ: 0,
      cornerTwist: 0,
      foreground: 0
    },
    target: {
      x: object.position.x,
      y: object.position.y,
      z: object.position.z,
      scale: 1,
      opacity: 1,
      rotationX: 0,
      rotationY: 0,
      rotationZ: 0,
      cornerTwist: 0,
      foreground: 0
    }
  };
}

function createExplosionState(halves, metadata) {
  const spacing = Number(metadata.site_exploded_spacing_mm || metadata.exploded_view_spacing_mm || 30);
  const layers = [];
  Object.values(halves).forEach((half) => {
    half.object.traverse((object) => {
      const order = Number(object.userData?.exploded_view_order);
      if (!object.userData?.exploded_view_layer || !Number.isFinite(order)) {
        return;
      }
      layers.push({
        object,
        half,
        side: half.side,
        name: object.userData.exploded_view_layer,
        order,
        basePosition: object.position.clone(),
        explosionAmount: 0,
        itemized: false,
        units: []
      });
    });
  });
  if (!layers.length) {
    throw new Error('The GLB does not contain exploded-view layer metadata.');
  }
  layers.sort((a, b) => a.order - b.order || a.side.localeCompare(b.side) || a.name.localeCompare(b.name));
  const units = [];
  layers.forEach((layer) => {
    const itemObjects = collectExplosionItemObjects(layer)
      .sort(compareExplosionItemPositions);
    layer.itemized = itemObjects.length > 1;
    layer.units = itemObjects.map((object, index) => {
      const itemPhase = itemObjects.length > 1 ? index / (itemObjects.length - 1) : 0;
      const unit = {
        object,
        layer,
        side: layer.side,
        name: object.name || `${layer.name}-${index + 1}`,
        basePosition: object.position.clone(),
        baseQuaternion: object.quaternion.clone(),
        partRotationAxis: new THREE.Vector3(),
        partRotationQuaternion: new THREE.Quaternion(),
        partRotationAmount: 0,
        explosionAmount: 0,
        appliedOffset: 0,
        waveDelay: (EXPLOSION_LAYER_DELAYS[layer.name] ?? layer.order * 40) +
          (layer.side === 'right' ? EXPLOSION_SIDE_DELAY : 0) +
          itemPhase * (EXPLOSION_ITEM_DELAYS[layer.name] ?? 0)
      };
      units.push(unit);
      return unit;
    });
  });
  const minWaveDelay = Math.min(...units.map((unit) => unit.waveDelay));
  const maxWaveDelay = Math.max(...units.map((unit) => unit.waveDelay));
  const waveDelaySpan = Math.max(1, maxWaveDelay - minWaveDelay);
  units.forEach((unit, index) => {
    const sequence = ((index + 1) * 0.61803398875) % 1;
    unit.rotationPhase = (unit.waveDelay - minWaveDelay) / waveDelaySpan;
    unit.rotationWeight = (PART_ROTATION_LAYER_WEIGHTS[unit.layer.name] ?? 0.5) *
      (0.82 + sequence * 0.18);
    unit.rotationAxisJitter = new THREE.Vector3(
      sequence - 0.5,
      ((sequence * 1.7) % 1) - 0.5,
      ((sequence * 2.3) % 1) - 0.5
    );
  });
  return {
    layers,
    units,
    spacing,
    current: 0,
    target: 0,
    motion: null,
    maxWaveDelay,
    maxOffset: Math.max(...layers.map((layer) => layer.order * spacing)) * MODEL_UNIT_SCALE
  };
}

function collectExplosionItemObjects(layer) {
  if (!ITEMIZED_EXPLOSION_LAYERS.has(layer.name)) {
    return [layer.object];
  }
  if (layer.name === 'sockets') {
    const assembly = layer.object.children.find((child) => /_Sockets_Assembly$/u.test(child.name));
    return assembly?.children.length ? [...assembly.children] : [layer.object];
  }
  return layer.object.children.length ? [...layer.object.children] : [layer.object];
}

function compareExplosionItemPositions(left, right) {
  const rowDifference = right.position.y - left.position.y;
  if (Math.abs(rowDifference) > 0.001) {
    return rowDifference;
  }
  const columnDifference = left.position.x - right.position.x;
  return Math.abs(columnDifference) > 0.001
    ? columnDifference
    : left.name.localeCompare(right.name);
}

// Preserve existing portrait bounds and use actual per-layer hulls for the
// landscape edges. A box around the ball or a tilted case leaves false margins.
// Keep explosion offsets separate so resizing never mutates a running animation.
function createPairLayoutPoints(halves, explosion) {
  const points = { left: [], right: [], exploded: { left: [], right: [] } };
  Object.values(halves).forEach((half) => half.object.updateWorldMatrix(true, true));
  explosion.layers.forEach((layer) => {
    const inverse = layer.half.object.matrixWorld.clone().invert();
    const explosionAxis = new THREE.Vector3(0, 0, 1).transformDirection(
      new THREE.Matrix4().multiplyMatrices(inverse, layer.object.matrixWorld)
    );
    const topCase = explosion.layers.find((candidate) => (
      candidate.side === layer.side && candidate.name === 'top_case'
    ));
    const order = TOP_CASE_CONSTRAINED_LAYERS.has(layer.name)
      ? Math.min(layer.order, (topCase?.order || 0) * TOP_CASE_CLEARANCE_RATIO)
      : layer.order;
    const hull = new ConvexHull().setFromObject(layer.object);
    const vertices = new Set();
    for (const face of hull.faces) {
      let edge = face.edge;
      do {
        vertices.add(edge.head().point);
        edge = edge.next;
      } while (edge !== face.edge);
    }
    for (const point of vertices) {
      points.exploded[layer.side].push({
        position: point.clone().applyMatrix4(inverse),
        explosionAxis,
        rise: order * explosion.spacing * MODEL_UNIT_SCALE
      });
    }
    layer.object.traverse((mesh) => {
      if (!mesh.isMesh) {
        return;
      }
      mesh.geometry.computeBoundingBox();
      const box = mesh.geometry.boundingBox;
      const transform = new THREE.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld);
      for (const x of [box.min.x, box.max.x]) {
        for (const y of [box.min.y, box.max.y]) {
          for (const z of [box.min.z, box.max.z]) {
            points[layer.side].push({
              position: new THREE.Vector3(x, y, z).applyMatrix4(transform),
              explosionAxis,
              rise: order * explosion.spacing * MODEL_UNIT_SCALE
            });
          }
        }
      }
    });
  });
  return points;
}

function createLayoutViews(camera, compact) {
  // Fit the entire pointer-parallax envelope, including both colorways.
  return [[0, 0], [-1, -1], [-1, 1], [1, -1], [1, 1]].map(([x, y]) => {
    const view = camera.clone();
    view.position.set(
      x * (compact ? 0.008 : 0.015),
      (compact ? 0.56 : 0.34) - y * (compact ? 0.005 : 0.009),
      compact ? 0.88 : 0.56
    );
    view.lookAt(x * -0.008, compact ? 0.045 : 0, 0);
    view.updateMatrixWorld();
    return new THREE.Matrix4().multiplyMatrices(view.projectionMatrix, view.matrixWorldInverse);
  });
}

function readFeaturedCopyBounds(index) {
  const section = document.getElementById(`surround-0${index + 1}`);
  const copy = section.querySelector('.surround-copy');
  const sectionTop = section.getBoundingClientRect().top;
  const transform = new DOMMatrixReadOnly(getComputedStyle(copy).transform);
  const bounds = { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity };
  // Text ranges exclude the unused width of the copy's grid cells. Remove its
  // reveal translation and scroll offset so the destination is stable in transit.
  for (const child of copy.children) {
    const range = document.createRange();
    range.selectNodeContents(child);
    for (const rect of range.getClientRects()) {
      if (!rect.width || !rect.height) continue;
      bounds.left = Math.min(bounds.left, rect.left - transform.m41);
      bounds.right = Math.max(bounds.right, rect.right - transform.m41);
      bounds.top = Math.min(bounds.top, rect.top - sectionTop - transform.m42);
      bounds.bottom = Math.max(bounds.bottom, rect.bottom - sectionTop - transform.m42);
    }
  }
  return bounds;
}

function fitFeaturedLayout(state, index, models, camera) {
  const compact = compactLayout.matches;
  const width = window.innerWidth;
  const height = window.visualViewport?.height || window.innerHeight;
  const margin = compact ? PAIR_MARGIN_PX.mobile : PAIR_MARGIN_PX.desktop;
  const side = index === 1 ? 'right' : 'left';
  const stacked = compact && width <= height;
  const copy = readFeaturedCopyBounds(index);
  const fitArea = {
    left: margin, right: width - margin,
    top: document.querySelector('.surround-topbar').getBoundingClientRect().bottom + margin,
    bottom: height - margin
  };
  if (stacked) {
    fitArea.bottom = Math.min(fitArea.bottom, copy.top - margin);
  } else if (side === 'right') {
    fitArea.left = Math.max(fitArea.left, copy.right + margin);
  } else {
    fitArea.right = Math.min(fitArea.right, copy.left - margin);
  }
  const pose = state[side];
  const views = createLayoutViews(camera, compact);
  const rotation = new THREE.Euler(pose.rotationX, pose.rotationY, pose.rotationZ);
  const points = Object.values(models).flatMap((model) => model.featuredLayoutPoints[side].map((point) => (
    point.clone().applyEuler(rotation)
  )));
  const cameraUp = new THREE.Vector3(0, compact ? 0.88 : 0.56, compact ? -0.515 : -0.34).normalize();
  const e = views[0].elements;
  const depth = e[3] * pose.x + e[7] * pose.y + e[11] * pose.z + e[15];
  const unitsPerPixel = 2 * depth * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / height;
  const projected = new THREE.Vector3();
  const evaluate = (scale, offsetX, offsetY) => {
    const bounds = { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity };
    let depthFits = true;
    for (const view of views) {
      for (const point of points) {
        projected.copy(point).multiplyScalar(scale);
        projected.x += pose.x + offsetX;
        projected.y += pose.y + cameraUp.y * offsetY;
        projected.z += pose.z + cameraUp.z * offsetY;
        projected.applyMatrix4(view);
        depthFits = depthFits && projected.z >= -1 && projected.z <= 1;
        const x = (projected.x + 1) * width / 2;
        const y = (1 - projected.y) * height / 2;
        bounds.left = Math.min(bounds.left, x);
        bounds.right = Math.max(bounds.right, x);
        bounds.top = Math.min(bounds.top, y);
        bounds.bottom = Math.max(bounds.bottom, y);
      }
    }
    const fits = depthFits && bounds.left >= fitArea.left && bounds.right <= fitArea.right &&
      bounds.top >= fitArea.top && bounds.bottom <= fitArea.bottom;
    return { scale, offsetX, offsetY, bounds, fits };
  };
  const evaluateCentered = (scale) => {
    let result = evaluate(scale, 0, 0);
    for (let iteration = 0; iteration < 8; iteration += 1) {
      const { bounds, offsetX, offsetY } = result;
      const dx = (fitArea.left + fitArea.right - bounds.left - bounds.right) / 2;
      const dy = (bounds.top + bounds.bottom - fitArea.top - fitArea.bottom) / 2;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 0.01) break;
      result = evaluate(scale, offsetX + dx * unitsPerPixel, offsetY + dy * unitsPerPixel);
    }
    return result;
  };
  let low = 0;
  let high = pose.scale;
  while (evaluateCentered(high).fits) high *= 2;
  for (let iteration = 0; iteration < 20; iteration += 1) {
    const candidate = evaluateCentered((low + high) / 2);
    if (candidate.fits) low = candidate.scale;
    else high = candidate.scale;
  }
  const result = evaluateCentered(low);
  pose.scale = result.scale;
  pose.x += result.offsetX;
  pose.y += cameraUp.y * result.offsetY;
  pose.z += cameraUp.z * result.offsetY;
  return { ...result, side, stacked, edgeMarginPx: margin, copy, fitArea };
}

function fitPairLayout(state, models, camera) {
  const compact = compactLayout.matches;
  const width = window.innerWidth;
  const height = window.visualViewport?.height || window.innerHeight;
  const margin = compact ? PAIR_MARGIN_PX.mobile : PAIR_MARGIN_PX.desktop;
  const maximize = width > height;
  const fitArea = { left: margin, right: width - margin, top: margin, bottom: height - margin };
  if (maximize && state.explosion === 0) {
    const topbar = document.querySelector('.surround-topbar').getBoundingClientRect();
    fitArea.top = topbar.bottom + margin;
    // Use section-local coordinates: the hero can still be offscreen when its
    // return animation starts, so the cue's viewport position is not its inset.
    const hero = document.getElementById('surround-01');
    const cue = hero.querySelector('.surround-scroll-cue');
    if (cue.getClientRects().length) {
      fitArea.bottom = cue.getBoundingClientRect().top - hero.getBoundingClientRect().top - margin;
    }
  }
  const explosionSpacing = state.explosion * getExplosionSpacingScale();
  const views = createLayoutViews(camera, compact);
  const points = Object.fromEntries(['left', 'right'].map((side) => {
    const pose = state[side];
    const rotation = new THREE.Euler(pose.rotationX, pose.rotationY, pose.rotationZ);
    return [side, Object.values(models).flatMap((model) => (
      state.explosionOrientation === 'horizontal' ? model.layoutPoints.exploded[side] : model.layoutPoints[side]
    ).map((point) => {
      const position = point.position.clone();
      if (state.explosionOrientation === 'horizontal') {
        position.addScaledVector(point.explosionAxis, point.rise * explosionSpacing);
      } else {
        position.y += point.rise * explosionSpacing;
      }
      return position.applyEuler(rotation);
    }))];
  }));
  if (state.explosionOrientation === 'horizontal') {
    return fitLandscapeExplosion(state, points, views, camera, { width, height, margin, compact });
  }
  const projected = new THREE.Vector3();
  const cameraUp = new THREE.Vector3(0, compact ? 0.88 : 0.56, compact ? -0.515 : -0.34).normalize();
  const e = views[0].elements;
  const centerDepth = e[7] * state.left.y + e[11] * state.left.z + e[15];
  const verticalUnitsPerPixel = 2 * centerDepth * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / height;
  const evaluate = (scale, verticalOffset = 0) => {
    let spread = 0;
    // clipX / clipW is linear-fractional in X. Solve each inner-edge
    // constraint directly, then use the smallest shared symmetric spread.
    for (const side of ['left', 'right']) {
      const direction = side === 'left' ? -1 : 1;
      const innerEdge = direction * margin / width;
      for (const view of views) {
        const e = view.elements;
        for (const point of points[side]) {
          const x = point.x * scale;
          const y = point.y * scale + state[side].y + cameraUp.y * verticalOffset;
          const z = point.z * scale + state[side].z + cameraUp.z * verticalOffset;
          const clipX = e[0] * x + e[4] * y + e[8] * z + e[12];
          const clipW = e[3] * x + e[7] * y + e[11] * z + e[15];
          spread = Math.max(spread, (innerEdge * clipW - clipX) /
            (direction * (e[0] - innerEdge * e[3])));
        }
      }
    }
    const bounds = {};
    let depthFits = true;
    for (const side of ['left', 'right']) {
      const x = side === 'left' ? -spread : spread;
      const box = { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity };
      for (const view of views) {
        for (const point of points[side]) {
          projected.copy(point).multiplyScalar(scale);
          projected.x += x;
          projected.y += state[side].y + cameraUp.y * verticalOffset;
          projected.z += state[side].z + cameraUp.z * verticalOffset;
          projected.applyMatrix4(view);
          depthFits = depthFits && projected.z >= -1 && projected.z <= 1;
          const px = (projected.x + 1) * width / 2;
          const py = (1 - projected.y) * height / 2;
          box.left = Math.min(box.left, px);
          box.right = Math.max(box.right, px);
          box.top = Math.min(box.top, py);
          box.bottom = Math.max(box.bottom, py);
        }
      }
      bounds[side] = box;
    }
    const fits = depthFits && Object.values(bounds).every((box) => (
      box.left >= fitArea.left && box.right <= fitArea.right &&
      box.top >= fitArea.top && box.bottom <= fitArea.bottom
    ));
    return { spread, scale, verticalOffset, bounds, fits };
  };
  const evaluateCentered = (scale) => {
    let candidate = evaluate(scale);
    if (maximize) {
      for (let iteration = 0; iteration < (state.explosion ? 8 : 4); iteration += 1) {
        const top = Math.min(candidate.bounds.left.top, candidate.bounds.right.top);
        const bottom = Math.max(candidate.bounds.left.bottom, candidate.bounds.right.bottom);
        const offset = candidate.verticalOffset + ((top + bottom - fitArea.top - fitArea.bottom) / 2) * verticalUnitsPerPixel;
        candidate = evaluate(scale, offset);
      }
    }
    return candidate;
  };
  const preferredScale = state.left.scale;
  let upperScale = preferredScale;
  let result = evaluateCentered(upperScale);
  while (maximize && result.fits) {
    upperScale *= 2;
    result = evaluateCentered(upperScale);
  }
  if (!result.fits) {
    let low = 0;
    let high = upperScale;
    for (let iteration = 0; iteration < 20; iteration += 1) {
      const candidate = evaluateCentered((low + high) / 2);
      if (candidate.fits) {
        low = candidate.scale;
      } else {
        high = candidate.scale;
      }
    }
    result = evaluateCentered(low);
  }
  state.left.x = -result.spread;
  state.right.x = result.spread;
  state.left.scale = state.right.scale = result.scale;
  for (const side of ['left', 'right']) {
    state[side].y += cameraUp.y * result.verticalOffset;
    state[side].z += cameraUp.z * result.verticalOffset;
  }
  return { ...result, minGapPx: margin, edgeMarginPx: margin, preferredScale, maximize, fitArea };
}

function fitLandscapeExplosion(state, points, views, camera, { width, height, margin, compact }) {
  const fitArea = { left: 0, right: width, top: margin, bottom: height - margin };
  const cameraUp = new THREE.Vector3(0, compact ? 0.88 : 0.56, compact ? -0.515 : -0.34).normalize();
  const e = views[0].elements;
  const depth = e[7] * state.left.y + e[11] * state.left.z + e[15];
  const unitsPerPixel = 2 * depth * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / height;
  const projected = new THREE.Vector3();
  const evaluateSide = (side, scale, offsetY) => {
    const edge = side === 'left' ? -1 : 1;
    let x = side === 'left' ? -Infinity : Infinity;
    const y = state[side].y + cameraUp.y * offsetY;
    const z = state[side].z + cameraUp.z * offsetY;
    // Solve the outer screen edge exactly over all parts, colorways and views.
    // Independent roots avoid unused space caused by symmetric X positions.
    for (const view of views) {
      const e = view.elements;
      for (const point of points[side]) {
        const px = point.x * scale;
        const py = point.y * scale + y;
        const pz = point.z * scale + z;
        const clipX = e[0] * px + e[4] * py + e[8] * pz + e[12];
        const clipW = e[3] * px + e[7] * py + e[11] * pz + e[15];
        const candidate = (edge * clipW - clipX) / (e[0] - edge * e[3]);
        x = side === 'left' ? Math.max(x, candidate) : Math.min(x, candidate);
      }
    }
    const bounds = { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity };
    let depthFits = true;
    for (const view of views) {
      for (const point of points[side]) {
        projected.copy(point).multiplyScalar(scale);
        projected.x += x;
        projected.y += y;
        projected.z += z;
        projected.applyMatrix4(view);
        depthFits = depthFits && projected.z >= -1 && projected.z <= 1;
        const px = (projected.x + 1) * width / 2;
        const py = (1 - projected.y) * height / 2;
        bounds.left = Math.min(bounds.left, px);
        bounds.right = Math.max(bounds.right, px);
        bounds.top = Math.min(bounds.top, py);
        bounds.bottom = Math.max(bounds.bottom, py);
      }
    }
    return { x, y, z, offsetY, bounds, depthFits };
  };
  const evaluate = (scale) => {
    const positions = {};
    for (const side of ['left', 'right']) {
      let result = evaluateSide(side, scale, 0);
      for (let iteration = 0; iteration < 12; iteration += 1) {
        const dy = (result.bounds.top + result.bounds.bottom - fitArea.top - fitArea.bottom) / 2;
        if (Math.abs(dy) < 0.001) break;
        result = evaluateSide(side, scale, result.offsetY + dy * unitsPerPixel);
      }
      positions[side] = result;
    }
    const bounds = { left: positions.left.bounds, right: positions.right.bounds };
    const fits = Object.values(positions).every((pose) => pose.depthFits &&
      pose.bounds.top >= fitArea.top && pose.bounds.bottom <= fitArea.bottom) &&
      bounds.left.right <= bounds.right.left;
    return { scale, positions, bounds, fits };
  };
  const preferredScale = state.left.scale;
  let low = 0;
  let high = preferredScale;
  while (evaluate(high).fits) high *= 2;
  for (let iteration = 0; iteration < 20; iteration += 1) {
    const candidate = evaluate((low + high) / 2);
    if (candidate.fits) low = candidate.scale;
    else high = candidate.scale;
  }
  const result = evaluate(low);
  for (const side of ['left', 'right']) {
    const { x, y, z } = result.positions[side];
    Object.assign(state[side], { x, y, z, scale: result.scale });
  }
  return {
    ...result, minGapPx: 0, edgeMarginPx: 0, verticalMarginPx: margin,
    preferredScale, maximize: true, placement: 'outer-edges', fitArea
  };
}

function getLayoutState(
  index,
  compact,
  viewportWidth = window.innerWidth,
  viewportHeight = window.visualViewport?.height || window.innerHeight
) {
  if (index === 3 && viewportWidth > viewportHeight) {
    // Compensate only for the mobile camera pitch, preserving the same view.
    const cameraPitchCorrection = compact ? Math.atan2(0.34, 0.56) - Math.atan2(0.515, 0.88) : 0;
    const poses = Object.fromEntries(['left', 'right'].map((side) => {
      const angles = LANDSCAPE_EXPLODED_ROTATION_DEG[side];
      return [side, createPose({
        y: 0, z: 0.02, scale: 0.92,
        rotationX: THREE.MathUtils.degToRad(angles.x) + cameraPitchCorrection,
        rotationY: THREE.MathUtils.degToRad(angles.y),
        rotationZ: THREE.MathUtils.degToRad(angles.z)
      })];
    }));
    return { explosion: 1, explosionOrientation: 'horizontal', ...poses };
  }
  const mobileWidthProgress = THREE.MathUtils.clamp((viewportWidth - 338) / (446 - 338), 0, 1);
  const mobileHeightProgress = THREE.MathUtils.clamp((viewportHeight - 619) / (844 - 619), 0, 1);
  const mobileExplosionY = THREE.MathUtils.lerp(-0.23, -0.27, mobileHeightProgress);
  const mobileExplosionScale = THREE.MathUtils.lerp(0.82, 0.88, mobileWidthProgress);
  const mobileExplosionPitch = THREE.MathUtils.lerp(-0.22, -0.28, mobileHeightProgress);
  const desktop = [
    {
      explosion: 0,
      left: createPose({ y: 0.035, z: 0.045, scale: 1.32, rotationX: 0.38 }),
      right: createPose({ y: 0.035, z: 0.045, scale: 1.32, rotationX: 0.38 })
    },
    {
      explosion: 0,
      left: createPose(EXIT_TARGETS.desktop.left),
      right: createPose({ x: 0.095, y: 0.018, z: 0.105, scale: 1.86, rotationX: -0.12, rotationY: -0.44, rotationZ: -0.13, foreground: 1 })
    },
    {
      explosion: 0,
      left: createPose({ x: -0.095, y: 0.018, z: 0.105, scale: 1.86, rotationX: -0.12, rotationY: 0.44, rotationZ: 0.13, foreground: 1 }),
      right: createPose(EXIT_TARGETS.desktop.right)
    },
    {
      explosion: 1,
      left: createPose({ y: -0.09, z: 0.02, scale: 0.92, rotationX: 0.16 }),
      right: createPose({ y: -0.09, z: 0.02, scale: 0.92, rotationX: 0.16 })
    }
  ];
  const mobile = [
    {
      explosion: 0,
      left: createPose({ y: -0.06, z: 0.02, scale: 0.82, rotationX: 0.24 }),
      right: createPose({ y: -0.06, z: 0.02, scale: 0.82, rotationX: 0.24 })
    },
    {
      explosion: 0,
      left: createPose(EXIT_TARGETS.mobile.left),
      right: createPose({ x: 0.014, y: 0.105, z: 0.035, scale: 2.2, rotationX: -0.05, rotationY: -0.26, rotationZ: -0.08 })
    },
    {
      explosion: 0,
      left: createPose({ x: -0.014, y: 0.105, z: 0.035, scale: 2.2, rotationX: -0.05, rotationY: 0.26, rotationZ: 0.08 }),
      right: createPose(EXIT_TARGETS.mobile.right)
    },
    {
      explosion: 1,
      left: createPose({ y: mobileExplosionY, z: 0.035, scale: mobileExplosionScale, rotationX: mobileExplosionPitch }),
      right: createPose({ y: mobileExplosionY, z: 0.035, scale: mobileExplosionScale, rotationX: mobileExplosionPitch })
    }
  ];
  return (compact ? mobile : desktop)[index] || (compact ? mobile[0] : desktop[0]);
}

function createPose(overrides = {}) {
  return {
    x: 0,
    y: 0,
    z: 0,
    scale: 1,
    opacity: 1,
    rotationX: 0,
    rotationY: 0,
    rotationZ: 0,
    cornerTwist: 0,
    foreground: 0,
    ...overrides
  };
}

function createExitPose(side, compact = false) {
  const direction = side === 'left' ? -1 : 1;
  return createPose({
    x: direction * (compact ? 0.3 : 0.58),
    y: compact ? 0.62 : 0.55,
    z: compact ? 0.34 : 0.26,
    scale: compact ? 2.35 : 2.15,
    opacity: 0,
    rotationX: compact ? -0.5 : -0.55,
    rotationY: direction * (compact ? -1 : -1.25),
    rotationZ: direction * (compact ? -0.12 : -0.16),
    cornerTwist: compact ? 0.78 : 0.9
  });
}

function createStagingPose(side, compact = false) {
  const direction = side === 'left' ? -1 : 1;
  return createPose({
    x: direction * (compact ? 0.12 : 0.3),
    y: compact ? 0.5 : 0.3,
    z: compact ? 0.28 : 0.18,
    scale: compact ? 2.25 : 2,
    opacity: 0,
    rotationX: compact ? -0.4 : -0.34,
    rotationY: direction * (compact ? -0.66 : -0.72),
    rotationZ: direction * -0.1,
    cornerTwist: compact ? 0.52 : 0.5
  });
}

function createCollisionSafeStagingPose(side, target, compact = false) {
  const direction = side === 'left' ? -1 : 1;
  return createPose({
    ...target,
    x: target.x + direction * (compact ? 0.045 : 0.1),
    y: target.y + (compact ? 0.035 : 0.07),
    z: target.z + (compact ? 0.025 : 0.04),
    scale: target.scale,
    opacity: 0,
    foreground: 0
  });
}

function setModelTarget(model, state, immediate, waveDirection = 1) {
  const explosionTarget = state.explosion || 0;
  if (immediate) {
    Object.entries(model.halves).forEach(([side, half]) => {
      Object.assign(half.target, state[side]);
      Object.assign(half.current, half.target);
      half.motion = null;
      resetPartMotion(half);
      applyHalfState(half);
    });
    setExplosionTarget(model.explosion, explosionTarget, true, waveDirection);
    return;
  }
  const delays = planMotionDelays(model, state);
  const now = performance.now();
  Object.entries(model.halves).forEach(([side, half]) => {
    Object.assign(half.target, state[side]);
    if (half.current.opacity > 0.5 && half.target.opacity < 0.5) {
      // A responsive close-up may exceed the original exit scale. Keep the
      // forward exit growing continuously from the displayed size.
      half.target.scale = Math.max(half.target.scale, half.current.scale * 1.16);
    }
    half.motion = createCurvedMotion(half, half.target, now + delays[side], explosionTarget > 0);
  });
  if (explosionTarget > 0) {
    setExplosionTarget(model.explosion, explosionTarget, false, waveDirection, now);
  } else if (model.explosion.current > 0 || model.explosion.target > 0 || model.explosion.motion) {
    setExplosionTarget(model.explosion, explosionTarget, false, waveDirection, now);
  } else {
    // Ordinary scenes stay assembled without starting another exploded-view wave.
    setExplosionTarget(model.explosion, explosionTarget, true, waveDirection, now);
  }
}

function setExplosionTarget(explosion, target, immediate, waveDirection, now = performance.now()) {
  if (immediate || reduceMotion.matches) {
    explosion.target = target;
    explosion.current = target;
    explosion.motion = null;
    explosion.units.forEach((unit) => {
      unit.explosionAmount = target;
    });
    syncExplosionAmounts(explosion);
    applyExplosionState(explosion);
    return;
  }
  if (target === explosion.target && !explosion.motion) {
    return;
  }
  if (target === explosion.target && explosion.motion) {
    return;
  }
  explosion.target = target;
  explosion.motion = {
    start: now,
    target,
    units: explosion.units.map((unit) => ({
      unit,
      from: unit.explosionAmount,
      delay: waveDirection >= 0 ? unit.waveDelay : explosion.maxWaveDelay - unit.waveDelay
    }))
  };
}

function planMotionDelays(model, state) {
  if (reduceMotion.matches) {
    return { left: 0, right: 0 };
  }
  const followDelay = compactLayout.matches ? 70 : 110;
  const roles = Object.fromEntries(Object.entries(model.halves).map(([side, half]) => [side, {
    exiting: half.current.opacity > 0.5 && state[side].opacity < 0.5,
    energy: motionEnergy(half.current, state[side])
  }]));
  const delays = { left: 0, right: 0 };
  if (roles.left.exiting !== roles.right.exiting) {
    delays[roles.left.exiting ? 'right' : 'left'] = followDelay;
  } else if (Math.abs(roles.left.energy - roles.right.energy) > 0.02) {
    delays[roles.left.energy > roles.right.energy ? 'right' : 'left'] = followDelay;
  }
  return delays;
}

function motionEnergy(from, to) {
  return Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z) +
    Math.abs(to.scale - from.scale) * 0.12;
}

function createPartMotion(from, to, direction, swing) {
  const cornerDelta = to.cornerTwist - from.cornerTwist;
  const axis = new THREE.Vector3(
    to.rotationX - from.rotationX + cornerDelta * 0.45,
    to.rotationY - from.rotationY - direction * swing * 0.14,
    to.rotationZ - from.rotationZ + direction * cornerDelta * 0.45
  );
  const angularTravel = axis.length();
  if (angularTravel < 0.001) {
    axis.set(0.35, -direction, 0.45);
  }
  return {
    axis: axis.normalize(),
    amplitude: Math.min(PART_ROTATION_MAX, 0.012 + angularTravel * 0.025 + swing * 0.016)
  };
}

function resetPartMotion(half) {
  half.partMotionProgress = 1;
  half.partMotionAmplitude = 0;
}

function createCurvedMotion(half, target, start = performance.now(), explodedDestination = false) {
  const from = { ...half.current };
  const to = { ...target };
  const compact = compactLayout.matches;
  const exiting = from.opacity > 0.5 && to.opacity < 0.5;
  const entering = !exiting && from.opacity < 0.2 && to.opacity > 0.5;
  if (entering) {
    const staging = explodedDestination || to.scale <= COMPACT_DESTINATION_SCALE
      ? createCollisionSafeStagingPose(half.side, to, compact)
      : (compact ? STAGING_TARGETS.mobile : STAGING_TARGETS.desktop)[half.side];
    Object.assign(from, staging);
  }
  const direction = Math.sign(to.x - from.x) || (half.side === 'left' ? -1 : 1);
  const baseDuration = compact ? 1080 : 1380;

  if (exiting) {
    const control = {
      x: from.x + direction * (compact ? 0.02 : 0.05),
      y: from.y + (compact ? 0.16 : 0.17),
      z: from.z + (compact ? 0.09 : 0.1),
      scale: THREE.MathUtils.lerp(from.scale, to.scale, 0.35)
    };
    const control2 = {
      x: to.x - direction * (compact ? 0.09 : 0.12),
      y: to.y - (compact ? 0.05 : 0.06),
      z: to.z - (compact ? 0.04 : 0.05),
      scale: THREE.MathUtils.lerp(from.scale, to.scale, 0.86)
    };
    return {
      start,
      duration: reduceMotion.matches ? 1 : baseDuration,
      from,
      to,
      control,
      control2,
      exiting: true,
      partMotion: createPartMotion(from, to, direction, 1)
    };
  }

  const travelX = to.x - from.x;
  const energy = motionEnergy(from, to);
  const swing = THREE.MathUtils.clamp(energy / (compact ? 0.36 : 0.55), 0, 1);
  const liftY = (compact ? 0.05 : 0.085) + energy * 0.14;
  const liftZ = (compact ? 0.045 : 0.075) + energy * 0.1;
  const bankSettle = (axis) => 1 - THREE.MathUtils.clamp(Math.abs(to[axis] - from[axis]) / 0.4, 0, 0.8);
  return {
    start,
    duration: reduceMotion.matches ? 1 : Math.round(baseDuration * (0.86 + 0.34 * swing)),
    from,
    to,
    control: entering ? {
      x: from.x + travelX * 0.3,
      y: THREE.MathUtils.lerp(from.y, to.y, 0.3),
      z: THREE.MathUtils.lerp(from.z, to.z, 0.25) + liftZ * 0.3,
      scale: THREE.MathUtils.lerp(from.scale, to.scale, 0.3)
    } : {
      x: from.x + travelX * 0.22,
      y: Math.max(from.y, to.y) + liftY,
      z: Math.max(from.z, to.z) + liftZ * 0.8,
      scale: THREE.MathUtils.lerp(from.scale, to.scale, 0.3)
    },
    control2: {
      x: to.x - travelX * 0.18,
      y: to.y + liftY * 0.35,
      z: to.z + liftZ * 0.45,
      scale: THREE.MathUtils.lerp(from.scale, to.scale, 0.9)
    },
    exiting: false,
    bank: {
      rotationX: -(0.06 + 0.2 * swing) * bankSettle('rotationX'),
      rotationY: -direction * (0.12 + 0.3 * swing) * bankSettle('rotationY'),
      rotationZ: -direction * (0.08 + 0.2 * swing) * bankSettle('rotationZ')
    },
    twistAmp: Math.min(0.34, 0.1 + 0.32 * swing) *
      (1 - THREE.MathUtils.clamp(Math.abs(to.cornerTwist - from.cornerTwist) / 0.5, 0, 0.8)),
    partMotion: createPartMotion(from, to, direction, swing)
  };
}

function updateModel(model, time) {
  Object.values(model.halves).forEach((half) => {
    updateHalfMotion(half, time);
    applyHalfState(half);
  });
  updateExplosionState(model.explosion, time);
}

function updateExplosionState(explosion, time) {
  if (explosion.motion) {
    let finished = true;
    explosion.motion.units.forEach(({ unit, from, delay }) => {
      const progress = THREE.MathUtils.clamp(
        (time - explosion.motion.start - delay) / EXPLOSION_WAVE_DURATION,
        0,
        1
      );
      unit.explosionAmount = THREE.MathUtils.lerp(from, explosion.motion.target, smootherStep(progress));
      finished = finished && progress >= 1;
    });
    if (finished) {
      explosion.units.forEach((unit) => {
        unit.explosionAmount = explosion.target;
      });
      explosion.motion = null;
    }
  }
  syncExplosionAmounts(explosion);
  if (!explosion.motion) {
    explosion.current = explosion.target;
  }
  applyExplosionState(explosion);
}

function syncExplosionAmounts(explosion) {
  explosion.layers.forEach((layer) => {
    layer.explosionAmount = layer.units.reduce((sum, unit) => sum + unit.explosionAmount, 0) /
      layer.units.length;
  });
  explosion.current = explosion.units.reduce((sum, unit) => sum + unit.explosionAmount, 0) /
    explosion.units.length;
}

function getExplosionSpacingScale() {
  const viewportHeight = window.visualViewport?.height || window.innerHeight;
  if (window.innerWidth > viewportHeight) {
    return THREE.MathUtils.lerp(0.85, 1.6,
      THREE.MathUtils.clamp((window.innerWidth / viewportHeight - 1) / 3, 0, 1));
  }
  if (!compactLayout.matches) {
    return 1;
  }
  return THREE.MathUtils.lerp(
    MOBILE_EXPLOSION_SPACING_MIN,
    MOBILE_EXPLOSION_SPACING_MAX,
    THREE.MathUtils.clamp((viewportHeight - 619) / (844 - 619), 0, 1)
  );
}

function applyExplosionState(explosion) {
  explosion.spacingScale = getExplosionSpacingScale();
  const spacing = explosion.spacing * explosion.spacingScale;
  explosion.layers.forEach((layer) => {
    layer.object.position.copy(layer.basePosition);
  });
  const topCaseOffsets = Object.fromEntries(
    explosion.layers
      .filter((layer) => layer.name === 'top_case')
      .map((layer) => [layer.side, layer.order * spacing * layer.explosionAmount])
  );
  explosion.units.forEach((unit) => {
    const requestedOffset = unit.layer.order * spacing * unit.explosionAmount;
    const appliedOffset = TOP_CASE_CONSTRAINED_LAYERS.has(unit.layer.name)
      ? Math.min(requestedOffset, (topCaseOffsets[unit.side] || 0) * TOP_CASE_CLEARANCE_RATIO)
      : requestedOffset;
    unit.appliedOffset = appliedOffset;
    unit.object.position.copy(unit.basePosition);
    unit.object.position.z += appliedOffset;
    unit.object.quaternion.copy(unit.baseQuaternion);
    const phaseStart = unit.rotationPhase * PART_ROTATION_STAGGER;
    const rotationProgress = THREE.MathUtils.clamp(
      (unit.layer.half.partMotionProgress - phaseStart) / (1 - phaseStart),
      0,
      1
    );
    const rotationEnvelope = bellImpulse(rotationProgress, 0.42);
    unit.partRotationAmount = reduceMotion.matches
      ? 0
      : -unit.layer.half.partMotionAmplitude * unit.rotationWeight *
        rotationEnvelope * unit.explosionAmount;
    if (Math.abs(unit.partRotationAmount) > 0.00001) {
      unit.partRotationAxis
        .copy(unit.layer.half.partMotionAxis)
        .addScaledVector(unit.rotationAxisJitter, 0.16)
        .normalize();
      unit.partRotationQuaternion.setFromAxisAngle(
        unit.partRotationAxis,
        unit.partRotationAmount
      );
      unit.object.quaternion.multiply(unit.partRotationQuaternion);
    }
  });
}

function updateHalfMotion(half, time) {
  const motion = half.motion;
  if (!motion) {
    resetPartMotion(half);
    return;
  }
  const rawProgress = Math.min(1, Math.max(0, (time - motion.start) / motion.duration));
  const progress = smootherStep(rawProgress);
  half.partMotionProgress = rawProgress;
  half.partMotionAmplitude = motion.partMotion.amplitude;
  half.partMotionAxis.copy(motion.partMotion.axis);
  if (motion.exiting) {
    ['x', 'y', 'z', 'scale'].forEach((key) => {
      half.current[key] = cubicBezier(motion.from[key], motion.control[key], motion.control2[key], motion.to[key], progress);
    });
    const attitudeProgress = smootherStep(THREE.MathUtils.clamp(rawProgress / 0.45, 0, 1));
    ['rotationX', 'rotationY', 'rotationZ'].forEach((key) => {
      half.current[key] = THREE.MathUtils.lerp(motion.from[key], motion.to[key], attitudeProgress);
    });
    const twistProgress = smootherStep(THREE.MathUtils.clamp(rawProgress / 0.42, 0, 1));
    half.current.cornerTwist = THREE.MathUtils.lerp(motion.from.cornerTwist, motion.to.cornerTwist, twistProgress);
    const opacityProgress = smootherStep(THREE.MathUtils.clamp((rawProgress - 0.68) / 0.32, 0, 1));
    const foregroundProgress = smootherStep(THREE.MathUtils.clamp((rawProgress - 0.72) / 0.28, 0, 1));
    half.current.opacity = THREE.MathUtils.lerp(motion.from.opacity, motion.to.opacity, opacityProgress);
    half.current.foreground = THREE.MathUtils.lerp(motion.from.foreground, motion.to.foreground, foregroundProgress);
  } else {
    ['x', 'y', 'z', 'scale'].forEach((key) => {
      half.current[key] = cubicBezier(motion.from[key], motion.control[key], motion.control2[key], motion.to[key], progress);
    });
    const poseProgress = smootherStep(Math.min(1, rawProgress / 0.9));
    const bankImpulse = bellImpulse(rawProgress, 0.34);
    const overshootImpulse = bellImpulse(rawProgress, 0.6) * 0.08;
    ['rotationX', 'rotationY', 'rotationZ'].forEach((key) => {
      const span = motion.to[key] - motion.from[key];
      half.current[key] = motion.from[key] + span * (poseProgress + overshootImpulse) +
        motion.bank[key] * bankImpulse;
    });
    half.current.cornerTwist = THREE.MathUtils.lerp(motion.from.cornerTwist, motion.to.cornerTwist, poseProgress) +
      motion.twistAmp * bellImpulse(rawProgress, 0.42);
    const fadeProgress = motion.to.opacity > motion.from.opacity
      ? smootherStep(Math.min(1, rawProgress / 0.3))
      : progress;
    half.current.opacity = THREE.MathUtils.lerp(motion.from.opacity, motion.to.opacity, fadeProgress);
    half.current.foreground = THREE.MathUtils.lerp(motion.from.foreground, motion.to.foreground, progress);
  }
  if (rawProgress >= 1) {
    Object.assign(half.current, motion.to);
    half.motion = null;
    resetPartMotion(half);
  }
}

function bellImpulse(progress, peak) {
  if (progress <= 0 || progress >= 1) {
    return 0;
  }
  return progress < peak
    ? smootherStep(progress / peak)
    : 1 - smootherStep((progress - peak) / (1 - peak));
}

function cubicBezier(start, control1, control2, end, progress) {
  const inverse = 1 - progress;
  return inverse * inverse * inverse * start +
    3 * inverse * inverse * progress * control1 +
    3 * inverse * progress * progress * control2 +
    progress * progress * progress * end;
}

function smootherStep(progress) {
  return progress * progress * progress * (progress * (progress * 6 - 15) + 10);
}

function applyHalfState(half) {
  const {
    object,
    current,
    baseScale,
    baseQuaternion,
    rotationEuler,
    rotationQuaternion,
    cornerTwistAxis,
    cornerTwistQuaternion,
    cornerTwistDirection,
    materialStates
  } = half;
  object.position.set(current.x, current.y, current.z);
  object.scale.copy(baseScale).multiplyScalar(current.scale);
  rotationEuler.set(current.rotationX, current.rotationY, current.rotationZ);
  rotationQuaternion.setFromEuler(rotationEuler);
  cornerTwistQuaternion.setFromAxisAngle(
    cornerTwistAxis,
    current.cornerTwist * cornerTwistDirection
  );
  object.quaternion
    .copy(baseQuaternion)
    .multiply(rotationQuaternion)
    .multiply(cornerTwistQuaternion);
  const opacity = THREE.MathUtils.clamp(current.opacity, 0, 1);
  object.visible = opacity > 0.002;
  materialStates.forEach((state) => {
    const { material } = state;
    const transparent = state.baseTransparent || opacity < 0.999;
    if (material.transparent !== transparent) {
      material.transparent = transparent;
      material.needsUpdate = true;
    }
    material.opacity = state.baseOpacity * opacity;
    material.depthWrite = state.baseDepthWrite && opacity > 0.35;
  });
}

function publishPoseSnapshot(model) {
  if (!model) {
    return;
  }
  publicState.currentPoses = Object.fromEntries(Object.entries(model.halves).map(([side, half]) => [
    side,
    { ...half.current }
  ]));
  publicState.explosionAmount = model.explosion.current;
  publicState.explosionTarget = model.explosion.target;
  publicState.explosionLayerAmounts = model.explosion.layers.map((layer) => layer.explosionAmount);
  publicState.explosionItemAmounts = model.explosion.units.map((unit) => unit.explosionAmount);
  publicState.explosionItemOffsets = model.explosion.units.map((unit) => unit.appliedOffset * MODEL_UNIT_SCALE);
  publicState.explosionLateralDrift = Math.max(...model.explosion.units.map((unit) => Math.hypot(
    unit.object.position.x - unit.basePosition.x,
    unit.object.position.y - unit.basePosition.y
  ))) * MODEL_UNIT_SCALE;
  publicState.explosionItemRotations = model.explosion.units.map((unit) => Math.abs(unit.partRotationAmount));
  publicState.explosionSpacingScale = model.explosion.spacingScale;
}
