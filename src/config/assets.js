// Single source of truth for every loadable asset. Swap a path here (or drop a
// replacement PNG with the same name into assets/) and the whole game updates —
// no code changes required. This satisfies the "trivial texture replacement"
// extensibility goal from the spec.

export const TEXTURES = {
  grass:        'assets/textures/grass.png',
  dirt:         'assets/textures/dirt.png',
  road:         'assets/textures/road.png',
  concrete:     'assets/textures/floor_concrete.png',
  brick:        'assets/textures/wall_brick.png',
  office:       'assets/textures/wall_inside_office.png',
  ceiling:      'assets/textures/ceiling.png',
  wood:         'assets/textures/wood.png',
  metal:        'assets/textures/metal.png',
  crate:        'assets/textures/crate.png',
};

// Sprite sheets use a 3-column (walk frames) x 4-row (Down/Left/Right/Up) layout.
// ROWS maps a facing bucket to its row index so directional billboarding is data-driven.
export const SHEETS = {
  zombie_basic:    { path: 'assets/sprites/zombie_basic.png',    cols: 3, rows: 4 },
  zombie_sprinter: { path: 'assets/sprites/zombie_sprinter.png', cols: 3, rows: 4 },
  zombie_tank:     { path: 'assets/sprites/zombie_tank.png',     cols: 3, rows: 4 },
  npc_peaceful:    { path: 'assets/sprites/npc_peaceful.png',    cols: 3, rows: 4 },
};
export const SHEET_ROWS = { front: 0, left: 1, right: 2, back: 3 };

export const ITEM_SPRITES = {
  ammo_pistol:  'assets/sprites/items/ammo_pistol.png',
  ammo_shotgun: 'assets/sprites/items/ammo_shotgun.png',
  ammo_rifle:   'assets/sprites/items/ammo_rifle.png',
  ammo_sniper:  'assets/sprites/items/ammo_sniper.png',
  health:       'assets/sprites/items/health.png',
};

export const WEAPON_SPRITES = {
  pistol:  'assets/sprites/weapons/pistol.png',
  shotgun: 'assets/sprites/weapons/shotgun.png',
  rifle:   'assets/sprites/weapons/rifle.png',
  sniper:  'assets/sprites/weapons/sniper.png',
  bat:     'assets/sprites/weapons/bat.png',
  muzzle:  'assets/sprites/weapons/muzzle.png',
};

export const MISC_SPRITES = {
  blood: 'assets/sprites/blood.png',
};
