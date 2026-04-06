const title = document.getElementById('title');
const hud = document.getElementById('hud');
const hudWave = document.getElementById('hud-wave');
const hudScore = document.getElementById('hud-score');
const hpFill = document.getElementById('hp-fill');
const comboEl = document.getElementById('combo');
const gameover = document.getElementById('gameover');
const goWave = document.getElementById('go-wave');
const goScore = document.getElementById('go-score');
const goKills = document.getElementById('go-kills');
const pingEl = document.getElementById('ping');

const COMBO_COLORS = { 5: '#ffff00', 10: '#ff8800', 15: '#ff4444', 20: '#aa44ff', 30: '#ffcc00', 50: '#ff44ff' };
const COMBO_NAMES = { 5: 'RAMPAGE', 10: 'KILLING SPREE', 15: 'DOMINATING', 20: 'UNSTOPPABLE', 30: 'GODLIKE', 50: 'LEGENDARY' };

export function showTitle() {
  title.style.display = 'block'; hud.style.display = 'none'; gameover.style.display = 'none';
  hideAbilities(); hideInfo(); hidePlayers();
}

export function showHUD() {
  title.style.display = 'none'; hud.style.display = 'block'; gameover.style.display = 'none'; pingEl.style.display = 'block';
  showAbilities(); showInfo();
}

export function showGameOver(wave, score, kills) {
  gameover.style.display = 'block'; hud.style.display = 'none';
  goWave.textContent = 'WAVE: ' + wave;
  goScore.textContent = 'SCORE: ' + score;
  const killLines = Object.entries(kills).map(([id, k]) => id + ': ' + k).join(' | ');
  goKills.textContent = 'KILLS: ' + killLines;
  hideAbilities(); hideInfo(); hidePlayers();
}

export function updateHUD(wave, score, hp, maxHp) {
  hudWave.textContent = 'WAVE ' + wave;
  hudScore.textContent = 'SCORE: ' + score;
  const pct = Math.max(0, Math.min(100, (hp / maxHp) * 100));
  hpFill.style.width = pct + '%';
  if (pct > 50) hpFill.style.background = '#44ff44';
  else if (pct > 25) hpFill.style.background = '#ffaa00';
  else hpFill.style.background = '#ff4444';
}

let comboTimeout = null;
export function showCombo(combo) {
  if (combo < 5) { comboEl.style.display = 'none'; return; }
  let tier = 5;
  for (const t of [50, 30, 20, 15, 10, 5]) { if (combo >= t) { tier = t; break; } }
  comboEl.textContent = (COMBO_NAMES[tier] || 'COMBO') + ' x' + combo;
  comboEl.style.color = COMBO_COLORS[tier] || '#ffcc00';
  comboEl.style.fontSize = Math.min(32 + combo, 64) + 'px';
  comboEl.style.textShadow = '0 0 10px ' + (COMBO_COLORS[tier] || '#ffcc00');
  comboEl.style.display = 'block';
  clearTimeout(comboTimeout);
  comboTimeout = setTimeout(() => { comboEl.style.display = 'none'; }, 2500);
}

export function updatePing(ms) { pingEl.textContent = ms + 'ms'; }

export function getPlayerName() {
  return document.getElementById('name-input').value.trim().slice(0, 12) ||
    'Warrior_' + Math.floor(Math.random() * 9000 + 1000);
}

const upgradeStrip = document.getElementById('upgrade-strip');
const weaponEl = document.getElementById('hud-weapon');
const weaponName = document.getElementById('weapon-name');
const ammoFill = document.getElementById('ammo-fill');
const ammoText = document.getElementById('ammo-text');
const controlsEl = document.getElementById('hud-controls');
const countdownEl = document.getElementById('hud-countdown');
const abilitiesEl = document.getElementById('hud-abilities');
const infoEl = document.getElementById('hud-info');
const playersEl = document.getElementById('hud-players');

