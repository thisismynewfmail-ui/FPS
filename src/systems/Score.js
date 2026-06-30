import { WIN_KILLS } from '../config/constants.js';

// Tracks kills (total + per type), points, accuracy and time. Listens for
// zombie deaths and fires the exact-250,000-kill victory — counted one kill at a
// time with a strict === check, so the win triggers on precisely that kill and
// never a shortcut.
export class Score {
  constructor(ctx) {
    this.ctx = ctx;
    this.reset();
    ctx.events.on('zombie:death', (e) => this._onKill(e));
  }

  reset() {
    this.kills = 0;
    this.byType = { walker: 0, sprinter: 0, tank: 0 };
    this.points = 0;
    this.shotsFired = 0;
    this.shotsHit = 0;
    this.startTime = performance.now() / 1000;
    this.won = false;
  }

  _onKill(e) {
    if (this.won) return;
    this.kills += 1;
    if (this.byType[e.type] !== undefined) this.byType[e.type] += 1;
    this.points += e.points;
    this.ctx.events.emit('kill:count', this.kills);
    if (this.kills === WIN_KILLS) {        // exact victory condition
      this.won = true;
      this.ctx.events.emit('victory', this.summary());
    }
  }

  recordShot(hit) {
    this.shotsFired += 1;
    if (hit) this.shotsHit += 1;
  }

  accuracy() {
    return this.shotsFired > 0 ? (this.shotsHit / this.shotsFired) * 100 : 100;
  }

  timeSurvived() { return performance.now() / 1000 - this.startTime; }

  summary() {
    return {
      kills: this.kills,
      byType: { ...this.byType },
      points: this.points,
      accuracy: this.accuracy(),
      time: this.timeSurvived(),
      shotsFired: this.shotsFired,
      shotsHit: this.shotsHit,
    };
  }
}
