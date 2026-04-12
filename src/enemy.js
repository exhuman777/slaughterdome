import * as THREE from 'three/webgpu';
import { scene } from './renderer.js';

const ENEMY_VISUALS = {
  grunt:    { geo: () => new THREE.BoxGeometry(1.2, 1.2, 1.2), color: 0xff4444, emissive: 0x441111, height: 1.2 },
  dasher:   { geo: () => new THREE.ConeGeometry(0.6, 1.5, 8), color: 0xff9944, emissive: 0x442200, height: 1.8 },
  brute:    { geo: () => new THREE.BoxGeometry(1.8, 1.8, 1.8), color: 0xcc3333, emissive: 0x331111, height: 2.4 },
  spitter:  { geo: () => new THREE.SphereGeometry(0.6, 8, 8), color: 0x44ff44, emissive: 0x114411, height: 1.4 },
  swarm:    { geo: () => new THREE.BoxGeometry(0.6, 0.6, 0.6), color: 0xdd44dd, emissive: 0x331133, height: 0.7 },
  shielder: { geo: () => new THREE.BoxGeometry(1.2, 1.2, 1.2), color: 0x4488ff, emissive: 0x112244, height: 1.4 },
  bomber:   { geo: () => new THREE.SphereGeometry(0.7, 8, 8), color: 0xff3333, emissive: 0x441111, height: 1.4 },
  titan:    { geo: () => new THREE.BoxGeometry(2.5, 3.5, 2.5), color: 0xffdd33, emissive: 0x443300, height: 3.5 },
};

const MONSTER_FILES = ['grunt', 'dasher', 'brute', 'spitter', 'swarm', 'shielder', 'bomber', 'titan'];
const monsterTemplates = {};
let modelsLoaded = false;

function dbg() {}

export async function loadMonsterModels() {
  dbg('Starting load...');
  try {
    const [{ GLTFLoader }, SkeletonUtils] = await Promise.all([
      import('three/addons/loaders/GLTFLoader.js'),
      import('three/addons/utils/SkeletonUtils.js'),
    ]);
    globalThis._MonsterSkeletonUtils = SkeletonUtils;
    dbg('GLTFLoader + SkeletonUtils OK');
    const gltfLoader = new GLTFLoader();
    for (const name of MONSTER_FILES) {
      try {
        const gltf = await new Promise((resolve, reject) => {
          gltfLoader.load('models/monsters/' + name + '.gltf', resolve, null, reject);
        });
        if (!gltf || !gltf.scene) { dbg(name + ': NO SCENE'); continue; }
        const visual = ENEMY_VISUALS[name] || ENEMY_VISUALS.grunt;
        const obj = gltf.scene;
        let meshCount = 0;
        obj.traverse(c => { if (c.isMesh) meshCount++; });
        obj.updateWorldMatrix(true, true);
        const box = new THREE.Box3().setFromObject(obj);
        const sz = new THREE.Vector3();
        box.getSize(sz);
        dbg(name + ': ' + meshCount + ' meshes, size=' + sz.x.toFixed(2) + 'x' + sz.y.toFixed(2) + 'x' + sz.z.toFixed(2));
        if (sz.y > 0.01) {
          obj.scale.setScalar(visual.height / sz.y);
          obj.updateWorldMatrix(true, true);
          box.setFromObject(obj);
          obj.position.y = -box.min.y;
        }
        // Do NOT modify template materials -- keep originals intact for proper cloning
        obj.traverse(c => { if (c.isMesh) c.castShadow = true; });
        monsterTemplates[name] = { scene: obj, visual };
      } catch (e) { dbg(name + ': ERR ' + e.message); }
    }
    modelsLoaded = Object.keys(monsterTemplates).length > 0;
    dbg('Done: ' + Object.keys(monsterTemplates).length + '/' + MONSTER_FILES.length);
  } catch (e) { dbg('INIT FAIL: ' + e.message); }
}

