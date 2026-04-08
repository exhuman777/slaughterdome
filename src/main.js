import { initRenderer, render, clock, updateCamera, setCamDt } from './renderer.js';
import { createArena, setBiome, updateBiome, updateArenaRadius } from './arena.js';
import { createPlayerMesh, updatePlayerMesh, setPlayerRotation, setPlayerDashing, removePlayerMesh, markLocalPlayer, flashPlayer, updateAfterimages } from './player.js';
import { createEnemyMesh, updateEnemyMesh, flashEnemy, removeEnemyMesh, removeAllEnemies, updateDyingEnemies } from './enemy.js';
import { updatePickups as updatePickupMeshes, syncPickups } from './pickups.js';
import { updateParticles, spawnKillParticles, spawnSparks, spawnBloodDrops, spawnDustPuff, spawnSpeedTrail, spawnFloatingText, spawnGoreChunks } from './particles.js';
import * as THREE from 'https://esm.sh/three@0.162.0';
import { scene } from './renderer.js';
import { showGunShot, showSpecialAttack, showDamageNumber, showExplosion, showHitImpact, updateCombatVisuals, showSwordSlash } from './combat.js';
import { playHit, playKill, playExplosion, playWaveStart, playBossSpawn, playPickup, playDeath, playCombo, resumeAudio, playShot, playWallPlace, playDash, playWallDestroy, playWaveClear, playSword } from './audio.js';
import { getInput, getMobileInput, isMobile, setupMobileControls, isWallMode, exitWallMode, resetInput } from './input.js';
import { connect, sendInput, sendPing, getState, getMyId, getPing, drainEvents, disconnect } from './network.js';
import { showTitle, showHUD, showGameOver, updateHUD, showCombo, updatePing, getPlayerName, updateUpgradeDisplay, updateWeaponHUD, showControlsHint, hideControlsHint, updateCountdown, updateAbilities, updateInfo, updatePlayers, showYouDied, hideYouDied, updateWallMode } from './ui.js';
import { showUpgradeShop, hideUpgradeShop } from './upgrades.js';

// Screen edge damage pulse
const flashOverlay = document.getElementById('flash-overlay');
function pulseDamageOverlay() {
  if (!flashOverlay) return;
  flashOverlay.style.background = 'radial-gradient(ellipse at center, transparent 50%, rgba(255,0,0,0.4) 100%)';
  flashOverlay.style.transition = 'none';
  flashOverlay.style.opacity = '1';
  flashOverlay.offsetHeight; // Force reflow so browser registers opacity:1
  flashOverlay.style.transition = 'opacity 0.3s ease-out';
  flashOverlay.style.opacity = '0';
}

initRenderer();
createArena();
showTitle();

let gameActive = false;
let lastPing = 0;
let playerIndex = 0;
const knownPlayers = new Map();
const knownEnemies = new Set();
let lastAttackTime = 0;
let lastSpecialTime = 0;
let lastInput = { dx: 0, dz: 0, attack: false, special: false, aimX: 0, aimZ: 0, wall: false };

// Projectile rendering
const knownProjectiles = new Map();
const bulletGeo = new THREE.SphereGeometry(0.2, 8, 8);
const bulletMat = new THREE.MeshBasicMaterial({ color: 0xffee44 });
const spitGeo = new THREE.SphereGeometry(0.25, 6, 6);
const spitMat = new THREE.MeshBasicMaterial({ color: 0x33ff33 });

// Wall rendering
const knownWalls = new Map();
const wallGeo = new THREE.BoxGeometry(4, 2.5, 0.5);
const wallMat = new THREE.MeshStandardMaterial({ color: 0x888899, roughness: 0.5, metalness: 0.3 });

// Wall placement preview ghost
const ghostWallMat = new THREE.MeshBasicMaterial({ color: 0x4488aa, transparent: true, opacity: 0.5, side: THREE.DoubleSide });
const ghostWall = new THREE.Mesh(wallGeo.clone(), ghostWallMat);
ghostWall.visible = false;
ghostWall.position.y = 1.25;

