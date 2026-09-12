import * as THREE from 'three';

export function createModelInteraction({ models, camera, state, reset }) {
  const root = document.querySelector('.surround-interaction');
  const canvas = document.getElementById('surround-canvas');
  const areas = [...root.querySelectorAll('[data-surround-model]')];
  const status = { enabled: false, dragging: false, mode: 'rotate', side: null, modified: false };
  state.interaction = status;
  let drag = null;
  let tabNavigation = false;
  const boundsCache = new Map();
  const point = new THREE.Vector3();
  const rightAxis = new THREE.Vector3();
  const upAxis = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const orientation = new THREE.Quaternion();
  const euler = new THREE.Euler(0, 0, 0, 'XYZ');

  function canInteract() {
    return state.ready && !state.failed && !state.motionActive &&
      Number(getComputedStyle(canvas).opacity) >= 0.999 &&
      document.body.dataset.surroundStop !== 'surround-footer' &&
      window.MDWSurroundNavigation?.isSettled() === true;
  }

  function endDrag() {
    if (!drag) return;
    const pointers = drag.pointers;
    drag = null;
    status.dragging = false;
    pointers.forEach(({ area }, pointerId) => {
      area.classList.remove('is-dragging');
      if (area.hasPointerCapture(pointerId)) area.releasePointerCapture(pointerId);
    });
  }

  function cancel() {
    endDrag();
    status.enabled = false;
    root.hidden = true;
  }

  function resetLayout() {
    if (!canInteract()) return;
    endDrag();
    reset();
    status.modified = false;
  }

  function manipulate(side, dx, dy, mode) {
    if (!canInteract()) return;
    const half = models[state.theme].halves[side];
    if (half.current.opacity < 0.99) return;
    const pose = { ...half.current };
    rightAxis.setFromMatrixColumn(camera.matrixWorld, 0);
    upAxis.setFromMatrixColumn(camera.matrixWorld, 1);
    if (mode === 'move') {
      // Translate in the camera plane so a drag follows the pointer at any angle.
      point.set(pose.x, pose.y, pose.z).applyMatrix4(camera.matrixWorldInverse);
      const unitsPerPixel = 2 * Math.abs(point.z) * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) /
        (window.visualViewport?.height || window.innerHeight);
      point.copy(rightAxis).multiplyScalar(dx * unitsPerPixel)
        .addScaledVector(upAxis, -dy * unitsPerPixel);
      const limit = 0.3;
      for (const axis of ['x', 'y', 'z']) {
        pose[axis] = THREE.MathUtils.clamp(pose[axis] + point[axis], half.target[axis] - limit, half.target[axis] + limit);
      }
    } else {
      orientation.setFromEuler(euler.set(pose.rotationX, pose.rotationY, pose.rotationZ));
      rotation.setFromAxisAngle(upAxis, dx * 0.008);
      orientation.premultiply(rotation);
      rotation.setFromAxisAngle(rightAxis, dy * 0.008);
      orientation.premultiply(rotation);
      euler.setFromQuaternion(orientation);
      pose.rotationX = euler.x;
      pose.rotationY = euler.y;
      pose.rotationZ = euler.z;
    }
    // Both colorways share the user's pose. The authored target is kept for reset
    // and the next section's animation starts from the pose the user is viewing.
    Object.values(models).forEach((model) => Object.assign(model.halves[side].current, pose));
    status.side = side;
    status.modified = true;
  }

  // Scripted focus on pointerdown can inherit :focus-visible from the previous
  // keyboard focus. Track Tab navigation explicitly for these model outlines.
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Tab') tabNavigation = true;
  }, true);
  document.addEventListener('pointerdown', () => {
    tabNavigation = false;
    areas.forEach((area) => area.classList.remove('is-tab-focused'));
  }, true);

  areas.forEach((area) => {
    const side = area.dataset.surroundModel;
    area.addEventListener('focus', () => {
      area.classList.toggle('is-tab-focused', tabNavigation);
    });
    area.addEventListener('blur', () => area.classList.remove('is-tab-focused'));
    area.addEventListener('pointerdown', (event) => {
      if (!canInteract() || ![0, 1].includes(event.button)) return;
      const touch = event.pointerType === 'touch';
      if (drag && (!touch || drag.type !== 'touch' || drag.pointers.size >= 2)) return;
      if (!touch && !event.isPrimary) return;
      event.preventDefault();
      area.focus({ preventScroll: true });
      if (!drag) {
        drag = { side, type: event.pointerType, mode: event.button === 1 ? 'move' : 'rotate', pointers: new Map() };
      }
      drag.pointers.set(event.pointerId, { area, x: event.clientX, y: event.clientY });
      status.side = drag.side;
      status.mode = drag.pointers.size === 2 ? 'move' : drag.mode;
      status.dragging = true;
      area.setPointerCapture(event.pointerId);
      area.classList.add('is-dragging');
    });
    area.addEventListener('pointermove', (event) => {
      const pointer = drag?.pointers.get(event.pointerId);
      if (!pointer) return;
      if (!canInteract()) { endDrag(); return; }
      event.preventDefault();
      // With two contacts, moving each contact contributes to the centroid pan.
      const count = drag.pointers.size;
      const mode = count === 2 ? 'move' : drag.mode;
      manipulate(drag.side, (event.clientX - pointer.x) / count, (event.clientY - pointer.y) / count, mode);
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      status.mode = mode;
    });
    for (const eventName of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      area.addEventListener(eventName, (event) => {
        if (!drag?.pointers.has(event.pointerId)) return;
        if (eventName === 'pointercancel') { endDrag(); return; }
        drag.pointers.delete(event.pointerId);
        if (area.hasPointerCapture(event.pointerId)) area.releasePointerCapture(event.pointerId);
        if (![...drag.pointers.values()].some((pointer) => pointer.area === area)) area.classList.remove('is-dragging');
        if (!drag.pointers.size) endDrag();
      });
    }
    area.addEventListener('auxclick', (event) => { if (event.button === 1) event.preventDefault(); });
    area.addEventListener('keydown', (event) => {
      if (!canInteract()) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        resetLayout();
        return;
      }
      const delta = { ArrowLeft: [-12, 0], ArrowRight: [12, 0], ArrowUp: [0, -12], ArrowDown: [0, 12] }[event.key];
      if (!delta) return;
      event.preventDefault();
      manipulate(side, ...delta, event.shiftKey ? 'move' : 'rotate');
    });
  });
  window.addEventListener('blur', endDrag);
  document.addEventListener('visibilitychange', () => { if (document.hidden) endDrag(); });

  function update() {
    status.enabled = Boolean(canInteract());
    root.hidden = !status.enabled;
    if (!status.enabled) { endDrag(); return; }
    camera.updateMatrixWorld();
    const width = window.innerWidth;
    const height = window.visualViewport?.height || window.innerHeight;
    areas.forEach((area) => {
      const side = area.dataset.surroundModel;
      const half = models[state.theme].halves[side];
      area.hidden = half.current.opacity < 0.99;
      if (area.hidden) return;
      const key = `${state.theme}:${JSON.stringify(half.current)}:${state.explosionAmount}`;
      let cached = boundsCache.get(side);
      if (cached?.key !== key) {
        half.object.updateWorldMatrix(true, true);
        cached = { key, box: new THREE.Box3().setFromObject(half.object) };
        boundsCache.set(side, cached);
      }
      const bounds = { left: width, right: 0, top: height, bottom: 0 };
      for (const x of [cached.box.min.x, cached.box.max.x]) {
        for (const y of [cached.box.min.y, cached.box.max.y]) {
          for (const z of [cached.box.min.z, cached.box.max.z]) {
            point.set(x, y, z).project(camera);
            const px = (point.x + 1) * width / 2;
            const py = (1 - point.y) * height / 2;
            bounds.left = Math.min(bounds.left, px);
            bounds.right = Math.max(bounds.right, px);
            bounds.top = Math.min(bounds.top, py);
            bounds.bottom = Math.max(bounds.bottom, py);
          }
        }
      }
      const left = Math.max(0, bounds.left);
      const top = Math.max(0, bounds.top);
      area.style.left = `${left}px`;
      area.style.top = `${top}px`;
      area.style.width = `${Math.max(0, Math.min(width, bounds.right) - left)}px`;
      area.style.height = `${Math.max(0, Math.min(height, bounds.bottom) - top)}px`;
    });
  }

  return { update, cancel };
}
