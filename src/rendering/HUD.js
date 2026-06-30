// Retro survival-horror HUD. Deliberately minimal on-screen chrome: crosshair,
// segmented health (bottom-left), ammo (bottom-right), a wave indicator, and a
// transient weapon picker shown only on switch. Run stats (kills / accuracy /
// time) intentionally live on the PAUSE screen, not here.
export class HUD {
  constructor(root) {
    this.root = root;
    this.container = document.createElement('div');
    this.container.className = 'hud-elements';
    this.container.style.display = 'none';     // hidden until a run begins
    root.appendChild(this.container);
    const el = (cls, parent = this.container, tag = 'div') => {
      const e = document.createElement(tag); e.className = cls; parent.appendChild(e); return e;
    };

    this.crosshair = el('crosshair');
    this.vignette = el('vignette');
    this.scope = el('scope'); this.scope.style.display = 'none';

    this.wave = el('wave'); this.wave.textContent = ''; this.wave.style.display = 'none';   // top-centre

    // transient weapon picker (top, only shown on switch)
    this.weaponMenu = el('weapon-menu'); this.weaponMenu.style.opacity = '0';
    this.weaponName = el('wm-name', this.weaponMenu);
    this.weaponBar = el('wm-bar', this.weaponMenu);
    this.slotEls = [];
    this._weaponMenuT = 0;

    // bottom-left health
    const health = el('health');
    el('hud-cap', health).textContent = 'HEALTH';
    this.healthSegs = el('seg-row', health);
    this.segEls = [];
    for (let i = 0; i < 10; i++) this.segEls.push(el('seg', this.healthSegs));
    this.healthNum = el('big-num', health);

    // bottom-right ammo (+ current weapon label)
    const ammo = el('ammo');
    this.ammoWeapon = el('ammo-weapon', ammo); this.ammoWeapon.textContent = '';
    this.ammoNum = el('big-num', ammo);
    el('hud-cap', ammo).textContent = 'AMMO';

    this.toast = el('toast'); this.toast.style.opacity = '0';
    this._toastT = 0;
    this._vig = 0;
  }

  setVisible(on) { this.container.style.display = on ? 'block' : 'none'; }

  buildWeaponBar(weapons) {
    this.weaponBar.innerHTML = '';
    this.slotEls = weapons.map((w, i) => {
      const slot = document.createElement('div');
      slot.className = 'slot';
      const icon = document.createElement('img'); icon.className = 'slot-icon'; icon.src = w.icon;
      const key = document.createElement('div'); key.className = 'slot-key'; key.textContent = i + 1;
      slot.appendChild(icon); slot.appendChild(key);
      this.weaponBar.appendChild(slot);
      return slot;
    });
  }

  setHealth(hp, max) {
    const frac = Math.max(0, hp / max);
    const lit = Math.round(frac * this.segEls.length);
    this.segEls.forEach((s, i) => {
      s.classList.toggle('on', i < lit);
      s.classList.toggle('low', frac < 0.34 && i < lit);
    });
    this.healthNum.textContent = Math.max(0, Math.ceil(hp));
    this._vig = Math.max(this._vig, frac < 0.34 ? (0.34 - frac) * 1.4 : 0);
  }

  setAmmo(mag, reserve, melee = false) {
    this.ammoNum.textContent = melee ? '∞' : `${mag} / ${reserve}`;
    this.ammoNum.classList.toggle('empty', !melee && mag === 0);
  }

  // update current weapon; show the transient picker only when `show` is true
  setWeapon(index, name, show = false) {
    this.weaponName.textContent = name;
    this.ammoWeapon.textContent = name;
    this.slotEls.forEach((s, i) => s.classList.toggle('active', i === index));
    if (show) { this._weaponMenuT = 2.4; this.weaponMenu.style.opacity = '1'; }
  }

  setWave(n) {
    this.wave.textContent = n > 0 ? `WAVE ${n}` : '';
    this.wave.style.display = n > 0 ? 'block' : 'none';
  }

  showScope(on) { this.scope.style.display = on ? 'block' : 'none'; this.crosshair.style.display = on ? 'none' : 'block'; }

  toastMsg(text, dur = 1.2) { this.toast.textContent = text; this._toastT = dur; this.toast.style.opacity = '1'; }

  damageFlash(intensity = 0.6) { this._vig = Math.min(1, this._vig + intensity); }

  update(dt) {
    if (this._toastT > 0) {
      this._toastT -= dt;
      this.toast.style.opacity = this._toastT <= 0 ? '0' : String(Math.min(1, this._toastT * 2));
    }
    if (this._weaponMenuT > 0) {
      this._weaponMenuT -= dt;
      this.weaponMenu.style.opacity = this._weaponMenuT <= 0 ? '0' : String(Math.min(1, this._weaponMenuT * 1.6));
    }
    this.vignette.style.opacity = this._vig.toFixed(3);
    this._vig = Math.max(0, this._vig - dt * 1.4);
  }
}
