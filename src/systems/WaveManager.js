import { makeRNG, rand } from '../engine/util.js';
import { difficulty } from '../config/constants.js';

// Spawns zombies as escalating hordes. Each wave has a spawn budget drip-fed at
// the ring around the player; once spent and the field is nearly clear, a short
// respite drops ammo/health, then the next (bigger, faster, deadlier) wave.
// Composition shifts toward sprinters and tanks as kills approach 250,000.
export class WaveManager {
  constructor(ctx) {
    this.ctx = ctx;
    this.rng = makeRNG(0xBEEF);
    this.reset();
  }

  reset() {
    this.wave = 0;
    this.state = 'respite';
    this.respiteT = 1.0;          // brief lead-in before wave 1
    this.budget = 0;
    this.spawnAcc = 0;
    this.interval = 0.6;
  }

  _startWave() {
    this.wave += 1;
    const d = difficulty(this.ctx.score.kills);
    this.budget = Math.floor(18 + this.wave * 2 + d * 160);
    this.interval = Math.max(0.1, 0.62 - d * 0.45 - this.wave * 0.006);
    this.state = 'spawning';
    this.spawnAcc = 0;
    this.ctx.hud.setWave(this.wave);
    this.ctx.hud.toastMsg('WAVE ' + this.wave, 1.4);
  }

  _pickType() {
    const d = difficulty(this.ctx.score.kills);
    const r = this.rng();
    const pTank = 0.012 + d * 0.06;
    const pSprint = 0.12 + d * 0.34;
    if (r < pTank) return 'tank';
    if (r < pTank + pSprint) return 'sprinter';
    return 'walker';
  }

  _spawnOne() {
    const p = this.ctx.player.pos;
    const pt = this.ctx.world.randomOpenPoint(this.rng, p.x, p.z, 36, 68);
    if (!pt) return false;
    return !!this.ctx.zombies.spawn(this._pickType(), pt.x, pt.z);
  }

  _respiteDrops() {
    const p = this.ctx.player.pos;
    const types = ['pistol', 'shotgun', 'rifle', 'sniper'];
    const drops = 3 + Math.floor(this.rng() * 3);
    for (let i = 0; i < drops; i++) {
      const pt = this.ctx.world.randomOpenPoint(this.rng, p.x, p.z, 6, 26);
      if (!pt) continue;
      this.ctx.pickups.spawnAmmo(types[Math.floor(this.rng() * types.length)], pt.x, pt.z);
    }
    if (this.rng() < 0.85) {
      const pt = this.ctx.world.randomOpenPoint(this.rng, p.x, p.z, 6, 22);
      if (pt) this.ctx.pickups.spawnHealth(pt.x, pt.z, 35);
    }
  }

  update(dt) {
    if (this.state === 'spawning') {
      this.spawnAcc += dt;
      while (this.spawnAcc >= this.interval && this.budget > 0) {
        this.spawnAcc -= this.interval;
        if (this.ctx.zombies.canSpawn()) { if (this._spawnOne()) this.budget -= 1; }
        else break;
      }
      if (this.budget <= 0 && this.ctx.zombies.livingCount() <= 6) {
        this.state = 'respite';
        this.respiteT = 6.5;
        this.ctx.hud.toastMsg('WAVE ' + this.wave + ' CLEARED', 1.6);
        this._respiteDrops();
      }
    } else {
      this.respiteT -= dt;
      if (this.respiteT <= 0) this._startWave();
    }
  }
}
