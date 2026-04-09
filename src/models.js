import * as THREE from 'https://esm.sh/three@0.162.0';
import { OBJLoader } from 'https://esm.sh/three@0.162.0/addons/loaders/OBJLoader.js';

const loader = new OBJLoader();
const templates = [];
let ready = false;

const mats = {
  canopy: new THREE.MeshStandardMaterial({ color: 0x2d5a1e, roughness: 0.8 }),
  trunk: new THREE.MeshStandardMaterial({ color: 0x5c3a1e, roughness: 0.9 }),
  dead: new THREE.MeshStandardMaterial({ color: 0x4a3528, roughness: 0.9 }),
  pine: new THREE.MeshStandardMaterial({ color: 0x1a4a2e, roughness: 0.8 }),
  pineTrunk: new THREE.MeshStandardMaterial({ color: 0x3a2a18, roughness: 0.9 }),
};

function load(url) {
  return new Promise(r => loader.load(url, r, null, () => r(null)));
}

function prepare(obj, h, type) {
  if (!obj) return null;
  obj.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(obj);
  const sz = new THREE.Vector3();
  box.getSize(sz);
  if (sz.y < 0.01) return null;

  obj.scale.multiplyScalar(h / sz.y);
  obj.updateWorldMatrix(true, true);
  box.setFromObject(obj);
  obj.position.y = -box.min.y;

  const midY = (box.min.y + box.max.y) / 2;
  obj.traverse(c => {
    if (!c.isMesh) return;
    if (type === 'dead') {
      c.material = mats.dead;
    } else {
      c.updateWorldMatrix(true, false);
      const cb = new THREE.Box3().setFromObject(c);
      const isUpper = (cb.min.y + cb.max.y) / 2 > midY;
      if (type === 'pine') {
        c.material = isUpper ? mats.pine : mats.pineTrunk;
      } else {
        c.material = isUpper ? mats.canopy : mats.trunk;
      }
    }
    c.castShadow = true;
  });

  const g = new THREE.Group();
  g.add(obj);
  return g;
}

export async function loadModels() {
  const defs = [
    { url: 'models/tree1.obj', h: 5, type: 'green' },
    { url: 'models/tree2.obj', h: 5.5, type: 'green' },
    { url: 'models/tree3.obj', h: 4.5, type: 'green' },
    { url: 'models/pine1.obj', h: 5, type: 'pine' },
    { url: 'models/pine3.obj', h: 4, type: 'pine' },
    { url: 'models/dead1.obj', h: 4, type: 'dead' },
    { url: 'models/dead2.obj', h: 3.5, type: 'dead' },
  ];
  const objs = await Promise.all(defs.map(d => load(d.url)));
  for (let i = 0; i < objs.length; i++) {
    const t = prepare(objs[i], defs[i].h, defs[i].type);
    if (t) templates.push(t);
  }
  ready = templates.length > 0;
}

export function modelsReady() { return ready; }

export function cloneTree(idx) {
  if (!ready) return null;
  return templates[idx % templates.length].clone();
}
