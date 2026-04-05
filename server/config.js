export const TICK_RATE = 20;
export const TICK_MS = 1000 / TICK_RATE;
export const ARENA_RADIUS = 40;
export const MAX_PLAYERS = 4;
export const GRACE_PERIOD_MS = 5000;
export const WAVE_REST_MS = 5000;
export const ROOM_CLEANUP_MS = 30000;

export const PLAYER = {
  hp: 100,
  damage: 10,
  speed: 8,
  meleeRange: 2,
  meleeArc: Math.PI / 2,
  meleeCooldown: 300,
  specialRange: 4,
  specialCooldown: 3000,
  specialKnockback: 5,
  critChance: 0.1,
  critMultiplier: 2,
};

export const ENEMY_DEFS = {
  grunt:    { hp: 20, damage: 8,  speed: 4,   wave: 1, geometry: 'box',     color: 0xcc3333, scale: 1 },
  dasher:   { hp: 15, damage: 10, speed: 8,   wave: 2, geometry: 'cone',    color: 0xff8833, scale: 1 },
  brute:    { hp: 60, damage: 18, speed: 2.5, wave: 3, geometry: 'box',     color: 0x882222, scale: 1.5 },
  spitter:  { hp: 25, damage: 12, speed: 3,   wave: 4, geometry: 'sphere',  color: 0x33cc33, scale: 1 },
  swarm:    { hp: 8,  damage: 4,  speed: 6,   wave: 5, geometry: 'box',     color: 0xaa33aa, scale: 0.5, count: 5 },
  shielder: { hp: 40, damage: 12, speed: 3.5, wave: 6, geometry: 'box',     color: 0x3366cc, scale: 1 },
  bomber:   { hp: 30, damage: 25, speed: 5,   wave: 7, geometry: 'sphere',  color: 0xff2222, scale: 1 },
  titan:    { hp: 200, damage: 20, speed: 3,  wave: 0, geometry: 'box',     color: 0xffcc00, scale: 3, boss: true },
};

export const PICKUPS = {
  health: { chance: 0.4, color: 0x44ff44, duration: 0 },
  speed:  { chance: 0.25, color: 0xffff00, duration: 5000 },
  damage: { chance: 0.2, color: 0xff4444, duration: 8000 },
  shield: { chance: 0.15, color: 0x4444ff, duration: 6000 },
};

export const PICKUP_DESPAWN_MS = 8000;
export const PICKUP_DROP_BASE = 0.15;
export const PICKUP_DROP_COMBO_BONUS = 0.02;

export const COMBO_DECAY_MS = 2500;
export const COMBO_TIERS = [
  { kills: 5,  name: 'RAMPAGE',       multiplier: 1.1 },
  { kills: 10, name: 'KILLING SPREE', multiplier: 1.2 },
  { kills: 15, name: 'DOMINATING',    multiplier: 1.3 },
  { kills: 20, name: 'UNSTOPPABLE',   multiplier: 1.4 },
  { kills: 30, name: 'GODLIKE',       multiplier: 1.5 },
  { kills: 50, name: 'LEGENDARY',     multiplier: 1.6 },
];

export const SCALING = {
  hpPerWave: 0.1,
  speedPerWave: 0.03,
  speedCap: 0.6,
  damagePerWave: 0.05,
  bossHpBase: 200,
  bossHpPerBoss: 50,
};

export const PLAYER_COUNT_SCALING = [0, 1, 1.5, 2, 2.5];

export function waveEnemyCount(wave, playerCount) {
  const base = 3 + wave * 2;
  return Math.ceil(base * PLAYER_COUNT_SCALING[playerCount]);
}

export function enemyTypesForWave(wave) {
  return Object.entries(ENEMY_DEFS)
    .filter(([, def]) => def.wave > 0 && def.wave <= wave)
    .map(([type]) => type);
}

export function scaleStat(base, wave, ratePerWave, cap) {
  const mult = cap !== undefined
    ? Math.min(1 + ratePerWave * wave, 1 + cap)
    : 1 + ratePerWave * wave;
  return base * mult;
}
