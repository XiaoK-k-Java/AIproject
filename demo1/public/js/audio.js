/**
 * Tiny procedural sound palette — no external assets and no autoplay:
 * the AudioContext is created or resumed from a real user gesture.
 */
export class SoundEngine {
  constructor(muted = false) {
    this.muted = muted;
    this.context = null;
    this.lastEatAt = 0;
  }

  unlock() {
    if (this.muted) return;
    if (!this.context) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      this.context = new AudioContext();
    }
    if (this.context.state === 'suspended') {
      this.context.resume().catch(() => {});
    }
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
    if (!this.muted) this.unlock();
  }

  tone({ frequency, endFrequency, type = 'sine', duration = 0.12, volume = 0.035, delay = 0 }) {
    if (this.muted || !this.context) return;
    const ctx = this.context;
    const start = ctx.currentTime + delay;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(Math.max(30, frequency), start);
    if (endFrequency) {
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(30, endFrequency), start + duration);
    }
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.03);
  }

  eat(streak = 0) {
    if (this.muted) return;
    const now = performance.now();
    if (now - this.lastEatAt < 40) return;
    this.lastEatAt = now;
    this.unlock();
    const base = 440 + Math.min(360, (streak % 8) * 34);
    this.tone({
      frequency: base,
      endFrequency: base * 1.42,
      type: 'sine',
      duration: 0.08,
      volume: 0.024,
    });
    this.tone({
      frequency: base * 1.5,
      endFrequency: base * 1.8,
      type: 'triangle',
      duration: 0.06,
      volume: 0.008,
      delay: 0.025,
    });
  }

  join() {
    this.unlock();
    this.tone({ frequency: 330, endFrequency: 440, type: 'sine', duration: 0.18, volume: 0.025 });
    this.tone({ frequency: 660, endFrequency: 880, type: 'triangle', duration: 0.16, volume: 0.014, delay: 0.08 });
  }

  death() {
    if (this.muted) return;
    this.unlock();
    this.tone({ frequency: 190, endFrequency: 56, type: 'sawtooth', duration: 0.55, volume: 0.026 });
    this.tone({ frequency: 96, endFrequency: 38, type: 'triangle', duration: 0.7, volume: 0.032, delay: 0.05 });
    this.tone({ frequency: 740, endFrequency: 280, type: 'sine', duration: 0.22, volume: 0.012 });
  }

  kill() {
    if (this.muted) return;
    this.unlock();
    this.tone({ frequency: 620, endFrequency: 980, type: 'triangle', duration: 0.14, volume: 0.02 });
    this.tone({ frequency: 920, endFrequency: 1300, type: 'sine', duration: 0.1, volume: 0.012, delay: 0.04 });
  }

  notice() {
    if (this.muted) return;
    this.unlock();
    this.tone({ frequency: 520, type: 'sine', duration: 0.08, volume: 0.012 });
  }
}
