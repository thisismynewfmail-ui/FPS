// Central gameplay constants. Tweak balance here without touching systems.
export const WIN_KILLS = 250000;          // exact victory threshold — enforced, no shortcuts

// Shared default size for every billboarded sprite NPC (the peaceful survivor
// AND all zombie types) so they all stand at a consistent height. EYE_FRAC /
// FEET_FRAC are measured from the sprite cell (eyes/feet as a fraction of cell
// height from the bottom); ASPECT is the cell's width/height.
export const NPC_SIZE = {
  HEIGHT: 2.7,            // default billboard height (metres) — zombies
  PEACEFUL_HEIGHT: 2.45,  // peaceful survivors stand a touch shorter
  EYE_FRAC: 0.562,
  FEET_FRAC: 0.012,
  ASPECT: 170 / 256,
};

export const WORLD = {
  SIZE: 220,            // half-extent of the playable square (units = metres)
  CELL: 2,             // nav-grid cell size
  SEED: 1337,          // fixed seed -> consistent world between playthroughs
  FOG_NEAR: 18,
  FOG_FAR: 95,
  FOG_COLOR: 0x10131a,
  SKY_TOP: 0x1a2233,
  SKY_BOTTOM: 0x39414e,
};

export const PLAYER = {
  EYE_HEIGHT: 1.65,
  CROUCH_HEIGHT: 0.95,
  RADIUS: 0.4,
  WALK_SPEED: 5.2,
  SPRINT_SPEED: 8.6,
  CROUCH_SPEED: 2.6,
  ACCEL: 60,
  FRICTION: 10,
  JUMP_SPEED: 6.4,
  GRAVITY: 20,
  MAX_HEALTH: 100,
  MOUSE_SENS: 0.0022,
  FOV: 90,
  BOB_WALK: 0.045,
  BOB_SPRINT: 0.085,
};

export const COMBAT = {
  ZOMBIE_HEAR_RADIUS: 42,   // base gunshot hearing radius
  ZOMBIE_SIGHT_RANGE: 55,
  ZOMBIE_SIGHT_FOV: Math.PI * 0.8,
  MAX_ACTIVE_ZOMBIES: 130,  // hard cap for performance
};

// Difficulty curve helper: 0 at start -> 1 at win.
export function difficulty(killCount) {
  return Math.min(1, killCount / WIN_KILLS);
}
