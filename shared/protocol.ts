// Shared game constants and network message types used by both client and server.

export const MAX_PLAYERS = 8;
export const MAX_HEALTH = 100;
export const RESPAWN_SECONDS = 3;
export const SNAPSHOT_HZ = 20;
export const LOOT_RESPAWN_SECONDS = 20;
export const PICKUP_RADIUS = 2.2;
export const VEHICLE_ENTER_RADIUS = 4;
/** A fresh vehicle appears at a spawn spot once its vehicle has been driven this far away. */
export const VEHICLE_RESPAWN_DISTANCE = 8;
/** Empty vehicles that are not parked at a spawn spot vanish after this long. */
export const ABANDONED_VEHICLE_SECONDS = 30;
export const POGO_GRAB_RADIUS = 2.2;

export const ANIMALS = ['panda', 'duck', 'shiba', 'tanuki', 'monkey'] as const;
export type AnimalId = (typeof ANIMALS)[number];

export const ANIMAL_NAMES: Record<AnimalId, string> = {
  panda: 'Panda',
  duck: 'Duck',
  shiba: 'Shiba Inu',
  tanuki: 'Tanuki',
  monkey: 'Snow Monkey',
};

export type WeaponId = 'slingshot' | 'watergun' | 'foam' | 'paintball' | 'duckzooka';

export interface WeaponDef {
  id: WeaponId;
  name: string;
  ammoName: string;
  /** Damage per projectile ("soak" points, not lethal — players get splatted and respawn). */
  damage: number;
  /** Seconds between shots. */
  fireInterval: number;
  /** Projectile speed in m/s. */
  speed: number;
  /** Multiplier on world gravity for projectiles. */
  gravity: number;
  /** Radians of random spread when hip-firing. */
  spread: number;
  /** Radians of random spread while aiming (right mouse). */
  aimSpread: number;
  pellets: number;
  startAmmo: number;
  maxAmmo: number;
  /** Ammo granted by an ammo box. */
  boxAmmo: number;
  color: number;
  /** Projectile radius in meters. */
  size: number;
  /** Times the projectile bounces before vanishing. */
  bounces: number;
  /** Knockback impulse applied to the target. */
  knockback: number;
  /** Projectile lifetime in seconds. */
  lifetime: number;
  /** Leaves a paint splat where it lands. */
  splats: boolean;
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  slingshot: {
    id: 'slingshot', name: 'Slingshot', ammoName: 'Mochi Pellets',
    damage: 25, fireInterval: 0.55, speed: 45, gravity: 1, spread: 0.02, aimSpread: 0.002,
    pellets: 1, startAmmo: 30, maxAmmo: 60, boxAmmo: 20, color: 0xfff4e0, size: 0.12,
    bounces: 1, knockback: 3, lifetime: 3, splats: false,
  },
  watergun: {
    id: 'watergun', name: 'Super Soaker', ammoName: 'Water',
    damage: 6, fireInterval: 0.07, speed: 32, gravity: 0.6, spread: 0.05, aimSpread: 0.02,
    pellets: 1, startAmmo: 150, maxAmmo: 300, boxAmmo: 100, color: 0x4fc3ff, size: 0.08,
    bounces: 0, knockback: 0.6, lifetime: 0.9, splats: false,
  },
  foam: {
    id: 'foam', name: 'Foam Dart Blaster', ammoName: 'Foam Darts',
    damage: 14, fireInterval: 0.16, speed: 60, gravity: 0.25, spread: 0.035, aimSpread: 0.006,
    pellets: 1, startAmmo: 48, maxAmmo: 96, boxAmmo: 36, color: 0xff7a1a, size: 0.07,
    bounces: 0, knockback: 1.5, lifetime: 2.5, splats: false,
  },
  paintball: {
    id: 'paintball', name: 'Paintball Marker', ammoName: 'Paintballs',
    damage: 20, fireInterval: 0.22, speed: 80, gravity: 0.35, spread: 0.025, aimSpread: 0.003,
    pellets: 1, startAmmo: 40, maxAmmo: 80, boxAmmo: 30, color: 0xff2fa8, size: 0.09,
    bounces: 0, knockback: 1.5, lifetime: 2.5, splats: true,
  },
  duckzooka: {
    id: 'duckzooka', name: 'Rubber Duckzooka', ammoName: 'Rubber Ducks',
    damage: 45, fireInterval: 1.1, speed: 28, gravity: 1, spread: 0.01, aimSpread: 0.002,
    pellets: 1, startAmmo: 5, maxAmmo: 12, boxAmmo: 4, color: 0xffd400, size: 0.35,
    bounces: 3, knockback: 14, lifetime: 5, splats: false,
  },
};

