import * as THREE from 'three';
import { Entity } from './Entity.js';
import { SpriteBillboard } from '../rendering/Billboard.js';
import { COMBAT, WORLD } from '../config/constants.js';

// A single zombie. Billboarded sprite + AI state machine:
// idle -> wander -> alert (heard a shot) -> chase (sees player) -> attack -> dead.
// Movement blends a flow-field direction toward the player with separation from
// neighbours so a horde flows around walls without stacking.
const _sep = new THREE.Vector3();
const _dir = { x: 0, z: 0 };

export class Zombie extends Entity {
  constructor(ctx, sheet, type) {
    super(ctx);
    this.type = type;
    this.height = type.height;
    this.hitRadius = type.hitRadius;
    this.radius = type.radius;
    this.points = type.points;
    this.billboard = new SpriteBillboard(sheet, {
      width: type.width, height: type.height, color: type.color, animFps: type.animFps,
    });
    this.state = 'idle';
    this.facing = 0;
    this.reset(type);
  }

  reset(type) {
    this.type = type;
    this.hp = type.hp;
    this.alive = true;
    this.dying = false;
    this.state = 'idle';
    this.vel.set(0, 0, 0);
    this.attackCD = 0;
    this.alertTimer = 0;
    this.wanderT = 0;
    this.wander = { x: 0, z: 0 };
    this.thinkT = Math.random() * 0.3;
    this.billboard.reset();
  }

  spawn(x, z) {
    this.pos.set(x, 0, z);
    this.billboard.mesh.position.set(x, this.height / 2, z);
    this.billboard.mesh.visible = true;
  }

  onHearSound(x, z) {
    if (!this.alive) return;
    this.alertTimer = 7;
    this.wander.x = x; this.wander.z = z;     // reuse as last-known target
    if (this.state === 'idle' || this.state === 'wander') this.state = 'alert';
  }

  applyKnockback(dir, amount) {
    const k = amount * this.type.knockResist;
    this.vel.x += dir.x * k;
    this.vel.z += dir.z * k;
  }

  takeDamage(dmg) {
    if (!this.alive) return;
    this.hp -= dmg;
    this.billboard.flash();
    this.alertTimer = 7;
    if (this.state === 'idle' || this.state === 'wander') this.state = 'chase';
    if (this.hp <= 0) this.die();
  }

  die() {
    if (this.dying) return;
    this.alive = false; this.dying = true;
    this.state = 'dead';
    this.billboard.startDeath(this.facing);
    this.ctx.audio.zombieDeath();
    this.ctx.events.emit('zombie:death', {
      type: this.type.key, points: this.points, x: this.pos.x, z: this.pos.z,
    });
  }

  _canSeePlayer(dist) {
    if (dist > COMBAT.ZOMBIE_SIGHT_RANGE) return false;
    return this.ctx.collision.segmentClear(this.pos.x, this.pos.z, this.ctx.player.pos.x, this.ctx.player.pos.z);
  }

