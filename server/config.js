export const TICK_RATE = 20;
export const TICK_MS = 1000 / TICK_RATE;
export const ARENA_RADIUS = 40;
export const MAX_PLAYERS = 2;
export const MAX_ROOMS = 3;
export const GRACE_PERIOD_MS = 5000;
export const WAVE_REST_MS = 5000;
export const ROOM_CLEANUP_MS = 30000;

export const PLAYER = {
  hp: 100,
  damage: 10,
  speed: 10,
  shootCooldown: 150,
  bulletSpeed: 35,
  specialRange: 6,
  specialCooldown: 2500,
  specialKnockback: 6,
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

export const WALL = {
  hp: 120,
  charges: 8,
  cooldown: 5000,
  placeCooldown: 200,
  halfWidth: 2.0,
  halfDepth: 0.4,
  lifetime: 60000,
};

export const DASH = {
  speed: 30,
  duration: 200,
  charges: 3,
  chainWindow: 300,
  iframes: 150,
  rechargeRate: 1500,
};

export const SWORD = {
  damage: 45,
  range: 3.0,
  arc: 1.8,
  cooldown: 250,
  comboPause: 700,
  comboWindow: 400,
  knockback: 3,
};

export const OBSTACLES = {
  treeCount: 10,
  treeRadius: 1.5,
  treeMinDist: 8,
  treeSeparation: 6,
  waterStartWave: 5,
  waterCount: 2,
  waterRadius: 3.5,
  waterMinDist: 12,
  waterSeparation: 10,
};

export const ARENA_SHRINK_PER_WAVE = 2;
export const ARENA_MIN_RADIUS = 12;
export const ARENA_OUTSIDE_DPS = 5;

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
  hpPerWave: 0.15,
  speedPerWave: 0.03,
  speedCap: 0.6,
  damagePerWave: 0.08,
  bossHpBase: 200,
  bossHpPerBoss: 50,
};

export const UPGRADE_DEFS = {
  fire_rate:     { name: 'RAPID FIRE',    desc: '-15% shoot cooldown',         tier: 'common',  category: 'weapon' },
  bullet_size:   { name: 'BIG ROUNDS',    desc: '+30% bullet hit radius',      tier: 'common',  category: 'weapon' },
  pierce:        { name: 'PIERCE',        desc: 'Bullets pass through +1',     tier: 'rare',    category: 'weapon' },
  crit_chance:   { name: 'PRECISION',     desc: '+5% crit chance',             tier: 'common',  category: 'weapon' },
  crit_damage:   { name: 'DEVASTATION',   desc: '+0.5x crit multiplier',      tier: 'rare',    category: 'weapon' },
  move_speed:    { name: 'SWIFT',         desc: '+1 movement speed',           tier: 'common',  category: 'movement' },
  dash_cooldown: { name: 'QUICK DASH',    desc: '-300ms dash cooldown',        tier: 'rare',    category: 'movement' },
  dash_distance: { name: 'LONG DASH',     desc: '+20% dash speed',             tier: 'common',  category: 'movement' },
  max_hp:        { name: 'VITALITY',      desc: '+20 max HP',                  tier: 'common',  category: 'defense' },
  wall_hp:       { name: 'FORTIFY',       desc: '+50 wall HP',                 tier: 'common',  category: 'defense' },
  thorns:        { name: 'THORNS',        desc: '5 contact dmg to enemies',    tier: 'rare',    category: 'defense' },
  lifesteal:     { name: 'VAMPIRISM',     desc: 'Heal 3% of damage dealt',     tier: 'epic',    category: 'passive' },
  magnet:        { name: 'MAGNET',        desc: '+3 pickup attract range',     tier: 'common',  category: 'passive' },
  combo_decay:   { name: 'MOMENTUM',      desc: '+500ms combo decay time',     tier: 'rare',    category: 'passive' },
  shotgun:       { name: 'SHOTGUN',       desc: '5-bullet spread, slower',     tier: 'epic',    category: 'weapon_swap' },
  flamethrower:  { name: 'FLAMETHROWER',  desc: 'Short range spray, fast',     tier: 'epic',    category: 'weapon_swap' },
};

export const UPGRADE_TIER_WEIGHTS = {
  common: { base: 0.65, perComboTier: -0.05 },
  rare:   { base: 0.28, perComboTier: 0.03 },
  epic:   { base: 0.07, perComboTier: 0.02 },
};

export const OVERHEAT = {
  fastMs: 3000,
  slowMs: 5000,
  slowMult: 3,
};

export const WEAPONS = {
  pistol:       { bullets: 1, spread: 0,   cooldown: 150, damageMult: 1.0, speed: 35, pierce: 0, range: 3000 },
  shotgun:      { bullets: 5, spread: 0.3, cooldown: 400, damageMult: 0.7, speed: 25, pierce: 0, range: 1500 },
  flamethrower: { bullets: 3, spread: 0.4, cooldown: 80,  damageMult: 0.3, speed: 15, pierce: 0, range: 500 },
};

export const PLAYER_COUNT_SCALING = [0, 1, 1.4];
export const MAX_ENEMIES = 30;

export function waveEnemyCount(wave, playerCount) {
  const base = 3 + wave * 2;
  return Math.min(MAX_ENEMIES, Math.ceil(base * PLAYER_COUNT_SCALING[playerCount]));
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
