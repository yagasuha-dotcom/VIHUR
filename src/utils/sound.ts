// Optional WebAudio feedback. All sounds are synthesised, no assets. Master switch lives in player settings.
let ctx: AudioContext | null = null;
let enabled = true;
export function setSoundEnabled(v: boolean): void { enabled = v; }
function ac(): AudioContext | null {
  if (!enabled) return null;
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch { return null; }
}
function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', gain = 0.05, slideTo?: number): void {
  const c = ac(); if (!c) return;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, c.currentTime + start);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, c.currentTime + start + dur);
  g.gain.setValueAtTime(0.0001, c.currentTime + start);
  g.gain.exponentialRampToValueAtTime(gain, c.currentTime + start + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + dur);
  o.connect(g).connect(c.destination); o.start(c.currentTime + start); o.stop(c.currentTime + start + dur + 0.02);
}
export function playSound(kind: string): void {
  if (!enabled) return;
  switch (kind) {
    case 'buy': tone(520, 0, 0.09, 'sine', 0.05); tone(780, 0.07, 0.12, 'sine', 0.045); break;
    case 'sell': tone(660, 0, 0.09, 'sine', 0.05); tone(440, 0.07, 0.12, 'sine', 0.045); break;
    case 'profit': tone(880, 0, 0.1, 'triangle', 0.04); tone(1320, 0.09, 0.16, 'triangle', 0.035); break;
    case 'loss': tone(300, 0, 0.18, 'sawtooth', 0.03, 200); break;
    case 'news': tone(1000, 0, 0.08, 'square', 0.025); tone(1000, 0.14, 0.08, 'square', 0.025); break;
    case 'margin': for (let i = 0; i < 4; i++) tone(i % 2 ? 520 : 780, i * 0.16, 0.14, 'sawtooth', 0.05); break;
    default: tone(600, 0, 0.06, 'sine', 0.03);
  }
}
