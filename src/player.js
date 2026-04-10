import * as THREE from 'https://esm.sh/three@0.162.0';
import { scene } from './renderer.js';

const PLAYER_COLORS = [0x44aaff, 0xff5555, 0x55ff55, 0xffff55];
const playerMeshes = new Map();
let localId = null;

// Character model templates (loaded dynamically to avoid blocking module chain)
const charTemplates = [];

export async function loadCharacters() {
  try {
    const [{ GLTFLoader }, SkeletonUtils] = await Promise.all([
      import('https://esm.sh/three@0.162.0/addons/loaders/GLTFLoader.js'),
      import('https://esm.sh/three@0.162.0/addons/utils/SkeletonUtils.js'),
    ]);
    globalThis._SkeletonUtils = SkeletonUtils;
    const gltfLoader = new GLTFLoader();
    const files = ['models/warrior.gltf', 'models/rogue.gltf', 'models/ranger.gltf'];
    const results = await Promise.all(files.map(url =>
      new Promise(r => gltfLoader.load(url, r, null, () => r(null)))
    ));
  for (const gltf of results) {
    if (!gltf) { charTemplates.push(null); continue; }
    gltf.scene.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(gltf.scene);
    const sz = new THREE.Vector3();
    box.getSize(sz);
    if (sz.y > 0.01) {
      gltf.scene.scale.setScalar(2.8 / sz.y);
      gltf.scene.updateWorldMatrix(true, true);
      box.setFromObject(gltf.scene);
      gltf.scene.position.y = -box.min.y;
    }
    gltf.scene.traverse(c => { if (c.isMesh) c.castShadow = true; });
    const clips = {};
    for (const clip of gltf.animations) clips[clip.name] = clip;
    charTemplates.push({ scene: gltf.scene, clips });
  }
  } catch (e) { console.warn('Character models failed:', e); }
}

// Dash afterimage system
const afterimages = [];
const afterimageGeo = new THREE.BoxGeometry(1.0, 2.8, 0.7);
const AFTERIMAGE_INTERVAL = 0.018;
const speedLineGeo = new THREE.PlaneGeometry(2.5, 0.12);
const burstRingGeo = new THREE.RingGeometry(0.5, 1.2, 24);
burstRingGeo.rotateX(-Math.PI / 2);

function switchAnim(pm, name) {
  if (!pm.actions || pm.currentAnim === name || !pm.actions[name]) return;
  const prev = pm.actions[pm.currentAnim];
  const next = pm.actions[name];
  if (prev) prev.fadeOut(0.15);
  next.reset().fadeIn(0.15).play();
  pm.currentAnim = name;
}

export function createPlayerMesh(id, index) {
  const color = PLAYER_COLORS[index % PLAYER_COLORS.length];
  const group = new THREE.Group();
  let isModel = false;
  let mixer = null;
  let actions = null;
  let modelMats = [];
  let mat = null;

  const template = charTemplates.length > 0 ? charTemplates[index % charTemplates.length] : null;
  if (template) {
    const model = globalThis._SkeletonUtils ? globalThis._SkeletonUtils.clone(template.scene) : template.scene.clone();
    model.traverse(c => {
      if (c.isMesh) {
        c.material = c.material.clone();
        c.material._origColor = c.material.color.clone();
        modelMats.push(c.material);
        c.castShadow = true;
      }
    });
    group.add(model);
    mixer = new THREE.AnimationMixer(model);
    actions = {};
    for (const [name, clip] of Object.entries(template.clips)) {
      actions[name] = mixer.clipAction(clip);
    }
    if (actions.Idle) actions.Idle.play();
    isModel = true;
  } else {
    mat = new THREE.MeshStandardMaterial({
      color, emissive: color, emissiveIntensity: 0.25,
      roughness: 0.3, metalness: 0.5,
    });
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.5, 0.7), mat);
    body.position.y = 1.4; body.castShadow = true; group.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 8), mat);
    head.position.y = 2.6; head.castShadow = true; group.add(head);
    const armGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.9, 6);
    group.add(Object.assign(new THREE.Mesh(armGeo, mat), { position: new THREE.Vector3(-0.65, 1.4, 0) }));
    group.add(Object.assign(new THREE.Mesh(armGeo, mat), { position: new THREE.Vector3(0.65, 1.4, 0) }));
    const legGeo = new THREE.CylinderGeometry(0.17, 0.17, 0.8, 6);
    group.add(Object.assign(new THREE.Mesh(legGeo, mat), { position: new THREE.Vector3(-0.25, 0.4, 0) }));
    group.add(Object.assign(new THREE.Mesh(legGeo, mat), { position: new THREE.Vector3(0.25, 0.4, 0) }));
  }

  // Ring indicator
  const ringGeo = new THREE.RingGeometry(0.8, 1.1, 32);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.4, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.position.y = 0.05;
  group.add(ring);

  scene.add(group);
  playerMeshes.set(id, {
    group, mat, ring, ringMat, bobTime: 0, color, hitFlash: 0,
    isModel, mixer, actions, modelMats, currentAnim: 'Idle', isDashing: false,
  });
  return group;
}

