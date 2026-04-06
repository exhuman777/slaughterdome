import * as THREE from 'https://esm.sh/three@0.162.0';
import { scene } from './renderer.js';

const particles = [];
const MAX_PARTICLES = 500;
const boxGeo = new THREE.BoxGeometry(0.2, 0.2, 0.2);

export function spawnKillParticles(x, z, color) {
  const count = 15 + Math.floor(Math.random() * 10);
  for (let i = 0; i < count && particles.length < MAX_PARTICLES; i++) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true });
    const mesh = new THREE.Mesh(boxGeo, mat);
    mesh.position.set(x, 0.8, z);
    const angle = Math.random() * Math.PI * 2;
    const speed = 3 + Math.random() * 6;
    scene.add(mesh);
    particles.push({
      mesh, mat,
      vx: Math.cos(angle) * speed, vy: 4 + Math.random() * 5, vz: Math.sin(angle) * speed,
      life: 1, decay: 0.7 + Math.random() * 0.4,
    });
  }
}

export function spawnSparks(x, z, color, count) {
  count = count || 8;
  const sparkGeo = new THREE.BoxGeometry(0.08, 0.08, 0.08);
  for (let i = 0; i < count && particles.length < MAX_PARTICLES; i++) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true });
    const mesh = new THREE.Mesh(sparkGeo, mat);
    mesh.position.set(x + (Math.random() - 0.5) * 0.5, 1 + Math.random(), z + (Math.random() - 0.5) * 0.5);
    const angle = Math.random() * Math.PI * 2;
    const speed = 5 + Math.random() * 10;
    scene.add(mesh);
    particles.push({
      mesh, mat,
      vx: Math.cos(angle) * speed, vy: 2 + Math.random() * 6, vz: Math.sin(angle) * speed,
      life: 0.5 + Math.random() * 0.3, decay: 2, isSpark: true,
    });
  }
}

export function spawnNeonPop(x, z, color, size) {
  size = size || 3;
  const ringGeo = new THREE.RingGeometry(0.3, 0.6, 24);
  ringGeo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(ringGeo, mat);
  mesh.position.set(x, 0.3, z);
  scene.add(mesh);
  particles.push({ mesh, mat, vx: 0, vy: 0, vz: 0, life: 0.35, decay: 2.8, isNeonPop: true, targetSize: size });

  const glowGeo = new THREE.CircleGeometry(0.5, 16);
  glowGeo.rotateX(-Math.PI / 2);
  const glowMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, side: THREE.DoubleSide });
  const glow = new THREE.Mesh(glowGeo, glowMat);
  glow.position.set(x, 0.25, z);
  scene.add(glow);
  particles.push({ mesh: glow, mat: glowMat, vx: 0, vy: 0, vz: 0, life: 0.2, decay: 5, isNeonPop: true, targetSize: size * 0.6 });
}

export function spawnBloodDrops(x, z) {
  const count = 6 + Math.floor(Math.random() * 4);
  const dropGeo = new THREE.SphereGeometry(0.08, 4, 4);
  for (let i = 0; i < count && particles.length < MAX_PARTICLES; i++) {
    const mat = new THREE.MeshBasicMaterial({ color: 0xcc0000, transparent: true });
    const mesh = new THREE.Mesh(dropGeo, mat);
    mesh.position.set(
      x + (Math.random() - 0.5) * 1.5,
      1.5 + Math.random() * 1.5,
      z + (Math.random() - 0.5) * 1.5
    );
    scene.add(mesh);
    particles.push({
      mesh, mat,
      vx: (Math.random() - 0.5) * 3,
      vy: 1 + Math.random() * 2,
      vz: (Math.random() - 0.5) * 3,
      life: 0.6 + Math.random() * 0.3, decay: 1.5, isSpark: true,
    });
  }
}

export function spawnDustPuff(x, z) {
  const dustGeo = new THREE.BoxGeometry(0.1, 0.1, 0.1);
  for (let i = 0; i < 5 && particles.length < MAX_PARTICLES; i++) {
    const mat = new THREE.MeshBasicMaterial({ color: 0x997755, transparent: true });
    const mesh = new THREE.Mesh(dustGeo, mat);
    mesh.position.set(x + (Math.random() - 0.5) * 0.5, 0.2, z + (Math.random() - 0.5) * 0.5);
    const angle = Math.random() * Math.PI * 2;
    const speed = 1 + Math.random() * 1.5;
    scene.add(mesh);
    particles.push({
      mesh, mat,
      vx: Math.cos(angle) * speed, vy: 0.5 + Math.random(), vz: Math.sin(angle) * speed,
      life: 0.25, decay: 4, isSpark: true,
    });
  }
}

export function spawnSpeedTrail(x, z, color) {
  if (particles.length >= MAX_PARTICLES) return;
  const trailGeo = new THREE.BoxGeometry(0.15, 0.05, 0.15);
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6 });
  const mesh = new THREE.Mesh(trailGeo, mat);
  mesh.position.set(x, 0.3, z);
  scene.add(mesh);
  particles.push({ mesh, mat, vx: 0, vy: 0, vz: 0, life: 0.3, decay: 3.3, isSpark: true });
}

export function spawnAoeRing(x, z, radius, color) {
  const ringGeo = new THREE.TorusGeometry(0.5, 0.12, 8, 32);
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true });
  const mesh = new THREE.Mesh(ringGeo, mat);
  mesh.position.set(x, 0.15, z);
  mesh.rotation.x = Math.PI / 2;
  scene.add(mesh);
  particles.push({ mesh, mat, vx: 0, vy: 0, vz: 0, life: 0.5, decay: 2, isRing: true, targetRadius: radius });
}

export function spawnFloatingText(x, z, text, color, scale) {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.font = 'bold 48px Courier New';
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 4;
  ctx.textAlign = 'center';
  ctx.strokeText(text, 128, 48);
  ctx.fillStyle = color || '#ffffff';
  ctx.fillText(text, 128, 48);
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
  const sprite = new THREE.Sprite(mat);
  sprite.position.set(x, 2.5, z);
  const s = scale || 1.5;
  sprite.scale.set(s * 2, s, 1);
  scene.add(sprite);
  particles.push({ mesh: sprite, mat, vx: 0, vy: 3, vz: 0, life: 0.8, decay: 1.2, isSprite: true });
}

export function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt * p.decay;
    if (p.life <= 0) {
      scene.remove(p.mesh);
      if (p.mat.map) p.mat.map.dispose();
      p.mat.dispose();
      if (p.isSpark) p.mesh.geometry.dispose();
      particles.splice(i, 1);
      continue;
    }
    p.mat.opacity = Math.min(1, p.life * 2);
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
      if (p.isSpark) { p.vx *= 0.95; p.vz *= 0.95; }
    }
  }
}
