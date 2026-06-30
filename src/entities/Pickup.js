import * as THREE from 'three';
import { ITEM_SPRITES } from '../config/assets.js';

// Floating, slowly spinning item pickups (THREE.Sprite -> always faces camera).
// Ammo refills a weapon's reserve; health restores HP. Picked up on proximity.
const ICON = {
  pistol: 'ammo_pistol', shotgun: 'ammo_shotgun', rifle: 'ammo_rifle', sniper: 'ammo_sniper',
};

export class PickupManager {
  constructor(ctx) {
    this.ctx = ctx;
    this.items = [];
    this.max = 60;
  }

  _makeSprite(texName) {
    const tex = this.ctx.assets.item(texName);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, alphaTest: 0.3, depthWrite: false, fog: true });
    const s = new THREE.Sprite(mat);
    s.scale.set(0.85, 0.85, 1);
    return s;
  }

  spawnAmmo(ammoType, x, z) {
    if (this.items.length >= this.max) return;
    const amount = { pistol: 24, shotgun: 12, rifle: 60, sniper: 8 }[ammoType] || 20;
    const sprite = this._makeSprite(ICON[ammoType]);
    sprite.position.set(x, 0.7, z);
    this.ctx.scene.add(sprite);
    this.items.push({ kind: 'ammo', ammoType, amount, sprite, t: Math.random() * 6 });
  }

  spawnHealth(x, z, amount = 35) {
    if (this.items.length >= this.max) return;
    const sprite = this._makeSprite('health');
    sprite.position.set(x, 0.7, z);
    this.ctx.scene.add(sprite);
    this.items.push({ kind: 'health', amount, sprite, t: Math.random() * 6 });
  }

  update(dt) {
    const px = this.ctx.player.pos.x, pz = this.ctx.player.pos.z;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += dt;
      it.sprite.position.y = 0.7 + Math.sin(it.t * 2) * 0.12;
      it.sprite.material.rotation = it.t * 1.5;
      const d = Math.hypot(it.sprite.position.x - px, it.sprite.position.z - pz);
      if (d < 1.35) {
        let consumed = false;
        if (it.kind === 'ammo') {
          if (this.ctx.weapons.addAmmo(it.ammoType, it.amount)) {
            this.ctx.audio.pickupAmmo(); this.ctx.hud.toastMsg('+ ' + it.ammoType.toUpperCase() + ' AMMO'); consumed = true;
          }
        } else {
          if (this.ctx.player.health < 100) {
            this.ctx.player.heal(it.amount); this.ctx.audio.pickupHealth(); this.ctx.hud.toastMsg('+ HEALTH'); consumed = true;
          }
        }
        if (consumed) { this._remove(i); continue; }
      }
    }
  }

  _remove(i) {
    const it = this.items[i];
    this.ctx.scene.remove(it.sprite);
    it.sprite.material.dispose();
    this.items.splice(i, 1);
  }

  clear() {
    for (const it of this.items) { this.ctx.scene.remove(it.sprite); it.sprite.material.dispose(); }
    this.items.length = 0;
  }
}
