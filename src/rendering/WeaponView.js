import { WEAPON_SPRITES } from '../config/assets.js';

// First-person weapon overlay (DOM). Shows the held weapon bottom-centre,
// animates recoil on fire, a dip on reload, sway/bob from movement, and a
// muzzle flash. Kept as a DOM layer so sprites stay pixel-crisp above the canvas.
export class WeaponView {
  constructor(root) {
    this.layer = document.createElement('div');
    this.layer.className = 'weapon-layer';

    this.flash = document.createElement('img');
    this.flash.className = 'muzzle-flash';
    this.flash.src = WEAPON_SPRITES.muzzle;
    this.flash.style.opacity = '0';

    this.img = document.createElement('img');
    this.img.className = 'weapon-img';

    this.layer.appendChild(this.flash);
    this.layer.appendChild(this.img);
    root.appendChild(this.layer);

    this.recoil = 0;        // 0..1 decaying
    this.reloadT = 0;       // seconds remaining in reload dip
    this.reloadDur = 0;
    this.bobX = 0; this.bobY = 0;
    this.flashT = 0;
    this._name = null;
  }

  setWeapon(name) {
    if (this._name === name) return;
    this._name = name;
    this.img.src = WEAPON_SPRITES[name] || WEAPON_SPRITES.pistol;
  }

  kick(amount = 1) { this.recoil = Math.min(1.4, this.recoil + amount); }

  showFlash() { this.flashT = 0.05; this.flash.style.opacity = '1'; }

  startReload(dur) { this.reloadT = dur; this.reloadDur = dur; }

  setBob(x, y) { this.bobX = x; this.bobY = y; }

  hide() { this.layer.style.display = 'none'; }
  show() { this.layer.style.display = 'block'; }

  update(dt) {
    if (this.recoil > 0) this.recoil = Math.max(0, this.recoil - dt * 6);
    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) this.flash.style.opacity = '0'; }

    let reloadDrop = 0, reloadRot = 0;
    if (this.reloadT > 0) {
      this.reloadT = Math.max(0, this.reloadT - dt);
      const phase = 1 - this.reloadT / this.reloadDur;    // 0..1
      const s = Math.sin(phase * Math.PI);                 // up-down dip
      reloadDrop = s * 120;
      reloadRot = s * 18;
    }

    const recoilY = this.recoil * 26;
    const x = this.bobX * 30;
    const y = this.bobY * 22 + recoilY + reloadDrop;
    const scale = 1 + this.recoil * 0.03;
    this.img.style.transform =
      `translate(-50%, 0) translate(${x}px, ${y}px) rotate(${reloadRot}deg) scale(${scale})`;
  }
}
