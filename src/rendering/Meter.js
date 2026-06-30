import { WIN_KILLS } from '../config/constants.js';
import { formatTime, clamp } from '../engine/util.js';

const SVGNS = 'http://www.w3.org/2000/svg';

// Builds an SVG circular gauge: a faint track ring + a coloured progress ring
// (driven by stroke-dashoffset) with a value + label stacked in the centre.
export function makeMeter(label, { size = 84, stroke = 8, color = '#b8e02c' } = {}) {
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

export function abbrev(n) {
  if (n < 1000) return String(n);
  if (n < 1e6) return (n / 1000).toFixed(n < 10000 ? 1 : 0) + 'K';
  return (n / 1e6).toFixed(2) + 'M';
}

// Build a row of three circular stat gauges (Kills / Accuracy / Time) for the
// pause screen. `night` recolours the Time ring; `dayPhase` fills it.
export function buildStatMeters({ kills, accuracy, timeSec, dayPhase = 0, dayLabel = 'TIME', night = false }) {
  const wrap = document.createElement('div');
  wrap.className = 'stat-meters';

  const k = makeMeter('KILLS', { size: 128, color: '#b8e02c' });
  k.setFrac(kills / WIN_KILLS);
  k.setText(abbrev(kills), '/ ' + abbrev(WIN_KILLS));

  const a = makeMeter('ACCURACY', { size: 128, color: '#ffb454' });
  a.setFrac(accuracy / 100);
  a.setText(accuracy.toFixed(0) + '%', 'ACCURACY');

  const t = makeMeter('TIME', { size: 128, color: night ? '#9fb0ff' : '#7ec8ff' });
  t.setFrac(dayPhase);
  t.setText(formatTime(timeSec), dayLabel);

  wrap.appendChild(k.root); wrap.appendChild(a.root); wrap.appendChild(t.root);
  return wrap;
}
