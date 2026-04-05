import * as THREE from 'https://esm.sh/three@0.162.0';
import { scene } from './renderer.js';
import { spawnAoeRing, spawnFloatingText } from './particles.js';

const swings = [];

export function showMeleeSwing(x, z, angle) {
  const arcGeo = new THREE.TorusGeometry(1.5, 0.05, 4, 16, Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 });
  const mesh = new THREE.Mesh(arcGeo, mat);
  mesh.position.set(x, 0.8, z);
  mesh.rotation.set(Math.PI / 2, 0, -angle - Math.PI / 4);
  scene.add(mesh);
  swings.push({ mesh, mat, life: 0.2 });
}

export function showSpecialAttack(x, z) {
  spawnAoeRing(x, z, 4, 0xffaa00);
}

export function showDamageNumber(x, z, dmg, crit) {
  const color = crit ? '#ffff00' : '#ffffff';
  const text = crit ? dmg + '!' : '' + dmg;
  spawnFloatingText(x + (Math.random() - 0.5), z + (Math.random() - 0.5), text, color);
}

export function showExplosion(x, z, radius) {
  spawnAoeRing(x, z, radius, 0xff4400);
}

export function updateCombatVisuals(dt) {
  for (let i = swings.length - 1; i >= 0; i--) {
    const s = swings[i];
    s.life -= dt;
    s.mat.opacity = Math.max(0, s.life / 0.2);
    if (s.life <= 0) {
      scene.remove(s.mesh);
      s.mat.dispose();
      swings.splice(i, 1);
    }
  }
}
