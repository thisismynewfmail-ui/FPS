import * as THREE from 'three';
import { WORLD } from '../config/constants.js';
import { makeRNG, rand, randInt, pick } from '../engine/util.js';

// Seeded procedural open world: central urban ruins (enterable office rooms),
// roads, a forest fringe, an open field, plus debris/cars/cover. Static geometry
// uses standard textured polygons (never billboards). Every solid surface also
// registers an AABB with the Collision system and is reflected in the nav grid.
export class World {
  constructor(scene, assets, collision) {
    this.scene = scene;
    this.assets = assets;
    this.collision = collision;
    this.rng = makeRNG(WORLD.SEED);
    this.matCache = new Map();
    this.bound = WORLD.SIZE;
    this.playerStart = { x: 0, z: 0 };       // open road intersection at map centre
    this.spawnClear = 22;                     // keep this radius around spawn empty
    this.buildings = [];     // {x,z,w,d} for spawn avoidance
    this.surfaceAt = () => 'grass';   // refined below via road list
    this._roads = [];
  }

  _texTiled(name, rx, ry) {
    const key = `${name}:${rx}:${ry}`;
    if (this.matCache.has(key)) return this.matCache.get(key);
    const base = this.assets.tex(name);
    const t = base.clone();
    t.needsUpdate = true;
    t.repeat.set(rx, ry);
    const m = new THREE.MeshLambertMaterial({ map: t });
    this.matCache.set(key, m);
    return m;
  }

  _colorMat(hex) {
    const key = `c:${hex}`;
    if (this.matCache.has(key)) return this.matCache.get(key);
    const m = new THREE.MeshLambertMaterial({ color: hex });
    this.matCache.set(key, m);
    return m;
  }

  _box(cx, cz, sx, sz, h, mat, { y = 0, collide = true } = {}) {
    const geo = new THREE.BoxGeometry(sx, h, sz);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(cx, y + h / 2, cz);
    this.scene.add(mesh);
    if (collide) this.collision.addBox(cx - sx / 2, cx + sx / 2, cz - sz / 2, cz + sz / 2);
    return mesh;
  }

  build() {
    this._ground();
    this._roads_();
    this._perimeter();
    this._urban();
    this._ruins();
    this._forest();
    this._props();
    return this;
  }