// Client-side prediction
const PREDICTED_SPEED = 10;
let predictedX = 0, predictedZ = 0;
let hasPrediction = false;
let predDashTimer = 0, predDashDirX = 0, predDashDirZ = 0;
const DASH_SPEED = 30;
const DASH_DURATION = 200;
let currentArenaRadius = 40;
let predVelX = 0, predVelZ = 0;
let prevInputDx = 0, prevInputDz = 0;
let speedTrailCounter = 0;

// Persistent corpses
const corpses = [];
const corpseGeo = new THREE.PlaneGeometry(1.2, 1.2);
corpseGeo.rotateX(-Math.PI / 2);

// Environment obstacles
const obstacleMeshes = new Map();

// Track server overheated state for visual sync
let serverOverheated = false;
let wasAlive = true;
let lastComboTier = 0;
const COMBO_TIER_THRESHOLDS = [5, 10, 15, 20, 30, 50];

if (isMobile()) setupMobileControls();

document.getElementById('play-btn').addEventListener('click', startGame);
document.getElementById('restart-btn').addEventListener('click', startGame);
document.getElementById('menu-btn').addEventListener('click', quitToMenu);
document.getElementById('go-menu-btn').addEventListener('click', quitToMenu);

// ESC during gameplay = quit to menu (only when NOT in wall mode)
document.addEventListener('keydown', e => {
  if (e.code === 'Escape' && gameActive && !isWallMode()) quitToMenu();
});

function quitToMenu() {
  gameActive = false;
  hasPrediction = false;
  disconnect();
  hideUpgradeShop();
  hideControlsHint();
  hideYouDied();
  resetInput();
  updateWallMode(false);
  ghostWall.visible = false;
  removeAllEnemies();
  for (const [id, data] of knownProjectiles) { scene.remove(data.mesh); }
  knownProjectiles.clear();
  for (const [id, data] of knownWalls) { scene.remove(data.mesh); data.mat.dispose(); }
  knownWalls.clear();
  for (const [id] of knownPlayers) { removePlayerMesh(id); }
  knownPlayers.clear();
  knownEnemies.clear();
  for (const c of corpses) { scene.remove(c); c.material.dispose(); }
  corpses.length = 0;
  for (const [, mesh] of obstacleMeshes) { scene.remove(mesh); }
  obstacleMeshes.clear();
  showTitle();
}

async function startGame() {
  resumeAudio();
  hideUpgradeShop();
  const name = getPlayerName();
  try {
    await connect(name);
    resetInput();
    gameActive = true;
    showHUD();
    showControlsHint();
    playerIndex = 0;
    knownPlayers.clear();
    knownEnemies.clear();
    removeAllEnemies();
    for (const [id, data] of knownProjectiles) { scene.remove(data.mesh); }
    knownProjectiles.clear();
    for (const [id, data] of knownWalls) { scene.remove(data.mesh); data.mat.dispose(); }
    knownWalls.clear();
    for (const c of corpses) { scene.remove(c); c.material.dispose(); }
    corpses.length = 0;
    for (const [, mesh] of obstacleMeshes) { scene.remove(mesh); }
    obstacleMeshes.clear();
      hasPrediction = false;
    predDashTimer = 0;
    serverOverheated = false;
    wasAlive = true;
    lastComboTier = 0;
    hideYouDied();
    markLocalPlayer(getMyId());
    scene.add(ghostWall);
  } catch (err) {
    console.error('Connection failed:', err);
  }
}

let lastFrameTime = performance.now();

