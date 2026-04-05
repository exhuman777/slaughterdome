import * as THREE from 'https://esm.sh/three@0.162.0';
import { scene } from './renderer.js';

const ENEMY_VISUALS = {
  grunt:    { geo: () => new THREE.BoxGeometry(1, 1, 1), color: 0xcc3333 },
  dasher:   { geo: () => new THREE.ConeGeometry(0.5, 1.2, 8), color: 0xff8833 },
  brute:    { geo: () => new THREE.BoxGeometry(1.5, 1.5, 1.5), color: 0x882222 },
  spitter:  { geo: () => new THREE.SphereGeometry(0.5, 8, 8), color: 0x33cc33 },
  swarm:    { geo: () => new THREE.BoxGeometry(0.5, 0.5, 0.5), color: 0xaa33aa },
  shielder: { geo: () => new THREE.BoxGeometry(1, 1, 1), color: 0x3366cc },
  bomber:   { geo: () => new THREE.SphereGeometry(0.6, 8, 8), color: 0xff2222 },
  titan:    { geo: () => new THREE.BoxGeometry(2, 3, 2), color: 0xffcc00 },
};

const enemyMeshes = new Map();

export function createEnemyMesh(id, type) {
  const visual = ENEMY_VISUALS[type] || ENEMY_VISUALS.grunt;
  const mat = new THREE.MeshStandardMaterial({ color: visual.color });
  const mesh = new THREE.Mesh(visual.geo(), mat);
  mesh.castShadow = true;
  const group = new THREE.Group();
  const yOffset = type === 'brute' ? 0.75 : type === 'titan' ? 1.5 : 0.5;
  mesh.position.y = yOffset;
  group.add(mesh);

  if (type === 'shielder') {
    const shield = new THREE.Mesh(
      new THREE.TorusGeometry(0.6, 0.1, 8, 16, Math.PI),
      new THREE.MeshStandardMaterial({ color: 0x88aaff, transparent: true, opacity: 0.6 })
    );
    shield.position.set(0, 0.5, 0.6);
    shield.rotation.y = Math.PI / 2;
    group.add(shield);
  }

  const hpBg = new THREE.Mesh(
    new THREE.PlaneGeometry(1.2, 0.12),
    new THREE.MeshBasicMaterial({ color: 0x333333 })
  );
  const hpFill = new THREE.Mesh(
    new THREE.PlaneGeometry(1.2, 0.1),
    new THREE.MeshBasicMaterial({ color: 0xff0000 })
  );
  const hpBarY = type === 'titan' ? 3.5 : type === 'brute' ? 2 : 1.5;
  hpBg.position.y = hpBarY; hpFill.position.y = hpBarY;
  hpBg.rotation.x = -0.3; hpFill.rotation.x = -0.3;
  group.add(hpBg); group.add(hpFill);

  scene.add(group);
  enemyMeshes.set(id, { group, mesh, mat, hpFill, type, flashTimer: 0 });
  return group;
}

export function updateEnemyMesh(id, x, z, hp, maxHp, dt) {
  const em = enemyMeshes.get(id);
  if (!em) return;
  em.group.position.x += (x - em.group.position.x) * 0.2;
  em.group.position.z += (z - em.group.position.z) * 0.2;
  const dx = x - em.group.position.x;
  const dz = z - em.group.position.z;
  if (dx * dx + dz * dz > 0.001) em.group.rotation.y = Math.atan2(dx, dz);
  const hpFrac = Math.max(0, hp / maxHp);
  em.hpFill.scale.x = hpFrac;
  em.hpFill.position.x = -(1.2 * (1 - hpFrac)) / 2;
  if (em.flashTimer > 0) {
    em.flashTimer -= dt;
    em.mat.emissive.set(0xffffff);
    em.mat.emissiveIntensity = em.flashTimer / 0.1;
  } else {
    em.mat.emissive.set(0x000000);
    em.mat.emissiveIntensity = 0;
  }
  if (em.type === 'bomber') {
    const s = 1 + Math.sin(Date.now() / 200) * 0.1;
    em.mesh.scale.set(s, s, s);
  }
}

export function flashEnemy(id) {
  const em = enemyMeshes.get(id);
  if (em) em.flashTimer = 0.1;
}

export function removeEnemyMesh(id) {
  const em = enemyMeshes.get(id);
  if (em) { scene.remove(em.group); enemyMeshes.delete(id); }
}

export function removeAllEnemies() {
  for (const [id] of enemyMeshes) removeEnemyMesh(id);
}

export function getEnemyMeshes() { return enemyMeshes; }
