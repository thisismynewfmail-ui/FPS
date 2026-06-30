import { Zombie } from './Zombie.js';
import { ZOMBIE_TYPES } from './ZombieTypes.js';
import { COMBAT } from '../config/constants.js';

// Owns the live horde with per-type object pooling (no GC churn from spawning
// thousands of zombies over a 250k-kill run). Routes gunshot sounds to nearby
// zombies and recycles corpses once their death animation finishes.
export class ZombieManager {
  constructor(ctx) {
    this.ctx = ctx;
    this.active = [];
    this.pools = { walker: [], sprinter: [], tank: [] };
    ctx.events.on('gunshot', (e) => this._onGunshot(e));
  }

  get count() { return this.active.length; }
  livingCount() { let n = 0; for (const z of this.active) if (z.alive) n++; return n; }

  canSpawn() { return this.active.length < COMBAT.MAX_ACTIVE_ZOMBIES; }

  spawn(typeKey, x, z) {
    if (!this.canSpawn()) return null;
    const type = ZOMBIE_TYPES[typeKey];
    let z0 = this.pools[typeKey].pop();
    if (!z0) {
      const sheet = this.ctx.assets.sheet(type.sheet);
      z0 = new Zombie(this.ctx, sheet, type);
    } else {
      z0.reset(type);
    }
    z0.spawn(x, z);
    this.ctx.scene.add(z0.billboard.mesh);
    this.active.push(z0);
    return z0;
  }

  _despawn(z, i) {
    this.ctx.scene.remove(z.billboard.mesh);
    this.pools[z.type.key].push(z);
    const last = this.active.length - 1;
    this.active[i] = this.active[last];
    this.active.pop();
  }

  _onGunshot(e) {
    const r2 = e.radius * e.radius;
    for (const z of this.active) {
      if (!z.alive) continue;
      const dx = z.pos.x - e.x, dz = z.pos.z - e.z;
      if (dx * dx + dz * dz <= r2) z.onHearSound(e.x, e.z);
    }
  }

  update(dt) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const z = this.active[i];
      z.update(dt);
      if (z.dying && z.billboard.isDeathDone()) this._despawn(z, i);
    }
  }

  clear() {
    for (const z of this.active) this.ctx.scene.remove(z.billboard.mesh);
    for (const z of this.active) this.pools[z.type.key].push(z);
    this.active.length = 0;
  }
}
