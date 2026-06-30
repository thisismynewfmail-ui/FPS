// Flow-field navigation. A BFS distance field is computed from the player's cell
// across open grid cells a few times per second; every zombie then samples a
// smooth "downhill" direction toward the player that flows around obstacles —
// far cheaper than per-zombie A* for a 100+ horde, and it looks like a real swarm.
const NEI = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
];

export class Nav {
  constructor(bound, cell) {
    this.bound = bound;
    this.cell = cell;
    this.n = Math.ceil((bound * 2) / cell);   // cells per side
    this.blocked = new Uint8Array(this.n * this.n);
    this.dist = new Int32Array(this.n * this.n).fill(-1);
    this.queue = new Int32Array(this.n * this.n);
    this.ready = false;
  }

  build(collision) {
    const { n, cell, bound } = this;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const x = -bound + (i + 0.5) * cell;
        const z = -bound + (j + 0.5) * cell;
        this.blocked[j * n + i] = collision.pointBlocked(x, z, 0.45) ? 1 : 0;
      }
    }
  }

  _ci(x, z) {
    const i = Math.floor((x + this.bound) / this.cell);
    const j = Math.floor((z + this.bound) / this.cell);
    if (i < 0 || j < 0 || i >= this.n || j >= this.n) return -1;
    return j * this.n + i;
  }

  cellCenter(idx) {
    const i = idx % this.n, j = (idx / this.n) | 0;
    return { x: -this.bound + (i + 0.5) * this.cell, z: -this.bound + (j + 0.5) * this.cell };
  }

  computeField(px, pz) {
    const start = this._ci(px, pz);
    if (start < 0) { this.ready = false; return; }
    const { n, dist, queue, blocked } = this;
    dist.fill(-1);
    let head = 0, tail = 0;
    // if player stands on a blocked cell, seed nearest open neighbour instead
    let seed = start;
    if (blocked[seed]) {
      for (const [dx, dy] of NEI) {
        const ni = (seed % n) + dx, nj = ((seed / n) | 0) + dy;
        if (ni >= 0 && nj >= 0 && ni < n && nj < n && !blocked[nj * n + ni]) { seed = nj * n + ni; break; }
      }
    }
    dist[seed] = 0; queue[tail++] = seed;
    while (head < tail) {
      const cur = queue[head++];
      const ci = cur % n, cj = (cur / n) | 0, cd = dist[cur];
      for (let k = 0; k < NEI.length; k++) {
        const dx = NEI[k][0], dy = NEI[k][1];
        const ni = ci + dx, nj = cj + dy;
        if (ni < 0 || nj < 0 || ni >= n || nj >= n) continue;
        const nidx = nj * n + ni;
        if (blocked[nidx] || dist[nidx] !== -1) continue;
        // prevent diagonal corner-cutting through walls
        if (dx !== 0 && dy !== 0) {
          if (blocked[cj * n + ni] || blocked[nj * n + ci]) continue;
        }
        dist[nidx] = cd + 1;
        queue[tail++] = nidx;
      }
    }
    this.ready = true;
  }

  // Direction (normalized {x,z}) a zombie at (x,z) should move to reach the player.
  directionAt(x, z, targetX, targetZ, out) {
    out = out || {};
    const idx = this._ci(x, z);
    if (this.ready && idx >= 0 && this.dist[idx] > 0) {
      const n = this.n, ci = idx % n, cj = (idx / n) | 0, cd = this.dist[idx];
      let best = -1, bestD = cd;
      for (let k = 0; k < NEI.length; k++) {
        const ni = ci + NEI[k][0], nj = cj + NEI[k][1];
        if (ni < 0 || nj < 0 || ni >= n || nj >= n) continue;
        const nidx = nj * n + ni;
        const d = this.dist[nidx];
        if (d >= 0 && d < bestD) { bestD = d; best = nidx; }
      }
      if (best >= 0) {
        const c = this.cellCenter(best);
        let dx = c.x - x, dz = c.z - z;
        const len = Math.hypot(dx, dz) || 1;
        out.x = dx / len; out.z = dz / len;
        return out;
      }
    }
    // fallback: straight line toward target
    let dx = targetX - x, dz = targetZ - z;
    const len = Math.hypot(dx, dz) || 1;
    out.x = dx / len; out.z = dz / len;
    return out;
  }
}
