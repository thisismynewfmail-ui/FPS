import { WEAPON_SPRITES } from '../config/assets.js';

// Pure data. Add a weapon by appending an object here — no system changes needed.
// fireRate is seconds between shots; spread is radians; range in metres.
export const WEAPON_DEFS = [
  {
    id: 'pistol', name: 'M9 PISTOL', icon: WEAPON_SPRITES.pistol, view: 'pistol', ammoType: 'pistol',
    auto: false, damage: 26, fireRate: 0.17, mag: 12, reserve: 60, maxReserve: 240,
    reload: 1.1, pellets: 1, spread: 0.012, range: 110, knock: 1.2, recoil: 0.5, sound: 'pistol',
  },
  {
    id: 'shotgun', name: 'PUMP SHOTGUN', icon: WEAPON_SPRITES.shotgun, view: 'shotgun', ammoType: 'shotgun',
    auto: false, damage: 15, fireRate: 0.8, mag: 8, reserve: 32, maxReserve: 120,
    reload: 2.0, pellets: 9, spread: 0.11, range: 34, knock: 3.2, recoil: 1.3, sound: 'shotgun',
  },
  {
    id: 'rifle', name: 'AK ASSAULT', icon: WEAPON_SPRITES.rifle, view: 'rifle', ammoType: 'rifle',
    auto: true, damage: 22, fireRate: 0.092, mag: 30, reserve: 180, maxReserve: 540,
    reload: 2.1, pellets: 1, spread: 0.022, range: 130, knock: 1.0, recoil: 0.7, sound: 'rifle',
  },
  {
    id: 'sniper', name: 'BOLT SNIPER', icon: WEAPON_SPRITES.sniper, view: 'sniper', ammoType: 'sniper',
    auto: false, damage: 220, fireRate: 1.1, mag: 5, reserve: 25, maxReserve: 80,
    reload: 2.5, pellets: 1, spread: 0.0, range: 320, knock: 4, recoil: 1.6, sound: 'sniper',
    zoomFOV: 32,
  },
  {
    id: 'bat', name: 'BASEBALL BAT', icon: WEAPON_SPRITES.bat, view: 'bat', ammoType: null,
    auto: false, damage: 42, fireRate: 0.42, mag: Infinity, reserve: Infinity, maxReserve: Infinity,
    reload: 0, pellets: 1, spread: 0, range: 3.0, knock: 5, recoil: 0.9, sound: 'melee', melee: true,
  },
];
