import * as THREE from 'https://esm.sh/three@0.162.0';
import { scene } from './renderer.js';

const PLAYER_COLORS = [0x4488ff, 0xff4444, 0x44ff44, 0xffff44];
const playerMeshes = new Map();

export function createPlayerMesh(id, index) {
  const color = PLAYER_COLORS[index % PLAYER_COLORS.length];
  const mat = new THREE.MeshStandardMaterial({ color });
  const group = new THREE.Group();

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.2, 0.5), mat);
  body.position.y = 1.2; body.castShadow = true; group.add(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 8), mat);
  head.position.y = 2.15; head.castShadow = true; group.add(head);

  const armGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.8, 6);
  const leftArm = new THREE.Mesh(armGeo, mat);
  leftArm.position.set(-0.55, 1.2, 0); group.add(leftArm);
  const rightArm = new THREE.Mesh(armGeo, mat);
  rightArm.position.set(0.55, 1.2, 0); group.add(rightArm);

  const legGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.7, 6);
  const leftLeg = new THREE.Mesh(legGeo, mat);
  leftLeg.position.set(-0.2, 0.35, 0); group.add(leftLeg);
  const rightLeg = new THREE.Mesh(legGeo, mat);
  rightLeg.position.set(0.2, 0.35, 0); group.add(rightLeg);

  scene.add(group);
  playerMeshes.set(id, { group, body, bobTime: 0 });
  return group;
}

export function updatePlayerMesh(id, x, z, alive, moving, dt) {
  const pm = playerMeshes.get(id);
  if (!pm) return;
  if (!alive) { pm.group.visible = false; return; }
  pm.group.visible = true;
  pm.group.position.x += (x - pm.group.position.x) * 0.2;
  pm.group.position.z += (z - pm.group.position.z) * 0.2;
  if (moving) {
    pm.bobTime += dt * 8;
    pm.group.position.y = Math.sin(pm.bobTime) * 0.15;
  } else {
    pm.group.position.y *= 0.9;
  }
}

export function setPlayerRotation(id, angle) {
  const pm = playerMeshes.get(id);
  if (pm) pm.group.rotation.y = -angle + Math.PI / 2;
}

export function removePlayerMesh(id) {
  const pm = playerMeshes.get(id);
  if (pm) { scene.remove(pm.group); playerMeshes.delete(id); }
}

export function getPlayerMeshes() { return playerMeshes; }
