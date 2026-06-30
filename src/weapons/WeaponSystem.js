import * as THREE from 'three';
import { WEAPON_DEFS } from './WeaponDefs.js';
import { COMBAT } from '../config/constants.js';

const LOUDNESS = { pistol: 1.0, shotgun: 1.45, rifle: 1.1, sniper: 1.6, bat: 0 };

// Owns the five weapons, ammo state, firing (hitscan vs zombies), reload, weapon
// switching and the sniper scope. Reads input, drives HUD / WeaponView / audio.
export class WeaponSystem {
  constructor(ctx) {
    this.ctx = ctx;
    this.slots = WEAPON_DEFS.map((def) => ({
      def, mag: def.mag === Infinity ? Infinity : def.mag, reserve: def.reserve,
    }));
    this.index = 0;
    this.cooldown = 0;
    this.reloading = false;
    this.reloadT = 0;
    this.switchT = 0;
    this.zoomed = false;

    this._origin = new THREE.Vector3();
    this._dir = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._up = new THREE.Vector3();
    this._tmp = new THREE.Vector3();

    ctx.hud.buildWeaponBar(WEAPON_DEFS.map((d) => ({ icon: d.icon })));
    this._equip(0, true);
  }

  get current() { return this.slots[this.index]; }

  reset() {
    this.slots = WEAPON_DEFS.map((def) => ({
      def, mag: def.mag === Infinity ? Infinity : def.mag, reserve: def.reserve,
    }));
    this.cooldown = 0; this.reloading = false; this.reloadT = 0; this.switchT = 0;
    this._setZoom(false);
    this.ctx.renderer.setFOV(this.ctx.renderer.baseFOV);
    this._equip(0, true);
  }

  _equip(i, instant = false) {
    if (i < 0 || i >= this.slots.length) return;
    if (i === this.index && !instant) return;
    this.index = i;
    this.reloading = false; this.reloadT = 0;
    this.switchT = instant ? 0 : 0.25;
    this.cooldown = Math.max(this.cooldown, this.switchT);
    this._setZoom(false);
    const def = this.current.def;
    this.ctx.weaponView.setWeapon(def.view);
    this.ctx.hud.setWeapon(i, def.name, !instant);   // show the picker only on a real switch
    if (!instant) this.ctx.audio.switchWeapon();
    this._refreshAmmoHUD();
  }

  _refreshAmmoHUD() {
    const s = this.current;
    this.ctx.hud.setAmmo(s.mag === Infinity ? 0 : s.mag, s.reserve === Infinity ? 0 : s.reserve, s.def.melee);
  }

  _setZoom(on) {
    const def = this.current.def;
    const want = on && !!def.zoomFOV && !this.reloading;
    if (want === this.zoomed) return;
    this.zoomed = want;
    this.ctx.renderer.setFOV(want ? def.zoomFOV : this.ctx.renderer.baseFOV);
    this.ctx.hud.showScope(want);
  }

  startReload() {
    const s = this.current, def = s.def;
    if (def.melee || this.reloading) return;
    if (s.mag >= def.mag || s.reserve <= 0) return;
    this.reloading = true; this.reloadT = def.reload;
    this._setZoom(false);
    this.ctx.weaponView.startReload(def.reload);
    this.ctx.audio.reload(def.id);
    this.ctx.hud.toastMsg('RELOADING…', def.reload);
  }

  _finishReload() {
    const s = this.current, def = s.def;
    const need = def.mag - s.mag;
    const take = Math.min(need, s.reserve);
    s.mag += take; s.reserve -= take;
    this.reloading = false;
    this._refreshAmmoHUD();
  }

  addAmmo(ammoType, amount) {
    let added = false;
    for (const s of this.slots) {
      if (s.def.ammoType === ammoType && s.reserve < s.def.maxReserve) {
        s.reserve = Math.min(s.def.maxReserve, s.reserve + amount);
        added = true;
      }
    }
    if (added) this._refreshAmmoHUD();
    return added;
  }

