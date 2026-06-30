import * as THREE from 'three';
import { TEXTURES, SHEETS, ITEM_SPRITES, WEAPON_SPRITES, MISC_SPRITES } from '../config/assets.js';
import { EMBEDDED } from '../generated/assets_data.js';

// Loads every texture declared in config/assets.js and applies retro filtering.
// Worlds textures wrap+repeat; sprites use clamp. All use NEAREST for the
// crunchy 2003-era look. Weapon/HUD images that are pure DOM are returned as URLs.
export class AssetLoader {
  constructor() {
    this.loader = new THREE.TextureLoader();
    // When opened directly from disk (file://), a crossOrigin="anonymous" <img>
    // request fails CORS, so textures never load. Drop the CORS attribute there
    // so the game also runs by simply double-clicking index.html.
    if (typeof location !== 'undefined' && location.protocol === 'file:') {
      this.loader.crossOrigin = null;
    }
    this.textures = {};   // name -> THREE.Texture (tileable world surfaces)
    this.sheets = {};     // name -> { tex, cols, rows }
    this.items = {};      // name -> THREE.Texture
    this.misc = {};       // name -> THREE.Texture
    this.weaponURLs = WEAPON_SPRITES;   // DOM <img> overlays use raw URLs
    this.itemURLs = ITEM_SPRITES;
  }

  _load(url) {
    // Prefer the embedded data: URI (works offline / from file://); fall back to
    // the on-disk path when running unbundled from a dev server.
    const src = EMBEDDED[url] || url;
    return new Promise((resolve, reject) => {
      this.loader.load(src, resolve, undefined, () => reject(new Error('failed to load ' + url)));
    });
  }

  _retroWorld(tex) {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestMipmapNearestFilter;
    tex.generateMipmaps = true;
    tex.anisotropy = 1;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  _retroSprite(tex) {
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  async loadAll(onProgress) {
    const jobs = [];
    const total = Object.keys(TEXTURES).length + Object.keys(SHEETS).length +
      Object.keys(ITEM_SPRITES).length + Object.keys(MISC_SPRITES).length;
    let done = 0;
    const tick = () => { done++; onProgress && onProgress(done / total); };

    for (const [name, url] of Object.entries(TEXTURES)) {
      jobs.push(this._load(url).then((t) => { this.textures[name] = this._retroWorld(t); tick(); }));
    }
    for (const [name, def] of Object.entries(SHEETS)) {
      jobs.push(this._load(def.path).then((t) => {
        this.sheets[name] = { tex: this._retroSprite(t), cols: def.cols, rows: def.rows };
        tick();
      }));
    }
    for (const [name, url] of Object.entries(ITEM_SPRITES)) {
      jobs.push(this._load(url).then((t) => { this.items[name] = this._retroSprite(t); tick(); }));
    }
    for (const [name, url] of Object.entries(MISC_SPRITES)) {
      jobs.push(this._load(url).then((t) => { this.misc[name] = this._retroSprite(t); tick(); }));
    }
    await Promise.all(jobs);
    return this;
  }

  tex(name) { return this.textures[name]; }
  sheet(name) { return this.sheets[name]; }
  item(name) { return this.items[name]; }
}
