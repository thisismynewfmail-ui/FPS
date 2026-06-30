import { WIN_KILLS } from '../config/constants.js';
import { formatInt, formatTime, clamp } from '../engine/util.js';

const SVGNS = 'http://www.w3.org/2000/svg';

// Builds an SVG circular gauge: a faint track ring + a coloured progress ring
// (driven by stroke-dashoffset) with a value + label stacked in the centre.
function makeMeter(label, { size = 84, stroke = 7, color = '#b8e02c' } = {}) {
  const r = size / 2 - stroke;
  const circ = 2 * Math.PI * r;
  const root = document.createElement('div');
  root.className = 'meter';
  root.style.width = root.style.height = size + 'px';

  const svg = document.createElementNS(SVGNS, 'svg');
  svg.setAttribute('width', size); svg.setAttribute('height', size);
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  const mk = (cls) => {
    const c = document.createElementNS(SVGNS, 'circle');
    c.setAttribute('cx', size / 2); c.setAttribute('cy', size / 2); c.setAttribute('r', r);
    c.setAttribute('fill', 'none'); c.setAttribute('stroke-width', stroke);
    c.setAttribute('class', cls);
    return c;
  };
  const track = mk('meter-track');
  const fg = mk('meter-fg');
  fg.setAttribute('stroke', color);
  fg.setAttribute('stroke-linecap', 'round');
  fg.setAttribute('stroke-dasharray', circ);
  fg.setAttribute('stroke-dashoffset', circ);
  fg.setAttribute('transform', `rotate(-90 ${size / 2} ${size / 2})`);
  svg.appendChild(track); svg.appendChild(fg);

  const center = document.createElement('div'); center.className = 'meter-center';
  const valEl = document.createElement('div'); valEl.className = 'meter-val';
  const labEl = document.createElement('div'); labEl.className = 'meter-label'; labEl.textContent = label;
  center.appendChild(valEl); center.appendChild(labEl);

  root.appendChild(svg); root.appendChild(center);
  return {
    root, valEl, labEl, fg, circ,
    setFrac(f) { fg.setAttribute('stroke-dashoffset', this.circ * (1 - clamp(f, 0, 1))); },
    setColor(c) { fg.setAttribute('stroke', c); },
    setText(v, l) { valEl.textContent = v; if (l !== undefined) labEl.textContent = l; },
  };
}

function abbrev(n) {
  if (n < 1000) return String(n);
  if (n < 1e6) return (n / 1000).toFixed(n < 10000 ? 1 : 0) + 'K';
  return (n / 1e6).toFixed(2) + 'M';
}

// Retro survival-horror HUD. Circular gauges for Kills / Accuracy / Time, a
// transient top weapon picker (only on switch), segmented health and ammo.
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

    // ---- top gauges ----
    this.meterTime = makeMeter('TIME', { color: '#7ec8ff' });
    this.meterKills = makeMeter('KILLS', { size: 96, color: '#b8e02c' });
    this.meterAcc = makeMeter('ACC', { color: '#ffb454' });
    const left = el('meter-left'); left.appendChild(this.meterTime.root);
    const mid = el('meter-mid'); mid.appendChild(this.meterKills.root);
    this.wave = el('wave-label', mid); this.wave.textContent = '';
    const right = el('meter-right'); right.appendChild(this.meterAcc.root);

    // ---- transient weapon picker (top, only shown on switch) ----
    this.weaponMenu = el('weapon-menu'); this.weaponMenu.style.opacity = '0';
    this.weaponName = el('wm-name', this.weaponMenu);
    this.weaponBar = el('wm-bar', this.weaponMenu);
    this.slotEls = [];
    this._weaponMenuT = 0;

    // ---- bottom-left health ----
    const health = el('health');
    el('hud-cap', health).textContent = 'HEALTH';
    this.healthSegs = el('seg-row', health);
    this.segEls = [];
    for (let i = 0; i < 10; i++) this.segEls.push(el('seg', this.healthSegs));
    this.healthNum = el('big-num', health);

    // ---- bottom-right ammo (+ current weapon label) ----
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

  setKills(kills) {
    this.meterKills.setFrac(kills / WIN_KILLS);
    this.meterKills.setText(abbrev(kills), '/ ' + abbrev(WIN_KILLS));
  }

  setAccuracy(pct) {
    this.meterAcc.setFrac(pct / 100);
    this.meterAcc.setText(pct.toFixed(0) + '%', 'ACC');
  }

  // survived seconds, day-cycle phase [0,1), and a phase label (DAY/NIGHT/…)
  setTime(survived, dayPhase = 0, phaseLabel = 'TIME', night = false) {
    this.meterTime.setFrac(dayPhase);
    this.meterTime.setText(formatTime(survived), phaseLabel);
    this.meterTime.setColor(night ? '#9fb0ff' : '#7ec8ff');
  }

  // update current weapon; show the transient picker only when `show` is true
  setWeapon(index, name, show = false) {
    this.weaponName.textContent = name;
    this.ammoWeapon.textContent = name;
    this.slotEls.forEach((s, i) => s.classList.toggle('active', i === index));
    if (show) { this._weaponMenuT = 2.4; this.weaponMenu.style.opacity = '1'; }
  }

  setWave(n) { this.wave.textContent = n > 0 ? `WAVE ${n}` : ''; }

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