function gameLoop() {
  requestAnimationFrame(gameLoop);
  const now = performance.now();
  const dtMs = Math.min(now - lastFrameTime, 100); // Cap at 100ms to prevent physics explosions
  lastFrameTime = now;
  const dt = Math.min(clock.getDelta(), 0.1);
  setCamDt(dt);

  if (gameActive) {
    const input = isMobile() ? getMobileInput() : getInput();
    // Mobile: offset aim by player position so aim direction is relative
    if (input.mobileAimRelative && hasPrediction) {
      input.aimX += predictedX;
      input.aimZ += predictedZ;
    }
    lastInput = input;
    sendInput(input);

    const myId = getMyId();
    const state = getState();
    if (state && myId) {
      const me = state.players.find(p => p.id === myId);
      if (me && me.alive) {
        // Client-side prediction
        if (!hasPrediction) {
          predictedX = me.pos[0];
          predictedZ = me.pos[2];
          hasPrediction = true;
        }

        // Track server overheat state
        serverOverheated = !!me.overheated;

        // Dash prediction
        if (input.dash && !predDashTimer) {
          let ddx = input.dx, ddz = input.dz;
          const dlen = Math.sqrt(ddx * ddx + ddz * ddz);
          if (dlen > 0) { ddx /= dlen; ddz /= dlen; }
          else {
            const aDx = input.aimX - predictedX, aDz = input.aimZ - predictedZ;
            const aLen = Math.sqrt(aDx * aDx + aDz * aDz) || 1;
            ddx = aDx / aLen; ddz = aDz / aLen;
          }
          predDashDirX = ddx; predDashDirZ = ddz;
          predDashTimer = DASH_DURATION;
          spawnDustPuff(predictedX, predictedZ);
          playDash();
        }

        if (predDashTimer > 0) {
          predDashTimer -= dtMs;
          if (predDashTimer < 0) predDashTimer = 0;
          predictedX += predDashDirX * DASH_SPEED * dt;
          predictedZ += predDashDirZ * DASH_SPEED * dt;
        } else {
          const speed = (me.buffs && me.buffs.includes('speed')) ? PREDICTED_SPEED * 1.5 : PREDICTED_SPEED;
          if (input.dx !== 0 || input.dz !== 0) {
            predVelX = input.dx * speed;
            predVelZ = input.dz * speed;
          } else {
            predVelX *= Math.exp(-20 * dt);
            predVelZ *= Math.exp(-20 * dt);
            if (Math.abs(predVelX) < 0.1) predVelX = 0;
            if (Math.abs(predVelZ) < 0.1) predVelZ = 0;
          }
          predictedX += predVelX * dt;
          predictedZ += predVelZ * dt;
        }
        const pDist = Math.sqrt(predictedX * predictedX + predictedZ * predictedZ);
        if (pDist > currentArenaRadius - 1) {
          const s = (currentArenaRadius - 1) / pDist;
          predictedX *= s;
          predictedZ *= s;
        }
        // Client-side obstacle prediction
        if (state.obstacles) {
          for (const ob of state.obstacles) {
            const odx = predictedX - ob.pos[0], odz = predictedZ - ob.pos[2];
            const odist = Math.sqrt(odx * odx + odz * odz);
            const minD = ob.radius + 0.5;
            if (odist < minD && odist > 0.01) {
              const push = (minD - odist) / odist;
              predictedX += odx * push;
              predictedZ += odz * push;
            }
          }
        }

        // Direction change dust puff
        if ((input.dx !== 0 || input.dz !== 0) &&
            (Math.sign(input.dx) !== Math.sign(prevInputDx) && prevInputDx !== 0 ||
             Math.sign(input.dz) !== Math.sign(prevInputDz) && prevInputDz !== 0)) {
          spawnDustPuff(predictedX, predictedZ);
        }
        prevInputDx = input.dx;
        prevInputDz = input.dz;

        // Speed trail when buffed or dashing
        const hasSpeedBuff = me.buffs && me.buffs.includes('speed');
        if (predDashTimer > 0) {
          spawnSpeedTrail(predictedX, predictedZ, 0x44ddff);
        } else if (hasSpeedBuff && (input.dx !== 0 || input.dz !== 0)) {
          speedTrailCounter++;
          if (speedTrailCounter % 3 === 0) spawnSpeedTrail(predictedX, predictedZ, 0xffff44);
        }

        // Gun shot visual - sync with server overheat state
        const px = predictedX;
        const pz = predictedZ;
        if (input.attack) {
          const weaponType = me.weapon || 'pistol';
          const wepCooldowns = { pistol: 150, shotgun: 400, flamethrower: 80 };
          let cooldown = wepCooldowns[weaponType] || 150;
          if (serverOverheated) cooldown *= 3; // Match server OVERHEAT.slowMult
          if (now - lastAttackTime > cooldown) {
            lastAttackTime = now;
            const angle = Math.atan2(input.aimZ - pz, input.aimX - px);
            showGunShot(px, pz, angle, weaponType);
            playShot(weaponType);
          }
        }
        if (input.special && now - lastSpecialTime > 2500) {
          lastSpecialTime = now;
          showSpecialAttack(px, pz);
          playExplosion();
        }

        // Wall placement preview ghost -- only in wall mode
        const wallCharges = me.wallCharges !== undefined ? me.wallCharges : 5;
        const inWallMode = isWallMode();
        updateWallMode(inWallMode);
        if (inWallMode && wallCharges > 0) {
          const aimAngle = Math.atan2(input.aimZ - pz, input.aimX - px);
          const aimDist = Math.sqrt((input.aimX - px) ** 2 + (input.aimZ - pz) ** 2);
          const placeDist = Math.min(aimDist, 8);
          const wx = px + Math.cos(aimAngle) * placeDist;
          const wz = pz + Math.sin(aimAngle) * placeDist;
          ghostWall.position.set(wx, 1.25, wz);
          ghostWall.rotation.y = aimAngle + Math.PI / 2;
          ghostWall.visible = true;
        } else {
          ghostWall.visible = false;
        }
      } else {
        ghostWall.visible = false;
      }
    }

    if (Date.now() - lastPing > 2000) {
      sendPing();
      lastPing = Date.now();
      updatePing(getPing());
    }

    const events = drainEvents();
    for (const ev of events) handleEvent(ev);

    if (state) processState(state, dt);
  }

  updateBiome(dt);
  updatePickupMeshes(dt);
  updateParticles(dt);
  updateCombatVisuals(dt);
  updateDyingEnemies(dt);
  updateAfterimages(dt);

  const myId = getMyId();
  const state = getState();
  if (state && myId) {
    const me = state.players.find(p => p.id === myId);
    if (me) updateCamera(hasPrediction ? predictedX : me.pos[0], hasPrediction ? predictedZ : me.pos[2], lastInput.aimX, lastInput.aimZ);
  } else {
    updateCamera(0, 0);
  }

  render();
}

