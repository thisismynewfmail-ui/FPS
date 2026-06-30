import { AssetLoader } from './engine/AssetLoader.js';
import { Audio } from './audio/Audio.js';
import { Game } from './engine/Game.js';

// Bootstrap: load every asset (with progress), then build the game.
async function boot() {
  const canvas = document.getElementById('canvas');
  const hudRoot = document.getElementById('hud');
  const loading = document.getElementById('loading');
  const pct = document.getElementById('loading-pct');

  try {
    const assets = await new AssetLoader().loadAll((p) => {
      pct.textContent = `LOADING… ${Math.round(p * 100)}%`;
    });
    const audio = new Audio();
    new Game(canvas, hudRoot, assets, audio);
    loading.style.display = 'none';
  } catch (err) {
    console.error(err);
    pct.textContent = 'FAILED TO LOAD';
    loading.innerHTML += `<small style="color:#d44">${err.message}<br>Serve over HTTP (see README) — file:// blocks module/texture loading.</small>`;
  }
}

boot();