const UPGRADE_NAMES = {
  fire_rate: 'RAPID', bullet_size: 'BIG RND', pierce: 'PIERCE', crit_chance: 'PRECISION',
  crit_damage: 'DEVASTATE', move_speed: 'SWIFT', dash_cooldown: 'QDASH', dash_distance: 'LDASH',
  max_hp: 'VITALITY', wall_hp: 'FORTIFY', thorns: 'THORNS', lifesteal: 'VAMP',
  magnet: 'MAGNET', combo_decay: 'MOMENTUM',
};

export function updateUpgradeDisplay(upgrades) {
  if (!upgradeStrip || !upgrades) return;
  const parts = [];
  for (const [key, count] of Object.entries(upgrades)) {
    const name = UPGRADE_NAMES[key] || key.toUpperCase();
    parts.push(name + (count > 1 ? 'x' + count : ''));
  }
  upgradeStrip.textContent = parts.join('  ');
}

export function updateWeaponHUD(weapon, overheated, heatPct) {
  if (!weaponEl) return;
  weaponEl.style.display = 'block';
  weaponName.textContent = (weapon || 'PISTOL').toUpperCase() + (overheated ? ' [SLOW]' : '');
  weaponName.style.color = overheated ? '#ff4444' : '#fff';
  const pct = Math.max(0, Math.min(100, heatPct * 100));
  ammoFill.style.width = pct + '%';
  ammoFill.style.background = overheated ? '#ff4444' : (pct > 70 ? '#ffaa00' : '#ffcc44');
  ammoText.textContent = overheated ? 'COOLING' : (pct > 0 ? 'HEAT' : 'READY');
}

export function showControlsHint() {
  if (controlsEl) controlsEl.style.display = 'block';
}

export function hideControlsHint() {
  if (controlsEl) controlsEl.style.display = 'none';
}

export function updateCountdown(phase, timerMs) {
  if (!countdownEl) return;
  if (phase === 'countdown' && timerMs > 0) {
    const secs = Math.ceil(timerMs / 1000);
    countdownEl.textContent = 'NEXT WAVE IN ' + secs;
    countdownEl.style.display = 'block';
  } else {
    countdownEl.style.display = 'none';
  }
}

// Abilities panel (right side)
function showAbilities() { if (abilitiesEl) abilitiesEl.style.display = 'block'; }
function hideAbilities() { if (abilitiesEl) abilitiesEl.style.display = 'none'; }

export function updateAbilities(wallCharges, specialCd, dashCd) {
  if (!abilitiesEl) return;
  const wallColor = wallCharges > 0 ? '#e6993a' : '#ff4444';
  const specialReady = specialCd <= 0;
  const dashReady = dashCd <= 0;
  abilitiesEl.innerHTML =
    '<div class="ab-row"><span class="ab-key">[E]</span> WALL <span class="ab-val" style="color:' + wallColor + '">' + wallCharges + '/3</span></div>' +
    '<div class="ab-row"><span class="ab-key">[RMB]</span> AoE ' + (specialReady ? '<span class="ab-val">READY</span>' : '<span class="ab-cd">' + Math.ceil(specialCd / 1000) + 's</span>') + '</div>' +
    '<div class="ab-row"><span class="ab-key">[SHIFT]</span> DASH ' + (dashReady ? '<span class="ab-val">READY</span>' : '<span class="ab-cd">' + ((dashCd / 1000).toFixed(1)) + 's</span>') + '</div>';
}

// Info panel (left side)
function showInfo() { if (infoEl) infoEl.style.display = 'block'; }
function hideInfo() { if (infoEl) infoEl.style.display = 'none'; }

export function updateInfo(kills) {
  if (!infoEl) return;
  infoEl.innerHTML = '<div class="info-row">KILLS: <span style="color:#fff">' + kills + '</span></div>';
}

// Player count
function hidePlayers() { if (playersEl) playersEl.style.display = 'none'; }

export function updatePlayers(count) {
  if (!playersEl) return;
  if (count > 1) {
    playersEl.style.display = 'block';
    playersEl.textContent = count + ' PLAYERS IN DOME';
  } else {
    playersEl.style.display = 'none';
  }
}