function cloneMonster(type) {
  const tmpl = monsterTemplates[type];
  if (!tmpl) return null;
  const SU = globalThis._MonsterSkeletonUtils;
  const clone = SU ? SU.clone(tmpl.scene) : tmpl.scene.clone();
  const visual = tmpl.visual || ENEMY_VISUALS[type] || ENEMY_VISUALS.grunt;
  const mats = [];
  clone.traverse(c => {
    if (c.isMesh) {
      c.material = c.material.clone();
      c.material._origColor = c.material.color ? c.material.color.clone() : new THREE.Color(0xffffff);
      // Subtle colored emissive per type -- NOT material.color (which is white for textured models)
      c.material.emissive = new THREE.Color(visual.color);
      c.material.emissiveIntensity = 0.15;
      c.castShadow = true;
      mats.push(c.material);
    }
  });
  return { model: clone, mats };
}

const enemyMeshes = new Map();

export function createEnemyMesh(id, type) {
  const visual = ENEMY_VISUALS[type] || ENEMY_VISUALS.grunt;
  const group = new THREE.Group();
  let mat = null;
  let modelMats = null;
  let isModel = false;

  const monster = cloneMonster(type);
  if (monster) {
    let mc = 0; monster.model.traverse(c => { if (c.isMesh) mc++; });
    dbg('spawn ' + type + ': ' + mc + ' meshes, ' + monster.mats.length + ' mats');
    group.add(monster.model);
    modelMats = monster.mats;
    isModel = true;
  } else {
    dbg('spawn ' + type + ': FALLBACK (no template)');
    // Fallback: colored primitives
    mat = new THREE.MeshStandardMaterial({
      color: visual.color, emissive: visual.emissive, emissiveIntensity: 0.5,
      roughness: 0.4, metalness: 0.3,
    });
    const mesh = new THREE.Mesh(visual.geo(), mat);
    const yOffset = type === 'brute' ? 0.9 : type === 'titan' ? 1.75 : 0.6;
    mesh.position.y = yOffset;
    group.add(mesh);
  }

  if (type === 'shielder' && !isModel) {
    const shield = new THREE.Mesh(
      new THREE.TorusGeometry(0.7, 0.12, 8, 16, Math.PI),
      new THREE.MeshStandardMaterial({ color: 0x88ccff, emissive: 0x4488ff, emissiveIntensity: 0.5, transparent: true, opacity: 0.7 })
    );
    shield.position.set(0, 0.6, 0.7);
    shield.rotation.y = Math.PI / 2;
    group.add(shield);
  }

  const hpBarY = type === 'titan' ? 4 : type === 'brute' ? 2.3 : 1.8;
  const hpBg = new THREE.Mesh(
    new THREE.PlaneGeometry(1.4, 0.15),
    new THREE.MeshBasicMaterial({ color: 0x333333 })
  );
  const hpFill = new THREE.Mesh(
    new THREE.PlaneGeometry(1.4, 0.12),
    new THREE.MeshBasicMaterial({ color: 0xff3333 })
  );
  hpBg.position.y = hpBarY; hpFill.position.y = hpBarY;
  hpBg.rotation.x = -0.3; hpFill.rotation.x = -0.3;
  group.add(hpBg); group.add(hpFill);

  group.scale.set(0.01, 0.01, 0.01);
  scene.add(group);
  enemyMeshes.set(id, { group, mat, modelMats, hpFill, type, flashTimer: 0, spawnTimer: 0.3, scalePunch: 0, isModel });
  return group;
}

