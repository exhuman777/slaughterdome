// Mini Three.js dome visualization for landing page
import * as THREE from 'https://esm.sh/three@0.162.0';

let scene, camera, renderer, active = false;
let arenaRing, innerRing, player, flag, walls = [], enemies = [], particles = [];
let time = 0;
const ARENA_MAX = 12;
const ARENA_MIN = 5;

export function initDomeScene() {
  const canvas = document.getElementById('dome-scene');
  if (!canvas) return;

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x0a0808, 1);

  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x0a0808, 25, 40);

  camera = new THREE.PerspectiveCamera(45, canvas.clientWidth / canvas.clientHeight, 0.1, 100);
  camera.position.set(0, 18, 10);
  camera.lookAt(0, 0, 0);

  // Ambient
  scene.add(new THREE.AmbientLight(0x332222, 0.6));
  const dirLight = new THREE.DirectionalLight(0xffaa88, 0.8);
  dirLight.position.set(5, 10, 5);
  scene.add(dirLight);

  // Arena floor
  const floorGeo = new THREE.CircleGeometry(ARENA_MAX + 1, 48);
  floorGeo.rotateX(-Math.PI / 2);
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x1a1412, roughness: 0.9 });
  scene.add(new THREE.Mesh(floorGeo, floorMat));

  // Arena boundary ring
  const ringGeo = new THREE.TorusGeometry(ARENA_MAX, 0.15, 8, 64);
  ringGeo.rotateX(Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xff2222, transparent: true, opacity: 0.8 });
  arenaRing = new THREE.Mesh(ringGeo, ringMat);
  arenaRing.position.y = 0.1;
  scene.add(arenaRing);

  // Inner danger ring
  const innerGeo = new THREE.TorusGeometry(ARENA_MAX, 0.08, 8, 64);
  innerGeo.rotateX(Math.PI / 2);
  const innerMat = new THREE.MeshBasicMaterial({ color: 0xff4444, transparent: true, opacity: 0.3 });
  innerRing = new THREE.Mesh(innerGeo, innerMat);
  innerRing.position.y = 0.05;
  scene.add(innerRing);

  // Player
  const pGeo = new THREE.CylinderGeometry(0.35, 0.35, 1.2, 8);
  const pMat = new THREE.MeshStandardMaterial({ color: 0xe6993a, emissive: 0xe6993a, emissiveIntensity: 0.4 });
  player = new THREE.Mesh(pGeo, pMat);
  player.position.y = 0.6;
  scene.add(player);

  // Player light
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
  scene.add(flag);

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
    scene.add(wall);
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
    scene.add(enemy);
  }

  // Ground grid lines for arena feel
  const gridMat = new THREE.LineBasicMaterial({ color: 0x221111, transparent: true, opacity: 0.3 });
  for (let i = -ARENA_MAX; i <= ARENA_MAX; i += 2) {
    const pts1 = [new THREE.Vector3(i, 0.01, -ARENA_MAX), new THREE.Vector3(i, 0.01, ARENA_MAX)];
    const pts2 = [new THREE.Vector3(-ARENA_MAX, 0.01, i), new THREE.Vector3(ARENA_MAX, 0.01, i)];
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts1), gridMat));
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts2), gridMat));
  }

  resize();
  window.addEventListener('resize', resize);
  active = true;
  animate();
}

function resize() {
  const canvas = renderer.domElement;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (canvas.width !== w || canvas.height !== h) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
}

function animate() {
  if (!active) return;
  requestAnimationFrame(animate);
  time += 0.016;

  // Slowly rotate the whole view
  camera.position.x = Math.sin(time * 0.15) * 4;
  camera.position.z = 10 + Math.cos(time * 0.15) * 3;
  camera.lookAt(0, 0, 0);

  // Arena shrink cycle (8 seconds)
  const cycle = (time % 8) / 8;
  const arenaR = ARENA_MAX - (ARENA_MAX - ARENA_MIN) * cycle;
  const s = arenaR / ARENA_MAX;
  arenaRing.scale.set(s, 1, s);
  innerRing.scale.set(s * 0.95, 1, s * 0.95);
  arenaRing.material.opacity = 0.5 + Math.sin(time * 4) * 0.3;

  // Player movement (figure-8 pattern)
  const px = Math.sin(time * 0.7) * 3;
  const pz = Math.sin(time * 1.4) * 2;
  player.position.x = px;
  player.position.z = pz;

  // Enemies orbit and chase
  for (const e of enemies) {
    e.userData.angle += e.userData.speed * 0.008;
    const wobble = Math.sin(time * 2 + e.userData.phase) * 0.5;
    e.position.x = Math.cos(e.userData.angle) * (e.userData.radius + wobble);
    e.position.z = Math.sin(e.userData.angle) * (e.userData.radius + wobble);
    // Clamp to arena
    const dist = Math.sqrt(e.position.x ** 2 + e.position.z ** 2);
    if (dist > arenaR - 0.5) {
      const clamp = (arenaR - 0.5) / dist;
      e.position.x *= clamp;
      e.position.z *= clamp;
    }
    e.rotation.y += 0.03;
  }

  // Flag bob
  flag.position.y = Math.sin(time * 3) * 0.15;
  flag.children[1].rotation.z = Math.sin(time * 4) * 0.2;

  // Simulated bullet particles (from player toward aim direction)
  if (Math.random() < 0.3) {
    const angle = Math.atan2(-pz, -px) + (Math.random() - 0.5) * 0.3;
    spawnBullet(px, pz, angle);
  }
  updateBullets();

  resize();
  renderer.render(scene, camera);
}

const bulletPool = [];
function spawnBullet(x, z, angle) {
  const geo = new THREE.SphereGeometry(0.08, 4, 4);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffee44 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, 0.8, z);
  mesh.userData = { vx: Math.cos(angle) * 15, vz: Math.sin(angle) * 15, life: 0.4 };
  scene.add(mesh);
  bulletPool.push(mesh);
  if (bulletPool.length > 20) {
    const old = bulletPool.shift();
    scene.remove(old);
    old.geometry.dispose();
    old.material.dispose();
  }
}

function updateBullets() {
  for (let i = bulletPool.length - 1; i >= 0; i--) {
    const b = bulletPool[i];
    b.userData.life -= 0.016;
    b.position.x += b.userData.vx * 0.016;
    b.position.z += b.userData.vz * 0.016;
    b.material.opacity = b.userData.life;
    if (b.userData.life <= 0) {
      scene.remove(b);
      b.geometry.dispose();
      b.material.dispose();
      bulletPool.splice(i, 1);
    }
  }
}

export function stopDomeScene() {
  active = false;
}