  update(dt) {
    const input = this.ctx.input;
    if (this.cooldown > 0) this.cooldown -= dt;
    if (this.switchT > 0) this.switchT -= dt;

    // weapon select 1..5
    for (let k = 0; k < this.slots.length; k++) {
      if (input.pressed('Digit' + (k + 1))) this._equip(k);
    }
    if (input.wheel !== 0) {
      let i = (this.index + (input.wheel > 0 ? 1 : -1) + this.slots.length) % this.slots.length;
      this._equip(i);
    }

    // reload
    if (input.pressed('KeyR')) this.startReload();
    if (this.reloading) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) this._finishReload();
    }

    // sniper scope on right mouse
    this._setZoom(input.mouseDown(2));

    // firing
    const def = this.current.def;
    const wantFire = def.auto ? input.mouseDown(0) : input.mouseClicked(0);
    if (wantFire && this.cooldown <= 0 && !this.reloading && this.switchT <= 0) this._fire();

    this.ctx.weaponView.setBob(this.ctx.player.bob.x, Math.abs(this.ctx.player.bob.y));
    this.ctx.weaponView.update(dt);
  }

  _fire() {
    const s = this.current, def = s.def;
    if (s.mag <= 0 && !def.melee) {
      this.ctx.audio.empty();
      this.ctx.hud.toastMsg('OUT OF AMMO — PRESS R', 0.8);
      this.cooldown = 0.3;
      this.startReload();
      return;
    }
    if (!def.melee) s.mag -= 1;
    this.cooldown = def.fireRate;

    this.ctx.weaponView.kick(def.recoil);
    if (!def.melee) this.ctx.weaponView.showFlash();
    this.ctx.audio.shot(def.id);
    this.ctx.effects.addShake(0.08 + def.recoil * 0.06);
    this._addRecoil(def.recoil);

    // alert zombies via sound
    if (LOUDNESS[def.id] > 0) {
      this.ctx.events.emit('gunshot', {
        x: this.ctx.player.pos.x, z: this.ctx.player.pos.z,
        radius: COMBAT.ZOMBIE_HEAR_RADIUS * LOUDNESS[def.id],
      });
    }

    let hitAny = false;
    if (def.melee) hitAny = this._melee(def);
    else {
      const cam = this.ctx.renderer.camera;
      this._origin.copy(cam.position);
      for (let p = 0; p < def.pellets; p++) {
        if (this._fireRay(def)) hitAny = true;
      }
    }
    this.ctx.score.recordShot(hitAny);
    this._refreshAmmoHUD();
  }

  _addRecoil(amount) {
    // small upward kick on the view
    this.ctx.player.pitch = Math.min(Math.PI / 2 - 0.05, this.ctx.player.pitch + amount * 0.012);
    this.ctx.player.yaw += (Math.random() - 0.5) * amount * 0.006;
  }

  _fireRay(def) {
    const cam = this.ctx.renderer.camera;
    cam.getWorldDirection(this._dir);
    this._right.crossVectors(this._dir, cam.up).normalize();
    this._up.crossVectors(this._right, this._dir).normalize();
    if (def.spread > 0) {
      const a = (Math.random() - 0.5) * def.spread * 2;
      const b = (Math.random() - 0.5) * def.spread * 2;
      this._dir.addScaledVector(this._right, a).addScaledVector(this._up, b).normalize();
    }
    return this._hitscan(def.range, def.damage, def.knock);
  }

  // ray vs vertical-cylinder zombies; nearest unobstructed hit takes damage
  _hitscan(range, damage, knock) {
    const zlist = this.ctx.zombies.active;
    let best = null, bestT = range;
    for (let i = 0; i < zlist.length; i++) {
      const z = zlist[i];
      if (!z.alive || z.dying) continue;
      const cx = z.pos.x, cy = z.pos.y + z.height * 0.5, cz = z.pos.z;
      this._tmp.set(cx - this._origin.x, cy - this._origin.y, cz - this._origin.z);
      const t = this._tmp.dot(this._dir);
      if (t < 0 || t > bestT) continue;
      const px = this._origin.x + this._dir.x * t;
      const py = this._origin.y + this._dir.y * t;
      const pz = this._origin.z + this._dir.z * t;
      const perp = Math.hypot(px - cx, py - cy, pz - cz);
      if (perp > z.hitRadius) continue;
      if (!this.ctx.collision.segmentClear(this._origin.x, this._origin.z, cx, cz)) continue;
      best = z; bestT = t;
      this._hitPoint = { x: px, y: py, z: pz };
    }
    if (best) {
      this.ctx.effects.spawnBlood(this._hitPoint, this._dir, 12);
      best.applyKnockback(this._dir, knock);
      best.takeDamage(damage, this._dir);
      return true;
    }
    return false;
  }

  _melee(def) {
    const cam = this.ctx.renderer.camera;
    cam.getWorldDirection(this._dir);
    const zlist = this.ctx.zombies.active;
    let hit = false;
    for (let i = 0; i < zlist.length; i++) {
      const z = zlist[i];
      if (!z.alive || z.dying) continue;
      const dx = z.pos.x - this.ctx.player.pos.x;
      const dz = z.pos.z - this.ctx.player.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > def.range + z.radius) continue;
      const dot = (dx * this._dir.x + dz * this._dir.z) / (dist || 1);
      if (dot < 0.4) continue;                          // must be roughly in front
      this._dir.y = 0;
      z.applyKnockback({ x: dx / dist, z: dz / dist }, def.knock);
      z.takeDamage(def.damage, { x: dx / dist, z: dz / dist });
      this.ctx.effects.spawnBlood({ x: z.pos.x, y: z.pos.y + z.height * 0.5, z: z.pos.z }, null, 10);
      hit = true;
    }
    return hit;
  }
}
