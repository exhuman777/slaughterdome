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
}

export function showHUD() {
  title.style.display = 'none'; hud.style.display = 'block'; gameover.style.display = 'none'; pingEl.style.display = 'block';
}

export function showGameOver(wave, score, kills) {
  gameover.style.display = 'block'; hud.style.display = 'none';
  goWave.textContent = 'WAVE: ' + wave;
  goScore.textContent = 'SCORE: ' + score;
  const killLines = Object.entries(kills).map(([id, k]) => id + ': ' + k).join(' | ');
  goKills.textContent = 'KILLS: ' + killLines;
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

export function updateUpgradeDisplay(upgrades) {
  if (!upgradeStrip || !upgrades) return;
  const parts = [];
  for (const [key, count] of Object.entries(upgrades)) {
    const short = key.slice(0, 4).toUpperCase();
    parts.push(short + '+' + count);
  }
  upgradeStrip.textContent = parts.join(' ');
}