export const WEAPON_IDS = Object.keys(WEAPONS) as WeaponId[];
export const STARTING_WEAPON: WeaponId = 'slingshot';

export type VehicleKind = 'kart' | 'car' | 'plane';
export type LootKind = 'health' | 'ammo' | 'weapon';

export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number];

export interface AnimState {
  moving: boolean;
  sprint: boolean;
  aiming: boolean;
  grounded: boolean;
}

export interface PlayerInfo {
  id: number;
  name: string;
  animal: AnimalId;
  health: number;
  alive: boolean;
  splats: number;
  splatted: number;
}

export interface PlayerSnapshot {
  id: number;
  p: Vec3;
  yaw: number;
  pitch: number;
  anim: AnimState;
  weapon: WeaponId;
  vehicle: number | null;
}

export interface VehicleState {
  id: number;
  kind: VehicleKind;
  p: Vec3;
  q: Quat;
  driver: number | null;
}

export interface PogoState {
  /** Player riding the pogo stick, or null while it lies on the ground at `p`. */
  holder: number | null;
  p: Vec3;
}

export interface LootState {
  id: number;
  p: Vec3;
  active: boolean;
}

export type LootGrant =
  | { kind: 'health'; amount: number }
  /** Refills every weapon the player owns by its `boxAmmo`. */
  | { kind: 'ammo' }
  | { kind: 'weapon'; weapon: WeaponId; amount: number };

export type ClientMsg =
  | { t: 'join'; name: string; animal: AnimalId }
  | {
      t: 'state';
      p: Vec3;
      yaw: number;
      pitch: number;
      anim: AnimState;
      weapon: WeaponId;
      veh: { p: Vec3; q: Quat } | null;
    }
  | { t: 'fire'; weapon: WeaponId; origin: Vec3; dirs: Vec3[] }
  | { t: 'hit'; target: number; weapon: WeaponId; dir: Vec3 }
  | { t: 'bonk'; target: number; dir: Vec3 }
  | { t: 'pickup'; loot: number }
  | { t: 'pogoGrab' }
  | { t: 'enter'; vehicle: number }
  /**
   * Leave the vehicle (or, after being splatted while driving, just park it).
   * `veh` is the vehicle's resting pose so planes don't hang in mid-air.
   */
  | { t: 'exit'; p: Vec3; veh: { p: Vec3; q: Quat } };

export type ServerMsg =
  | { t: 'welcome'; id: number; players: PlayerInfo[]; loot: LootState[]; vehicles: VehicleState[]; pogo: PogoState }
  | { t: 'full' }
  | { t: 'joined'; player: PlayerInfo }
  | { t: 'left'; id: number }
  | { t: 'snap'; players: PlayerSnapshot[]; vehicles: VehicleState[] }
  | { t: 'fire'; id: number; weapon: WeaponId; origin: Vec3; dirs: Vec3[] }
  | { t: 'health'; id: number; health: number; attacker: number | null; knock: Vec3 | null }
  | { t: 'splat'; target: number; attacker: number | null; weapon: WeaponId | 'bonk'; players: PlayerInfo[] }
  | { t: 'respawn'; id: number; p: Vec3; yaw: number }
  | { t: 'loot'; id: number; active: boolean; by: number | null; grant: LootGrant | null }
  | { t: 'driver'; vehicle: number; driver: number | null; exitP: Vec3 | null }
  | { t: 'pogo'; pogo: PogoState };