function processState(state, dt) {
  const myId = getMyId();

  // Update arena radius
  if (state.arenaRadius !== undefined) {
    currentArenaRadius = state.arenaRadius;
    updateArenaRadius(currentArenaRadius);
  }

  const serverPlayerIds = new Set(state.players.map(p => p.id));
  for (const [id] of knownPlayers) {
    if (!serverPlayerIds.has(id)) { removePlayerMesh(id); knownPlayers.delete(id); }
  }
  for (const p of state.players) {
    if (!knownPlayers.has(p.id)) {
      createPlayerMesh(p.id, playerIndex++);
      knownPlayers.set(p.id, { prevPos: [0, 0] });
      if (p.id === myId) markLocalPlayer(p.id);
    }
    const data = knownPlayers.get(p.id);
    const dx = p.pos[0] - data.prevPos[0];
    const dz = p.pos[2] - data.prevPos[1];
    const moving = (dx * dx + dz * dz) > 0.001;
    data.prevPos = [p.pos[0], p.pos[2]];

    if (p.id === myId && hasPrediction) {
      // Correct prediction toward server position
      const correction = 1 - Math.exp(-5 * dt);
      predictedX += (p.pos[0] - predictedX) * correction;
      predictedZ += (p.pos[2] - predictedZ) * correction;
      if (!p.dashing && predDashTimer > 0) predDashTimer = 0;
      updatePlayerMesh(p.id, predictedX, predictedZ, p.alive, moving || (lastInput.dx !== 0 || lastInput.dz !== 0), dt);
      if (p.alive) {
        setPlayerRotation(p.id, Math.atan2(lastInput.aimZ - predictedZ, lastInput.aimX - predictedX));
      }
    } else {
      updatePlayerMesh(p.id, p.pos[0], p.pos[2], p.alive, moving, dt);
      if (p.id === myId && p.alive) {
        setPlayerRotation(p.id, Math.atan2(lastInput.aimZ - p.pos[2], lastInput.aimX - p.pos[0]));
      }
    }
    setPlayerDashing(p.id, p.id === myId ? (predDashTimer > 0 || p.dashing) : p.dashing);
  }

  const serverEnemyIds = new Set(state.enemies.map(e => e.id));
  for (const id of knownEnemies) {
    if (!serverEnemyIds.has(id)) { removeEnemyMesh(id); knownEnemies.delete(id); }
  }
  for (const e of state.enemies) {
    if (!knownEnemies.has(e.id)) {
      createEnemyMesh(e.id, e.type);
      knownEnemies.add(e.id);
    }
    updateEnemyMesh(e.id, e.pos[0], e.pos[2], e.hp, e.maxHp || e.hp, dt);
  }

  // Play pickup sound when a nearby pickup disappears (collected)
  const me2 = state.players.find(p => p.id === myId);
  syncPickups(state.pickups, (removedX, removedZ) => {
    if (me2) {
      const dx = removedX - (hasPrediction ? predictedX : me2.pos[0]);
      const dz = removedZ - (hasPrediction ? predictedZ : me2.pos[2]);
      if (dx * dx + dz * dz < 100) playPickup();
    }
  });

  // Sync projectiles
  const serverProjIds = new Set((state.projectiles || []).map(p => p.id));
  for (const [id, data] of knownProjectiles) {
    if (!serverProjIds.has(id)) { scene.remove(data.mesh); knownProjectiles.delete(id); }
  }
  for (const pr of (state.projectiles || [])) {
    if (!knownProjectiles.has(pr.id)) {
      const isBullet = pr.type === 'bullet';
      const mesh = new THREE.Mesh(isBullet ? bulletGeo : spitGeo, isBullet ? bulletMat : spitMat);
      mesh.position.set(pr.pos[0], 1.2, pr.pos[2]);
      scene.add(mesh);
      knownProjectiles.set(pr.id, { mesh });
    } else {
      const data = knownProjectiles.get(pr.id);
      data.mesh.position.set(pr.pos[0], 1.2, pr.pos[2]);
    }
  }

  // Sync walls
  const serverWallIds = new Set((state.walls || []).map(w => w.id));
  for (const [id, data] of knownWalls) {
    if (!serverWallIds.has(id)) {
      scene.remove(data.mesh);
      data.mat.dispose();
      spawnSparks(data.mesh.position.x, data.mesh.position.z, 0x888888, 10);
      playWallDestroy();
      knownWalls.delete(id);
    }
  }
  for (const w of (state.walls || [])) {
    if (!knownWalls.has(w.id)) {
      const mat = wallMat.clone();
      const mesh = new THREE.Mesh(wallGeo, mat);
      mesh.position.set(w.pos[0], 1.25, w.pos[2]);
      mesh.rotation.y = w.angle || 0;
      mesh.castShadow = true;
      scene.add(mesh);
      knownWalls.set(w.id, { mesh, mat, maxHp: w.maxHp || 80 });
      playWallPlace();
    }
    const wData = knownWalls.get(w.id);
    if (wData) {
      const hpRatio = Math.max(0, w.hp / wData.maxHp);
      wData.mat.opacity = 0.4 + hpRatio * 0.6;
      wData.mat.transparent = true;
      // Shift color from grey to red as wall takes damage
      const r = 0.53 + (1 - hpRatio) * 0.47;
      const g = 0.53 * hpRatio;
      const b = 0.6 * hpRatio;
      wData.mat.color.setRGB(r, g, b);
    }
  }

  // Sync environment obstacles (trees + water)
  if (state.obstacles) {
    for (const ob of state.obstacles) {
      const key = ob.type + '_' + ob.pos[0] + '_' + ob.pos[2];
      if (obstacleMeshes.has(key)) continue;
      if (ob.type === 'tree') {
        const group = new THREE.Group();
        const trunkGeo = new THREE.CylinderGeometry(0.3, 0.4, 3, 6);
        const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5c3a1e, roughness: 0.9 });
        const trunk = new THREE.Mesh(trunkGeo, trunkMat);
        trunk.position.y = 1.5;
        trunk.castShadow = true;
        group.add(trunk);
        const canopyGeo = new THREE.SphereGeometry(1.4, 8, 6);
        const canopyMat = new THREE.MeshStandardMaterial({ color: 0x2d5a1e, roughness: 0.8 });
        const canopy = new THREE.Mesh(canopyGeo, canopyMat);
        canopy.position.y = 3.5;
        canopy.castShadow = true;
        group.add(canopy);
        const canopy2Geo = new THREE.SphereGeometry(1.0, 6, 5);
        const canopy2 = new THREE.Mesh(canopy2Geo, canopyMat);
        canopy2.position.set(0.5, 4.2, 0.3);
        group.add(canopy2);
        group.position.set(ob.pos[0], 0, ob.pos[2]);
        group.rotation.y = Math.random() * Math.PI * 2;
        scene.add(group);
        obstacleMeshes.set(key, group);
      } else if (ob.type === 'water') {
        const group = new THREE.Group();
        const waterGeo = new THREE.CircleGeometry(ob.radius, 24);
        waterGeo.rotateX(-Math.PI / 2);
        const waterMat = new THREE.MeshStandardMaterial({ color: 0x1a4a7a, transparent: true, opacity: 0.7, roughness: 0.1, metalness: 0.3, side: THREE.DoubleSide });
        const water = new THREE.Mesh(waterGeo, waterMat);
        water.position.y = 0.03;
        group.add(water);
        const edgeGeo = new THREE.RingGeometry(ob.radius - 0.3, ob.radius + 0.2, 24);
        edgeGeo.rotateX(-Math.PI / 2);
        const edgeMat = new THREE.MeshBasicMaterial({ color: 0x3a6a4a, transparent: true, opacity: 0.5, side: THREE.DoubleSide });
        const edge = new THREE.Mesh(edgeGeo, edgeMat);
        edge.position.y = 0.04;
        group.add(edge);
        group.position.set(ob.pos[0], 0, ob.pos[2]);
        scene.add(group);
        obstacleMeshes.set(key, group);
      }
    }
  }

  const me = state.players.find(p => p.id === myId);
  if (me) {
    updateHUD(state.wave, state.score, me.hp, me.maxHp);
    updateUpgradeDisplay(me.upgrades);
    const dashCharges = me.dashCharges !== undefined ? me.dashCharges : 3;
    const dashFill = document.getElementById('dash-fill');
    if (dashFill) dashFill.style.width = (dashCharges / 3 * 100) + '%';
    updateWeaponHUD(me.weapon, me.overheated, me.heatPct || 0);
    updateAbilities(me.wallCharges !== undefined ? me.wallCharges : 5, me.specialCd || 0, dashCharges, me.swordCd || 0);
    updateInfo(me.kills || 0);
    // Show YOU DIED when player dies but game continues
    if (!me.alive && wasAlive) {
      showYouDied();
      wasAlive = false;
    } else if (me.alive && !wasAlive) {
      hideYouDied();
      wasAlive = true;
    }
  }
  updateCountdown(state.phase, state.waveTimer);
  updatePlayers(state.playerCount || 1);

  setBiome(state.wave);
  showCombo(state.combo);

  // Combo audio escalation -- play sound when crossing tier thresholds
  let currentTier = 0;
  for (const t of COMBO_TIER_THRESHOLDS) { if (state.combo >= t) currentTier = t; }
  if (currentTier > lastComboTier && currentTier > 0) playCombo();
  lastComboTier = currentTier;
}

