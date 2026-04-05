import * as THREE from 'https://esm.sh/three@0.162.0';

export let scene, camera, renderer, clock;

const CAMERA_HEIGHT = 45;
const CAMERA_ANGLE = 55 * (Math.PI / 180);

export function initRenderer() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x111111);
  scene.fog = new THREE.Fog(0x111111, 60, 100);

  camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 200);
  camera.position.set(0, CAMERA_HEIGHT, CAMERA_HEIGHT * Math.cos(CAMERA_ANGLE));
  camera.lookAt(0, 0, 0);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.body.insertBefore(renderer.domElement, document.getElementById('ui'));

  const ambient = new THREE.AmbientLight(0x404040, 0.6);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(0xffffff, 0.8);
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

  clock = new THREE.Clock();

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

let shakeIntensity = 0;

export function triggerShake(intensity) {
  shakeIntensity = Math.max(shakeIntensity, intensity);
}

export function updateCamera(targetX, targetZ) {
  const lerpSpeed = 0.05;
  const tz = targetZ + CAMERA_HEIGHT * Math.cos(CAMERA_ANGLE);
  camera.position.x += (targetX - camera.position.x) * lerpSpeed;
  camera.position.z += (tz - camera.position.z) * lerpSpeed;
  camera.lookAt(targetX, 0, targetZ);

  if (shakeIntensity > 0.1) {
    camera.position.x += (Math.random() - 0.5) * shakeIntensity;
    camera.position.z += (Math.random() - 0.5) * shakeIntensity;
    shakeIntensity *= 0.9;
  } else {
    shakeIntensity = 0;
  }
}

export function render() {
  renderer.render(scene, camera);
}
