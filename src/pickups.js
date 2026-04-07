import * as THREE from 'https://esm.sh/three@0.162.0';
import { scene } from './renderer.js';

const PICKUP_GEOS = {
  health: () => new THREE.SphereGeometry(0.4, 8, 8),
  speed: () => new THREE.ConeGeometry(0.3, 0.8, 6),
  damage: () => new THREE.BoxGeometry(0.3, 0.8, 0.15),
  shield: () => new THREE.OctahedronGeometry(0.4),
};
const PICKUP_COLORS = { health: 0x44ff44, speed: 0xffff00, damage: 0xff4444, shield: 0x4444ff };
const pickupMeshes = new Map();

export function createPickupMesh(id, type, x, z) {
  const geo = (PICKUP_GEOS[type] || PICKUP_GEOS.health)();
  const color = PICKUP_COLORS[type] || 0xffffff;
  const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.5 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, 1, z);
  const light = new THREE.PointLight(color, 0.5, 5);
  light.position.set(x, 1.5, z);
  scene.add(mesh);
  scene.add(light);
  pickupMeshes.set(id, { mesh, light, type, spawnTime: Date.now() });
}

export function updatePickups(dt) {
  const now = Date.now();
  for (const [id, pk] of pickupMeshes) {
    pk.mesh.rotation.y += 2 * dt;
    pk.mesh.position.y = 1 + Math.sin(now / 300) * 0.3;
    pk.light.position.y = pk.mesh.position.y + 0.5;
    const age = (now - pk.spawnTime) / 1000;
    if (age > 6) pk.mesh.visible = Math.floor(now / 100) % 2 === 0;
  }
}

export function removePickupMesh(id) {
  const pk = pickupMeshes.get(id);
  if (pk) { scene.remove(pk.mesh); scene.remove(pk.light); pickupMeshes.delete(id); }
}

export function syncPickups(serverPickups, onRemove) {
  const serverIds = new Set(serverPickups.map(p => p.id));
  for (const [id] of pickupMeshes) {
    if (!serverIds.has(id)) {
      const pk = pickupMeshes.get(id);
      if (pk && onRemove) onRemove(pk.mesh.position.x, pk.mesh.position.z);
      removePickupMesh(id);
    }
  }
  for (const p of serverPickups) {
    if (!pickupMeshes.has(p.id)) createPickupMesh(p.id, p.type, p.pos[0], p.pos[2]);
  }
}
