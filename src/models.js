import * as THREE from 'three/webgpu';

let loader = null;
const templates = [];
let ready = false;

const mats = {
  canopy: new THREE.MeshStandardMaterial({ color: 0x2d6a1e, emissive: 0x0a1a05, emissiveIntensity: 0.08, roughness: 0.75 }),
  trunk: new THREE.MeshStandardMaterial({ color: 0x6a4a1a, emissive: 0x110800, emissiveIntensity: 0.05, roughness: 0.85 }),
  dead: new THREE.MeshStandardMaterial({ color: 0x6a5a44, emissive: 0x0a0804, emissiveIntensity: 0.05, roughness: 0.85 }),
  pine: new THREE.MeshStandardMaterial({ color: 0x1e5a2e, emissive: 0x081408, emissiveIntensity: 0.08, roughness: 0.75 }),
  pineTrunk: new THREE.MeshStandardMaterial({ color: 0x5a4020, emissive: 0x0a0800, emissiveIntensity: 0.05, roughness: 0.85 }),
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
  try {
    const { OBJLoader } = await import('three/addons/loaders/OBJLoader.js');
    loader = new OBJLoader();
  } catch (e) { console.warn('OBJLoader failed:', e); return; }
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
  const clone = templates[idx % templates.length].clone();
  // Randomize canopy and trunk shading per tree
  clone.traverse(c => {
    if (!c.isMesh) return;
    c.material = c.material.clone();
    const col = c.material.color;
    // Shift hue/brightness randomly
    const hsl = {};
    col.getHSL(hsl);
    hsl.h += (Math.random() - 0.5) * 0.06;  // slight hue shift
    hsl.s *= 0.7 + Math.random() * 0.6;      // saturation variation
    hsl.l *= 0.75 + Math.random() * 0.5;     // brightness variation
    col.setHSL(hsl.h, Math.min(1, hsl.s), Math.min(1, hsl.l));
  });
  return clone;
}