export function markLocalPlayer(id) {
  localId = id;
  const pm = playerMeshes.get(id);
  if (pm) pm.ringMat.opacity = 0.7;
}

export function updatePlayerMesh(id, x, z, alive, moving, dt) {
  const pm = playerMeshes.get(id);
  if (!pm) return;
  if (!alive) {
    pm.group.visible = false;
    if (pm.isModel) switchAnim(pm, 'Death');
    return;
  }
  pm.group.visible = true;
  const t = 1 - Math.exp(-18 * dt);
  pm.group.position.x += (x - pm.group.position.x) * t;
  pm.group.position.z += (z - pm.group.position.z) * t;

  // Animation update
  if (pm.mixer) pm.mixer.update(dt);
  if (pm.isModel) {
    if (pm.isDashing) switchAnim(pm, 'Roll');
    else if (moving) switchAnim(pm, 'Run');
    else switchAnim(pm, 'Idle');
  } else {
    if (moving) {
      pm.bobTime += dt * 10;
      pm.group.position.y = Math.sin(pm.bobTime) * 0.2;
    } else {
      pm.group.position.y *= 0.85;
    }
  }

  // Hit flash
  if (pm.hitFlash > 0) {
    pm.hitFlash -= dt;
    const fi = Math.max(0, pm.hitFlash / 0.15);
    if (pm.isModel) {
      const red = new THREE.Color(0xff0000);
      pm.modelMats.forEach(m => m.color.copy(m._origColor).lerp(red, fi * 0.7));
    } else if (pm.mat) {
      pm.mat.emissive.set(0xff0000);
      pm.mat.emissiveIntensity = 1.5 * fi;
    }
  } else {
    if (pm.isModel) {
      pm.modelMats.forEach(m => { if (!m.color.equals(m._origColor)) m.color.copy(m._origColor); });
    } else if (pm.mat) {
      pm.mat.emissive.set(pm.color);
      pm.mat.emissiveIntensity = 0.25;
    }
  }

  const pulse = 1 + Math.sin(Date.now() / 250) * 0.1;
  pm.ring.scale.set(pulse, 1, pulse);
  if (id === localId) pm.ringMat.opacity = 0.5 + Math.sin(Date.now() / 200) * 0.2;
}

export function setPlayerRotation(id, angle) {
  const pm = playerMeshes.get(id);
  if (!pm) return;
  pm.group.rotation.y = -angle + Math.PI / 2;
}

export function flashPlayer(id) {
  const pm = playerMeshes.get(id);
  if (pm) pm.hitFlash = 0.15;
}

