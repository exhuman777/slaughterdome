// Mini Three.js dome visualization for landing page
// Uses its own renderer targeting the dome-scene canvas, destroyed before game start
import * as THREE from 'three/webgpu';

let domeScene, camera, domeRenderer, active = false;
let arenaRing, innerRing, player, flag, walls = [], enemies = [];
let time = 0;
const ARENA_MAX = 12;
const ARENA_MIN = 5;

// Shared bullet geo/mat (not per-bullet)
const bulletGeo = new THREE.SphereGeometry(0.08, 4, 4);
const bulletMatTemplate = new THREE.MeshBasicMaterial({ color: 0xffee44, transparent: true });

export async function initDomeScene() {
  const canvas = document.getElementById('dome-scene');
  if (!canvas) return;

  domeRenderer = new THREE.WebGPURenderer({ canvas, antialias: true });
  domeRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  await domeRenderer.init();

  domeScene = new THREE.Scene();
  domeScene.background = new THREE.Color(0x0a0808);
  domeScene.fog = new THREE.Fog(0x0a0808, 25, 40);

  camera = new THREE.PerspectiveCamera(45, canvas.clientWidth / canvas.clientHeight, 0.1, 100);
  camera.position.set(0, 18, 10);
  camera.lookAt(0, 0, 0);

  // Ambient
  domeScene.add(new THREE.AmbientLight(0x332222, 0.6));
  const dirLight = new THREE.DirectionalLight(0xffaa88, 0.8);
  dirLight.position.set(5, 10, 5);
  domeScene.add(dirLight);

  // Arena floor
  const floorGeo = new THREE.CircleGeometry(ARENA_MAX + 1, 48);
  floorGeo.rotateX(-Math.PI / 2);
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x1a1412, roughness: 0.9 });
  domeScene.add(new THREE.Mesh(floorGeo, floorMat));

  // Arena boundary ring
  const ringGeo = new THREE.TorusGeometry(ARENA_MAX, 0.15, 8, 64);
  ringGeo.rotateX(Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xff2222, transparent: true, opacity: 0.8 });
  arenaRing = new THREE.Mesh(ringGeo, ringMat);
  arenaRing.position.y = 0.1;
  domeScene.add(arenaRing);

  // Inner danger ring
  const innerGeo = new THREE.TorusGeometry(ARENA_MAX, 0.08, 8, 64);
  innerGeo.rotateX(Math.PI / 2);
  const innerMat = new THREE.MeshBasicMaterial({ color: 0xff4444, transparent: true, opacity: 0.3 });
  innerRing = new THREE.Mesh(innerGeo, innerMat);
  innerRing.position.y = 0.05;
  domeScene.add(innerRing);

  // Player
  const pGeo = new THREE.CylinderGeometry(0.35, 0.35, 1.2, 8);
  const pMat = new THREE.MeshStandardMaterial({ color: 0xe6993a, emissive: 0xe6993a, emissiveIntensity: 0.4 });
  player = new THREE.Mesh(pGeo, pMat);
  player.position.y = 0.6;
  domeScene.add(player);

  const pLight = new THREE.PointLight(0xe6993a, 2, 6);
  pLight.position.y = 1;
  player.add(pLight);

  // Flag
  const flagGroup = new THREE.Group();
  const poleGeo = new THREE.CylinderGeometry(0.05, 0.05, 2, 4);
  const poleMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, emissive: 0x444444, emissiveIntensity: 0.3 });
  const pole = new THREE.Mesh(poleGeo, poleMat);
  pole.position.y = 1;
  flagGroup.add(pole);
  const clothGeo = new THREE.PlaneGeometry(0.8, 0.5);
  const clothMat = new THREE.MeshStandardMaterial({ color: 0xe6993a, emissive: 0xe6993a, emissiveIntensity: 0.8, side: THREE.DoubleSide });
  const cloth = new THREE.Mesh(clothGeo, clothMat);
  cloth.position.set(0.45, 1.7, 0);
  flagGroup.add(cloth);
  const fLight = new THREE.PointLight(0xe6993a, 1.5, 5);
  fLight.position.y = 2;
  flagGroup.add(fLight);
  flagGroup.position.set(5, 0, -3);
  flag = flagGroup;
  domeScene.add(flag);

  // Walls
  const wallGeo = new THREE.BoxGeometry(2, 1.2, 0.3);
  const wallColors = [0x4488ff, 0x44aaff, 0x3399ff];
  for (let i = 0; i < 3; i++) {
    const wMat = new THREE.MeshStandardMaterial({ color: wallColors[i], emissive: wallColors[i], emissiveIntensity: 0.3, transparent: true, opacity: 0.85 });
    const wall = new THREE.Mesh(wallGeo, wMat);
    const angle = (i / 3) * Math.PI * 2 + 0.5;
    wall.position.set(Math.cos(angle) * 4, 0.6, Math.sin(angle) * 4);
    wall.rotation.y = angle + Math.PI / 2;
    walls.push(wall);
    domeScene.add(wall);
  }

  // Enemies
  const enemyTypes = [
    { color: 0x44aa44, size: 0.3, speed: 1.2 },
    { color: 0xcc4444, size: 0.4, speed: 0.8 },
    { color: 0x8844cc, size: 0.5, speed: 0.6 },
    { color: 0x44aa44, size: 0.3, speed: 1.0 },
    { color: 0xccaa22, size: 0.35, speed: 1.4 },
    { color: 0x44aa44, size: 0.3, speed: 0.9 },
    { color: 0xcc4444, size: 0.4, speed: 0.7 },
  ];
  for (const et of enemyTypes) {
    const eGeo = new THREE.BoxGeometry(et.size * 2, et.size * 2, et.size * 2);
    const eMat = new THREE.MeshStandardMaterial({ color: et.color, emissive: et.color, emissiveIntensity: 0.2 });
    const enemy = new THREE.Mesh(eGeo, eMat);
    const a = Math.random() * Math.PI * 2;
    const r = 3 + Math.random() * 6;
    enemy.position.set(Math.cos(a) * r, et.size, Math.sin(a) * r);
    enemy.userData = { angle: a, radius: r, speed: et.speed, phase: Math.random() * Math.PI * 2 };
    enemies.push(enemy);
    domeScene.add(enemy);
  }

  // Ground grid lines
  const gridMat = new THREE.LineBasicMaterial({ color: 0x221111, transparent: true, opacity: 0.3 });
  for (let i = -ARENA_MAX; i <= ARENA_MAX; i += 2) {
    const pts1 = [new THREE.Vector3(i, 0.01, -ARENA_MAX), new THREE.Vector3(i, 0.01, ARENA_MAX)];
    const pts2 = [new THREE.Vector3(-ARENA_MAX, 0.01, i), new THREE.Vector3(ARENA_MAX, 0.01, i)];
    domeScene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts1), gridMat));
    domeScene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts2), gridMat));
  }

  active = true;
  animate();
}

