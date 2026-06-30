import { NPC_SIZE } from '../config/constants.js';

// Zombie archetypes. Add a new variant by appending here and dropping a sheet
// into config/assets.js — Zombie reads everything from these stat blocks.
// All sprite NPCs share NPC_SIZE.HEIGHT so the peaceful survivor and every
// zombie stand at a consistent height; width derives from the cell aspect.
const H = NPC_SIZE.HEIGHT;
const W = H * NPC_SIZE.ASPECT;

export const ZOMBIE_TYPES = {
  walker: {
    key: 'walker', sheet: 'zombie_basic', hp: 30, speed: 1.7, damage: 9,
    attackRange: 1.9, attackRate: 1.0, points: 1,
    height: H, width: W, hitRadius: 0.85, radius: 0.5,
    animFps: 5, color: 0xdedede, knockResist: 1.0,
  },
  sprinter: {
    key: 'sprinter', sheet: 'zombie_sprinter', hp: 15, speed: 4.6, damage: 7,
    attackRange: 1.8, attackRate: 0.8, points: 2,
    height: H, width: W, hitRadius: 0.78, radius: 0.45,
    animFps: 12, color: 0xeae2d2, knockResist: 1.2,
  },
  tank: {
    key: 'tank', sheet: 'zombie_tank', hp: 240, speed: 1.25, damage: 26,
    attackRange: 2.2, attackRate: 1.6, points: 5,
    height: H, width: W, hitRadius: 0.95, radius: 0.85,
    animFps: 4, color: 0xc8d0c0, knockResist: 0.25,
  },
};
