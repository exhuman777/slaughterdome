import { initRenderer, render, clock, updateCamera, triggerShake } from './renderer.js';
import { createArena, setBiome, updateBiome } from './arena.js';
import { createPlayerMesh, updatePlayerMesh, setPlayerRotation, removePlayerMesh } from './player.js';
import { createEnemyMesh, updateEnemyMesh, flashEnemy, removeEnemyMesh, removeAllEnemies } from './enemy.js';
import { updatePickups as updatePickupMeshes, syncPickups } from './pickups.js';
import { updateParticles, spawnKillParticles } from './particles.js';
import { showMeleeSwing, showSpecialAttack, showDamageNumber, showExplosion, updateCombatVisuals } from './combat.js';
import { playHit, playKill, playExplosion, playWaveStart, playBossSpawn, playPickup, playDeath, playCombo, resumeAudio } from './audio.js';
import { getInput, getMobileInput, isMobile, setupMobileControls } from './input.js';
import { connect, sendInput, sendPing, getState, getMyId, getPing, drainEvents } from './network.js';
import { showTitle, showHUD, showGameOver, updateHUD, showCombo, updatePing, getPlayerName } from './ui.js';

initRenderer();
createArena();
showTitle();

let gameActive = false;
let lastPing = 0;
let playerIndex = 0;
const knownPlayers = new Map();
const knownEnemies = new Set();

if (isMobile()) setupMobileControls();

document.getElementById('play-btn').addEventListener('click', startGame);
document.getElementById('restart-btn').addEventListener('click', startGame);

async function startGame() {
  resumeAudio();
  const name = getPlayerName();
  try {
    await connect(name);
    gameActive = true;
    showHUD();
    playerIndex = 0;
    knownPlayers.clear();
    knownEnemies.clear();
    removeAllEnemies();
  } catch (err) {
    console.error('Connection failed:', err);
  }
}

function gameLoop() {
  requestAnimationFrame(gameLoop);
  const dt = clock.getDelta();

  if (gameActive) {
    const input = isMobile() ? getMobileInput() : getInput();
    sendInput(input);

    if (Date.now() - lastPing > 2000) {
      sendPing();
      lastPing = Date.now();
      updatePing(getPing());
    }

    const events = drainEvents();
    for (const ev of events) handleEvent(ev);

    const state = getState();
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
    if (me) updateCamera(me.pos[0], me.pos[2]);
  } else {
    updateCamera(0, 0);
  }

  render();
}

function processState(state, dt) {
  const myId = getMyId();

  // Sync players
  const serverPlayerIds = new Set(state.players.map(p => p.id));
  for (const [id] of knownPlayers) {
    if (!serverPlayerIds.has(id)) { removePlayerMesh(id); knownPlayers.delete(id); }
  }
  for (const p of state.players) {
    if (!knownPlayers.has(p.id)) {
      createPlayerMesh(p.id, playerIndex++);
      knownPlayers.set(p.id, true);
    }
    const moving = Math.abs(p.pos[0]) + Math.abs(p.pos[2]) > 0.1;
    updatePlayerMesh(p.id, p.pos[0], p.pos[2], p.alive, moving, dt);
    if (p.id === myId) {
      const input = isMobile() ? getMobileInput() : getInput();
      setPlayerRotation(p.id, Math.atan2(input.aimZ - p.pos[2], input.aimX - p.pos[0]));
    }
  }

  // Sync enemies
  const serverEnemyIds = new Set(state.enemies.map(e => e.id));
  for (const id of knownEnemies) {
    if (!serverEnemyIds.has(id)) { removeEnemyMesh(id); knownEnemies.delete(id); }
  }
  for (const e of state.enemies) {
    if (!knownEnemies.has(e.id)) {
      createEnemyMesh(e.id, e.type);
      knownEnemies.add(e.id);
    }
    updateEnemyMesh(e.id, e.pos[0], e.pos[2], e.hp, e.hp, dt);
  }

  // Sync pickups
  syncPickups(state.pickups);

  // Update HUD
  const me = state.players.find(p => p.id === myId);
  if (me) updateHUD(state.wave, state.score, me.hp, me.maxHp);

  setBiome(state.wave);
  showCombo(state.combo);
}

function handleEvent(ev) {
  switch (ev.t) {
    case 'kill':
      spawnKillParticles(ev.pos[0], ev.pos[2], 0xcc3333);
      playKill();
      break;
    case 'hit':
      if (ev.target === getMyId()) triggerShake(3);
      if (ev.crit) triggerShake(5);
      if (ev.pos) showDamageNumber(ev.pos[0], ev.pos[2], ev.dmg, ev.crit);
      playHit(ev.dmg);
      flashEnemy(ev.target);
      break;
    case 'wave':
      playWaveStart();
      break;
    case 'boss':
      playBossSpawn();
      break;
    case 'death':
      if (ev.pid === getMyId()) playDeath();
      break;
    case 'explosion':
      showExplosion(ev.pos[0], ev.pos[2], ev.radius);
      playExplosion();
      triggerShake(8);
      break;
    case 'gameover':
      gameActive = false;
      showGameOver(ev.wave, ev.score, ev.kills);
      playDeath();
      break;
  }
}

gameLoop();
