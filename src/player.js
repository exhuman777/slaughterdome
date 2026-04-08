import * as THREE from 'https://esm.sh/three@0.162.0';
import { scene } from './renderer.js';

const PLAYER_COLORS = [0x44aaff, 0xff5555, 0x55ff55, 0xffff55];
const playerMeshes = new Map();
let localId = null;

// Dash afterimage system
const afterimages = [];
const afterimageGeo = new THREE.BoxGeometry(1.2, 2.0, 0.8);
const AFTERIMAGE_INTERVAL = 0.025;

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

  scene.add(group);
  playerMeshes.set(id, { group, body, mat, ring, ringMat, bobTime: 0, color, hitFlash: 0 });
  return group;
}

export function markLocalPlayer(id) {
  localId = id;
  const pm = playerMeshes.get(id);
  if (pm) {
    pm.ringMat.opacity = 0.7;
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
  // Hit flash: red tint when damaged
  if (pm.hitFlash > 0) {
    pm.hitFlash -= dt;
    pm.mat.emissive.set(0xff0000);
    pm.mat.emissiveIntensity = 1.5 * (pm.hitFlash / 0.15);
  } else {
    pm.mat.emissive.set(pm.color);
    pm.mat.emissiveIntensity = 0.25;
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

export function flashPlayer(id) {
  const pm = playerMeshes.get(id);
  if (pm) pm.hitFlash = 0.15;
}

export function setPlayerDashing(id, dashing) {
  const pm = playerMeshes.get(id);
  if (!pm) return;
  if (dashing) {
    pm.group.scale.set(0.8, 1.2, 1.0);
    // Spawn afterimage
    pm.afterimageTimer = (pm.afterimageTimer || 0) - 0.016;
    if (pm.afterimageTimer <= 0) {
      pm.afterimageTimer = AFTERIMAGE_INTERVAL;
      // Bright cyan-white ghost
      const mat = new THREE.MeshBasicMaterial({ color: 0x88ddff, transparent: true, opacity: 0.7 });
      const ghost = new THREE.Mesh(afterimageGeo, mat);
      ghost.position.copy(pm.group.position);
      ghost.position.y += 1.2;
      ghost.rotation.y = pm.group.rotation.y;
      scene.add(ghost);
      afterimages.push({ mesh: ghost, mat, life: 0.25 });
      // Ground streak
      const trailMat = new THREE.MeshBasicMaterial({ color: pm.color, transparent: true, opacity: 0.6, side: THREE.DoubleSide });
      const trailGeo = new THREE.PlaneGeometry(0.8, 0.8);
      trailGeo.rotateX(-Math.PI / 2);
      const trail = new THREE.Mesh(trailGeo, trailMat);
      trail.position.set(pm.group.position.x, 0.05, pm.group.position.z);
      scene.add(trail);
      afterimages.push({ mesh: trail, mat: trailMat, life: 0.4, disposeGeo: true });
    }
  } else {
    pm.afterimageTimer = 0;
    pm.group.scale.set(
      pm.group.scale.x + (1 - pm.group.scale.x) * 0.3,
      pm.group.scale.y + (1 - pm.group.scale.y) * 0.3,
      pm.group.scale.z + (1 - pm.group.scale.z) * 0.3
    );
  }
}

export function updateAfterimages(dt) {
  for (let i = afterimages.length - 1; i >= 0; i--) {
    const a = afterimages[i];
    a.life -= dt;
    const maxLife = a.disposeGeo ? 0.4 : 0.25;
    a.mat.opacity = Math.max(0, a.life / maxLife) * 0.7;
    if (!a.disposeGeo) a.mesh.scale.y *= 0.94;
    if (a.life <= 0) {
      scene.remove(a.mesh);
      a.mat.dispose();
      if (a.disposeGeo) a.mesh.geometry.dispose();
      afterimages.splice(i, 1);
    }
  }
}

export function removePlayerMesh(id) {
  const pm = playerMeshes.get(id);
  if (pm) { scene.remove(pm.group); playerMeshes.delete(id); }
}

export function getPlayerMeshes() { return playerMeshes; }
