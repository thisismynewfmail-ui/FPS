import * as THREE from 'three';

// Pooled visual effects: blood particle bursts (single draw call) and screen
// shake trauma. DOM-side effects (muzzle flash, damage vignette) live elsewhere.
const MAX_BLOOD = 600;

export class Effects {
  constructor(scene, bloodTex) {
    this.scene = scene;

    this.positions = new Float32Array(MAX_BLOOD * 3);
    this.vel = new Float32Array(MAX_BLOOD * 3);
    this.life = new Float32Array(MAX_BLOOD);     // remaining seconds
    this.cursor = 0;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    // park all particles far below the world initially
    for (let i = 0; i < MAX_BLOOD; i++) this.positions[i * 3 + 1] = -1000;

    const mat = new THREE.PointsMaterial({
      map: bloodTex, size: 0.16, sizeAttenuation: true,
      transparent: true, alphaTest: 0.35, depthWrite: false,
      color: 0xb01818, fog: true,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);

    this.shake = 0;            // trauma 0..1
    this._shakeT = 0;
  }

  // burst of blood at a world position, biased along `dir` (THREE.Vector3 or null)
  spawnBlood(pos, dir = null, count = 14) {
    for (let i = 0; i < count; i++) {
      const idx = this.cursor;
      this.cursor = (this.cursor + 1) % MAX_BLOOD;
      const p = idx * 3;
      this.positions[p] = pos.x;
      this.positions[p + 1] = pos.y;
      this.positions[p + 2] = pos.z;
      const spread = 2.6;
      let vx = (Math.random() - 0.5) * spread;
      let vy = Math.random() * 3 + 1.5;
      let vz = (Math.random() - 0.5) * spread;
      if (dir) { vx += dir.x * 2.5; vz += dir.z * 2.5; }
      this.vel[p] = vx; this.vel[p + 1] = vy; this.vel[p + 2] = vz;
      this.life[idx] = 0.6 + Math.random() * 0.5;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }

  addShake(amount) { this.shake = Math.min(1, this.shake + amount); }

  update(dt) {
    const pos = this.positions, vel = this.vel, life = this.life;
    let dirty = false;
    for (let i = 0; i < MAX_BLOOD; i++) {
      if (life[i] <= 0) continue;
      life[i] -= dt;
      const p = i * 3;
      vel[p + 1] -= 14 * dt;       // gravity
      pos[p] += vel[p] * dt;
      pos[p + 1] += vel[p + 1] * dt;
      pos[p + 2] += vel[p + 2] * dt;
      if (pos[p + 1] < 0.02) { pos[p + 1] = 0.02; vel[p] *= 0.4; vel[p + 2] *= 0.4; vel[p + 1] = 0; }
      if (life[i] <= 0) pos[p + 1] = -1000;   // retire
      dirty = true;
    }
    if (dirty) this.points.geometry.attributes.position.needsUpdate = true;

    if (this.shake > 0) { this.shake = Math.max(0, this.shake - dt * 1.6); this._shakeT += dt * 40; }
  }

  // returns a small positional + roll offset for the camera
  sampleShake(out) {
    const s = this.shake * this.shake;
    const t = this._shakeT;
    out.x = Math.sin(t * 1.3) * 0.12 * s;
    out.y = Math.cos(t * 1.7) * 0.12 * s;
    out.roll = Math.sin(t * 2.1) * 0.05 * s;
    return out;
  }
}
