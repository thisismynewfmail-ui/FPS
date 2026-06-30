// Zombie archetypes. Add a new variant by appending here and dropping a sheet
// into config/assets.js — Zombie reads everything from these stat blocks.
// width derives from the sheet cell aspect (~170/256).
const AR = 170 / 256;

export const ZOMBIE_TYPES = {
  walker: {
    key: 'walker', sheet: 'zombie_basic', hp: 30, speed: 1.7, damage: 9,
    attackRange: 1.8, attackRate: 1.0, points: 1,
    height: 1.9, width: 1.9 * AR, hitRadius: 0.62, radius: 0.42,
    animFps: 5, color: 0xdedede, knockResist: 1.0,
  },
  sprinter: {
    key: 'sprinter', sheet: 'zombie_sprinter', hp: 15, speed: 4.6, damage: 7,
    attackRange: 1.7, attackRate: 0.8, points: 2,
    height: 1.78, width: 1.78 * AR, hitRadius: 0.56, radius: 0.38,
    animFps: 12, color: 0xeae2d2, knockResist: 1.2,
  },
  tank: {
    key: 'tank', sheet: 'zombie_tank', hp: 240, speed: 1.25, damage: 26,
    attackRange: 2.4, attackRate: 1.6, points: 5,
    height: 3.0, width: 3.0 * AR, hitRadius: 0.95, radius: 0.8,
    animFps: 4, color: 0xc8d0c0, knockResist: 0.25,
  },
};