export function updateEnemyMesh(id, x, z, hp, maxHp, dt) {
  const em = enemyMeshes.get(id);
  if (!em) return;

  if (em.spawnTimer > 0) {
    em.spawnTimer -= dt;
    const t = 1 - Math.max(0, em.spawnTimer) / 0.3;
    const s = t * (2 - t);
    em.group.scale.set(s, s, s);
  } else if (em.scalePunch > 0) {
    em.scalePunch -= dt * 6;
    const s = 1 + Math.max(0, em.scalePunch) * 0.3;
    em.group.scale.set(s, s, s);
  } else {
    em.group.scale.set(1, 1, 1);
  }

  em.group.position.x += (x - em.group.position.x) * 0.2;
  em.group.position.z += (z - em.group.position.z) * 0.2;
  const dx = x - em.group.position.x;
  const dz = z - em.group.position.z;
  if (dx * dx + dz * dz > 0.001) em.group.rotation.y = Math.atan2(dx, dz);

  const hpFrac = Math.max(0, hp / (maxHp || 1));
  em.hpFill.scale.x = hpFrac;
  em.hpFill.position.x = -(1.4 * (1 - hpFrac)) / 2;

  if (em.flashTimer > 0) {
    em.flashTimer -= dt;
    const fi = Math.max(0, em.flashTimer / 0.15);
    if (em.isModel && em.modelMats) {
      em.modelMats.forEach(m => {
        m.color.set(0xffffff).lerp(m._origColor, 1 - fi);
      });
    } else if (em.mat) {
      em.mat.emissive.set(0xffffff);
      em.mat.emissiveIntensity = 2 * fi;
    }
  } else {
    if (em.isModel && em.modelMats) {
      em.modelMats.forEach(m => {
        if (m._needsRestore) { m.color.copy(m._origColor); m._needsRestore = false; }
      });
    } else if (em.mat) {
      const visual = ENEMY_VISUALS[em.type] || ENEMY_VISUALS.grunt;
      em.mat.emissive.set(visual.emissive);
      em.mat.emissiveIntensity = 0.5;
    }
  }

  if (em.type === 'bomber') {
    const s = 1 + Math.sin(Date.now() / 150) * 0.15;
    em.group.children[0].scale.set(s, s, s);
  }
}

export function flashEnemy(id) {
  const em = enemyMeshes.get(id);
  if (em) {
    em.flashTimer = 0.15; em.scalePunch = 1;
    if (em.isModel && em.modelMats) em.modelMats.forEach(m => { m._needsRestore = true; });
  }
}

const dyingEnemies = [];

export function removeEnemyMesh(id) {
  const em = enemyMeshes.get(id);
  if (em) {
    // Remove HP bars before death anim
    em.group.remove(em.hpFill);
    em.group.children.forEach(c => { if (c.geometry && c.geometry.type === 'PlaneGeometry') em.group.remove(c); });
    const tumbleDir = (Math.random() - 0.5) * 2;
    dyingEnemies.push({
      group: em.group, mat: em.mat, modelMats: em.modelMats, isModel: em.isModel,
      timer: 0.5, tumbleDir, startY: em.group.position.y,
    });
    enemyMeshes.delete(id);
  }
}

export function updateDyingEnemies(dt) {
  for (let i = dyingEnemies.length - 1; i >= 0; i--) {
    const d = dyingEnemies[i];
    d.timer -= dt;
    const t = Math.max(0, d.timer / 0.5);
    // Tumble sideways and flatten
    d.group.rotation.z += d.tumbleDir * dt * 8;
    d.group.rotation.x += dt * 3;
    d.group.scale.y = t;
    d.group.scale.x = 0.8 + (1 - t) * 0.3;
    d.group.scale.z = 0.8 + (1 - t) * 0.3;
    d.group.position.y = d.startY * t;
    if (d.isModel && d.modelMats) {
      d.modelMats.forEach(m => { m.opacity = t; m.transparent = true; });
    } else if (d.mat) {
      d.mat.opacity = t;
      d.mat.transparent = true;
    }
    if (d.timer <= 0) {
      scene.remove(d.group);
      dyingEnemies.splice(i, 1);
    }
  }
}

export function removeAllEnemies() {
  for (const [id] of enemyMeshes) removeEnemyMesh(id);
}

export function getEnemyMeshes() { return enemyMeshes; }
