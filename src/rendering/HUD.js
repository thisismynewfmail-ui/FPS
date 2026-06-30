import { WIN_KILLS } from '../config/constants.js';
import { formatInt } from '../engine/util.js';

// Retro survival-horror HUD. All DOM + CSS (styled in index.html) — no rounded
// corners, no gradients on the chrome, blocky segmented bars, monospace text.
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

    // top-centre kill counter + victory progress
    const killWrap = el('kill-wrap');
    this.killLabel = el('kill-label', killWrap);
    const prog = el('progress', killWrap);
    this.progFill = el('progress-fill', prog);

    this.wave = el('wave');            // top-left
    this.accuracy = el('accuracy');    // top-right

    // bottom-left health
    const health = el('health');
    el('hud-cap', health).textContent = 'HEALTH';
    this.healthSegs = el('seg-row', health);
    this.segEls = [];
    for (let i = 0; i < 10; i++) { this.segEls.push(el('seg', this.healthSegs)); }
    this.healthNum = el('big-num', health);

    // bottom-right ammo
    const ammo = el('ammo');
    el('hud-cap', ammo).textContent = 'AMMO';
    this.ammoNum = el('big-num', ammo);

    // bottom-centre weapon name + selection bar
    const wc = el('weapon-center');
    this.weaponName = el('weapon-name', wc);
    this.weaponBar = el('weapon-bar', wc);
    this.slotEls = [];

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
      const key = document.createElement('div'); key.className = 'slot-key'; key.textContent = i + 1;
      const icon = document.createElement('img'); icon.className = 'slot-icon'; icon.src = w.icon;
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
    // persistent low-health vignette
    this._vig = Math.max(this._vig, frac < 0.34 ? (0.34 - frac) * 1.4 : 0);
  }

  setAmmo(mag, reserve, melee = false) {
    this.ammoNum.textContent = melee ? '∞' : `${mag} / ${reserve}`;
    this.ammoNum.classList.toggle('empty', !melee && mag === 0);
  }

  setKills(kills) {
    this.killLabel.textContent = `KILLS: ${formatInt(kills)} / ${formatInt(WIN_KILLS)}`;
    this.progFill.style.width = `${Math.min(100, (kills / WIN_KILLS) * 100)}%`;
  }

  setWeapon(index, name) {
    this.weaponName.textContent = name;
    this.slotEls.forEach((s, i) => s.classList.toggle('active', i === index));
  }

  setWave(n) { this.wave.textContent = n > 0 ? `WAVE ${n}` : ''; }
  setAccuracy(pct) { this.accuracy.textContent = `ACC ${pct.toFixed(1)}%`; }

  showScope(on) { this.scope.style.display = on ? 'block' : 'none'; this.crosshair.style.display = on ? 'none' : 'block'; }

  toastMsg(text, dur = 1.2) { this.toast.textContent = text; this._toastT = dur; this.toast.style.opacity = '1'; }

  damageFlash(intensity = 0.6) { this._vig = Math.min(1, this._vig + intensity); }

  update(dt) {
    if (this._toastT > 0) {
      this._toastT -= dt;
      if (this._toastT <= 0) this.toast.style.opacity = '0';
      else this.toast.style.opacity = String(Math.min(1, this._toastT * 2));
    }
    // vignette eases toward 0 each frame (re-set by damage / low health)
    this.vignette.style.opacity = this._vig.toFixed(3);
    this._vig = Math.max(0, this._vig - dt * 1.4);
  }
}
