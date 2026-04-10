import * as THREE from 'https://esm.sh/three@0.162.0';
import { scene } from './renderer.js';

// Pickup model templates (loaded async)
const pickupTemplates = {};
let modelsLoaded = false;

const PICKUP_COLORS = {
  health: 0x44ff44,
  speed: 0xffdd00,
  damage: 0xff4444,
  shield: 0x4488ff,
};

// Model-to-type mapping: which OBJ and object name to use per pickup
const PICKUP_MODELS = {
  health: { file: 'models/gems.obj', objName: 'Gem7', color: 0x44ff44, emissive: 0x22aa22 },
  speed:  { file: 'models/gems.obj', objName: 'Gem4', color: 0xffdd00, emissive: 0xaa8800 },
  damage: { file: 'models/gems.obj', objName: 'Gem3', color: 0xff4444, emissive: 0xaa2222 },
  shield: { file: 'models/gems.obj', objName: 'Gem1', color: 0x4488ff, emissive: 0x2244aa },
};

// Fallback geometries if models fail
const FALLBACK_GEOS = {
  health: () => new THREE.OctahedronGeometry(0.4),
  speed: () => new THREE.OctahedronGeometry(0.35),
  damage: () => new THREE.OctahedronGeometry(0.4),
  shield: () => new THREE.OctahedronGeometry(0.4),
};

export async function loadPickupModels() {
  try {
    const { OBJLoader } = await import('https://esm.sh/three@0.162.0/addons/loaders/OBJLoader.js');
    const loader = new OBJLoader();
    const gemsObj = await new Promise((resolve, reject) => {
      loader.load('models/gems.obj', resolve, null, reject);
    });
    // Extract individual gem objects by name prefix
    for (const [type, cfg] of Object.entries(PICKUP_MODELS)) {
      let found = null;
      gemsObj.traverse(c => {
        if (c.isMesh && c.name && c.name.startsWith(cfg.objName) && !found) found = c;
      });
      if (!found) {
        // Try matching by object name pattern
        gemsObj.traverse(c => {
          if (c.name && c.name.startsWith(cfg.objName) && !found) {
            c.traverse(m => { if (m.isMesh && !found) found = m; });
          }
        });
      }
      if (found) {
        // Normalize size
        found.geometry.computeBoundingBox();
        const box = found.geometry.boundingBox;
        const sz = new THREE.Vector3();
        box.getSize(sz);
        const maxDim = Math.max(sz.x, sz.y, sz.z);
        const scale = 1.2 / maxDim;
        pickupTemplates[type] = { geometry: found.geometry, scale, cfg };
      }
    }
    // Also try loading scroll and book
    try {
      const scrollObj = await new Promise((r, j) => loader.load('models/scroll.obj', r, null, j));
      let scrollMesh = null;
      scrollObj.traverse(c => { if (c.isMesh && !scrollMesh) scrollMesh = c; });
      if (scrollMesh) {
        scrollMesh.geometry.computeBoundingBox();
        const sz2 = new THREE.Vector3();
        scrollMesh.geometry.boundingBox.getSize(sz2);
        pickupTemplates._scroll = { geometry: scrollMesh.geometry, scale: 1.0 / Math.max(sz2.x, sz2.y, sz2.z) };
      }
    } catch (e) { /* scroll optional */ }
    try {
      const bookObj = await new Promise((r, j) => loader.load('models/book.obj', r, null, j));
      let bookMesh = null;
      bookObj.traverse(c => { if (c.isMesh && !bookMesh) bookMesh = c; });
      if (bookMesh) {
        bookMesh.geometry.computeBoundingBox();
        const sz3 = new THREE.Vector3();
        bookMesh.geometry.boundingBox.getSize(sz3);
        pickupTemplates._book = { geometry: bookMesh.geometry, scale: 1.0 / Math.max(sz3.x, sz3.y, sz3.z) };
      }
    } catch (e) { /* book optional */ }
    modelsLoaded = Object.keys(pickupTemplates).length > 0;
    console.log('[PICKUP] Loaded ' + Object.keys(pickupTemplates).length + ' templates');
  } catch (e) {
    console.warn('[PICKUP] Model load failed:', e);
  }
}

const pickupMeshes = new Map();

export function createPickupMesh(id, type, x, z) {
  const color = PICKUP_COLORS[type] || 0xffffff;
  const cfg = PICKUP_MODELS[type];
  const emissiveColor = cfg ? cfg.emissive : color;
  const group = new THREE.Group();

  const tmpl = pickupTemplates[type];
  if (tmpl) {
    const mat = new THREE.MeshStandardMaterial({
      color, emissive: emissiveColor, emissiveIntensity: 0.5,
      roughness: 0.3, metalness: 0.5,
    });
    const mesh = new THREE.Mesh(tmpl.geometry.clone(), mat);
    mesh.scale.setScalar(tmpl.scale);
    group.add(mesh);
  } else {
    // Fallback: colored gem shape
    const geo = (FALLBACK_GEOS[type] || FALLBACK_GEOS.health)();
    const mat = new THREE.MeshStandardMaterial({
      color, emissive: emissiveColor, emissiveIntensity: 0.5,
      roughness: 0.3, metalness: 0.5,
    });
    group.add(new THREE.Mesh(geo, mat));
  }

  group.position.set(x, 1, z);
  const light = new THREE.PointLight(color, 0.4, 4);
  light.position.set(x, 1.5, z);
  scene.add(group);
  scene.add(light);
  pickupMeshes.set(id, { mesh: group, light, type, spawnTime: Date.now() });
}

export function updatePickups(dt) {
  const now = Date.now();
  for (const [id, pk] of pickupMeshes) {
    pk.mesh.rotation.y += 2 * dt;
    pk.mesh.position.y = 1 + Math.sin(now / 300) * 0.3;
    pk.light.position.y = pk.mesh.position.y + 0.5;
    pk.light.position.x = pk.mesh.position.x;
    pk.light.position.z = pk.mesh.position.z;
    const age = (now - pk.spawnTime) / 1000;
    if (age > 6) pk.mesh.visible = Math.floor(now / 100) % 2 === 0;
    else pk.mesh.visible = true;
  }
}

export function removePickupMesh(id) {
  const pk = pickupMeshes.get(id);
  if (pk) {
    scene.remove(pk.mesh); scene.remove(pk.light);
    pk.mesh.traverse(c => {
      if (c.isMesh) { c.geometry.dispose(); c.material.dispose(); }
    });
    pickupMeshes.delete(id);
  }
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