export function setPlayerDashing(id, dashing) {
  const pm = playerMeshes.get(id);
  if (!pm) return;
  pm.isDashing = dashing;
  if (dashing) {
    pm.group.scale.set(0.6, 1.4, 0.6);
    if (!pm.dashActive) {
      pm.dashActive = true;
      const burstMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, side: THREE.DoubleSide });
      const burst = new THREE.Mesh(burstRingGeo, burstMat);
      burst.position.set(pm.group.position.x, 0.15, pm.group.position.z);
      scene.add(burst);
      afterimages.push({ mesh: burst, mat: burstMat, life: 0.35, isBurst: true, startScale: 1 });
      const burst2Mat = new THREE.MeshBasicMaterial({ color: pm.color, transparent: true, opacity: 0.7, side: THREE.DoubleSide });
      const burst2 = new THREE.Mesh(burstRingGeo, burst2Mat);
      burst2.position.set(pm.group.position.x, 0.1, pm.group.position.z);
      scene.add(burst2);
      afterimages.push({ mesh: burst2, mat: burst2Mat, life: 0.5, isBurst: true, startScale: 0.5 });
    }
    pm.afterimageTimer = (pm.afterimageTimer || 0) - 0.016;
    if (pm.afterimageTimer <= 0) {
      pm.afterimageTimer = AFTERIMAGE_INTERVAL;
      const mat2 = new THREE.MeshBasicMaterial({ color: 0xccffff, transparent: true, opacity: 0.85 });
      const ghost = new THREE.Mesh(afterimageGeo, mat2);
      ghost.position.copy(pm.group.position); ghost.position.y += 1.4;
      ghost.rotation.y = pm.group.rotation.y; ghost.scale.set(1, 1, 0.8);
      scene.add(ghost);
      afterimages.push({ mesh: ghost, mat: mat2, life: 0.35 });
      const trailMat = new THREE.MeshBasicMaterial({ color: pm.color, transparent: true, opacity: 0.7, side: THREE.DoubleSide });
      const trailGeo = new THREE.PlaneGeometry(1.4, 1.4); trailGeo.rotateX(-Math.PI / 2);
      const trail = new THREE.Mesh(trailGeo, trailMat);
      trail.position.set(pm.group.position.x, 0.04, pm.group.position.z);
      trail.rotation.y = pm.group.rotation.y;
      scene.add(trail);
      afterimages.push({ mesh: trail, mat: trailMat, life: 0.5, disposeGeo: true });
      for (let s = -1; s <= 1; s += 2) {
        const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, side: THREE.DoubleSide });
        const line = new THREE.Mesh(speedLineGeo, lineMat);
        const perpAngle = pm.group.rotation.y + Math.PI / 2;
        line.position.set(
          pm.group.position.x + Math.sin(perpAngle) * s * (0.5 + Math.random() * 0.5),
          0.8 + Math.random() * 1.5,
          pm.group.position.z + Math.cos(perpAngle) * s * (0.5 + Math.random() * 0.5)
        );
        line.rotation.y = pm.group.rotation.y;
        scene.add(line);
        afterimages.push({ mesh: line, mat: lineMat, life: 0.15 });
      }
    }
  } else {
    if (pm.dashActive) {
      pm.dashActive = false;
      const endMat = new THREE.MeshBasicMaterial({ color: pm.color, transparent: true, opacity: 0.6, side: THREE.DoubleSide });
      const endBurst = new THREE.Mesh(burstRingGeo, endMat);
      endBurst.position.set(pm.group.position.x, 0.1, pm.group.position.z);
      scene.add(endBurst);
      afterimages.push({ mesh: endBurst, mat: endMat, life: 0.25, isBurst: true, startScale: 0.5 });
    }
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
    if (a.isBurst) {
      const maxLife = a.life + dt > 0.4 ? 0.5 : (a.life + dt > 0.3 ? 0.35 : 0.25);
      const t2 = 1 - Math.max(0, a.life / maxLife);
      const s = (a.startScale || 1) + t2 * 5;
      a.mesh.scale.set(s, 1, s);
      a.mat.opacity = Math.max(0, a.life / maxLife) * 0.9;
    } else if (a.disposeGeo) {
      a.mat.opacity = Math.max(0, a.life / 0.5) * 0.7;
    } else {
      a.mat.opacity = Math.max(0, a.life / 0.35) * 0.85;
      a.mesh.scale.y *= 0.96;
      a.mesh.scale.x *= 0.98;
      a.mesh.scale.z *= 0.98;
    }
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
  if (pm) {
    if (pm.mixer) pm.mixer.stopAllAction();
    scene.remove(pm.group);
    playerMeshes.delete(id);
  }
}

export function getPlayerMeshes() { return playerMeshes; }
