// Philosophy セクションに、テーマ連動のコントリビューショングラフ風背景を描画する。
(function () {
  'use strict';

  const canvas = document.querySelector('[data-philosophy-tiles]');
  const section = canvas ? canvas.closest('.home-section--catch') : null;
  if (!canvas || !section) {
    return;
  }

  const context = canvas.getContext('2d', { alpha: true });
  if (!context) {
    return;
  }

  const TILE_SIZE = 10;
  const TILE_GAP = 5;
  const TILE_RADIUS = 2;
  const POINTER_GLOW_RADIUS = 72;
  const POINTER_FIELD_BOUND = POINTER_GLOW_RADIUS * 1.25;
  const POINTER_PEAK_OPACITY = 0.96;
  const POINTER_BASE_INTENSITY = 0.82;
  const POINTER_INTENSITY_VARIATION = 0.18;
  const POINTER_FADE_IN_DURATION = 260;
  const POINTER_FADE_OUT_DURATION = 320;
  const POINTER_TILE_FADE_IN_TAU = 120;
  const POINTER_TILE_FADE_OUT_TAU = 150;
  const FRAME_INTERVAL = 1000 / 30;
  const PULSE_INTERVAL = 110;
  const MAX_DEVICE_PIXEL_RATIO = 2;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  const baseCanvas = document.createElement('canvas');
  const baseContext = baseCanvas.getContext('2d', { alpha: true });

  let width = 0;
  let height = 0;
  let devicePixelRatio = 1;
  let columns = 0;
  let rows = 0;
  let offsetX = 0;
  let offsetY = 0;
  let accentColor = '#2f49ff';
  let idleOpacity = 0.0015;
  let hoveredIndex = -1;
  let pointerX = null;
  let pointerY = null;
  let pointerOpacity = 0;
  let pointerOpacityFrom = 0;
  let pointerOpacityTarget = 0;
  let pointerOpacityStartedAt = 0;
  let pointerOpacityDuration = POINTER_FADE_IN_DURATION;
  let lastPointerTileUpdateAt = 0;
  let isIntersecting = true;
  let animationFrame = null;
  let lastDrawAt = 0;
  let lastPulseAt = 0;
  const pulses = new Map();
  const pointerTiles = new Map();

  function createTilePath(target, x, y) {
    target.beginPath();
    if (typeof target.roundRect === 'function') {
      target.roundRect(x, y, TILE_SIZE, TILE_SIZE, TILE_RADIUS);
      return;
    }
    target.rect(x, y, TILE_SIZE, TILE_SIZE);
  }

  function getTilePosition(index) {
    return {
      x: offsetX + (index % columns) * (TILE_SIZE + TILE_GAP),
      y: offsetY + Math.floor(index / columns) * (TILE_SIZE + TILE_GAP)
    };
  }

  function fillTile(target, index, opacity) {
    const position = getTilePosition(index);
    target.globalAlpha = opacity;
    createTilePath(target, position.x, position.y);
    target.fill();
  }

  function readThemeValues() {
    const styles = window.getComputedStyle(canvas);
    accentColor = styles.getPropertyValue('--accent-color').trim() || '#2f49ff';
    const parsedOpacity = Number.parseFloat(styles.getPropertyValue('--philosophy-tile-idle-opacity'));
    idleOpacity = Number.isFinite(parsedOpacity) ? parsedOpacity : 0.0015;
    canvas.dataset.tileAccent = accentColor;
    canvas.dataset.tileIdleOpacity = String(idleOpacity);
  }

  function drawBaseGrid() {
    if (!baseContext || width <= 0 || height <= 0 || columns <= 0 || rows <= 0) {
      return;
    }

    baseContext.setTransform(1, 0, 0, 1, 0, 0);
    baseContext.clearRect(0, 0, baseCanvas.width, baseCanvas.height);
    baseContext.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    baseContext.fillStyle = accentColor;

    const tileCount = columns * rows;
    for (let index = 0; index < tileCount; index += 1) {
      fillTile(baseContext, index, idleOpacity);
    }
    baseContext.globalAlpha = 1;
  }

  function smootherStep(progress) {
    const clamped = Math.min(1, Math.max(0, progress));
    return clamped * clamped * clamped * (clamped * (clamped * 6 - 15) + 10);
  }

  function schedulePointerTileIntensity(tile, timestamp) {
    tile.intensityFrom = tile.intensity;
    const direction = Math.abs(tile.intensity - POINTER_BASE_INTENSITY) < 0.005
      ? (Math.random() < 0.5 ? -1 : 1)
      : (tile.intensity >= POINTER_BASE_INTENSITY ? -1 : 1);
    const variation = 0.06 + Math.random() * (POINTER_INTENSITY_VARIATION - 0.06);
    tile.intensityTarget = POINTER_BASE_INTENSITY + direction * variation;
    tile.intensityStartedAt = timestamp;
    tile.intensityDuration = 520 + Math.random() * 680;
  }

  function getOrganicPointerEnvelope(dx, dy, column, row, timestamp) {
    const normalizedX = dx / POINTER_GLOW_RADIUS;
    const normalizedY = dy / POINTER_GLOW_RADIUS;
    const time = reduceMotion.matches ? 0 : timestamp / 1000;
    const upwardDistance = Math.max(0, -normalizedY);
    const plumeSway = upwardDistance * (
      Math.sin(time * 1.7) * 0.09 +
      Math.sin(time * 0.73 + 1.4) * 0.04
    );
    const taperedWidth = 0.92 * (1 - Math.min(0.18, upwardDistance * 0.16));
    const verticalScale = normalizedY < 0 ? 1.1 : 0.78;
    const shapedX = (normalizedX - plumeSway) / taperedWidth;
    const shapedY = normalizedY / verticalScale;
    const shapedDistance = Math.hypot(shapedX, shapedY);
    const angle = Math.atan2(shapedY, shapedX);
    const edgeInfluence = smootherStep((shapedDistance - 0.2) / 0.8);
    const angularNoise =
      Math.sin(angle * 3 + time * 2.1) * 0.07 +
      Math.sin(angle * 7 - time * 1.3 + 0.8) * 0.04;
    const flowingNoise =
      Math.sin(column * 0.49 + row * 0.31 + time * 2.7) * 0.035 +
      Math.sin(column * 0.17 - row * 0.67 - time * 1.8) * 0.02;
    const warpedDistance = shapedDistance - (angularNoise + flowingNoise) * edgeInfluence;
    const proximity = 1 - warpedDistance;
    if (proximity <= 0) {
      return 0;
    }

    const smoothProximity = proximity * proximity * (3 - 2 * proximity);
    const heatFlow = reduceMotion.matches
      ? 1
      : 0.9 + 0.1 * (
        0.5 + 0.5 * Math.sin(row * 0.34 - time * 3 + Math.sin(column * 0.27 + time) * 0.8)
      );
    return Math.pow(smoothProximity, 1.18) * heatFlow;
  }

  function updatePointerGlow(timestamp) {
    const opacityProgress = pointerOpacityDuration <= 0
      ? 1
      : (timestamp - pointerOpacityStartedAt) / pointerOpacityDuration;
    pointerOpacity = pointerOpacityFrom +
      (pointerOpacityTarget - pointerOpacityFrom) * smootherStep(opacityProgress);
    if (opacityProgress >= 1) {
      pointerOpacity = pointerOpacityTarget;
      if (pointerOpacityTarget === 0) {
        pointerX = null;
        pointerY = null;
        pointerTiles.clear();
        lastPointerTileUpdateAt = 0;
      }
    }

    canvas.dataset.pointerGlowOpacity = pointerOpacity.toFixed(3);
  }

  function updatePointerTiles(timestamp) {
    const elapsed = lastPointerTileUpdateAt > 0
      ? Math.min(100, Math.max(1, timestamp - lastPointerTileUpdateAt))
      : FRAME_INTERVAL;
    lastPointerTileUpdateAt = timestamp;
    const targets = new Map();
    const shapeEnergy = { top: 0, right: 0, bottom: 0, left: 0 };
    const shapeExtents = { top: 0, right: 0, bottom: 0, left: 0 };

    if (pointerX !== null && pointerY !== null && pointerOpacityTarget > 0) {
      const stride = TILE_SIZE + TILE_GAP;
      const minColumn = Math.max(0, Math.floor((pointerX - POINTER_FIELD_BOUND - offsetX) / stride));
      const maxColumn = Math.min(columns - 1, Math.ceil((pointerX + POINTER_FIELD_BOUND - offsetX) / stride));
      const minRow = Math.max(0, Math.floor((pointerY - POINTER_FIELD_BOUND - offsetY) / stride));
      const maxRow = Math.min(rows - 1, Math.ceil((pointerY + POINTER_FIELD_BOUND - offsetY) / stride));

      for (let row = minRow; row <= maxRow; row += 1) {
        for (let column = minColumn; column <= maxColumn; column += 1) {
          const centerX = offsetX + column * stride + TILE_SIZE / 2;
          const centerY = offsetY + row * stride + TILE_SIZE / 2;
          const dx = centerX - pointerX;
          const dy = centerY - pointerY;
          const targetEnvelope = getOrganicPointerEnvelope(dx, dy, column, row, timestamp);
          if (targetEnvelope <= 0) {
            continue;
          }
          targets.set(row * columns + column, targetEnvelope);
          if (dy < 0) {
            shapeEnergy.top += targetEnvelope;
            shapeExtents.top = Math.max(shapeExtents.top, -dy);
          } else {
            shapeEnergy.bottom += targetEnvelope;
            shapeExtents.bottom = Math.max(shapeExtents.bottom, dy);
          }
          if (dx < 0) {
            shapeEnergy.left += targetEnvelope;
            shapeExtents.left = Math.max(shapeExtents.left, -dx);
          } else {
            shapeEnergy.right += targetEnvelope;
            shapeExtents.right = Math.max(shapeExtents.right, dx);
          }
        }
      }
    }

    canvas.dataset.pointerShapeSignature = [
      shapeEnergy.top,
      shapeEnergy.right,
      shapeEnergy.bottom,
      shapeEnergy.left
    ].map((value) => value.toFixed(3)).join(',');
    canvas.dataset.pointerShapeExtents = [
      shapeExtents.top,
      shapeExtents.right,
      shapeExtents.bottom,
      shapeExtents.left
    ].map((value) => value.toFixed(1)).join(',');

    targets.forEach((targetEnvelope, index) => {
      if (pointerTiles.has(index)) {
        return;
      }
      const initialIntensity = reduceMotion.matches
        ? POINTER_BASE_INTENSITY
        : POINTER_BASE_INTENSITY + (Math.random() * 2 - 1) * POINTER_INTENSITY_VARIATION;
      pointerTiles.set(index, {
        envelope: 0,
        targetEnvelope,
        intensity: initialIntensity,
        intensityFrom: initialIntensity,
        intensityTarget: initialIntensity,
        intensityStartedAt: timestamp,
        intensityDuration: 0
      });
    });

    const intensitySamples = [];
    let intensityTotal = 0;
    let intensityMin = 1;
    let intensityMax = 0;
    pointerTiles.forEach((tile, index) => {
      tile.targetEnvelope = targets.get(index) || 0;
      const tau = tile.targetEnvelope > tile.envelope
        ? POINTER_TILE_FADE_IN_TAU
        : POINTER_TILE_FADE_OUT_TAU;
      const blend = 1 - Math.exp(-elapsed / tau);
      tile.envelope += (tile.targetEnvelope - tile.envelope) * blend;

      if (reduceMotion.matches) {
        tile.intensity = POINTER_BASE_INTENSITY;
      } else {
        if (tile.intensityDuration <= 0) {
          schedulePointerTileIntensity(tile, timestamp);
        }
        const intensityProgress = (timestamp - tile.intensityStartedAt) / tile.intensityDuration;
        tile.intensity = tile.intensityFrom +
          (tile.intensityTarget - tile.intensityFrom) * smootherStep(intensityProgress);
        if (intensityProgress >= 1) {
          tile.intensity = tile.intensityTarget;
          schedulePointerTileIntensity(tile, timestamp);
        }
      }

      if (tile.targetEnvelope === 0 && tile.envelope < 0.002) {
        pointerTiles.delete(index);
        return;
      }
      intensityTotal += tile.intensity;
      intensityMin = Math.min(intensityMin, tile.intensity);
      intensityMax = Math.max(intensityMax, tile.intensity);
      if (intensitySamples.length < 6) {
        intensitySamples.push(`${index}:${tile.intensity.toFixed(3)}`);
      }
    });

    const tileCount = pointerTiles.size;
    canvas.dataset.pointerTileCount = String(tileCount);
    canvas.dataset.pointerGlowIntensity = (tileCount > 0
      ? intensityTotal / tileCount
      : POINTER_BASE_INTENSITY).toFixed(3);
    canvas.dataset.pointerTileIntensitySpread = (tileCount > 0
      ? intensityMax - intensityMin
      : 0).toFixed(3);
    canvas.dataset.pointerTileIntensitySample = intensitySamples.join(',');
  }

  function setPointerOpacity(target, timestamp = window.performance.now()) {
    updatePointerGlow(timestamp);
    if (pointerOpacityTarget === target) {
      return;
    }
    pointerOpacityFrom = pointerOpacity;
    pointerOpacityTarget = target;
    pointerOpacityStartedAt = timestamp;
    pointerOpacityDuration = target > pointerOpacity
      ? POINTER_FADE_IN_DURATION
      : POINTER_FADE_OUT_DURATION;
    startAnimation();
  }

  function draw(timestamp) {
    updatePointerGlow(timestamp);
    updatePointerTiles(timestamp);
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    if (baseCanvas.width > 0 && baseCanvas.height > 0) {
      context.drawImage(baseCanvas, 0, 0);
    }

    context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    context.fillStyle = accentColor;

    pulses.forEach((pulse, index) => {
      const progress = (timestamp - pulse.startedAt) / pulse.duration;
      if (progress >= 1) {
        pulses.delete(index);
        return;
      }
      if (progress >= 0) {
        const fade = Math.sin(Math.PI * progress);
        fillTile(context, index, pulse.peakOpacity * fade);
      }
    });

    if (pointerTiles.size > 0 && pointerOpacity > 0.001) {
      context.save();
      context.fillStyle = accentColor;
      context.shadowColor = accentColor;
      context.shadowBlur = 8;
      pointerTiles.forEach((tile, index) => {
        const opacity = POINTER_PEAK_OPACITY * tile.envelope * tile.intensity * pointerOpacity;
        if (opacity >= 0.003) {
          fillTile(context, index, opacity);
        }
      });
      context.restore();
    }
    context.globalAlpha = 1;
  }

  function createRandomPulse(timestamp) {
    const tileCount = columns * rows;
    if (tileCount <= 0) {
      return;
    }

    const pulseCount = tileCount >= 3600 ? 2 : 1;
    for (let count = 0; count < pulseCount; count += 1) {
      const index = Math.floor(Math.random() * tileCount);
      if (index === hoveredIndex) {
        continue;
      }
      const level = 1 + Math.floor(Math.random() * 4);
      pulses.set(index, {
        startedAt: timestamp,
        duration: 1300 + Math.random() * 1300,
        peakOpacity: 0.18 + level * 0.16
      });
    }
  }

  function shouldAnimate() {
    const pointerIsFading = Math.abs(pointerOpacity - pointerOpacityTarget) >= 0.001;
    const pointerTilesAreFading = Array.from(pointerTiles.values()).some((tile) => (
      Math.abs(tile.envelope - tile.targetEnvelope) >= 0.002
    ));
    return isIntersecting && !document.hidden &&
      (!reduceMotion.matches || pointerIsFading || pointerTilesAreFading);
  }

  function animate(timestamp) {
    if (
      animationFrame !== null &&
      pointerOpacityTarget > 0 &&
      finePointer.matches &&
      !document.documentElement.matches(':hover')
    ) {
      clearHoveredTile();
    }
    animationFrame = null;
    if (!shouldAnimate()) {
      return;
    }

    if (!reduceMotion.matches) {
      if (lastPulseAt === 0) {
        lastPulseAt = timestamp;
      }
      while (timestamp - lastPulseAt >= PULSE_INTERVAL) {
        lastPulseAt += PULSE_INTERVAL;
        createRandomPulse(lastPulseAt);
      }
    }

    if (timestamp - lastDrawAt >= FRAME_INTERVAL) {
      draw(timestamp);
      lastDrawAt = timestamp;
    }
    if (shouldAnimate()) {
      animationFrame = window.requestAnimationFrame(animate);
    }
  }

  function startAnimation() {
    if (animationFrame !== null || !shouldAnimate()) {
      return;
    }
    lastDrawAt = 0;
    lastPulseAt = 0;
    animationFrame = window.requestAnimationFrame(animate);
  }

  function stopAnimation() {
    if (animationFrame !== null) {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = null;
    }
    lastDrawAt = 0;
    lastPulseAt = 0;
    pulses.clear();
    draw(window.performance.now());
  }

  function resizeCanvas() {
    const rect = section.getBoundingClientRect();
    const nextWidth = Math.max(1, Math.round(rect.width));
    const nextHeight = Math.max(1, Math.round(rect.height));
    const nextDevicePixelRatio = Math.min(window.devicePixelRatio || 1, MAX_DEVICE_PIXEL_RATIO);
    if (
      nextWidth === width &&
      nextHeight === height &&
      nextDevicePixelRatio === devicePixelRatio
    ) {
      return;
    }

    width = nextWidth;
    height = nextHeight;
    devicePixelRatio = nextDevicePixelRatio;
    const stride = TILE_SIZE + TILE_GAP;
    columns = Math.max(1, Math.ceil((width + TILE_GAP) / stride));
    rows = Math.max(1, Math.ceil((height + TILE_GAP) / stride));
    const gridWidth = columns * TILE_SIZE + (columns - 1) * TILE_GAP;
    const gridHeight = rows * TILE_SIZE + (rows - 1) * TILE_GAP;
    offsetX = (width - gridWidth) / 2;
    offsetY = (height - gridHeight) / 2;

    canvas.width = Math.round(width * devicePixelRatio);
    canvas.height = Math.round(height * devicePixelRatio);
    baseCanvas.width = canvas.width;
    baseCanvas.height = canvas.height;
    canvas.dataset.tileColumns = String(columns);
    canvas.dataset.tileRows = String(rows);
    canvas.dataset.pointerGlowRadius = String(POINTER_GLOW_RADIUS);
    hoveredIndex = -1;
    pointerX = null;
    pointerY = null;
    pointerOpacity = 0;
    pointerOpacityFrom = 0;
    pointerOpacityTarget = 0;
    lastPointerTileUpdateAt = 0;
    pointerTiles.clear();
    canvas.dataset.hoveredTile = '-1';
    canvas.dataset.pointerGlowOpacity = '0.000';
    canvas.dataset.pointerGlowIntensity = POINTER_BASE_INTENSITY.toFixed(3);
    canvas.dataset.pointerTileCount = '0';
    canvas.dataset.pointerTileIntensitySpread = '0.000';
    canvas.dataset.pointerTileIntensitySample = '';
    canvas.dataset.pointerShapeSignature = '0.000,0.000,0.000,0.000';
    canvas.dataset.pointerShapeExtents = '0.0,0.0,0.0,0.0';
    pulses.clear();
    readThemeValues();
    drawBaseGrid();
    draw(window.performance.now());
  }

  function getNearestTileIndexAt(localX, localY) {
    const stride = TILE_SIZE + TILE_GAP;
    const column = Math.round((localX - offsetX - TILE_SIZE / 2) / stride);
    const row = Math.round((localY - offsetY - TILE_SIZE / 2) / stride);
    if (column < 0 || column >= columns || row < 0 || row >= rows) {
      return -1;
    }
    return row * columns + column;
  }

  function updateHoveredTile(event) {
    if (!finePointer.matches || event.pointerType === 'touch') {
      return;
    }
    const rect = section.getBoundingClientRect();
    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;
    if (localX < 0 || localX > width || localY < 0 || localY > height) {
      clearHoveredTile();
      return;
    }
    setPointerOpacity(1);
    pointerX = localX;
    pointerY = localY;
    const nextIndex = getNearestTileIndexAt(localX, localY);
    hoveredIndex = nextIndex;
    canvas.dataset.hoveredTile = String(hoveredIndex);
    if (!shouldAnimate()) {
      draw(window.performance.now());
    }
    startAnimation();
  }

  function clearHoveredTile() {
    if (hoveredIndex < 0 && pointerX === null && pointerY === null) {
      return;
    }
    hoveredIndex = -1;
    canvas.dataset.hoveredTile = '-1';
    setPointerOpacity(0);
    if (!shouldAnimate()) {
      draw(window.performance.now());
    }
  }

  function handleWindowMouseOut(event) {
    if (event.relatedTarget === null) {
      clearHoveredTile();
    }
  }

  function handleDocumentPointerOut(event) {
    const nextTarget = event.relatedTarget;
    if (!(nextTarget instanceof Node) || !document.documentElement.contains(nextTarget)) {
      clearHoveredTile();
    }
  }

  function handleMotionPreferenceChange() {
    canvas.dataset.reducedMotion = String(reduceMotion.matches);
    if (reduceMotion.matches) {
      stopAnimation();
    } else {
      startAnimation();
    }
  }

  function handleVisibilityChange() {
    if (document.hidden) {
      pointerOpacity = 0;
      pointerOpacityFrom = 0;
      pointerOpacityTarget = 0;
      pointerX = null;
      pointerY = null;
      pointerTiles.clear();
      lastPointerTileUpdateAt = 0;
      hoveredIndex = -1;
      canvas.dataset.hoveredTile = '-1';
      stopAnimation();
    } else {
      startAnimation();
    }
  }

  const themeObserver = new MutationObserver(() => {
    readThemeValues();
    drawBaseGrid();
    draw(window.performance.now());
  });
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme']
  });

  if (typeof ResizeObserver === 'function') {
    const resizeObserver = new ResizeObserver(resizeCanvas);
    resizeObserver.observe(section);
  } else {
    window.addEventListener('resize', resizeCanvas);
  }

  if (typeof IntersectionObserver === 'function') {
    const intersectionObserver = new IntersectionObserver((entries) => {
      isIntersecting = entries.some((entry) => entry.isIntersecting);
      if (isIntersecting) {
        startAnimation();
      } else {
        stopAnimation();
      }
    });
    intersectionObserver.observe(section);
  }

  section.addEventListener('pointermove', updateHoveredTile, { passive: true });
  section.addEventListener('pointerleave', clearHoveredTile, { passive: true });
  document.documentElement.addEventListener('pointerleave', clearHoveredTile, { passive: true });
  document.addEventListener('pointerout', handleDocumentPointerOut, { capture: true, passive: true });
  document.addEventListener('pointercancel', clearHoveredTile, { capture: true, passive: true });
  window.addEventListener('mouseout', handleWindowMouseOut, { passive: true });
  window.addEventListener('blur', clearHoveredTile);
  document.addEventListener('visibilitychange', handleVisibilityChange);
  if (typeof reduceMotion.addEventListener === 'function') {
    reduceMotion.addEventListener('change', handleMotionPreferenceChange);
  }

  canvas.dataset.hoveredTile = '-1';
  canvas.dataset.reducedMotion = String(reduceMotion.matches);
  resizeCanvas();
  startAnimation();
})();
