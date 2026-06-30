// Fully procedural WebAudio SFX — no audio files needed. Each weapon, zombie
// sound, footstep and pickup is synthesised from oscillators + filtered noise.
// A low ambient drone + random moans intensify with the nearby zombie count.
export class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noiseBuf = null;
    this.enabled = false;
    this._last = {};        // rate limiters per category
    this._ambGain = null;
    this._ambTarget = 0;
    this._moanT = 0;
  }

  resume() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(this.ctx.destination);

    // shared white-noise buffer
    const len = this.ctx.sampleRate * 1.0;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    // ambient drone
    this._ambGain = this.ctx.createGain();
    this._ambGain.gain.value = 0;
    this._ambGain.connect(this.master);
    const o1 = this.ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 48;
    const o2 = this.ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = 55;
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 180;
    o1.connect(lp); o2.connect(lp); lp.connect(this._ambGain);
    o1.start(); o2.start();

    this.enabled = true;
  }

  setVolume(v) { if (this.master) this.master.gain.value = v; }

  _ok(cat, minGap) {
    const t = this.ctx ? this.ctx.currentTime : 0;
    if (this._last[cat] && t - this._last[cat] < minGap) return false;
    this._last[cat] = t; return true;
  }

  _noise(dur, { type = 'lowpass', freq = 2000, q = 1, gain = 0.5, attack = 0.001, decay = null } = {}) {
    if (!this.enabled) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (decay || dur));
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + dur + 0.02);
  }

  _tone(freq, dur, { type = 'square', gain = 0.25, slideTo = null, attack = 0.002 } = {}) {
    if (!this.enabled) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  shot(id) {
    if (!this.enabled) return;
    switch (id) {
      case 'pistol':
        this._noise(0.12, { type: 'bandpass', freq: 1400, q: 0.8, gain: 0.5 });
        this._tone(220, 0.08, { type: 'square', gain: 0.18, slideTo: 90 });
        break;
      case 'shotgun':
        this._noise(0.32, { type: 'lowpass', freq: 900, q: 0.7, gain: 0.7 });
        this._tone(120, 0.22, { type: 'sawtooth', gain: 0.25, slideTo: 50 });
        break;
      case 'rifle':
        if (!this._ok('rifle', 0.04)) return;
        this._noise(0.1, { type: 'bandpass', freq: 1800, q: 0.6, gain: 0.45 });
        this._tone(180, 0.06, { type: 'square', gain: 0.16, slideTo: 80 });
        break;
      case 'sniper':
        this._noise(0.45, { type: 'lowpass', freq: 1600, gain: 0.7 });
        this._tone(140, 0.35, { type: 'sawtooth', gain: 0.3, slideTo: 45 });
        break;
      case 'melee':
        this._noise(0.18, { type: 'lowpass', freq: 500, gain: 0.4 });
        this._tone(90, 0.1, { type: 'sine', gain: 0.2, slideTo: 50 });
        break;
    }
  }

  empty() { this._tone(2400, 0.03, { type: 'square', gain: 0.12 }); }

  reload(/* id */) {
    if (!this.enabled) return;
    const t = this.ctx.currentTime;
    for (const off of [0, 0.18, 0.42]) {
      setTimeout(() => this._noise(0.05, { type: 'bandpass', freq: 1200, gain: 0.3 }), off * 1000);
    }
  }

  switchWeapon() { this._noise(0.05, { type: 'highpass', freq: 2200, gain: 0.2 }); }

  pickupAmmo() { this._tone(660, 0.08, { type: 'square', gain: 0.2 }); setTimeout(() => this._tone(990, 0.1, { type: 'square', gain: 0.2 }), 70); }
  pickupHealth() { this._tone(523, 0.1, { type: 'sine', gain: 0.22 }); setTimeout(() => this._tone(784, 0.14, { type: 'sine', gain: 0.22 }), 90); }

  hurt() { if (!this._ok('hurt', 0.15)) return; this._noise(0.18, { type: 'lowpass', freq: 700, gain: 0.4 }); this._tone(150, 0.12, { type: 'sawtooth', gain: 0.2, slideTo: 80 }); }

  footstep(surface) {
    if (!this._ok('step', 0.12)) return;
    const f = surface === 'concrete' ? 1400 : 600;
    this._noise(0.06, { type: 'lowpass', freq: f, gain: 0.12 });
  }

  zombieDeath() {
    if (!this._ok('zdeath', 0.06)) return;
    this._tone(180, 0.35, { type: 'sawtooth', gain: 0.16, slideTo: 60 });
    this._noise(0.25, { type: 'lowpass', freq: 800, gain: 0.12 });
  }

  moan() {
    if (!this._ok('moan', 0.4)) return;
    const base = 90 + Math.random() * 60;
    this._tone(base, 0.7, { type: 'sawtooth', gain: 0.1, slideTo: base * 0.7, attack: 0.15 });
  }

  victory() {
    const notes = [523, 659, 784, 1047];
    notes.forEach((n, i) => setTimeout(() => this._tone(n, 0.3, { type: 'square', gain: 0.25 }), i * 160));
  }

  // called each frame: count = nearby living zombies
  updateAmbience(count, dt) {
    if (!this.enabled) return;
    this._ambTarget = Math.min(0.18, count * 0.006);
    const g = this._ambGain.gain;
    g.value += (this._ambTarget - g.value) * Math.min(1, dt * 2);
    this._moanT -= dt;
    if (this._moanT <= 0) {
      this._moanT = 1.5 + Math.random() * 3;
      if (count > 2 && Math.random() < Math.min(0.9, count / 20)) this.moan();
    }
  }
}
