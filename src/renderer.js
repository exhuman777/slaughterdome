import * as THREE from 'https://esm.sh/three@0.162.0';
import { EffectComposer } from 'https://esm.sh/three@0.162.0/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'https://esm.sh/three@0.162.0/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'https://esm.sh/three@0.162.0/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'https://esm.sh/three@0.162.0/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'https://esm.sh/three@0.162.0/addons/postprocessing/OutputPass.js';
import { ColorGradeShader } from './shaders.js';

export let scene, camera, renderer, clock;
let composer;
let colorGradePass;

const CAMERA_HEIGHT = 35;
const CAMERA_ANGLE = 55 * (Math.PI / 180);

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

  // Post-processing pipeline
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.2,   // strength
    0.8,   // radius
    0.4    // threshold
  );
  composer.addPass(bloomPass);

  colorGradePass = new ShaderPass(ColorGradeShader);
  composer.addPass(colorGradePass);

  composer.addPass(new OutputPass());

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
    bloomPass.resolution.set(window.innerWidth, window.innerHeight);
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
  if (colorGradePass) {
    colorGradePass.uniforms.time.value = performance.now() * 0.001;
  }
  composer.render();
}
