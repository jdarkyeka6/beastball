import { GameEvents } from '../core/EventBus.js';

// AudioManager.js
// ---------------------------------------------------------------------------
// Turns game events into sound. It is a pure CONSUMER of the EventBus - it reads
// nothing from the game state and the game knows nothing about it. Swap it out,
// mute it, or delete it and gameplay is unaffected.
//
// All sounds are SYNTHESISED with the Web Audio API (oscillators + filtered
// noise), so the repo ships ZERO audio asset files - nothing to download,
// bundle or license, which keeps the "no build tools / runs from a static
// server" promise intact.
//
// Browser notes:
//  - Autoplay policies forbid making noise before a user gesture, so the
//    AudioContext is created lazily in unlock(), which main.js calls from the
//    Start / Play-Again button clicks.
//  - If the Web Audio API is missing, every method becomes a safe no-op.
// ---------------------------------------------------------------------------

export class AudioManager {
  constructor() {
    const Ctx = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
    this._Ctx = Ctx || null;
    this.ctx = null; // created on first unlock()
    this.master = null;
    this.muted = false;
    this._masterVolume = 0.5;
  }

  get supported() {
    return !!this._Ctx;
  }

  /** Create/resume the AudioContext. Must be called from a user gesture. */
  unlock() {
    if (!this._Ctx) return;
    if (!this.ctx) {
      this.ctx = new this._Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this._masterVolume;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  /** Flip mute and report the new state (used by the UI button). */
  toggleMute() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : this._masterVolume;
  }

  /** Subscribe to every gameplay event we care about. */
  connect(bus) {
    bus.on(GameEvents.MATCH_START, () => this._whistle(1));
    bus.on(GameEvents.MATCH_END, () => this._whistle(3));
    bus.on(GameEvents.GOAL, () => this._goal());
    bus.on(GameEvents.KICK, ({ kind }) => (kind === 'pass' ? this._pass() : this._shot()));
    bus.on(GameEvents.ABILITY, ({ abilityId }) => this._ability(abilityId));
    bus.on(GameEvents.TACKLE, () => this._tackle());
    bus.on(GameEvents.SAVE, () => this._save());
    bus.on(GameEvents.SWITCH, () => this._blip());
  }

  // ----------------------------------------------------------------------
  // Low-level synth helpers
  // ----------------------------------------------------------------------
  _ready() {
    return this.ctx && !this.muted;
  }

  /** A single enveloped oscillator, with an optional frequency glide. */
  _tone({ freq = 440, freqEnd = null, type = 'sine', dur = 0.15, gain = 0.3, attack = 0.005, when = 0 }) {
    if (!this._ready()) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t0 + dur);
    // Exponential ramps can't touch 0, so we floor at a tiny value.
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  /** A burst of filtered white noise - for thuds, impacts, crowd & whistle air. */
  _noise({ dur = 0.2, gain = 0.3, filter = 'lowpass', freq = 1000, q = 1, when = 0 }) {
    if (!this._ready()) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + when;
    const n = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t0);
    src.stop(t0 + dur);
  }

  // ----------------------------------------------------------------------
  // Sound design - one method per event
  // ----------------------------------------------------------------------
  _shot() {
    this._tone({ freq: 190, freqEnd: 85, type: 'sine', dur: 0.13, gain: 0.55 });
    this._noise({ dur: 0.05, gain: 0.25, filter: 'lowpass', freq: 500 });
  }

  _pass() {
    this._tone({ freq: 250, freqEnd: 170, type: 'sine', dur: 0.1, gain: 0.3 });
  }

  _goal() {
    // Rising triad fanfare + a short "crowd" swell.
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
    notes.forEach((f, i) => this._tone({ freq: f, type: 'triangle', dur: 0.22, gain: 0.35, when: i * 0.1 }));
    this._noise({ dur: 0.7, gain: 0.16, filter: 'bandpass', freq: 1100, q: 0.6 });
  }

  _ability(abilityId) {
    switch (abilityId) {
      case 'superLeapShot': // kangaroo "boing"
        this._tone({ freq: 400, freqEnd: 920, type: 'triangle', dur: 0.12, gain: 0.34 });
        this._tone({ freq: 920, freqEnd: 320, type: 'triangle', dur: 0.18, gain: 0.34, when: 0.1 });
        break;
      case 'chargeTackle': // bear heavy growl/whoosh
        this._tone({ freq: 130, freqEnd: 60, type: 'sawtooth', dur: 0.3, gain: 0.45 });
        this._noise({ dur: 0.25, gain: 0.2, filter: 'lowpass', freq: 350 });
        break;
      case 'webPass': // spider zip
        this._tone({ freq: 1300, freqEnd: 420, type: 'square', dur: 0.18, gain: 0.22 });
        break;
      default:
        this._tone({ freq: 600, freqEnd: 1000, type: 'sawtooth', dur: 0.2, gain: 0.3 });
    }
  }

  _tackle() {
    this._noise({ dur: 0.18, gain: 0.4, filter: 'lowpass', freq: 300 });
    this._tone({ freq: 95, freqEnd: 50, type: 'sine', dur: 0.16, gain: 0.4 });
  }

  _save() {
    this._tone({ freq: 150, freqEnd: 80, type: 'sine', dur: 0.12, gain: 0.35 });
    this._noise({ dur: 0.06, gain: 0.18, filter: 'lowpass', freq: 600 });
  }

  _blip() {
    this._tone({ freq: 660, type: 'square', dur: 0.05, gain: 0.12 });
  }

  /** Referee whistle: `pips` short trilled bursts (1 = kickoff, 3 = full time). */
  _whistle(pips = 1) {
    for (let i = 0; i < pips; i++) {
      const when = i * 0.18;
      this._tone({ freq: 2100, freqEnd: 2300, type: 'square', dur: 0.16, gain: 0.16, when });
      this._noise({ dur: 0.16, gain: 0.06, filter: 'bandpass', freq: 2300, q: 6, when });
    }
  }
}
