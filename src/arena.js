import * as THREE from 'three/webgpu';
import { scene } from './renderer.js';

const ARENA_RADIUS = 40;
let floorMesh, barrierMesh, shrinkRingMesh, shrinkRingMat, gridLines;
let currentRadius = 40;

const BIOMES = {
  stone:   { floor: 0x3a3632, wall: 0x777777 },
  inferno: { floor: 0x4a2a1a, wall: 0xaa4433 },
  frozen:  { floor: 0x2a4455, wall: 0x7799aa },
  toxic:   { floor: 0x1a3a1a, wall: 0x448844 },
  void:    { floor: 0x2a2a44, wall: 0x665588 },
};

let currentBiome = 'stone';
let targetBiome = 'stone';
let biomeTransition = 0;

// Procedural ground texture -- cracked concrete / arena floor
function generateFloorTexture(size) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  // Base: dark concrete
  ctx.fillStyle = '#3a3632';
  ctx.fillRect(0, 0, size, size);

  // Noise grain layer
  const imgData = ctx.getImageData(0, 0, size, size);
  const d = imgData.data;
  for (let i = 0; i < d.length; i += 4) {
    const noise = (Math.random() - 0.5) * 30;
    d[i] += noise;
    d[i + 1] += noise;
    d[i + 2] += noise;
  }
  ctx.putImageData(imgData, 0, 0);

  // Darker patches (dirt / stains)
  for (let i = 0; i < 40; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 20 + Math.random() * 60;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    const alpha = 0.05 + Math.random() * 0.1;
    grad.addColorStop(0, 'rgba(20,15,10,' + alpha + ')');
    grad.addColorStop(1, 'rgba(20,15,10,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // Lighter dust patches
  for (let i = 0; i < 20; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 15 + Math.random() * 40;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(90,80,70,0.08)');
    grad.addColorStop(1, 'rgba(90,80,70,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // Cracks
  ctx.strokeStyle = 'rgba(15,12,10,0.4)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 30; i++) {
    ctx.beginPath();
    let cx = Math.random() * size;
    let cy = Math.random() * size;
    ctx.moveTo(cx, cy);
    const segs = 3 + Math.floor(Math.random() * 8);
    for (let j = 0; j < segs; j++) {
      cx += (Math.random() - 0.5) * 50;
      cy += (Math.random() - 0.5) * 50;
      ctx.lineTo(cx, cy);
    }
    ctx.stroke();
  }

  // Fine cracks
  ctx.strokeStyle = 'rgba(15,12,10,0.2)';
  ctx.lineWidth = 0.5;
  for (let i = 0; i < 50; i++) {
    ctx.beginPath();
    let cx = Math.random() * size;
    let cy = Math.random() * size;
    ctx.moveTo(cx, cy);
    const segs = 2 + Math.floor(Math.random() * 4);
    for (let j = 0; j < segs; j++) {
      cx += (Math.random() - 0.5) * 25;
      cy += (Math.random() - 0.5) * 25;
      ctx.lineTo(cx, cy);
    }
    ctx.stroke();
  }

  // Tile/slab lines (subtle, like old arena tiles)
  ctx.strokeStyle = 'rgba(0,0,0,0.08)';
  ctx.lineWidth = 1;
  const tileSize = size / 8;
  for (let x = 0; x < size; x += tileSize) {
    // Slight offset for each row to look worn
    const off = (Math.random() - 0.5) * 3;
    ctx.beginPath();
    ctx.moveTo(x + off, 0);
    ctx.lineTo(x + off, size);
    ctx.stroke();
  }
  for (let y = 0; y < size; y += tileSize) {
    const off = (Math.random() - 0.5) * 3;
    ctx.beginPath();
    ctx.moveTo(0, y + off);
    ctx.lineTo(size, y + off);
    ctx.stroke();
  }

  // Blood stains
  for (let i = 0; i < 8; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 8 + Math.random() * 25;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(80,10,10,0.12)');
    grad.addColorStop(0.6, 'rgba(60,5,5,0.06)');
    grad.addColorStop(1, 'rgba(40,0,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * (0.6 + Math.random() * 0.4), Math.random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  return tex;
}

export function createArena() {
  const floorTex = generateFloorTexture(256);
  const floorGeo = new THREE.CircleGeometry(ARENA_RADIUS, 64);
  floorGeo.rotateX(-Math.PI / 2);
  const floorMat = new THREE.MeshStandardMaterial({
    map: floorTex,
    roughness: 0.9,
    metalness: 0.05,
  });
  floorMesh = new THREE.Mesh(floorGeo, floorMat);
  floorMesh.receiveShadow = true;
  scene.add(floorMesh);

  // Subtle grid lines (dimmer now that floor has texture)
  const gridGeo = new THREE.BufferGeometry();
  const gridPoints = [];
  for (let i = -ARENA_RADIUS; i <= ARENA_RADIUS; i += 4) {
    const halfLen = Math.sqrt(Math.max(0, ARENA_RADIUS * ARENA_RADIUS - i * i));
    gridPoints.push(i, 0.01, -halfLen, i, 0.01, halfLen);
    gridPoints.push(-halfLen, 0.01, i, halfLen, 0.01, i);
  }
  gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(gridPoints, 3));
  const gridMat = new THREE.LineBasicMaterial({ color: 0x555555, transparent: true, opacity: 0.12 });
  gridLines = new THREE.LineSegments(gridGeo, gridMat);
  scene.add(gridLines);

  const barrierGeo = new THREE.TorusGeometry(ARENA_RADIUS, 0.5, 8, 64);
  barrierGeo.rotateX(Math.PI / 2);
  const barrierMat = new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.5 });
  barrierMesh = new THREE.Mesh(barrierGeo, barrierMat);
  barrierMesh.position.y = 0.5;
  scene.add(barrierMesh);

  // Danger zone ring
  const shrinkGeo = new THREE.RingGeometry(ARENA_RADIUS - 0.8, ARENA_RADIUS + 0.8, 64);
  shrinkGeo.rotateX(-Math.PI / 2);
  shrinkRingMat = new THREE.MeshBasicMaterial({ color: 0xff2222, transparent: true, opacity: 0.25, side: THREE.DoubleSide });
  shrinkRingMesh = new THREE.Mesh(shrinkGeo, shrinkRingMat);
  shrinkRingMesh.position.y = 0.08;
  scene.add(shrinkRingMesh);
}

export function setBiome(wave) {
  const biomes = ['stone', 'inferno', 'frozen', 'toxic', 'void'];
  const idx = Math.floor((wave - 1) / 5);
  targetBiome = biomes[Math.min(idx, biomes.length - 1)];
  if (targetBiome !== currentBiome) biomeTransition = 0;
}

export function updateArenaRadius(radius) {
  if (Math.abs(radius - currentRadius) < 0.1) return;
  currentRadius = radius;
  const scale = radius / ARENA_RADIUS;
  barrierMesh.scale.set(scale, 1, scale);
  shrinkRingMesh.scale.set(scale, 1, scale);
  shrinkRingMat.opacity = 0.2 + Math.sin(Date.now() / 400) * 0.15;
}

// Pre-allocated Color objects for biome transitions (avoid per-frame allocation)
const _tempColor = new THREE.Color();
const _fromColor = new THREE.Color();
const _toColor = new THREE.Color();

export function updateBiome(dt) {
  if (targetBiome === currentBiome) return;
  biomeTransition += dt / 2;
  if (biomeTransition >= 1) { biomeTransition = 1; currentBiome = targetBiome; }
  const from = BIOMES[currentBiome];
  const to = BIOMES[targetBiome];
  _fromColor.set(from.floor);
  _toColor.set(to.floor);
  _tempColor.copy(_fromColor).lerp(_toColor, biomeTransition);
  floorMesh.material.color.copy(_tempColor);
  _fromColor.set(from.wall);
  _toColor.set(to.wall);
  _tempColor.copy(_fromColor).lerp(_toColor, biomeTransition);
  barrierMesh.material.color.copy(_tempColor);
}
