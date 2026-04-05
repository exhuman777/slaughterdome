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

export function playHit(damage) { noise(0.05, 800 + damage * 30); }
export function playKill() { tone(600, 0.15, 0.15); setTimeout(() => tone(900, 0.1, 0.1), 50); }
export function playExplosion() { noise(0.3, 100, 'lowpass'); }
export function playWaveStart() { tone(440, 0.1, 0.15); setTimeout(() => tone(550, 0.1, 0.15), 100); setTimeout(() => tone(660, 0.15, 0.15), 200); }
export function playBossSpawn() { noise(1, 60, 'lowpass'); }
export function playPickup() { tone(1200, 0.08, 0.1); setTimeout(() => tone(1500, 0.06, 0.1), 40); }
export function playDeath() { tone(400, 0.15, 0.2); setTimeout(() => tone(300, 0.15, 0.2), 100); setTimeout(() => tone(200, 0.3, 0.2), 200); }
export function playCombo() { tone(523, 0.2, 0.1); tone(659, 0.2, 0.1); tone(784, 0.2, 0.1); }
export function toggleAudio() { enabled = !enabled; return enabled; }
export function resumeAudio() { if (ctx && ctx.state === 'suspended') ctx.resume(); }
