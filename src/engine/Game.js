import * as THREE from 'three';
import { Renderer } from '../rendering/Renderer.js';
import { Effects } from '../rendering/Effects.js';
import { HUD } from '../rendering/HUD.js';
import { WeaponView } from '../rendering/WeaponView.js';
import { Input } from './Input.js';
import { EventBus } from './Events.js';
import { Collision } from '../world/Collision.js';
import { Nav } from '../world/Nav.js';
import { World } from '../world/World.js';
import { Player } from '../entities/Player.js';
import { WeaponSystem } from '../weapons/WeaponSystem.js';
import { ZombieManager } from '../entities/ZombieManager.js';
import { NPC } from '../entities/NPC.js';
import { PickupManager } from '../entities/Pickup.js';
import { Score } from '../systems/Score.js';
import { WaveManager } from '../systems/WaveManager.js';
import { GameState } from '../systems/GameState.js';
import { TimeOfDay } from '../systems/TimeOfDay.js';
import { Audio } from '../audio/Audio.js';
import { WORLD } from '../config/constants.js';

// Top-level orchestrator: builds the shared context, owns update order, the
// pointer-lock pause, the nav-field cadence and the run lifecycle (begin/reset).
export class Game {
  constructor(canvas, hudRoot, assets, audio) {
    const renderer = new Renderer(canvas);
    const ctx = {};
    this.ctx = ctx;
    ctx.assets = assets;
    ctx.audio = audio || new Audio();
    ctx.events = new EventBus();
    ctx.input = new Input(canvas);
    ctx.renderer = renderer;
    ctx.scene = renderer.scene;
    ctx.camera = renderer.camera;

    ctx.collision = new Collision(WORLD.SIZE);
    ctx.world = new World(ctx.scene, assets, ctx.collision).build();
    ctx.nav = new Nav(WORLD.SIZE, WORLD.CELL);
    ctx.nav.build(ctx.collision);

    ctx.effects = new Effects(ctx.scene, assets.misc.blood);
    ctx.timeOfDay = new TimeOfDay(ctx.renderer);
    ctx.hud = new HUD(hudRoot);
    ctx.weaponView = new WeaponView(hudRoot);

    ctx.player = new Player(ctx);
    ctx.zombies = new ZombieManager(ctx);
    ctx.pickups = new PickupManager(ctx);
    ctx.weapons = new WeaponSystem(ctx);
    ctx.score = new Score(ctx);
    ctx.waves = new WaveManager(ctx);

    // peaceful survivors near spawn
    this.npcs = [];
    const sheet = assets.sheet('npc_peaceful');
    const s = ctx.world.playerStart;
    for (const off of [[-6, -4], [5, -7], [-2, -10]]) {
      this.npcs.push(new NPC(ctx, sheet, { x: s.x + off[0], z: s.z + off[1] }));
    }

    ctx.gameState = new GameState(ctx, hudRoot, {
      start: () => this.beginRun(),
      restart: () => this.beginRun(),
      // After resuming, the pointer lock may be briefly denied by the browser's
      // post-Esc cooldown; clear the guard so the loop doesn't instantly re-pause.
      resume: () => { this._wasLocked = false; },
    });

    // If we're playing but the mouse isn't locked (e.g. lock was denied right
    // after resuming), a click on the view re-acquires it.
    canvas.addEventListener('click', () => {
      if (ctx.gameState.isPlaying() && !ctx.input.locked) ctx.input.requestLock();
    });

    ctx.player.applyCamera();          // place camera for the menu backdrop
    ctx.nav.computeField(s.x, s.z);

    this.clock = new THREE.Clock();
    this._navT = 0;
    this._wasLocked = false;
    this._shake = { x: 0, y: 0, roll: 0 };
    this._tmpV = new THREE.Vector3();

    window.GAME = this;                // exposed for the documented dev test hook
    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
  }

  beginRun() {
    const ctx = this.ctx;
    ctx.zombies.clear();
    ctx.pickups.clear();
    ctx.weapons.reset();
    ctx.player = new Player(ctx);
    ctx.player.applyCamera();
    ctx.score.reset();
    ctx.waves.reset();
    ctx.timeOfDay.reset();
    ctx.hud.setWave(0);
    ctx.effects.shake = 0;
    this._wasLocked = false;
    this._navT = 0;
    this._initialPickups();
  }

  _initialPickups() {
    const ctx = this.ctx, s = ctx.world.playerStart;
    const types = ['pistol', 'shotgun', 'rifle', 'sniper'];
    for (let i = 0; i < 6; i++) {
      const pt = ctx.world.randomOpenPoint(ctx.waves.rng, s.x, s.z, 6, 22);
      if (pt) ctx.pickups.spawnAmmo(types[i % types.length], pt.x, pt.z);
    }
    for (let i = 0; i < 2; i++) {
      const pt = ctx.world.randomOpenPoint(ctx.waves.rng, s.x, s.z, 6, 18);
      if (pt) ctx.pickups.spawnHealth(pt.x, pt.z, 35);
    }
  }

  _loop() {
    requestAnimationFrame(this._loop);
    const dt = Math.min(0.05, this.clock.getDelta());
    const ctx = this.ctx;

    if (ctx.input.locked) this._wasLocked = true;
    if (ctx.gameState.isPlaying() && this._wasLocked && !ctx.input.locked) {
      ctx.gameState.pause();
    }

    if (ctx.gameState.isPlaying()) this._updatePlay(dt);

    ctx.hud.update(dt);
    ctx.renderer.render();
    ctx.input.endFrame();
  }

  _updatePlay(dt) {
    const ctx = this.ctx;

    ctx.player.update(dt);
    ctx.weapons.update(dt);

    this._navT -= dt;
    if (this._navT <= 0) { this._navT = 0.33; ctx.nav.computeField(ctx.player.pos.x, ctx.player.pos.z); }

    ctx.zombies.update(dt);
    for (const n of this.npcs) n.update(dt);
    ctx.pickups.update(dt);
    ctx.waves.update(dt);
    ctx.effects.update(dt);
    ctx.timeOfDay.update(dt);

    // re-apply camera with screen shake on top of the player's view
    ctx.effects.sampleShake(this._shake);
    ctx.player.applyCamera(this._shake);

    // HUD live values
    ctx.hud.setHealth(ctx.player.health, 100);
    ctx.hud.setKills(ctx.score.kills);
    ctx.hud.setAccuracy(ctx.score.accuracy());
    const tod = ctx.timeOfDay;
    ctx.hud.setTime(ctx.score.timeSurvived(), tod.phase, tod.label(), tod.isNight());

    // ambience scales with nearby living zombies
    let near = 0;
    const px = ctx.player.pos.x, pz = ctx.player.pos.z;
    for (const z of ctx.zombies.active) {
      if (!z.alive) continue;
      const dx = z.pos.x - px, dz = z.pos.z - pz;
      if (dx * dx + dz * dz < 900) near++;
    }
    ctx.audio.updateAmbience(near, dt);
  }

  // --- documented developer/QA hook (see README). Not reachable from gameplay. ---
  dev = {
    addKills: (n = 1) => {
      for (let i = 0; i < n && !this.ctx.score.won; i++) {
        this.ctx.events.emit('zombie:death', { type: 'walker', points: 1, x: 0, z: 0 });
      }
      return this.ctx.score.kills;
    },
    setKills: (n) => {
      this.ctx.score.kills = Math.max(0, n - 1);
      return this.dev.addKills(1);
    },
    godMode: (on = true) => { this._god = on; if (on) this.ctx.player.takeDamage = () => {}; },
  };
}