  _ground() {
    const S = this.bound * 2;
    const geo = new THREE.PlaneGeometry(S, S);
    geo.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geo, this._texTiled('grass', S / 4, S / 4));
    mesh.position.y = 0;
    this.scene.add(mesh);
  }

  _roads_() {
    // a cross of roads through the centre + one ring road
    const w = 9;
    const lay = (cx, cz, sx, sz) => {
      const geo = new THREE.PlaneGeometry(sx, sz);
      geo.rotateX(-Math.PI / 2);
      const mesh = new THREE.Mesh(geo, this._texTiled('road', sx / 4, sz / 4));
      mesh.position.set(cx, 0.02, cz);
      this.scene.add(mesh);
      this._roads.push({ minX: cx - sx / 2, maxX: cx + sx / 2, minZ: cz - sz / 2, maxZ: cz + sz / 2 });
    };
    lay(0, 0, w, this.bound * 2);
    lay(0, 0, this.bound * 2, w);
    lay(0, -70, 150, w);
    lay(0, 70, 150, w);
    this.surfaceAt = (x, z) => {
      for (const r of this._roads) if (x > r.minX && x < r.maxX && z > r.minZ && z < r.maxZ) return 'concrete';
      return 'grass';
    };
  }

  _perimeter() {
    const B = this.bound, h = 6, t = 2;
    const brick = this._texTiled('brick', (B * 2) / 4, h / 2);
    this._box(0, -B, B * 2, t, h, brick);
    this._box(0, B, B * 2, t, h, brick);
    this._box(-B, 0, t, B * 2, h, brick);
    this._box(B, 0, t, B * 2, h, brick);
  }

  // build a wall run, optionally leaving a centred doorway gap
  _wall(cx, cz, len, horizontal, h, mat, doorGap = 0) {
    const t = 0.4;
    if (doorGap <= 0) {
      if (horizontal) this._box(cx, cz, len, t, h, this._wallMat(mat, len, h));
      else this._box(cx, cz, t, len, h, this._wallMat(mat, len, h));
      return;
    }
    const seg = (len - doorGap) / 2;
    if (seg <= 0.2) { // door too wide, just make solid
      this._wall(cx, cz, len, horizontal, h, mat, 0); return;
    }
    if (horizontal) {
      this._box(cx - (doorGap / 2 + seg / 2), cz, seg, t, h, this._wallMat(mat, seg, h));
      this._box(cx + (doorGap / 2 + seg / 2), cz, seg, t, h, this._wallMat(mat, seg, h));
    } else {
      this._box(cx, cz - (doorGap / 2 + seg / 2), t, seg, h, this._wallMat(mat, seg, h));
      this._box(cx, cz + (doorGap / 2 + seg / 2), t, seg, h, this._wallMat(mat, seg, h));
    }
  }

  _wallMat(name, len, h) {
    return this._texTiled(name, Math.max(1, Math.round(len / 3)), Math.max(1, Math.round(h / 3)));
  }

  _urban() {
    const rng = this.rng;
    const placed = [];
    const tries = 60;
    let count = 0, target = 16;
    for (let i = 0; i < tries && count < target; i++) {
      const w = rand(rng, 9, 17), d = rand(rng, 9, 17), h = 4;
      const x = rand(rng, -95, 95), z = rand(rng, -95, 95);
      // keep the building's whole footprint clear of the spawn area
      const sx = this.playerStart.x, sz = this.playerStart.z, m = this.spawnClear;
      if (Math.abs(x - sx) < w / 2 + m && Math.abs(z - sz) < d / 2 + m) continue;
      let ok = true;
      for (const b of placed) {
        if (Math.abs(x - b.x) < (w + b.w) / 2 + 5 && Math.abs(z - b.z) < (d + b.d) / 2 + 5) { ok = false; break; }
      }
      if (!ok) continue;
      placed.push({ x, z, w, d });
      this.buildings.push({ x, z, w, d });
      this._room(x, z, w, d, h);
      count++;
    }
  }

  _room(x, z, w, d, h) {
    const door = 3;
    const side = randInt(this.rng, 0, 3);
    // four office walls with a doorway on one side
    this._wall(x, z - d / 2, w, true, h, 'office', side === 0 ? door : 0);
    this._wall(x, z + d / 2, w, true, h, 'office', side === 1 ? door : 0);
    this._wall(x - w / 2, z, d, false, h, 'office', side === 2 ? door : 0);
    this._wall(x + w / 2, z, d, false, h, 'office', side === 3 ? door : 0);
    // concrete floor + ceiling tiles
    const fgeo = new THREE.PlaneGeometry(w, d); fgeo.rotateX(-Math.PI / 2);
    const floor = new THREE.Mesh(fgeo, this._texTiled('concrete', w / 3, d / 3));
    floor.position.set(x, 0.04, z); this.scene.add(floor);
    const cgeo = new THREE.PlaneGeometry(w, d); cgeo.rotateX(Math.PI / 2);
    const ceil = new THREE.Mesh(cgeo, this._texTiled('ceiling', w / 4, d / 4));
    ceil.position.set(x, h, z); this.scene.add(ceil);
  }

  _ruins() {
    const rng = this.rng;
    for (let i = 0; i < 22; i++) {
      const x = rand(rng, -150, 150), z = rand(rng, -150, 150);
      if (Math.hypot(x, z) < this.spawnClear) continue;
      const len = rand(rng, 4, 11), h = rand(rng, 2, 3.4);
      const horiz = rng() > 0.5;
      this._wall(x, z, len, horiz, h, 'brick', rng() > 0.6 ? 2 : 0);
    }
  }

  _forest() {
    const rng = this.rng;
    const trunkMat = this._colorMat(0x5a3d24);
    const leafMat = this._colorMat(0x2f5a30);
    const leafMat2 = this._colorMat(0x3b6e38);
    for (let i = 0; i < 150; i++) {
      // bias trees toward the outer field/forest fringe
      let x = rand(rng, -190, 190), z = rand(rng, -190, 190);
      if (Math.hypot(x, z) < this.spawnClear) continue;       // keep spawn clear
      if (Math.hypot(x, z) < 100 && rng() < 0.8) continue;
      if (Math.abs(x) < 7 || Math.abs(z) < 7) continue;       // keep roads clear
      const th = rand(rng, 3.5, 6);
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, th, 6), trunkMat);
      trunk.position.set(x, th / 2, z); this.scene.add(trunk);
      const fr = rand(rng, 1.6, 2.6);
      const foliage = new THREE.Mesh(new THREE.ConeGeometry(fr, th * 0.9, 7), rng() > 0.5 ? leafMat : leafMat2);
      foliage.position.set(x, th + th * 0.2, z); this.scene.add(foliage);
      this.collision.addBox(x - 0.4, x + 0.4, z - 0.4, z + 0.4);
    }
  }

  _props() {
    const rng = this.rng;
    // wooden crates (cover) — crate texture
    for (let i = 0; i < 40; i++) {
      const x = rand(rng, -160, 160), z = rand(rng, -160, 160);
      if (Math.hypot(x, z) < this.spawnClear) continue;
      const s = rand(rng, 1, 1.6);
      this._box(x, z, s, s, s, this._texTiled('crate', 1, 1), {});
      if (rng() > 0.6) this._box(x + rand(rng, -0.4, 0.4), z + rand(rng, -0.4, 0.4), s * 0.8, s * 0.8, s * 0.8, this._texTiled('crate', 1, 1), { y: s });
    }
    // abandoned cars — untextured coloured geometry (per spec), with collision
    const bodyColors = [0x7a2b2b, 0x2b3b6a, 0x4a4a4a, 0x6a5a2b, 0x355030];
    for (let i = 0; i < 18; i++) {
      const x = rand(rng, -150, 150), z = rand(rng, -150, 150);
      if (Math.hypot(x, z) < this.spawnClear) continue;
      const rot = rng() > 0.5;
      const cw = rot ? 4.4 : 2.0, cd = rot ? 2.0 : 4.4;
      const col = pick(rng, bodyColors);
      this._box(x, z, cw, cd, 1.1, this._colorMat(col), {});
      this._box(x, z, cw * 0.55, cd * 0.55, 0.8, this._colorMat(0x222428), { y: 1.1, collide: false });
    }
    // metal storage containers
    for (let i = 0; i < 10; i++) {
      const x = rand(rng, -160, 160), z = rand(rng, -160, 160);
      if (Math.hypot(x, z) < this.spawnClear + 2) continue;
      const rot = rng() > 0.5;
      const cw = rot ? 6 : 2.6, cd = rot ? 2.6 : 6;
      this._box(x, z, cw, cd, 2.6, this._texTiled('metal', Math.round(cw / 2), 1), {});
    }
  }

  // find an open point in a ring [minR,maxR] around (cx,cz) for spawning
  randomOpenPoint(rng, cx, cz, minR, maxR, attempts = 24) {
    for (let i = 0; i < attempts; i++) {
      const a = rng() * Math.PI * 2;
      const r = minR + rng() * (maxR - minR);
      const x = cx + Math.cos(a) * r;
      const z = cz + Math.sin(a) * r;
      const lim = this.bound - 3;
      if (x < -lim || x > lim || z < -lim || z > lim) continue;
      if (!this.collision.pointBlocked(x, z, 0.6)) return { x, z };
    }
    return null;
  }
}
