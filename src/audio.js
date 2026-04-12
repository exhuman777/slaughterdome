let ctx = null;
let enabled = true;

function getCtx() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  return ctx;
}

function noise(duration, frequency, type = 'bandpass') {
  if (!enabled) return;
  const c = getCtx();
  const bufferSize = c.sampleRate * duration;
  const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
  const source = c.createBufferSource();
  source.buffer = buffer;
  const filter = c.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = frequency;
  const gain = c.createGain();
  gain.gain.setValueAtTime(0.3, c.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
  source.connect(filter).connect(gain).connect(c.destination);
  source.start();
  source.stop(c.currentTime + duration);
}

function tone(freq, duration, volume = 0.2) {
  if (!enabled) return;
  const c = getCtx();
  const osc = c.createOscillator();
  osc.frequency.value = freq;
  const gain = c.createGain();
  gain.gain.setValueAtTime(volume, c.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
  osc.connect(gain).connect(c.destination);
  osc.start();
  osc.stop(c.currentTime + duration);
}

export function playShot(weaponType) {
  switch (weaponType) {
    case 'shotgun': noise(0.08, 400, 'lowpass'); noise(0.04, 1200); break;
    case 'railgun': tone(2000, 0.06, 0.15); tone(3000, 0.03, 0.1); break;
    case 'flamethrower': noise(0.03, 600, 'bandpass'); break;
    default: noise(0.04, 1000); break;
  }
}
export function playHit(damage) { noise(0.05, 800 + damage * 30); }
export function playKill() { tone(600, 0.15, 0.15); setTimeout(() => tone(900, 0.1, 0.1), 50); }
export function playExplosion() { noise(0.3, 100, 'lowpass'); }
export function playWaveStart() { tone(440, 0.1, 0.15); setTimeout(() => tone(550, 0.1, 0.15), 100); setTimeout(() => tone(660, 0.15, 0.15), 200); }
export function playBossSpawn() { noise(1, 60, 'lowpass'); }
export function playPickup() { tone(1200, 0.08, 0.1); setTimeout(() => tone(1500, 0.06, 0.1), 40); }
export function playDeath() { tone(400, 0.15, 0.2); setTimeout(() => tone(300, 0.15, 0.2), 100); setTimeout(() => tone(200, 0.3, 0.2), 200); }
export function playCombo() { tone(523, 0.2, 0.1); tone(659, 0.2, 0.1); tone(784, 0.2, 0.1); }
export function playWallPlace() { noise(0.06, 300, 'lowpass'); tone(200, 0.08, 0.12); }
export function playDash() { noise(0.08, 2000, 'highpass'); tone(800, 0.06, 0.08); }
export function playWallDestroy() { noise(0.15, 200, 'lowpass'); tone(120, 0.12, 0.15); }
export function playSword(combo) {
  const freqs = [400, 500, 700];
  tone(freqs[combo] || 400, 0.1, 0.15);
  noise(0.06, 1500 + combo * 500, 'highpass');
}
export function playWaveClear() { tone(523, 0.1, 0.15); setTimeout(() => tone(659, 0.1, 0.15), 80); setTimeout(() => tone(784, 0.12, 0.15), 160); setTimeout(() => tone(1047, 0.2, 0.12), 240); }
export function resumeAudio() { if (ctx && ctx.state === 'suspended') ctx.resume(); }

// Background music system
let musicGain = null;
let musicSource = null;
let musicBuffer = null;
let musicPlaying = false;
let musicVolume = 0.3;

function canPlayOgg() {
  const a = document.createElement('audio');
  return a.canPlayType && a.canPlayType('audio/ogg; codecs="opus"') !== '';
}

async function loadMusicBuffer() {
  if (musicBuffer) return musicBuffer;
  const c = getCtx();
  const url = canPlayOgg() ? 'music/loop.ogg' : 'music/loop.mp3';
  try {
    const resp = await fetch(url);
    const arrayBuf = await resp.arrayBuffer();
    musicBuffer = await c.decodeAudioData(arrayBuf);
    return musicBuffer;
  } catch (e) {
    console.warn('Music load failed:', e);
    return null;
  }
}

export async function startMusic() {
  if (!enabled || musicPlaying) return;
  const c = getCtx();
  const buf = await loadMusicBuffer();
  if (!buf) return;

  musicGain = c.createGain();
  musicGain.gain.value = musicVolume;
  musicGain.connect(c.destination);

  musicSource = c.createBufferSource();
  musicSource.buffer = buf;
  musicSource.loop = true;
  musicSource.connect(musicGain);
  musicSource.start();
  musicPlaying = true;
}

export function stopMusic() {
  if (!musicPlaying || !musicSource) return;
  const c = getCtx();
  if (musicGain) {
    musicGain.gain.setValueAtTime(musicGain.gain.value, c.currentTime);
    musicGain.gain.linearRampToValueAtTime(0, c.currentTime + 0.5);
  }
  const src = musicSource;
  setTimeout(() => { try { src.stop(); } catch (e) {} }, 600);
  musicSource = null;
  musicGain = null;
  musicPlaying = false;
}

export function setMusicVolume(v) {
  musicVolume = v;
  if (musicGain) musicGain.gain.value = v;
}

export function toggleAudio() {
  enabled = !enabled;
  if (musicGain) musicGain.gain.value = enabled ? musicVolume : 0;
  return enabled;
}
