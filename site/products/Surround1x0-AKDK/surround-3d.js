import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const visual = document.querySelector('.surround-visual');
const canvas = document.getElementById('surround-canvas');
const fallback = document.querySelector('.surround-visual__fallback');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const compactLayout = window.matchMedia('(max-width: 42rem)');
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
    visual.classList.add('is-fallback');
    fallback?.removeAttribute('hidden');
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

  const motion = {
    pointerX: 0,
    pointerY: 0,
    targetPointerX: 0,
    targetPointerY: 0,
    lastTime: performance.now()
  };

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
    publicState.activeScene = normalized;
    publicState.foregroundSide = normalized === 1 ? 'right' : (normalized === 2 ? 'left' : null);
    const state = getLayoutState(normalized, compactLayout.matches, window.innerWidth);
    publicState.heroSpread = normalized === 0 ? Math.abs(state.left.x) : null;
    Object.values(models).forEach((model) => setModelTarget(model, state, immediate));
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
    if (reduceMotion.matches) {
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
      Object.values(model.halves).some((half) => Boolean(half.motion))
    ));

    const compact = compactLayout.matches;
    const baseX = 0;
    const baseY = compact ? 0.56 : 0.34;
    camera.position.x = baseX + motion.pointerX * (compact ? 0.008 : 0.015);
    camera.position.y = baseY - motion.pointerY * (compact ? 0.005 : 0.009);
    camera.lookAt(motion.pointerX * -0.008, compact ? 0.045 : 0, 0);

    if (!document.hidden) {
      renderer.render(scene, camera);
    }
    publishPoseSnapshot(models[publicState.theme]);
    window.requestAnimationFrame(render);
  }

  syncTheme();
  resize();
  setScene(publicState.activeScene, true);
  visual.style.setProperty('--surround-load-progress', '100%');
  visual.classList.add('is-ready');
  publicState.ready = true;

  const themeObserver = new MutationObserver(syncTheme);
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme']
  });

  window.addEventListener('surround:segment-change', (event) => {
    setScene(event.detail?.index);
  });
  window.addEventListener('pointermove', handlePointerMove, { passive: true });
  window.addEventListener('resize', resize, { passive: true });
  window.visualViewport?.addEventListener('resize', resize, { passive: true });
  compactLayout.addEventListener?.('change', resize);
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    publicState.failed = true;
    visual.classList.remove('is-ready');
    visual.classList.add('is-fallback');
    fallback?.removeAttribute('hidden');
  });
  window.requestAnimationFrame(render);
}

function prepareModel(group, colorName) {
  group.name = `Surround1x0-AKDK-${colorName}`;
  const left = group.getObjectByName(`Surround1x0-AKDK-${colorName}_Left`);
  const right = group.getObjectByName(`Surround1x0-AKDK-${colorName}_Right`);
  if (!left || !right) {
    throw new Error(`The ${colorName} GLB does not contain separate left and right keyboard roots.`);
  }

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

  return {
    group,
    halves: {
      left: createHalfState(left, 'left'),
      right: createHalfState(right, 'right')
    }
  };
}

