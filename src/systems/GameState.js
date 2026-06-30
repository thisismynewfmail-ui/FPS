import { formatInt, formatTime } from '../engine/util.js';
import { WIN_KILLS } from '../config/constants.js';

export const STATE = { MENU: 'menu', PLAYING: 'playing', PAUSED: 'paused', VICTORY: 'victory', DEAD: 'dead' };

// Owns screen overlays (menu / pause / victory / death) and the high-level state
// machine, including pointer-lock handoff. Gameplay systems only run while PLAYING.
export class GameState {
  constructor(ctx, root, hooks) {
    this.ctx = ctx;
    this.hooks = hooks;            // { start, restart }
    this.state = STATE.MENU;

    this.overlay = document.createElement('div');
    this.overlay.className = 'overlay';
    root.appendChild(this.overlay);

    ctx.events.on('victory', (s) => this.showVictory(s));
    ctx.events.on('player:death', () => this.showDeath());

    this.showMenu();
  }

  isPlaying() { return this.state === STATE.PLAYING; }

  _panel(html) {
    this.overlay.innerHTML = `<div class="panel">${html}</div>`;
    this.overlay.style.display = 'flex';
  }
  _hide() { this.overlay.style.display = 'none'; this.overlay.innerHTML = ''; }

  _showHUD(on) { this.ctx.hud.setVisible(on); if (on) this.ctx.weaponView.show(); else this.ctx.weaponView.hide(); }

  showMenu() {
    this.state = STATE.MENU;
    this._showHUD(false);
    this.ctx.input.exitLock();
    this._panel(`
      <h1>OUTBREAK<span class="sub">: 250K</span></h1>
      <p class="tag">Kill <b>${formatInt(WIN_KILLS)}</b> zombies. That is the only way out.</p>
      <div class="controls">
        <div><b>WASD</b> move &nbsp; <b>MOUSE</b> look &nbsp; <b>SHIFT</b> sprint &nbsp; <b>CTRL</b> crouch &nbsp; <b>SPACE</b> jump</div>
        <div><b>LMB</b> fire &nbsp; <b>RMB</b> sniper scope &nbsp; <b>R</b> reload &nbsp; <b>1–5</b> / <b>WHEEL</b> weapons &nbsp; <b>ESC</b> pause</div>
      </div>
      <button class="btn" id="btn-start">CLICK TO PLAY</button>
    `);
    this.overlay.querySelector('#btn-start').onclick = () => this.start();
  }

  start() {
    this._hide();
    this.state = STATE.PLAYING;
    this._showHUD(true);
    this.ctx.audio.resume();
    this.hooks.start();
    this.ctx.input.requestLock();
  }

  pause() {
    if (this.state !== STATE.PLAYING) return;
    this.state = STATE.PAUSED;
    this._showHUD(false);
    this.ctx.input.exitLock();
    const s = this.ctx.score;
    this._panel(`
      <h1>PAUSED</h1>
      <div class="stats">
        <div>KILLS</div><div>${formatInt(s.kills)} / ${formatInt(WIN_KILLS)}</div>
        <div>ACCURACY</div><div>${s.accuracy().toFixed(1)}%</div>
        <div>TIME</div><div>${formatTime(s.timeSurvived())}</div>
      </div>
      <button class="btn" id="btn-resume">RESUME</button>
    `);
    this.overlay.querySelector('#btn-resume').onclick = () => this.resume();
  }

  resume() {
    if (this.state !== STATE.PAUSED) return;
    this._hide();
    this.state = STATE.PLAYING;
    this._showHUD(true);
    this.ctx.input.requestLock();
  }

  showVictory(s) {
    this.state = STATE.VICTORY;
    this._showHUD(false);
    this.ctx.input.exitLock();
    this.ctx.audio.victory();
    this._panel(`
      <h1 class="win">VICTORY</h1>
      <p class="tag">You killed ${formatInt(s.kills)} zombies and lived.</p>
      <div class="stats">
        <div>TIME PLAYED</div><div>${formatTime(s.time)}</div>
        <div>ACCURACY</div><div>${s.accuracy.toFixed(1)}% (${formatInt(s.shotsHit)}/${formatInt(s.shotsFired)})</div>
        <div>WALKERS</div><div>${formatInt(s.byType.walker)}</div>
        <div>SPRINTERS</div><div>${formatInt(s.byType.sprinter)}</div>
        <div>TANKS</div><div>${formatInt(s.byType.tank)}</div>
        <div>SCORE</div><div>${formatInt(s.points)} pts</div>
      </div>
      <button class="btn" id="btn-restart">PLAY AGAIN</button>
    `);
    this.overlay.querySelector('#btn-restart').onclick = () => this.restart();
  }

  showDeath() {
    if (this.state === STATE.VICTORY) return;
    this.state = STATE.DEAD;
    this._showHUD(false);
    this.ctx.input.exitLock();
    const s = this.ctx.score;
    this._panel(`
      <h1 class="dead">YOU DIED</h1>
      <p class="tag">The horde got you at ${formatInt(s.kills)} kills.</p>
      <div class="stats">
        <div>KILLS</div><div>${formatInt(s.kills)} / ${formatInt(WIN_KILLS)}</div>
        <div>ACCURACY</div><div>${s.accuracy().toFixed(1)}%</div>
        <div>TIME</div><div>${formatTime(s.timeSurvived())}</div>
      </div>
      <button class="btn" id="btn-restart">TRY AGAIN</button>
    `);
    this.overlay.querySelector('#btn-restart').onclick = () => this.restart();
  }

  restart() {
    this._hide();
    this.state = STATE.PLAYING;
    this._showHUD(true);
    this.hooks.restart();
    this.ctx.input.requestLock();
  }
}
