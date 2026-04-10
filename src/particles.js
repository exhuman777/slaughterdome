import * as THREE from 'https://esm.sh/three@0.162.0';
import { scene } from './renderer.js';

const particles = [];
const MAX_PARTICLES = 200;

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

export function spawnKillParticles(x, z, color) {
  const count = 4;
  for (let i = 0; i < count && particles.length < MAX_PARTICLES; i++) {
    const mat = getMat(color);
    const mesh = new THREE.Mesh(boxGeo, mat);
    mesh.position.set(x, 0.8, z);
    const angle = Math.random() * Math.PI * 2;
    const speed = 3 + Math.random() * 5;
    scene.add(mesh);
    particles.push({
      mesh, mat,
      vx: Math.cos(angle) * speed, vy: 3 + Math.random() * 4, vz: Math.sin(angle) * speed,
      life: 0.8, decay: 1,
    });
  }
}

export function spawnSparks(x, z, color, count) {
  count = Math.min(count || 4, 4);
  for (let i = 0; i < count && particles.length < MAX_PARTICLES; i++) {
    const mat = getMat(color);
    const mesh = new THREE.Mesh(sparkGeo, mat);
    mesh.position.set(x + (Math.random() - 0.5) * 0.5, 1 + Math.random(), z + (Math.random() - 0.5) * 0.5);
    const angle = Math.random() * Math.PI * 2;
    const speed = 4 + Math.random() * 6;
    scene.add(mesh);
    particles.push({
      mesh, mat,
      vx: Math.cos(angle) * speed, vy: 2 + Math.random() * 4, vz: Math.sin(angle) * speed,
      life: 0.4, decay: 2.5,
    });
  }
}

export function spawnNeonPop(x, z, color, size) {
  if (particles.length >= MAX_PARTICLES) return;
  size = size || 3;
  const ringGeo = new THREE.RingGeometry(0.3, 0.6, 16);
  ringGeo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(ringGeo, mat);
  mesh.position.set(x, 0.3, z);
  scene.add(mesh);
  particles.push({ mesh, mat, vx: 0, vy: 0, vz: 0, life: 0.3, decay: 3, isNeonPop: true, targetSize: size, disposeGeo: true, ownsMat: true });
}

export function spawnBloodDrops(x, z) {
  const count = 3;
  for (let i = 0; i < count && particles.length < MAX_PARTICLES; i++) {
    const mat = getMat(0xcc0000);
    const mesh = new THREE.Mesh(dropGeo, mat);
    mesh.position.set(
      x + (Math.random() - 0.5) * 1.5,
      1.5 + Math.random(),
      z + (Math.random() - 0.5) * 1.5
    );
    scene.add(mesh);
    particles.push({
      mesh, mat,
      vx: (Math.random() - 0.5) * 3,
      vy: 1 + Math.random() * 2,
      vz: (Math.random() - 0.5) * 3,
      life: 0.5, decay: 2,
    });
  }
}

export function spawnDustPuff(x, z) {
  for (let i = 0; i < 2 && particles.length < MAX_PARTICLES; i++) {
    const mat = getMat(0x997755);
    const mesh = new THREE.Mesh(dustGeo, mat);
    mesh.position.set(x + (Math.random() - 0.5) * 0.5, 0.2, z + (Math.random() - 0.5) * 0.5);
    const angle = Math.random() * Math.PI * 2;
    const speed = 1 + Math.random();
    scene.add(mesh);
    particles.push({
      mesh, mat,
      vx: Math.cos(angle) * speed, vy: 0.5 + Math.random(), vz: Math.sin(angle) * speed,
      life: 0.2, decay: 5,
    });
  }
}

export function spawnSpeedTrail(x, z, color) {
  if (particles.length >= MAX_PARTICLES) return;
  const mat = getMat(color);
  const mesh = new THREE.Mesh(trailGeo, mat);
  mesh.position.set(x, 0.3, z);
  scene.add(mesh);
  particles.push({ mesh, mat, vx: 0, vy: 0, vz: 0, life: 0.25, decay: 4 });
}

export function spawnGoreChunks(x, z) {
  const count = 5;
  for (let i = 0; i < count && particles.length < MAX_PARTICLES; i++) {
    const color = Math.random() > 0.3 ? 0xaa0000 : 0x660000;
    const mat = getMat(color);
    const mesh = new THREE.Mesh(boxGeo, mat);
    mesh.position.set(x + (Math.random() - 0.5), 0.8, z + (Math.random() - 0.5));
    const angle = Math.random() * Math.PI * 2;
    const speed = 4 + Math.random() * 6;
    scene.add(mesh);
    particles.push({
      mesh, mat,
      vx: Math.cos(angle) * speed, vy: 4 + Math.random() * 5, vz: Math.sin(angle) * speed,
      life: 1.2, decay: 0.8,
    });
  }
}

export function spawnAoeRing(x, z, radius, color) {
  if (particles.length >= MAX_PARTICLES) return;
  const ringGeo = new THREE.TorusGeometry(0.5, 0.12, 6, 24);
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true });
  const mesh = new THREE.Mesh(ringGeo, mat);
  mesh.position.set(x, 0.15, z);
  mesh.rotation.x = Math.PI / 2;
  scene.add(mesh);
  particles.push({ mesh, mat, vx: 0, vy: 0, vz: 0, life: 0.4, decay: 2.5, isRing: true, targetRadius: radius, disposeGeo: true, ownsMat: true });
}

export function spawnFloatingText(x, z, text, color, scale, fontOverride) {
  if (particles.length >= MAX_PARTICLES) return;
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const font = fontOverride || '700 48px monospace';
  ctx.font = font;
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 5;
  ctx.textAlign = 'center';
  ctx.strokeText(text, 256, 90);
  ctx.fillStyle = color || '#ffffff';
  ctx.fillText(text, 256, 90);
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
  const sprite = new THREE.Sprite(mat);
  sprite.position.set(x, 2.5, z);
  const s = scale || 2;
  sprite.scale.set(s * 2, s, 1);
  scene.add(sprite);
  particles.push({ mesh: sprite, mat, vx: 0, vy: 3, vz: 0, life: 1, decay: 1, isSprite: true, ownsMat: true });
}

export function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt * p.decay;
    if (p.life <= 0) {
      scene.remove(p.mesh);
      // Only dispose non-pooled materials (sprites, rings with unique textures)
      if (p.ownsMat) {
        if (p.mat.map) p.mat.map.dispose();
        p.mat.dispose();
      }
      if (p.disposeGeo) p.mesh.geometry.dispose();
      particles.splice(i, 1);
      continue;
    }
    // Pooled materials are shared -- only set opacity on owned materials
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
    } else {
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      p.vy -= 15 * dt;
      p.vx *= 0.95; p.vz *= 0.95;
    }
  }
}
