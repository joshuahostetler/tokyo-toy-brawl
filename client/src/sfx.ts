// Tiny synthesized sound effects — no audio files needed.
import type { WeaponId } from '../../shared/protocol.ts';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

export function initAudio() {
  if (ctx) return;
  ctx = new AudioContext();
  master = ctx.createGain();
  master.gain.value = 0.35;
  master.connect(ctx.destination);
}

function tone(freq: number, endFreq: number, dur: number, type: OscillatorType, vol = 1, delay = 0) {
  if (!ctx || !master) return;
  const t = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(endFreq, 1), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(g).connect(master);
  osc.start(t);
  osc.stop(t + dur);
}

function noise(dur: number, vol: number, filterFreq: number) {
  if (!ctx || !master) return;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = filterFreq;
  const g = ctx.createGain();
  g.gain.value = vol;
  src.connect(filter).connect(g).connect(master);
  src.start();
}

/** Volume scales down with distance for sounds made by other players. */
export function playFire(weapon: WeaponId, volume = 1) {
  switch (weapon) {
    case 'slingshot': tone(300, 900, 0.12, 'triangle', 0.5 * volume); break;
    case 'watergun': noise(0.06, 0.25 * volume, 2500); break;
    case 'foam': tone(500, 180, 0.08, 'square', 0.15 * volume); noise(0.05, 0.2 * volume, 1200); break;
    case 'paintball': noise(0.07, 0.45 * volume, 900); tone(160, 60, 0.07, 'sine', 0.4 * volume); break;
    case 'duckzooka': tone(900, 1300, 0.08, 'square', 0.25 * volume); tone(1300, 700, 0.15, 'square', 0.25 * volume, 0.08); break;
  }
}

export function playHitMarker() { tone(1400, 1800, 0.06, 'sine', 0.3); }
export function playHurt() { tone(220, 110, 0.18, 'sawtooth', 0.25); }
export function playSplat() { noise(0.3, 0.6, 600); tone(400, 80, 0.35, 'sine', 0.4); }
export function playPickup() { tone(660, 660, 0.08, 'sine', 0.4); tone(990, 990, 0.12, 'sine', 0.4, 0.08); }
export function playSquish() { noise(0.12, 0.25, 800); }
export function playHonk() { tone(330, 320, 0.25, 'square', 0.2); tone(415, 410, 0.25, 'square', 0.15); }
export function playJump() { tone(250, 500, 0.1, 'sine', 0.15); }
