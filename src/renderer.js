import * as THREE from 'three/webgpu';

export let scene, camera, renderer, clock;
let postProcessing = null;

const CAMERA_HEIGHT = 35;
const CAMERA_ANGLE = 55 * (Math.PI / 180);

// FPS counter
const FPS_SAMPLES = 60;
const frameTimes = new Array(FPS_SAMPLES).fill(16.67);
let frameIdx = 0;
let lastFrameTs = 0;
let fpsVisible = false;
let fpsEl = null;
let currentFPS = 60;

export function getFPS() { return currentFPS; }

function updateFPSCounter() {
  const now = performance.now();
  if (lastFrameTs > 0) {
    frameTimes[frameIdx] = now - lastFrameTs;
    frameIdx = (frameIdx + 1) % FPS_SAMPLES;
  }
  lastFrameTs = now;
  let sum = 0;
  for (let i = 0; i < FPS_SAMPLES; i++) sum += frameTimes[i];
  currentFPS = Math.round(1000 / (sum / FPS_SAMPLES));
}

function createFPSOverlay() {
  fpsEl = document.createElement('div');
  fpsEl.id = 'fps-counter';
  fpsEl.style.cssText = 'position:fixed;top:8px;left:8px;color:#e6993a;font:bold 14px monospace;z-index:9999;pointer-events:none;text-shadow:1px 1px 2px #000;display:none;';
  document.body.appendChild(fpsEl);
  document.addEventListener('keydown', e => {
    if (e.code === 'KeyF' && !e.ctrlKey && !e.metaKey && !e.altKey && document.activeElement.tagName !== 'INPUT') {
      fpsVisible = !fpsVisible;
      fpsEl.style.display = fpsVisible ? 'block' : 'none';
    }
  });
}

// Adaptive quality state
let adaptiveEnabled = true;
let qualityLevel = 2; // 2=high, 1=medium, 0=low
let lowFpsTimer = 0;
let veryLowFpsTimer = 0;
let highFpsTimer = 0;
let sunLight = null;

export function getQualityLevel() { return qualityLevel; }

export function updateAdaptiveQuality(dt) {
  if (!adaptiveEnabled) return;
  const fps = currentFPS;
  if (fps < 20) {
    veryLowFpsTimer += dt;
    lowFpsTimer += dt;
    highFpsTimer = 0;
  } else if (fps < 30) {
    lowFpsTimer += dt;
    veryLowFpsTimer = 0;
    highFpsTimer = 0;
  } else if (fps > 50) {
    highFpsTimer += dt;
    lowFpsTimer = 0;
    veryLowFpsTimer = 0;
  } else {
    lowFpsTimer = 0;
    veryLowFpsTimer = 0;
    highFpsTimer = 0;
  }

  if (veryLowFpsTimer > 2 && qualityLevel > 0) {
    qualityLevel = 0;
    veryLowFpsTimer = 0;
    applyQuality();
  } else if (lowFpsTimer > 2 && qualityLevel > 1) {
    qualityLevel = 1;
    lowFpsTimer = 0;
    applyQuality();
  } else if (highFpsTimer > 5 && qualityLevel < 2) {
    qualityLevel = Math.min(qualityLevel + 1, 2);
    highFpsTimer = 0;
    applyQuality();
  }
}

function applyQuality() {
  if (!renderer) return;
  if (qualityLevel === 0) {
    renderer.setPixelRatio(1.0);
    if (sunLight) sunLight.castShadow = false;
  } else if (qualityLevel === 1) {
    renderer.setPixelRatio(1.0);
    if (sunLight) sunLight.castShadow = true;
  } else {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    if (sunLight) sunLight.castShadow = true;
  }
}

export async function initRenderer() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x22222e);
  scene.fog = new THREE.Fog(0x22222e, 70, 110);

  camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 200);
  camera.position.set(0, CAMERA_HEIGHT, CAMERA_HEIGHT * Math.cos(CAMERA_ANGLE));
  camera.lookAt(0, 0, 0);

  renderer = new THREE.WebGPURenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 2.2;
  await renderer.init();
  document.body.insertBefore(renderer.domElement, document.getElementById('ui'));

  scene.add(new THREE.AmbientLight(0xccccdd, 1.4));

  sunLight = new THREE.DirectionalLight(0xffffff, 1.6);
  const sun = sunLight;
  sun.position.set(20, 40, 20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(512, 512);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 100;
  sun.shadow.camera.left = -50;
  sun.shadow.camera.right = 50;
  sun.shadow.camera.top = 50;
  sun.shadow.camera.bottom = -50;
  scene.add(sun);

  const rim = new THREE.DirectionalLight(0x4488ff, 0.5);
  rim.position.set(-30, 20, -30);
  scene.add(rim);

  clock = new THREE.Clock();
  createFPSOverlay();

  // Post-processing with bloom (only if bloom actually available -- skip passthrough)
  try {
    const tsl = await import('three/tsl');
    if (THREE.PostProcessing && tsl.pass && tsl.bloom) {
      const pp = new THREE.PostProcessing(renderer);
      const scenePass = tsl.pass(scene, camera);
      pp.outputNode = tsl.bloom(scenePass.getTextureNode(), 0.15, 0.5, 0.6);
      postProcessing = pp;
    }
  } catch (e) { /* direct render fallback */ }

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

// All stutter effects disabled - no-ops for smooth gameplay
export function triggerShake() {}
export function flashScreen() {}
export function startHitstop() {}
export function tickHitstop() { return false; }
export function triggerCamKick() {}

let lastCamDt = 0.016;
export function setCamDt(dt) { lastCamDt = dt; }

export function updateCamera(targetX, targetZ, aimX, aimZ) {
  if (aimX !== undefined && aimZ !== undefined) {
    const lookX = (aimX - targetX) * 0.3;
    const lookZ = (aimZ - targetZ) * 0.3;
    const lookDist = Math.sqrt(lookX * lookX + lookZ * lookZ);
    const maxOff = 5;
    const s = lookDist > maxOff ? maxOff / lookDist : 1;
    targetX += lookX * s;
    targetZ += lookZ * s;
  }
  const t = 1 - Math.exp(-12 * lastCamDt);
  const tz = targetZ + CAMERA_HEIGHT * Math.cos(CAMERA_ANGLE);
  camera.position.x += (targetX - camera.position.x) * t;
  camera.position.z += (tz - camera.position.z) * t;
  camera.lookAt(targetX, 0, targetZ);
}

export function render() {
  updateFPSCounter();
  if (fpsEl && fpsVisible) fpsEl.textContent = currentFPS + ' FPS';
  if (postProcessing) {
    postProcessing.render();
  } else {
    renderer.render(scene, camera);
  }
}
