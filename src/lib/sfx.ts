/** Tiny child-friendly WebAudio chimes — no assets, created lazily on first user gesture. */
let ctx: AudioContext | null = null;

function ac(): AudioContext | null {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch { return null; }
}

function tone(freq: number, delay: number, dur: number, type: OscillatorType = 'triangle', vol = .1) {
  const a = ac(); if (!a) return;
  const t0 = a.currentTime + delay;
  const osc = a.createOscillator(), gain = a.createGain();
  osc.type = type; osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(vol, t0 + .015);
  gain.gain.exponentialRampToValueAtTime(.0001, t0 + dur);
  osc.connect(gain).connect(a.destination);
  osc.start(t0); osc.stop(t0 + dur + .05);
}

export const sfx = {
  jump() { tone(520, 0, .12, 'triangle', .07); },
  pickup() { tone(660, 0, .1); tone(880, .09, .16); },
  discover() { tone(740, 0, .12, 'sine'); tone(988, .1, .18, 'sine'); },
  deposit() { [523, 659, 784, 1047].forEach((f, i) => tone(f, i * .1, .2, 'triangle', .12)); },
  levelup() { [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, i * .09, .22, 'triangle', .12)); },
  hurt() { tone(170, 0, .18, 'sawtooth', .06); },
  bump() { tone(220, 0, .1, 'square', .05); },
};
