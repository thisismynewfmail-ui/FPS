import * as THREE from 'three';

// Base for every world actor. Keeps logic minimal; subclasses own their meshes.
export class Entity {
  constructor(ctx) {
    this.ctx = ctx;
    this.pos = new THREE.Vector3();   // feet position (y = ground)
    this.vel = new THREE.Vector3();
    this.radius = 0.4;
    this.alive = true;
  }
  update(_dt) {}
  dispose() {}
}
