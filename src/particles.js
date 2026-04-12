import * as THREE from 'three/webgpu';
import { scene } from './renderer.js';

let MAX_PARTICLES = 200;
export function setParticleLimit(n) { MAX_PARTICLES = n; }

// Shared geometries - never recreated
const boxGeo = new THREE.BoxGeometry(0.2, 0.2, 0.2);
const sparkGeo = new THREE.BoxGeometry(0.08, 0.08, 0.08);
const dropGeo = new THREE.SphereGeometry(0.08, 4, 4);
const dustGeo = new THREE.BoxGeometry(0.1, 0.1, 0.1);
const trailGeo = new THREE.BoxGeometry(0.15, 0.05, 0.15);

// Material pool -- reuse materials by color
const matPool = new Map();
function getMat(color) {
  if (matPool.has(color)) return matPool.get(color);
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true });
  matPool.set(color, mat);
  return mat;
}

// Pre-allocated particle mesh pool (lazy init after scene exists)
const POOL_SIZE = 200;
const meshPool = [];
const activeParticles = [];
let poolInitialized = false;

function ensurePool() {
  if (poolInitialized || !scene) return;
  poolInitialized = true;
  for (let i = 0; i < POOL_SIZE; i++) {
    const mesh = new THREE.Mesh(boxGeo, getMat(0xffffff));
    mesh.visible = false;
    mesh.position.y = -100;
    scene.add(mesh);
    meshPool.push(mesh);
  }
}

function acquireMesh(geo, mat) {
  ensurePool();
  if (meshPool.length > 0) {
    const mesh = meshPool.pop();
    mesh.geometry = geo;
    mesh.material = mat;
    mesh.visible = true;
    mesh.scale.set(1, 1, 1);
    mesh.rotation.set(0, 0, 0);
    return mesh;
  }
  // Overflow: create new (rare)
  const mesh = new THREE.Mesh(geo, mat);
  scene.add(mesh);
  return mesh;
}

function releaseMesh(mesh) {
  mesh.visible = false;
  mesh.position.set(0, -100, 0);
  mesh.scale.set(1, 1, 1);
  mesh.rotation.set(0, 0, 0);
  meshPool.push(mesh);
}

// Floating text sprite pool (lazy init)
const TEXT_POOL_SIZE = 8;
const MAX_ACTIVE_TEXTS = 3;
const textPool = [];
let activeTextCount = 0;
let textPoolInitialized = false;

function ensureTextPool() {
  if (textPoolInitialized || !scene) return;
  textPoolInitialized = true;
  for (let i = 0; i < TEXT_POOL_SIZE; i++) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
    const sprite = new THREE.Sprite(mat);
    sprite.visible = false;
    sprite.position.y = -100;
    scene.add(sprite);
    textPool.push({ sprite, mat, tex, canvas, ctx, inUse: false });
  }
}

export function spawnKillParticles(x, z, color) {
  const count = 4;
  for (let i = 0; i < count && activeParticles.length < MAX_PARTICLES; i++) {
    const mat = getMat(color);
    const mesh = acquireMesh(boxGeo, mat);
    mesh.position.set(x, 0.8, z);
    const angle = Math.random() * Math.PI * 2;
    const speed = 3 + Math.random() * 5;
    activeParticles.push({
      mesh, mat,
      vx: Math.cos(angle) * speed, vy: 3 + Math.random() * 4, vz: Math.sin(angle) * speed,
      life: 0.8, decay: 1,
    });
  }
}

export function spawnSparks(x, z, color, count) {
  count = Math.min(count || 4, 4);
  for (let i = 0; i < count && activeParticles.length < MAX_PARTICLES; i++) {
    const mat = getMat(color);
    const mesh = acquireMesh(sparkGeo, mat);
    mesh.position.set(x + (Math.random() - 0.5) * 0.5, 1 + Math.random(), z + (Math.random() - 0.5) * 0.5);
    const angle = Math.random() * Math.PI * 2;
    const speed = 4 + Math.random() * 6;
    activeParticles.push({
      mesh, mat,
      vx: Math.cos(angle) * speed, vy: 2 + Math.random() * 4, vz: Math.sin(angle) * speed,
      life: 0.4, decay: 2.5,
    });
  }
}

export function spawnNeonPop(x, z, color, size) {
  if (activeParticles.length >= MAX_PARTICLES) return;
  size = size || 3;
  const ringGeo = new THREE.RingGeometry(0.3, 0.6, 16);
  ringGeo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(ringGeo, mat);
  mesh.position.set(x, 0.3, z);
  scene.add(mesh);
  activeParticles.push({ mesh, mat, vx: 0, vy: 0, vz: 0, life: 0.3, decay: 3, isNeonPop: true, targetSize: size, disposeGeo: true, ownsMat: true, noPool: true });
}

export function spawnBloodDrops(x, z) {
  const count = 3;
  for (let i = 0; i < count && activeParticles.length < MAX_PARTICLES; i++) {
    const mat = getMat(0xcc0000);
    const mesh = acquireMesh(dropGeo, mat);
    mesh.position.set(
      x + (Math.random() - 0.5) * 1.5,
      1.5 + Math.random(),
      z + (Math.random() - 0.5) * 1.5
    );
    activeParticles.push({
      mesh, mat,
      vx: (Math.random() - 0.5) * 3,
      vy: 1 + Math.random() * 2,
      vz: (Math.random() - 0.5) * 3,
      life: 0.5, decay: 2,
    });
  }
}

