import * as THREE from 'three';
import { Entity } from './Entity.js';
import { PLAYER } from '../config/constants.js';
import { clamp } from '../engine/util.js';

// First-person player controller: mouse-look, WASD with acceleration/friction,
// sprint, crouch, jump+gravity, wall-sliding collision (no clipping), head-bob,
// surface-aware footsteps and health with out-of-combat regen.
export class Player extends Entity {
  constructor(ctx) {
    super(ctx);
    this.radius = PLAYER.RADIUS;
    this.yaw = Math.PI;        // face -Z initially (toward map centre)
    this.pitch = 0;
    this.vy = 0;
    this.grounded = true;
    this.crouching = false;
    this.eye = PLAYER.EYE_HEIGHT;
    this.health = PLAYER.MAX_HEALTH;
    this.lastDamage = -999;
    this.bobPhase = 0;
    this.bob = { x: 0, y: 0 };
    this.stepTimer = 0;
    this.alive = true;

    const s = ctx.world.playerStart;
    this.pos.set(s.x, 0, s.z);
  }

  look(dx, dy) {
    this.yaw -= dx * PLAYER.MOUSE_SENS;
    this.pitch -= dy * PLAYER.MOUSE_SENS;
    this.pitch = clamp(this.pitch, -Math.PI / 2 + 0.05, Math.PI / 2 - 0.05);
  }

  forwardVec(out) { out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); return out; }
  rightVec(out) { out.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw)); return out; }

  takeDamage(amount) {
    if (!this.alive) return;
    this.health -= amount;
    this.lastDamage = performance.now() / 1000;
    this.ctx.hud.damageFlash(clamp(amount / 30, 0.25, 0.9));
    this.ctx.effects.addShake(clamp(amount / 40, 0.1, 0.5));
    this.ctx.audio.hurt();
    if (this.health <= 0) { this.health = 0; this.die(); }
  }

  heal(amount) { this.health = Math.min(PLAYER.MAX_HEALTH, this.health + amount); }

  die() {
    this.alive = false;
    this.ctx.events.emit('player:death');
  }

  update(dt) {
    const input = this.ctx.input;
    if (input.locked && input.enabled) this.look(input.mouseDX, input.mouseDY);

    const f = new THREE.Vector3(), r = new THREE.Vector3();
    this.forwardVec(f); this.rightVec(r);

    let wx = 0, wz = 0;
    if (input.isDown('KeyW')) { wx += f.x; wz += f.z; }
    if (input.isDown('KeyS')) { wx -= f.x; wz -= f.z; }
    if (input.isDown('KeyD')) { wx += r.x; wz += r.z; }
    if (input.isDown('KeyA')) { wx -= r.x; wz -= r.z; }
    const wlen = Math.hypot(wx, wz);
    if (wlen > 0) { wx /= wlen; wz /= wlen; }

    this.crouching = input.isDown('ControlLeft') || input.isDown('KeyC');
    const sprinting = input.isDown('ShiftLeft') && !this.crouching && wlen > 0;
    let target = PLAYER.WALK_SPEED;
    if (this.crouching) target = PLAYER.CROUCH_SPEED;
    else if (sprinting) target = PLAYER.SPRINT_SPEED;

    // accelerate / apply friction in XZ
    const desiredVx = wx * target, desiredVz = wz * target;
    if (wlen > 0) {
      this.vel.x += (desiredVx - this.vel.x) * Math.min(1, PLAYER.ACCEL * dt / target);
      this.vel.z += (desiredVz - this.vel.z) * Math.min(1, PLAYER.ACCEL * dt / target);
    } else {
      const fr = Math.max(0, 1 - PLAYER.FRICTION * dt);
      this.vel.x *= fr; this.vel.z *= fr;
    }

    // jump + gravity
    if (this.grounded && input.isDown('Space')) { this.vy = PLAYER.JUMP_SPEED; this.grounded = false; }
    this.vy -= PLAYER.GRAVITY * dt;

    // integrate horizontal with collision
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.ctx.collision.resolveCircle(this.pos, this.radius);

    // integrate vertical
    this.pos.y += this.vy * dt;
    if (this.pos.y <= 0) { this.pos.y = 0; this.vy = 0; this.grounded = true; }

    // crouch eye height
    const targetEye = this.crouching ? PLAYER.CROUCH_HEIGHT : PLAYER.EYE_HEIGHT;
    this.eye += (targetEye - this.eye) * Math.min(1, dt * 12);

    // head bob + footsteps
    const speed = Math.hypot(this.vel.x, this.vel.z);
    if (this.grounded && speed > 0.6) {
      const rate = sprinting ? 11 : 7;
      this.bobPhase += dt * rate;
      const amp = sprinting ? PLAYER.BOB_SPRINT : PLAYER.BOB_WALK;
      this.bob.y = Math.sin(this.bobPhase * 2) * amp;
      this.bob.x = Math.cos(this.bobPhase) * amp * 0.6;
      this.stepTimer -= dt;
      if (this.stepTimer <= 0) {
        this.stepTimer = sprinting ? 0.3 : 0.45;
        this.ctx.audio.footstep(this.ctx.world.surfaceAt(this.pos.x, this.pos.z));
      }
    } else {
      this.bob.x *= 0.85; this.bob.y *= 0.85;
    }

    // No passive regen — health is only restored by health-kit pickups.

    this.applyCamera();
  }

  applyCamera(shake = null) {
    const cam = this.ctx.renderer.camera;
    const r = new THREE.Vector3(); this.rightVec(r);
    let px = this.pos.x + this.bob.x * r.x;
    let pz = this.pos.z + this.bob.x * r.z;
    let py = this.pos.y + this.eye + this.bob.y;
    let roll = 0;
    if (shake) { px += shake.x; py += shake.y; roll = shake.roll; }
    cam.position.set(px, py, pz);
    cam.rotation.set(this.pitch, this.yaw, roll);
  }
}
