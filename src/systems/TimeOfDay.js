import * as THREE from 'three';

// 10-minute day/night cycle. Interpolates sky gradient, fog colour + draw
// distance, sun position/colour/intensity, hemisphere and ambient light across
// keyframes (night → dawn → day → noon → dusk → night). Drives the Renderer's
// exposed lights/sky/fog; exposes phase + label for the HUD time gauge.
const C = (hex) => new THREE.Color(hex);

const STOPS = [
  { p: 0.00, skyTop: C(0x05070f), skyBot: C(0x10162c), fog: C(0x06080f), near: 8, far: 50,
    sun: C(0x6a80c0), sunI: 0.18, hemiSky: C(0x2a3550), hemiGnd: C(0x0a0c12), hemiI: 0.35, amb: C(0x10131f), ambI: 0.28 },
  { p: 0.18, skyTop: C(0x223152), skyBot: C(0xc8743c), fog: C(0x3a2e2e), near: 12, far: 78,
    sun: C(0xffb06a), sunI: 0.70, hemiSky: C(0x8a7a86), hemiGnd: C(0x2a2622), hemiI: 0.80, amb: C(0x3a3340), ambI: 0.46 },
  { p: 0.30, skyTop: C(0x3f73c0), skyBot: C(0xa9c0d6), fog: C(0x9fb0c0), near: 18, far: 110,
    sun: C(0xfff0d0), sunI: 1.00, hemiSky: C(0xa6c0e0), hemiGnd: C(0x3a3a30), hemiI: 1.00, amb: C(0x556070), ambI: 0.55 },
  { p: 0.50, skyTop: C(0x4f86d6), skyBot: C(0xbcd0e2), fog: C(0xb8c6d4), near: 22, far: 118,
    sun: C(0xffffe8), sunI: 1.15, hemiSky: C(0xbcd2ec), hemiGnd: C(0x44443a), hemiI: 1.05, amb: C(0x66707e), ambI: 0.60 },
  { p: 0.68, skyTop: C(0x2e3a60), skyBot: C(0xd05a2c), fog: C(0x4a2c26), near: 12, far: 76,
    sun: C(0xff8a4a), sunI: 0.70, hemiSky: C(0x8a6a6e), hemiGnd: C(0x2a2420), hemiI: 0.75, amb: C(0x40323a), ambI: 0.46 },
  { p: 0.82, skyTop: C(0x0a0e1e), skyBot: C(0x161e38), fog: C(0x0a0d18), near: 9, far: 56,
    sun: C(0x7286c0), sunI: 0.25, hemiSky: C(0x2c3858), hemiGnd: C(0x0c0e16), hemiI: 0.45, amb: C(0x141826), ambI: 0.32 },
];
// wrap: append a copy of the first stop at p=1.0
STOPS.push({ ...STOPS[0], p: 1.0 });

export class TimeOfDay {
  constructor(renderer, { cycle = 600, startPhase = 0.26 } = {}) {
    this.renderer = renderer;
    this.cycle = cycle;            // seconds for a full day
    this.t = startPhase * cycle;   // start in the morning
    this.phase = startPhase;
    this._top = new THREE.Color();
    this._bot = new THREE.Color();
    this._fog = new THREE.Color();
    this._sun = new THREE.Color();
    this._hs = new THREE.Color();
    this._hg = new THREE.Color();
    this._amb = new THREE.Color();
    this.skyTime = 0;       // monotonic clock for cloud drift
    this.apply(0);
  }

  reset(startPhase = 0.26) { this.t = startPhase * this.cycle; this.apply(0); }

  label() {
    const p = this.phase;
    if (p >= 0.14 && p < 0.25) return 'DAWN';
    if (p >= 0.25 && p < 0.62) return 'DAY';
    if (p >= 0.62 && p < 0.75) return 'DUSK';
    return 'NIGHT';
  }
  isNight() { const l = this.label(); return l === 'NIGHT'; }

  update(dt) { this.t = (this.t + dt) % this.cycle; this.skyTime += dt; this.apply(dt); }

  apply() {
    const phase = this.t / this.cycle;
    this.phase = phase;

    // find surrounding keyframes
    let a = STOPS[0], b = STOPS[1];
    for (let i = 0; i < STOPS.length - 1; i++) {
      if (phase >= STOPS[i].p && phase < STOPS[i + 1].p) { a = STOPS[i]; b = STOPS[i + 1]; break; }
    }
    const tt = (phase - a.p) / (b.p - a.p || 1);
    const lerp = (x, y) => x + (y - x) * tt;

    const r = this.renderer;
    r.skyUniforms.top.value.copy(this._top.copy(a.skyTop).lerp(b.skyTop, tt));
    r.skyUniforms.bottom.value.copy(this._bot.copy(a.skyBot).lerp(b.skyBot, tt));

    r.scene.fog.color.copy(this._fog.copy(a.fog).lerp(b.fog, tt));
    r.scene.fog.near = lerp(a.near, b.near);
    r.scene.fog.far = lerp(a.far, b.far);
    r.renderer.setClearColor(r.scene.fog.color);

    r.sun.color.copy(this._sun.copy(a.sun).lerp(b.sun, tt));
    r.sun.intensity = lerp(a.sunI, b.sunI);
    // celestial arc: sun high at noon, a low "moon" through the night
    const ang = (phase - 0.25) * Math.PI * 2;
    const elevSin = Math.sin(ang);
    const elev01 = Math.max(0, elevSin);
    r.sun.position.set(Math.cos(ang) * 70, 18 + elev01 * 80, 40);

    // drive the sky shader: sun direction/colour, day-amount and cloud clock
    const su = r.skyUniforms;
    su.sunDir.value.set(r.sun.position.x, r.sun.position.y, r.sun.position.z).normalize();
    su.sunColor.value.copy(r.sun.color);
    su.dayAmount.value = Math.min(1, Math.max(0, elevSin * 1.3 + 0.22));
    su.time.value = this.skyTime;

    r.hemi.color.copy(this._hs.copy(a.hemiSky).lerp(b.hemiSky, tt));
    r.hemi.groundColor.copy(this._hg.copy(a.hemiGnd).lerp(b.hemiGnd, tt));
    r.hemi.intensity = lerp(a.hemiI, b.hemiI);

    r.ambient.color.copy(this._amb.copy(a.amb).lerp(b.amb, tt));
    r.ambient.intensity = lerp(a.ambI, b.ambI);
  }
}
