import * as THREE from 'three';
import { SHEET_ROWS } from '../config/assets.js';

// A camera-facing sprite quad driven by a 3x4 walk sheet.
// - Always yaw-billboards toward the camera (upright, never rolls).
// - Picks the sheet ROW from the entity's facing relative to the camera
//   (front / back / left / right) for that classic Doom/Build directional look.
// - Cycles the 3 COLUMNS as a walk animation while moving.
// Each instance owns its own material so it can flash on hit and fade on death
// independently (meshes are separate draw calls regardless, so this costs nothing).
const _v = new THREE.Vector3();

export class SpriteBillboard {
  constructor(sheet, { width = 1, height = 1.9, color = 0xdedede, animFps = 6 } = {}) {
    this.sheet = sheet;
    this.cols = sheet.cols;
    this.rows = sheet.rows;
    this.animFps = animFps;

    this.geo = new THREE.PlaneGeometry(width, height);
    this.baseColor = new THREE.Color(color);
    this.mat = new THREE.MeshBasicMaterial({
      map: sheet.tex, transparent: false, alphaTest: 0.5,
      side: THREE.DoubleSide, color: this.baseColor.clone(), fog: true,
    });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.width = width; this.height = height;

    this._col = -1; this._row = -1;
    this._animT = 0;
    this._flash = 0;
    this._dying = false; this._deathT = 0; this._deathDur = 1.2;
    this.setCell(1, SHEET_ROWS.front);
  }

  setSize(width, height) {
    this.width = width; this.height = height;
    this.geo.dispose();
    this.geo = new THREE.PlaneGeometry(width, height);
    this.mesh.geometry = this.geo;
    this._col = this._row = -1;     // force UV rewrite
  }

  setCell(col, row) {
    if (col === this._col && row === this._row) return;
    this._col = col; this._row = row;
    const u0 = col / this.cols, u1 = (col + 1) / this.cols;
    const vT = 1 - row / this.rows, vB = 1 - (row + 1) / this.rows;
    const uv = this.geo.attributes.uv;
    uv.setXY(0, u0, vT); uv.setXY(1, u1, vT);
    uv.setXY(2, u0, vB); uv.setXY(3, u1, vB);
    uv.needsUpdate = true;
  }

  // facingYaw: direction the entity is facing (atan2(dirX, dirZ)); moving: bool
  update(camera, pos, facingYaw, moving, dt) {
    this.mesh.position.copy(pos);

    if (this._dying) { this._updateDeath(dt); return; }

    // yaw-billboard toward camera
    const yawToCam = Math.atan2(camera.position.x - pos.x, camera.position.z - pos.z);
    this.mesh.rotation.set(0, yawToCam, 0);

    // directional row from facing vs camera
    const f = _v.set(Math.sin(facingYaw), 0, Math.cos(facingYaw));
    const cx = camera.position.x - pos.x, cz = camera.position.z - pos.z;
    const cl = Math.hypot(cx, cz) || 1;
    const dot = (f.x * cx + f.z * cz) / cl;        // forward alignment
    const rightDot = (f.z * cx - f.x * cz) / cl;   // camera side
    let row;
    if (dot > 0.5) row = SHEET_ROWS.front;
    else if (dot < -0.5) row = SHEET_ROWS.back;
    else row = rightDot > 0 ? SHEET_ROWS.left : SHEET_ROWS.right;

    let col = 1;
    if (moving) {
      this._animT += dt * this.animFps;
      col = Math.floor(this._animT) % this.cols;
    } else {
      this._animT = 0;
    }
    this.setCell(col, row);

    // hit flash decay
    if (this._flash > 0) {
      this._flash = Math.max(0, this._flash - dt * 8);
      this.mat.color.copy(this.baseColor).lerp(FLASH_COLOR, this._flash);
    }
  }

  flash() { this._flash = 1; this.mat.color.copy(FLASH_COLOR); }

  startDeath(forwardYaw) {
    this._dying = true; this._deathT = 0;
    // face camera one last time, then we tilt backward away from impact
    this.mat.transparent = true; this.mat.alphaTest = 0.05; this.mat.depthWrite = false;
    this._fallAxis = forwardYaw;
  }

  _updateDeath(dt) {
    this._deathT += dt;
    const t = Math.min(1, this._deathT / this._deathDur);
    this.mesh.rotation.x = -t * 1.45;            // fall backward
    this.mat.opacity = 1 - t * t;                 // fade out
    // sink slightly into ground as it falls
    this.mesh.position.y -= dt * 0.4;
  }

  isDeathDone() { return this._dying && this._deathT >= this._deathDur; }

  reset() {
    this._dying = false; this._deathT = 0; this._flash = 0;
    this.mat.transparent = false; this.mat.alphaTest = 0.5; this.mat.depthWrite = true;
    this.mat.opacity = 1; this.mat.color.copy(this.baseColor);
    this.mesh.rotation.set(0, 0, 0);
    this.mesh.visible = true;
  }

  dispose() { this.geo.dispose(); this.mat.dispose(); }
}

const FLASH_COLOR = new THREE.Color(0xff5050);