function resize() {
  const canvas = domeRenderer ? domeRenderer.domElement : null;
  if (!canvas) return;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (canvas.width !== w || canvas.height !== h) {
    domeRenderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
}

// Bullet pool (reuse meshes, no per-bullet geo/mat allocation)
const bulletPool = [];
const BULLET_POOL_SIZE = 20;
for (let i = 0; i < BULLET_POOL_SIZE; i++) {
  const mesh = new THREE.Mesh(bulletGeo, bulletMatTemplate.clone());
  mesh.visible = false;
  bulletPool.push(mesh);
}
const activeBullets = [];

function spawnBullet(x, z, angle) {
  let mesh = null;
  for (const b of bulletPool) {
    if (!b.visible) { mesh = b; break; }
  }
  if (!mesh) return;
  mesh.position.set(x, 0.8, z);
  mesh.userData = { vx: Math.cos(angle) * 15, vz: Math.sin(angle) * 15, life: 0.4 };
  mesh.material.opacity = 1;
  mesh.visible = true;
  if (!mesh.parent) domeScene.add(mesh);
  activeBullets.push(mesh);
}

function updateBullets() {
  for (let i = activeBullets.length - 1; i >= 0; i--) {
    const b = activeBullets[i];
    b.userData.life -= 0.016;
    b.position.x += b.userData.vx * 0.016;
    b.position.z += b.userData.vz * 0.016;
    b.material.opacity = Math.max(0, b.userData.life);
    if (b.userData.life <= 0) {
      b.visible = false;
      activeBullets.splice(i, 1);
    }
  }
}

function animate() {
  if (!active) return;
  requestAnimationFrame(animate);
  time += 0.016;

  camera.position.x = Math.sin(time * 0.15) * 4;
  camera.position.z = 10 + Math.cos(time * 0.15) * 3;
  camera.lookAt(0, 0, 0);

  const cycle = (time % 8) / 8;
  const arenaR = ARENA_MAX - (ARENA_MAX - ARENA_MIN) * cycle;
  const s = arenaR / ARENA_MAX;
  arenaRing.scale.set(s, 1, s);
  innerRing.scale.set(s * 0.95, 1, s * 0.95);
  arenaRing.material.opacity = 0.5 + Math.sin(time * 4) * 0.3;

  const px = Math.sin(time * 0.7) * 3;
  const pz = Math.sin(time * 1.4) * 2;
  player.position.x = px;
  player.position.z = pz;

  for (const e of enemies) {
    e.userData.angle += e.userData.speed * 0.008;
    const wobble = Math.sin(time * 2 + e.userData.phase) * 0.5;
    e.position.x = Math.cos(e.userData.angle) * (e.userData.radius + wobble);
    e.position.z = Math.sin(e.userData.angle) * (e.userData.radius + wobble);
    const dist = Math.sqrt(e.position.x ** 2 + e.position.z ** 2);
    if (dist > arenaR - 0.5) {
      const clamp = (arenaR - 0.5) / dist;
      e.position.x *= clamp;
      e.position.z *= clamp;
    }
    e.rotation.y += 0.03;
  }

  flag.position.y = Math.sin(time * 3) * 0.15;
  flag.children[1].rotation.z = Math.sin(time * 4) * 0.2;

  if (Math.random() < 0.3) {
    const angle = Math.atan2(-pz, -px) + (Math.random() - 0.5) * 0.3;
    spawnBullet(px, pz, angle);
  }
  updateBullets();

  resize();
  if (domeRenderer) domeRenderer.render(domeScene, camera);
}

export function stopDomeScene() {
  active = false;
  // Clean up bullets
  for (const b of activeBullets) b.visible = false;
  activeBullets.length = 0;
  // Dispose the dome renderer to free the GPU context
  if (domeRenderer) {
    domeRenderer.dispose();
    domeRenderer = null;
  }
}
