import * as THREE from 'https://esm.sh/three@0.162.0';
import { scene } from './renderer.js';

const particles = [];
const MAX_PARTICLES = 200;
const tmpGeo = new THREE.BoxGeometry(0.15, 0.15, 0.15);

export function spawnKillParticles(x, z, color) {
  const count = 8 + Math.floor(Math.random() * 5);
  for (let i = 0; i < count && particles.length < MAX_PARTICLES; i++) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true });
    const mesh = new THREE.Mesh(tmpGeo, mat);
    mesh.position.set(x, 0.5, z);
    const angle = Math.random() * Math.PI * 2;
    const speed = 2 + Math.random() * 4;
    scene.add(mesh);
    particles.push({
      mesh, mat,
      vx: Math.cos(angle) * speed, vy: 3 + Math.random() * 3, vz: Math.sin(angle) * speed,
      life: 1, decay: 0.8 + Math.random() * 0.4,
    });
  }
}

export function spawnAoeRing(x, z, radius, color) {
  const ringGeo = new THREE.TorusGeometry(0.5, 0.08, 8, 32);
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true });
  const mesh = new THREE.Mesh(ringGeo, mat);
  mesh.position.set(x, 0.1, z);
  mesh.rotation.x = Math.PI / 2;
  scene.add(mesh);
  particles.push({ mesh, mat, vx: 0, vy: 0, vz: 0, life: 1, decay: 2, isRing: true, targetRadius: radius });
}

export function spawnFloatingText(x, z, text, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.font = 'bold 32px Courier New';
  ctx.fillStyle = color || '#ffffff';
  ctx.textAlign = 'center';
  ctx.fillText(text, 64, 40);
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
  const sprite = new THREE.Sprite(mat);
  sprite.position.set(x, 2, z);
  sprite.scale.set(2, 1, 1);
  scene.add(sprite);
  particles.push({ mesh: sprite, mat, vx: 0, vy: 2, vz: 0, life: 1, decay: 1.5, isSprite: true });
}

export function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt * p.decay;
    if (p.life <= 0) {
      scene.remove(p.mesh);
      if (p.mat.map) p.mat.map.dispose();
      p.mat.dispose();
      particles.splice(i, 1);
      continue;
    }
    p.mat.opacity = p.life;
    if (p.isRing) {
      const s = (1 - p.life) * p.targetRadius / 0.5;
      p.mesh.scale.set(Math.max(s, 0.1), Math.max(s, 0.1), 1);
    } else if (p.isSprite) {
      p.mesh.position.y += p.vy * dt;
    } else {
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      p.vy -= 10 * dt;
    }
  }
}
