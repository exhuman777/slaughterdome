import * as THREE from 'https://esm.sh/three@0.162.0';
import { scene } from './renderer.js';

const PLAYER_COLORS = [0x44aaff, 0xff5555, 0x55ff55, 0xffff55];
const playerMeshes = new Map();
let localId = null;

export function createPlayerMesh(id, index) {
  const color = PLAYER_COLORS[index % PLAYER_COLORS.length];
  const mat = new THREE.MeshStandardMaterial({
    color, emissive: color, emissiveIntensity: 0.25,
    roughness: 0.3, metalness: 0.5,
  });
  const group = new THREE.Group();

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.5, 0.7), mat);
  body.position.y = 1.4; body.castShadow = true; group.add(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 8), mat);
  head.position.y = 2.6; head.castShadow = true; group.add(head);

  const armGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.9, 6);
  const lArm = new THREE.Mesh(armGeo, mat); lArm.position.set(-0.65, 1.4, 0); group.add(lArm);
  const rArm = new THREE.Mesh(armGeo, mat); rArm.position.set(0.65, 1.4, 0); group.add(rArm);

  const legGeo = new THREE.CylinderGeometry(0.17, 0.17, 0.8, 6);
  const lLeg = new THREE.Mesh(legGeo, mat); lLeg.position.set(-0.25, 0.4, 0); group.add(lLeg);
  const rLeg = new THREE.Mesh(legGeo, mat); rLeg.position.set(0.25, 0.4, 0); group.add(rLeg);

  const ringGeo = new THREE.RingGeometry(0.8, 1.1, 32);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.4, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.position.y = 0.05;
  group.add(ring);

  const glow = new THREE.PointLight(color, 0.6, 8);
  glow.position.y = 1.5;
  group.add(glow);

  scene.add(group);
  playerMeshes.set(id, { group, body, mat, ring, ringMat, glow, bobTime: 0, color });
  return group;
}

export function markLocalPlayer(id) {
  localId = id;
  const pm = playerMeshes.get(id);
  if (pm) {
    pm.ringMat.opacity = 0.7;
    pm.glow.intensity = 1.2;
  }
}

export function updatePlayerMesh(id, x, z, alive, moving, dt) {
  const pm = playerMeshes.get(id);
  if (!pm) return;
  if (!alive) { pm.group.visible = false; return; }
  pm.group.visible = true;
  const t = 1 - Math.exp(-18 * dt);
  pm.group.position.x += (x - pm.group.position.x) * t;
  pm.group.position.z += (z - pm.group.position.z) * t;
  if (moving) {
    pm.bobTime += dt * 10;
    pm.group.position.y = Math.sin(pm.bobTime) * 0.2;
  } else {
    pm.group.position.y *= 0.85;
  }
  const pulse = 1 + Math.sin(Date.now() / 250) * 0.1;
  pm.ring.scale.set(pulse, 1, pulse);
  if (id === localId) {
    pm.ringMat.opacity = 0.5 + Math.sin(Date.now() / 200) * 0.2;
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