  update(dt) {
    const cam = this.ctx.renderer.camera;
    if (this.dying) {
      this.billboard.update(cam, this.pos, this.facing, false, dt);
      return;
    }

    const player = this.ctx.player;
    const dx = player.pos.x - this.pos.x, dz = player.pos.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    const far = dist > 95;

    if (this.alertTimer > 0) this.alertTimer -= dt;

    // --- decide state ---
    this.thinkT -= dt;
    if (this.thinkT <= 0) {
      this.thinkT = 0.2 + Math.random() * 0.2;
      if (player.alive && this._canSeePlayer(dist)) {
        this.state = (dist <= this.type.attackRange) ? 'attack' : 'chase';
        this.alertTimer = 7;
      } else if (this.alertTimer > 0) {
        this.state = 'alert';
      } else if (this.state === 'chase' || this.state === 'attack' || this.state === 'alert') {
        this.state = 'wander';
      } else if (this.state === 'idle' && Math.random() < 0.3) {
        this.state = 'wander';
      }
    }
    if (this.state === 'attack' && dist > this.type.attackRange * 1.15) this.state = 'chase';
    if (this.state === 'chase' && dist <= this.type.attackRange) this.state = 'attack';

    // --- desired movement direction + speed ---
    let dvx = 0, dvz = 0, speed = 0, moving = false;
    if (this.state === 'chase' || this.state === 'alert') {
      this.ctx.nav.directionAt(this.pos.x, this.pos.z, player.pos.x, player.pos.z, _dir);
      dvx = _dir.x; dvz = _dir.z; speed = this.type.speed; moving = true;
    } else if (this.state === 'attack') {
      const l = dist || 1; dvx = dx / l; dvz = dz / l; speed = 0; moving = false;
      this._doAttack(dt, dist);
    } else if (this.state === 'wander') {
      this.wanderT -= dt;
      if (this.wanderT <= 0) {
        this.wanderT = 1.5 + Math.random() * 2.5;
        const a = Math.random() * Math.PI * 2;
        this.wander.x = this.pos.x + Math.cos(a) * 6;
        this.wander.z = this.pos.z + Math.sin(a) * 6;
      }
      const wx = this.wander.x - this.pos.x, wz = this.wander.z - this.pos.z;
      const wl = Math.hypot(wx, wz) || 1;
      dvx = wx / wl; dvz = wz / wl; speed = this.type.speed * 0.4; moving = wl > 0.5;
    }

    // --- separation from neighbours (skip for far zombies to save cost) ---
    if (!far && (moving || this.state === 'attack')) {
      this._separate(_sep);
      dvx += _sep.x; dvz += _sep.z;
      const dl = Math.hypot(dvx, dvz) || 1;
      dvx /= dl; dvz /= dl;
    }

    // --- integrate ---
    const targetVx = dvx * speed, targetVz = dvz * speed;
    const smooth = Math.min(1, dt * 8);
    this.vel.x += (targetVx - this.vel.x) * smooth;
    this.vel.z += (targetVz - this.vel.z) * smooth;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.ctx.collision.resolveCircle(this.pos, this.radius);

    const sp = Math.hypot(this.vel.x, this.vel.z);
    if (sp > 0.15) this.facing = Math.atan2(this.vel.x, this.vel.z);

    this.billboard.mesh.position.set(this.pos.x, this.height / 2, this.pos.z);
    if (!far) {
      this.billboard.update(cam, this.billboard.mesh.position, this.facing, sp > 0.3, dt);
    } else {
      // cheap: keep facing camera, idle frame, skip directional/anim work
      this.billboard.mesh.rotation.set(0, Math.atan2(cam.position.x - this.pos.x, cam.position.z - this.pos.z), 0);
    }
  }

  _doAttack(dt, dist) {
    this.attackCD -= dt;
    if (this.attackCD <= 0 && dist <= this.type.attackRange + 0.2 && this.ctx.player.alive) {
      this.attackCD = this.type.attackRate;
      this.ctx.player.takeDamage(this.type.damage);
      this.billboard.flash();
    }
  }

  _separate(out) {
    out.set(0, 0, 0);
    const list = this.ctx.zombies.active;
    let n = 0;
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      if (o === this || !o.alive) continue;
      const dx = this.pos.x - o.pos.x, dz = this.pos.z - o.pos.z;
      const d2 = dx * dx + dz * dz;
      const rr = this.radius + o.radius + 0.25;
      if (d2 < rr * rr && d2 > 1e-5) {
        const d = Math.sqrt(d2);
        out.x += (dx / d) * (rr - d);
        out.z += (dz / d) * (rr - d);
        if (++n > 6) break;          // cap influence for cost
      }
    }
    const l = Math.hypot(out.x, out.z);
    if (l > 1) { out.x /= l; out.z /= l; }   // normalize to steering weight
    out.multiplyScalar(0.9);
  }
}