function createHalfState(object, side) {
  const direction = side === 'left' ? -1 : 1;
  const materialStates = [];
  object.traverse((child) => {
    if (!child.isMesh || !child.material) {
      return;
    }
    const sourceMaterials = Array.isArray(child.material) ? child.material : [child.material];
    const clonedMaterials = sourceMaterials.map((source) => {
      const material = source.clone();
      materialStates.push({
        material,
        baseOpacity: source.opacity,
        baseTransparent: source.transparent,
        baseDepthWrite: source.depthWrite
      });
      return material;
    });
    child.material = Array.isArray(child.material) ? clonedMaterials : clonedMaterials[0];
  });
  return {
    side,
    object,
    materialStates,
    baseScale: object.scale.clone(),
    baseQuaternion: object.quaternion.clone(),
    rotationEuler: new THREE.Euler(0, 0, 0, 'XYZ'),
    rotationQuaternion: new THREE.Quaternion(),
    cornerTwistAxis: new THREE.Vector3(direction, 0, 1).normalize(),
    cornerTwistQuaternion: new THREE.Quaternion(),
    cornerTwistDirection: direction,
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

function getLayoutState(index, compact, viewportWidth = window.innerWidth) {
  const heroSpread = compact
    ? 0.105
    : THREE.MathUtils.lerp(
      0.1,
      0.205,
      THREE.MathUtils.clamp((viewportWidth - 672) / (1065 - 672), 0, 1)
    );
  const desktop = [
    {
      left: createPose({ x: -heroSpread, y: 0.035, z: 0.045, scale: 1.32, rotationX: 0.38 }),
      right: createPose({ x: heroSpread, y: 0.035, z: 0.045, scale: 1.32, rotationX: 0.38 })
    },
    {
      left: createPose(EXIT_TARGETS.desktop.left),
      right: createPose({ x: 0.095, y: 0.018, z: 0.105, scale: 1.86, rotationX: -0.12, rotationY: -0.44, rotationZ: -0.13, foreground: 1 })
    },
    {
      left: createPose({ x: -0.095, y: 0.018, z: 0.105, scale: 1.86, rotationX: -0.12, rotationY: 0.44, rotationZ: 0.13, foreground: 1 }),
      right: createPose(EXIT_TARGETS.desktop.right)
    },
    {
      left: createPose({ x: -0.165, y: 0.025, z: 0.015, scale: 1.08 }),
      right: createPose({ x: 0.165, y: 0.025, z: 0.015, scale: 1.08 })
    }
  ];
  const mobile = [
    {
      left: createPose({ x: -0.105, y: -0.06, z: 0.02, scale: 0.82, rotationX: 0.24 }),
      right: createPose({ x: 0.105, y: -0.06, z: 0.02, scale: 0.82, rotationX: 0.24 })
    },
    {
      left: createPose(EXIT_TARGETS.mobile.left),
      right: createPose({ x: 0.014, y: 0.105, z: 0.035, scale: 2.2, rotationX: -0.05, rotationY: -0.26, rotationZ: -0.08 })
    },
    {
      left: createPose({ x: -0.014, y: 0.105, z: 0.035, scale: 2.2, rotationX: -0.05, rotationY: 0.26, rotationZ: 0.08 }),
      right: createPose(EXIT_TARGETS.mobile.right)
    },
    {
      left: createPose({ x: -0.09, y: 0.155, z: 0, scale: 0.72 }),
      right: createPose({ x: 0.09, y: 0.155, z: 0, scale: 0.72 })
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

function setModelTarget(model, state, immediate) {
  if (immediate) {
    Object.entries(model.halves).forEach(([side, half]) => {
      Object.assign(half.target, state[side]);
      Object.assign(half.current, half.target);
      half.motion = null;
      applyHalfState(half);
    });
    return;
  }
  const delays = planMotionDelays(model, state);
  const now = performance.now();
  Object.entries(model.halves).forEach(([side, half]) => {
    Object.assign(half.target, state[side]);
    half.motion = createCurvedMotion(half, half.target, now + delays[side]);
  });
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

function createCurvedMotion(half, target, start = performance.now()) {
  const from = { ...half.current };
  const to = { ...target };
  const compact = compactLayout.matches;
  const exiting = from.opacity > 0.5 && to.opacity < 0.5;
  const entering = !exiting && from.opacity < 0.2 && to.opacity > 0.5;
  if (entering) {
    Object.assign(from, (compact ? STAGING_TARGETS.mobile : STAGING_TARGETS.desktop)[half.side]);
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
      exiting: true
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
      (1 - THREE.MathUtils.clamp(Math.abs(to.cornerTwist - from.cornerTwist) / 0.5, 0, 0.8))
  };
}

function updateModel(model, time) {
  Object.values(model.halves).forEach((half) => {
    updateHalfMotion(half, time);
    applyHalfState(half);
  });
}

function updateHalfMotion(half, time) {
  const motion = half.motion;
  if (!motion) {
    return;
  }
  const rawProgress = Math.min(1, Math.max(0, (time - motion.start) / motion.duration));
  const progress = smootherStep(rawProgress);
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
}