export function spawnDustPuff(x, z) {
  for (let i = 0; i < 2 && activeParticles.length < MAX_PARTICLES; i++) {
    const mat = getMat(0x997755);
    const mesh = acquireMesh(dustGeo, mat);
    mesh.position.set(x + (Math.random() - 0.5) * 0.5, 0.2, z + (Math.random() - 0.5) * 0.5);
    const angle = Math.random() * Math.PI * 2;
    const speed = 1 + Math.random();
    activeParticles.push({
      mesh, mat,
      vx: Math.cos(angle) * speed, vy: 0.5 + Math.random(), vz: Math.sin(angle) * speed,
      life: 0.2, decay: 5,
    });
  }
}

export function spawnSpeedTrail(x, z, color) {
  if (activeParticles.length >= MAX_PARTICLES) return;
  const mat = getMat(color);
  const mesh = acquireMesh(trailGeo, mat);
  mesh.position.set(x, 0.3, z);
  activeParticles.push({ mesh, mat, vx: 0, vy: 0, vz: 0, life: 0.25, decay: 4 });
}

export function spawnGoreChunks(x, z) {
  const count = 5;
  for (let i = 0; i < count && activeParticles.length < MAX_PARTICLES; i++) {
    const color = Math.random() > 0.3 ? 0xaa0000 : 0x660000;
    const mat = getMat(color);
    const mesh = acquireMesh(boxGeo, mat);
    mesh.position.set(x + (Math.random() - 0.5), 0.8, z + (Math.random() - 0.5));
    const angle = Math.random() * Math.PI * 2;
    const speed = 4 + Math.random() * 6;
    activeParticles.push({
      mesh, mat,
      vx: Math.cos(angle) * speed, vy: 4 + Math.random() * 5, vz: Math.sin(angle) * speed,
      life: 1.2, decay: 0.8,
    });
  }
}

export function spawnAoeRing(x, z, radius, color) {
  if (activeParticles.length >= MAX_PARTICLES) return;
  const ringGeo = new THREE.TorusGeometry(0.5, 0.12, 6, 24);
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true });
  const mesh = new THREE.Mesh(ringGeo, mat);
  mesh.position.set(x, 0.15, z);
  mesh.rotation.x = Math.PI / 2;
  scene.add(mesh);
  activeParticles.push({ mesh, mat, vx: 0, vy: 0, vz: 0, life: 0.4, decay: 2.5, isRing: true, targetRadius: radius, disposeGeo: true, ownsMat: true, noPool: true });
}

export function spawnFloatingText(x, z, text, color, scale, fontOverride) {
  if (activeParticles.length >= MAX_PARTICLES) return;
  if (activeTextCount >= MAX_ACTIVE_TEXTS) return;
  ensureTextPool();

  // Find available text sprite from pool
  let slot = null;
  for (const s of textPool) {
    if (!s.inUse) { slot = s; break; }
  }
  if (!slot) return;

  // Reuse canvas context
  const ctx = slot.ctx;
  ctx.clearRect(0, 0, 512, 128);
  const font = fontOverride || '700 48px monospace';
  ctx.font = font;
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 5;
  ctx.textAlign = 'center';
  ctx.strokeText(text, 256, 90);
  ctx.fillStyle = color || '#ffffff';
  ctx.fillText(text, 256, 90);
  slot.tex.needsUpdate = true;
  slot.mat.opacity = 1;

  const s = scale || 2;
  slot.sprite.scale.set(s * 2, s, 1);
  slot.sprite.position.set(x, 2.5, z);
  slot.sprite.visible = true;
  slot.inUse = true;
  activeTextCount++;

  activeParticles.push({
    mesh: slot.sprite, mat: slot.mat,
    vx: 0, vy: 3, vz: 0,
    life: 1, decay: 1,
    isSprite: true, textSlot: slot,
  });
}

export function updateParticles(dt) {
  for (let i = activeParticles.length - 1; i >= 0; i--) {
    const p = activeParticles[i];
    p.life -= dt * p.decay;
    if (p.life <= 0) {
      if (p.textSlot) {
        // Return text sprite to pool
        p.textSlot.sprite.visible = false;
        p.textSlot.sprite.position.y = -100;
        p.textSlot.inUse = false;
        activeTextCount--;
      } else if (p.noPool) {
        scene.remove(p.mesh);
        if (p.ownsMat) {
          if (p.mat.map) p.mat.map.dispose();
          p.mat.dispose();
        }
        if (p.disposeGeo) p.mesh.geometry.dispose();
      } else {
        // Return to mesh pool
        releaseMesh(p.mesh);
      }
      activeParticles.splice(i, 1);
      continue;
    }
    if (p.ownsMat) p.mat.opacity = Math.min(1, p.life * 2);
    if (p.isNeonPop) {
      const t = 1 - p.life * p.decay;
      const s = Math.max(0.1, t * p.targetSize);
      p.mesh.scale.set(s, 1, s);
    } else if (p.isRing) {
      const t = 1 - p.life * p.decay;
      const s = Math.max(0.1, t * p.targetRadius / 0.5);
      p.mesh.scale.set(s, s, 1);
    } else if (p.isSprite) {
      p.mesh.position.y += p.vy * dt;
      p.mat.opacity = Math.min(1, p.life * 2);
    } else {
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      p.vy -= 15 * dt;
      p.vx *= 0.95; p.vz *= 0.95;
    }
  }
}
