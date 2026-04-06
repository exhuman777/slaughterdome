import * as THREE from 'https://esm.sh/three@0.162.0';

export let scene, camera, renderer, clock;

const CAMERA_HEIGHT = 35;
const CAMERA_ANGLE = 55 * (Math.PI / 180);

let shakeIntensity = 0;
let flashEl = null;
let hitstopRemaining = 0;

export function initRenderer() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1a2e);
  scene.fog = new THREE.Fog(0x1a1a2e, 70, 110);

  camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 200);
  camera.position.set(0, CAMERA_HEIGHT, CAMERA_HEIGHT * Math.cos(CAMERA_ANGLE));
  camera.lookAt(0, 0, 0);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.3;
  document.body.insertBefore(renderer.domElement, document.getElementById('ui'));

  scene.add(new THREE.AmbientLight(0x8888aa, 1.0));

  const sun = new THREE.DirectionalLight(0xffffff, 1.2);
  sun.position.set(20, 40, 20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
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
  flashEl = document.getElementById('flash-overlay');

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

export function triggerShake(intensity) {
  shakeIntensity = Math.max(shakeIntensity, intensity);
}

export function flashScreen(color, duration) {
  if (!flashEl) return;
  flashEl.style.background = color || '#ffffff';
  flashEl.style.opacity = '0.5';
  flashEl.style.transition = 'none';
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      flashEl.style.transition = `opacity ${duration || 0.15}s ease-out`;
      flashEl.style.opacity = '0';
    });
  });
}

export function startHitstop(ms) {
  hitstopRemaining = Math.max(hitstopRemaining, ms || 60);
}

export function tickHitstop(dtMs) {
  if (hitstopRemaining > 0) { hitstopRemaining -= dtMs; return true; }
  return false;
}

let lastCamDt = 0.016;
export function setCamDt(dt) { lastCamDt = dt; }

export function updateCamera(targetX, targetZ, aimX, aimZ) {
  // Look-ahead: blend target 30% toward aim, max 5 units offset
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

  if (shakeIntensity > 0.1) {
    camera.position.x += (Math.random() - 0.5) * shakeIntensity;
    camera.position.y += (Math.random() - 0.5) * shakeIntensity * 0.3;
    camera.position.z += (Math.random() - 0.5) * shakeIntensity;
    shakeIntensity *= 0.82;
  } else {
    shakeIntensity = 0;
  }
}

export function render() {
  renderer.render(scene, camera);
}