function handleEvent(ev) {
  switch (ev.t) {
    case 'sword': {
      showSwordSlash(ev.pos[0], ev.pos[2], ev.angle, ev.combo);
      playSword(ev.combo);
      break;
    }
    case 'kill': {
      spawnGoreChunks(ev.pos[0], ev.pos[2]);
      spawnKillParticles(ev.pos[0], ev.pos[2], 0xff4444);
      playKill();
      // Persistent corpse decal
      const corpseMat = new THREE.MeshBasicMaterial({ color: 0x440000, transparent: true, opacity: 0.4, side: THREE.DoubleSide });
      const corpseMesh = new THREE.Mesh(corpseGeo, corpseMat);
      corpseMesh.position.set(ev.pos[0], 0.02, ev.pos[2]);
      corpseMesh.rotation.y = Math.random() * Math.PI * 2;
      scene.add(corpseMesh);
      corpses.push(corpseMesh);
      if (corpses.length > 50) { const old = corpses.shift(); scene.remove(old); old.material.dispose(); }
      // Score popup at kill location
      const combo = ev.combo || 0;
      const wave = getState()?.wave || 1;
      let multiplier = 1;
      for (const t of COMBO_TIER_THRESHOLDS) { if (combo >= t) multiplier = 1 + (COMBO_TIER_THRESHOLDS.indexOf(t) + 1) * 0.1; }
      const pts = Math.floor((10 + wave * 2) * multiplier);
      spawnFloatingText(ev.pos[0] + 1.5, ev.pos[2], '+' + pts, '#e6993a', 2);
      break;
    }
    case 'hit': {
      const isMe = ev.target === getMyId();
      if (isMe) {
        const me = getState()?.players?.find(p => p.id === getMyId());
        if (me) spawnBloodDrops(me.pos[0], me.pos[2]);
        flashPlayer(getMyId());
        pulseDamageOverlay();
      }
      if (ev.pos) {
        showDamageNumber(ev.pos[0], ev.pos[2], ev.dmg, ev.crit);
        if (!isMe) showHitImpact(ev.pos[0], ev.pos[2]);
      }
      playHit(ev.dmg);
      flashEnemy(ev.target);
      break;
    }
    case 'upgrades': {
      // Wave cleared -- celebrate before showing shop
      const meNow = getState()?.players?.find(p => p.id === getMyId());
      const px2 = meNow ? (hasPrediction ? predictedX : meNow.pos[0]) : 0;
      const pz2 = meNow ? (hasPrediction ? predictedZ : meNow.pos[2]) : 0;
      spawnKillParticles(px2, pz2, 0xe6993a);
      spawnSparks(px2, pz2, 0xffcc44, 6);
      playWaveClear();
      const waveNum = getState()?.wave || 0;
      spawnFloatingText(px2, pz2, 'WAVE ' + waveNum + ' CLEARED', '#e6993a', 3);
      showUpgradeShop(ev.options);
      break;
    }
    case 'wave': {
      hideUpgradeShop();
      playWaveStart();
      break;
    }
    case 'boss': {
      playBossSpawn();
      break;
    }
    case 'death':
      if (ev.pid === getMyId()) {
        playDeath();
      }
      break;
    case 'explosion':
      showExplosion(ev.pos[0], ev.pos[2], ev.radius);
      playExplosion();
      break;
    case 'gameover':
      gameActive = false;
      hasPrediction = false;
      hideUpgradeShop();
      hideControlsHint();
      hideYouDied();
      resetInput();
      updateWallMode(false);
      ghostWall.visible = false;
      for (const c of corpses) { scene.remove(c); c.material.dispose(); }
      corpses.length = 0;
      showGameOver(ev.wave, ev.score, ev.players || ev.kills);
      playDeath();
      break;
  }
}

gameLoop();
