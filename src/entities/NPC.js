import { Entity } from './Entity.js';
import { SpriteBillboard } from '../rendering/Billboard.js';
import { NPC_SIZE } from '../config/constants.js';

// Peaceful survivor near spawn. Billboarded with the friendly sheet, wanders
// near a home point and flees from approaching zombies. Uses the shared default
// NPC height (NPC_SIZE) with the feet offset so they rest on the ground.
export class NPC extends Entity {
  constructor(ctx, sheet, home) {
    super(ctx);
    this.radius = 0.4;
    this.home = home;
    this.pos.set(home.x, 0, home.z);
    this.height = NPC_SIZE.PEACEFUL_HEIGHT;
    this.yCenter = this.height / 2 - NPC_SIZE.FEET_FRAC * this.height;   // feet on the ground
    this.billboard = new SpriteBillboard(sheet, { width: this.height * NPC_SIZE.ASPECT, height: this.height, color: 0xffffff, animFps: 6 });
    this.billboard.mesh.position.set(home.x, this.yCenter, home.z);
    ctx.scene.add(this.billboard.mesh);
    this.facing = 0;
    this.wanderT = 0;
    this.target = { x: home.x, z: home.z };
  }

  update(dt) {
    const cam = this.ctx.renderer.camera;
    // nearest zombie
    let near = null, nd = 99;
    for (const z of this.ctx.zombies.active) {
      if (!z.alive) continue;
      const d = Math.hypot(z.pos.x - this.pos.x, z.pos.z - this.pos.z);
      if (d < nd) { nd = d; near = z; }
    }
    let dvx = 0, dvz = 0, speed = 0;
    if (near && nd < 11) {                      // flee
      const dx = this.pos.x - near.pos.x, dz = this.pos.z - near.pos.z;
      const l = Math.hypot(dx, dz) || 1; dvx = dx / l; dvz = dz / l; speed = 4.5;
    } else {                                    // idle wander near home
      this.wanderT -= dt;
      if (this.wanderT <= 0) {
        this.wanderT = 2 + Math.random() * 3;
        const a = Math.random() * Math.PI * 2, r = Math.random() * 5;
        this.target.x = this.home.x + Math.cos(a) * r;
        this.target.z = this.home.z + Math.sin(a) * r;
      }
      const dx = this.target.x - this.pos.x, dz = this.target.z - this.pos.z;
      const l = Math.hypot(dx, dz);
      if (l > 0.4) { dvx = dx / l; dvz = dz / l; speed = 1.4; }
    }
    this.pos.x += dvx * speed * dt;
    this.pos.z += dvz * speed * dt;
    this.ctx.collision.resolveCircle(this.pos, this.radius);
    const moving = speed > 0.1 && (dvx || dvz);
    if (moving) this.facing = Math.atan2(dvx, dvz);
    this.billboard.mesh.position.set(this.pos.x, this.yCenter, this.pos.z);
    this.billboard.update(cam, this.billboard.mesh.position, this.facing, moving, dt);
  }
}
