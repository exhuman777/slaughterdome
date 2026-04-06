import { initRenderer, render, clock, updateCamera, setCamDt, triggerShake, startHitstop, tickHitstop, triggerCamKick } from './renderer.js';
import { createArena, setBiome, updateBiome, updateArenaRadius } from './arena.js';
import { createPlayerMesh, updatePlayerMesh, setPlayerRotation, setPlayerDashing, removePlayerMesh, markLocalPlayer } from './player.js';
import { createEnemyMesh, updateEnemyMesh, flashEnemy, removeEnemyMesh, removeAllEnemies } from './enemy.js';
import { updatePickups as updatePickupMeshes, syncPickups } from './pickups.js';
import { updateParticles, spawnKillParticles, spawnSparks, spawnBloodDrops, spawnNeonPop, spawnDustPuff, spawnSpeedTrail } from './particles.js';
import * as THREE from 'https://esm.sh/three@0.162.0';
import { scene } from './renderer.js';
import { showGunShot, showSpecialAttack, showDamageNumber, showExplosion, showHitImpact, updateCombatVisuals } from './combat.js';
import { playHit, playKill, playExplosion, playWaveStart, playBossSpawn, playPickup, playDeath, playCombo, resumeAudio, playShot } from './audio.js';
import { getInput, getMobileInput, isMobile, setupMobileControls } from './input.js';
import { connect, sendInput, sendPing, getState, getMyId, getPing, drainEvents } from './network.js';
import { showTitle, showHUD, showGameOver, updateHUD, showCombo, updatePing, getPlayerName, updateUpgradeDisplay } from './ui.js';
import { showUpgradeShop, hideUpgradeShop } from './upgrades.js';

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

// Client-side prediction
const PREDICTED_SPEED = 10;
let predictedX = 0, predictedZ = 0;
let hasPrediction = false;
let predDashTimer = 0, predDashDirX = 0, predDashDirZ = 0;
const DASH_SPEED = 30;
const DASH_DURATION = 250;
let currentArenaRadius = 40;
let predVelX = 0, predVelZ = 0;
let prevInputDx = 0, prevInputDz = 0;
let speedTrailCounter = 0;

if (isMobile()) setupMobileControls();

document.getElementById('play-btn').addEventListener('click', startGame);
document.getElementById('restart-btn').addEventListener('click', startGame);

async function startGame() {
  resumeAudio();
  hideUpgradeShop();
  const name = getPlayerName();
  try {
    await connect(name);
    gameActive = true;
    showHUD();
    playerIndex = 0;
    knownPlayers.clear();
    knownEnemies.clear();
    removeAllEnemies();
    hasPrediction = false;
    predDashTimer = 0;
    markLocalPlayer(getMyId());
  } catch (err) {
    console.error('Connection failed:', err);
  }
}

let lastFrameTime = performance.now();

