// Axis-aligned box collision in the XZ plane (all obstacles are full height).
// Entities are circles; resolveCircle pushes them out with sliding so walls feel
// solid and nothing clips through. Also provides segment tests for line-of-sight.
export class Collision {
  constructor(bound) {
    this.boxes = [];          // {minX,maxX,minZ,maxZ}
    this.bound = bound;       // world half-extent
  }

  addBox(minX, maxX, minZ, maxZ) {
    this.boxes.push({ minX, maxX, minZ, maxZ });
  }

  // Resolve a circle of radius r at p={x,z}; mutates p. Two passes for stability.
  resolveCircle(p, r) {
    for (let pass = 0; pass < 2; pass++) {
      for (const b of this.boxes) {
        const cx = Math.max(b.minX, Math.min(p.x, b.maxX));
        const cz = Math.max(b.minZ, Math.min(p.z, b.maxZ));
        let dx = p.x - cx, dz = p.z - cz;
        let d2 = dx * dx + dz * dz;
        if (d2 > r * r) continue;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          const push = r - d;
          p.x += (dx / d) * push;
          p.z += (dz / d) * push;
        } else {
          // centre inside box -> push along least-penetration axis
          const pl = p.x - b.minX, pr = b.maxX - p.x;
          const pu = p.z - b.minZ, pd = b.maxZ - p.z;
          const m = Math.min(pl, pr, pu, pd);
          if (m === pl) p.x = b.minX - r;
          else if (m === pr) p.x = b.maxX + r;
          else if (m === pu) p.z = b.minZ - r;
          else p.z = b.maxZ + r;
        }
      }
    }
    const lim = this.bound - r;
    if (p.x < -lim) p.x = -lim; else if (p.x > lim) p.x = lim;
    if (p.z < -lim) p.z = -lim; else if (p.z > lim) p.z = lim;
  }

  // True if the straight segment (x0,z0)->(x1,z1) is unobstructed.
  segmentClear(x0, z0, x1, z1) {
    const dx = x1 - x0, dz = z1 - z0;
    for (const b of this.boxes) {
      if (this._segHitsBox(x0, z0, dx, dz, b)) return false;
    }
    return true;
  }

  _segHitsBox(x0, z0, dx, dz, b) {
    let tmin = 0, tmax = 1;
    // X slab
    if (Math.abs(dx) < 1e-8) {
      if (x0 < b.minX || x0 > b.maxX) return false;
    } else {
      let t1 = (b.minX - x0) / dx, t2 = (b.maxX - x0) / dx;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
      if (tmin > tmax) return false;
    }
    // Z slab
    if (Math.abs(dz) < 1e-8) {
      if (z0 < b.minZ || z0 > b.maxZ) return false;
    } else {
      let t1 = (b.minZ - z0) / dz, t2 = (b.maxZ - z0) / dz;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
      if (tmin > tmax) return false;
    }
    return true;
  }

  pointBlocked(x, z, pad = 0) {
    for (const b of this.boxes) {
      if (x > b.minX - pad && x < b.maxX + pad && z > b.minZ - pad && z < b.maxZ + pad) return true;
    }
    return false;
  }
}
