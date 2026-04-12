import * as THREE from 'three/webgpu';
import { scene } from './renderer.js';

let loader = null;
const templates = {};
let ready = false;
const placed = [];

const DECO_MODELS = [
  'rwall', 'rwall_broken', 'rwall_vine',
  'column', 'column_short', 'arch',
  'barrel', 'crate', 'bush', 'pot', 'skull', 'torch', 'statue',
];

const STONE_MAT = new THREE.MeshStandardMaterial({ color: 0x6a6055, roughness: 0.85, metalness: 0.1 });
const DARK_STONE = new THREE.MeshStandardMaterial({ color: 0x4a4540, roughness: 0.9, metalness: 0.05 });
const WOOD_MAT = new THREE.MeshStandardMaterial({ color: 0x5c3a1e, roughness: 0.9 });
const GREEN_MAT = new THREE.MeshStandardMaterial({ color: 0x2d5a1e, roughness: 0.8 });
const BONE_MAT = new THREE.MeshStandardMaterial({ color: 0xd4c8a8, roughness: 0.7 });

function matFor(name) {
  if (name === 'barrel' || name === 'crate') return WOOD_MAT;
  if (name === 'bush') return GREEN_MAT;
  if (name === 'skull') return BONE_MAT;
  if (name === 'statue') return DARK_STONE;
  return STONE_MAT;
}

function load(url) {
  return new Promise(r => loader.load(url, r, null, () => r(null)));
}

function prepare(obj, targetH, name) {
  if (!obj) return null;
  obj.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(obj);
  const sz = new THREE.Vector3();
  box.getSize(sz);
  if (sz.y < 0.01) return null;
  obj.scale.multiplyScalar(targetH / sz.y);
  obj.updateWorldMatrix(true, true);
  box.setFromObject(obj);
  obj.position.y = -box.min.y;
  const mat = matFor(name);
  obj.traverse(c => { if (c.isMesh) { c.material = mat; c.castShadow = true; } });
  const g = new THREE.Group();
  g.add(obj);
  return g;
}

const HEIGHTS = {
  rwall: 4, rwall_broken: 3, rwall_vine: 4,
  column: 5, column_short: 3, arch: 5,
  barrel: 1.2, crate: 1, bush: 1.5, pot: 0.8, skull: 0.5, torch: 2.5, statue: 3.5,
};

export async function loadDecorations() {
  try {
    const { OBJLoader } = await import('three/addons/loaders/OBJLoader.js');
    loader = new OBJLoader();
  } catch (e) { console.warn('OBJLoader failed:', e); return; }
  const objs = await Promise.all(
    DECO_MODELS.map(n => load('models/' + n + '.obj'))
  );
  for (let i = 0; i < objs.length; i++) {
    const name = DECO_MODELS[i];
    const t = prepare(objs[i], HEIGHTS[name] || 2, name);
    if (t) templates[name] = t;
  }
  ready = Object.keys(templates).length > 0;
}

function clone(name) {
  if (!templates[name]) return null;
  return templates[name].clone();
}

function place(name, x, z, rotY, scale) {
  const mesh = clone(name);
  if (!mesh) return;
  mesh.position.set(x, 0, z);
  mesh.rotation.y = rotY || 0;
  if (scale) mesh.scale.multiplyScalar(scale);
  // Use shared materials (no per-decoration cloning)
  scene.add(mesh);
  placed.push(mesh);
}

// Seeded random for consistent decoration placement
function seededRandom(seed) {
  let s = seed;
  return () => { s = (s * 16807 + 0) % 2147483647; return s / 2147483647; };
}

export function buildArenaDecorations(radius) {
  if (!ready) return;
  clearDecorations();

  const r = radius || 40;
  const rand = seededRandom(42);

  // Perimeter walls -- ring of ruins around arena edge
  const wallTypes = ['rwall', 'rwall_broken', 'rwall_vine'];
  const wallCount = 16;
  const wallDist = r + 2.5;
  for (let i = 0; i < wallCount; i++) {
    const angle = (i / wallCount) * Math.PI * 2;
    // Leave gaps at cardinal directions for arches
    const cardinalGap = [0, Math.PI / 2, Math.PI, Math.PI * 1.5];
    const isGap = cardinalGap.some(ca => Math.abs(angle - ca) < 0.25);
    if (isGap) continue;
    const wt = wallTypes[Math.floor(rand() * wallTypes.length)];
    const x = Math.cos(angle) * wallDist;
    const z = Math.sin(angle) * wallDist;
    const sv = 0.9 + rand() * 0.3;
    place(wt, x, z, -angle + Math.PI / 2, sv);
  }

  // Arches at 4 cardinal entry points
  if (templates['arch']) {
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2;
      const x = Math.cos(angle) * (r + 2);
      const z = Math.sin(angle) * (r + 2);
      place('arch', x, z, -angle + Math.PI / 2, 1.1);
    }
  }

  // Columns at 8 compass points inside arena
  const colDist = r * 0.7;
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const colType = i % 2 === 0 ? 'column' : 'column_short';
    const x = Math.cos(angle) * colDist;
    const z = Math.sin(angle) * colDist;
    place(colType, x, z, rand() * Math.PI * 2, 0.8 + rand() * 0.3);
  }

  // Center statue
  if (templates['statue']) {
    place('statue', 0, 0, rand() * Math.PI * 2, 1.2);
  }

  // Scattered props around mid-ring
  const props = ['barrel', 'crate', 'bush', 'pot', 'skull', 'torch'];
  const propCount = 28;
  for (let i = 0; i < propCount; i++) {
    const angle = rand() * Math.PI * 2;
    const dist = r * 0.25 + rand() * r * 0.55;
    const x = Math.cos(angle) * dist;
    const z = Math.sin(angle) * dist;
    const p = props[Math.floor(rand() * props.length)];
    const sv = 0.7 + rand() * 0.5;
    place(p, x, z, rand() * Math.PI * 2, sv);
  }
}

export function clearDecorations() {
  for (const m of placed) scene.remove(m);
  placed.length = 0;
}