function gameLoop() {
  requestAnimationFrame(gameLoop);
  const now = performance.now();
  const dtMs = now - lastFrameTime;
  lastFrameTime = now;
  const dt = clock.getDelta();
  setCamDt(dt);

  if (tickHitstop(dtMs)) {
    updateCombatVisuals(dt * 0.1);
    updateParticles(dt * 0.1);
    const myId = getMyId();
    const state = getState();
    if (state && myId) {
      const me = state.players.find(p => p.id === myId);
      if (me) updateCamera(hasPrediction ? predictedX : me.pos[0], hasPrediction ? predictedZ : me.pos[2], lastInput.aimX, lastInput.aimZ);
    }
    render();
    return;
  }

  if (gameActive) {
    const input = isMobile() ? getMobileInput() : getInput();
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
        }

        if (predDashTimer > 0) {
          predDashTimer -= dtMs;
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

        // Gun shot visual
        const px = predictedX;
        const pz = predictedZ;
        if (input.attack) {
          const weaponType = me.weapon || 'pistol';
          const wepCooldowns = { pistol: 150, shotgun: 400, railgun: 800, flamethrower: 80 };
          const cooldown = wepCooldowns[weaponType] || 150;
          if (now - lastAttackTime > cooldown) {
            lastAttackTime = now;
            const angle = Math.atan2(input.aimZ - pz, input.aimX - px);
            showGunShot(px, pz, angle, weaponType);
            playShot(weaponType);
            triggerCamKick(angle);
          }
        }
        if (input.special && now - lastSpecialTime > 3000) {
          lastSpecialTime = now;
          showSpecialAttack(px, pz);
          spawnNeonPop(px, pz, 0xffaa00, 5);
        }
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
    setPlayerDashing(p.id, p.id === myId ? predDashTimer > 0 : p.dashing);
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

  syncPickups(state.pickups);

  // Sync projectiles
  const serverProjIds = new Set((state.projectiles || []).map(p => p.id));
  for (const [id, data] of knownProjectiles) {
    if (!serverProjIds.has(id)) { scene.remove(data.mesh); if (data.glow) scene.remove(data.glow); knownProjectiles.delete(id); }
  }
  for (const pr of (state.projectiles || [])) {
    if (!knownProjectiles.has(pr.id)) {
      const isBullet = pr.type === 'bullet';
      const mesh = new THREE.Mesh(isBullet ? bulletGeo : spitGeo, (isBullet ? bulletMat : spitMat).clone());
      mesh.position.set(pr.pos[0], 1.2, pr.pos[2]);
      scene.add(mesh);
      // Add glow light to bullets
      const glow = new THREE.PointLight(isBullet ? 0xffdd44 : 0x33ff33, 0.5, 3);
      glow.position.copy(mesh.position);
      scene.add(glow);
      knownProjectiles.set(pr.id, { mesh, glow });
    } else {
      const data = knownProjectiles.get(pr.id);
      data.mesh.position.set(pr.pos[0], 1.2, pr.pos[2]);
      if (data.glow) data.glow.position.copy(data.mesh.position);
    }
  }

  // Sync walls
  const serverWallIds = new Set((state.walls || []).map(w => w.id));
  for (const [id, data] of knownWalls) {
    if (!serverWallIds.has(id)) {
      scene.remove(data.mesh);
      spawnSparks(data.mesh.position.x, data.mesh.position.z, 0x888888, 10);
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
    }
    const wData = knownWalls.get(w.id);
    if (wData) {
      const hpRatio = w.hp / wData.maxHp;
      wData.mat.opacity = 0.4 + hpRatio * 0.6;
      wData.mat.transparent = hpRatio < 1;
    }
  }

  const me = state.players.find(p => p.id === myId);
  if (me) updateHUD(state.wave, state.score, me.hp, me.maxHp);
  if (me) updateUpgradeDisplay(me.upgrades);
  if (me) {
    const dashPct = me.dashCooldown > 0 ? Math.max(0, 1 - me.dashCooldown / 2000) * 100 : 100;
    const dashFill = document.getElementById('dash-fill');
    if (dashFill) dashFill.style.width = dashPct + '%';
  }

  setBiome(state.wave);
  showCombo(state.combo);
}

function handleEvent(ev) {
  switch (ev.t) {
    case 'kill':
      spawnKillParticles(ev.pos[0], ev.pos[2], 0xff4444);
      spawnSparks(ev.pos[0], ev.pos[2], 0xffaa00, 15);
      playKill();
      break;
    case 'hit': {
      const isMe = ev.target === getMyId();
      if (isMe) {
        const me = getState()?.players?.find(p => p.id === getMyId());
        if (me) spawnBloodDrops(me.pos[0], me.pos[2]);
        triggerShake(1);
      }
      if (ev.crit) {
        triggerShake(3);
        startHitstop(40);
      }
      if (ev.pos) {
        showDamageNumber(ev.pos[0], ev.pos[2], ev.dmg, ev.crit);
        if (!isMe) showHitImpact(ev.pos[0], ev.pos[2]);
      }
      playHit(ev.dmg);
      flashEnemy(ev.target);
      break;
    }
    case 'upgrades':
      showUpgradeShop(ev.options);
      break;
    case 'wave': {
      hideUpgradeShop();
      playWaveStart();
      const wMe = getState()?.players?.find(p => p.id === getMyId());
      if (wMe) spawnNeonPop(wMe.pos[0], wMe.pos[2], 0x4488ff, 6);
      break;
    }
    case 'boss': {
      playBossSpawn();
      const bMe = getState()?.players?.find(p => p.id === getMyId());
      if (bMe) spawnNeonPop(bMe.pos[0], bMe.pos[2], 0xffcc00, 8);
      triggerShake(3);
      break;
    }
    case 'death':
      if (ev.pid === getMyId()) {
        playDeath();
        const dMe = getState()?.players?.find(p => p.id === getMyId());
        if (dMe) { spawnNeonPop(dMe.pos[0], dMe.pos[2], 0xff0000, 6); spawnBloodDrops(dMe.pos[0], dMe.pos[2]); }
        triggerShake(4);
      }
      break;
    case 'explosion':
      showExplosion(ev.pos[0], ev.pos[2], ev.radius);
      playExplosion();
      spawnNeonPop(ev.pos[0], ev.pos[2], 0xff6600, ev.radius * 2);
      triggerShake(4);
      startHitstop(60);
      break;
    case 'gameover':
      gameActive = false;
      hasPrediction = false;
      hideUpgradeShop();
      showGameOver(ev.wave, ev.score, ev.kills);
      playDeath();
      break;
  }
}

gameLoop();
