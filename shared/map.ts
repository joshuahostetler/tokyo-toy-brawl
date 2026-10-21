// Deterministic layout of the toy Tokyo map. Shared so the server knows spawn points
// and the client can build identical geometry and colliders on every machine.
import type { Vec3, VehicleKind } from './protocol.ts';

export const MAP_HALF = 100;
export const ROAD_WIDTH = 12;
/** Road centerlines; roads run along both axes at each of these coordinates. */
export const ROAD_LINES = [-60, 0, 60];

export type District = 'shinjuku' | 'akihabara' | 'shrine' | 'tower' | 'city';

export interface Building {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  color: number;
  district: District;
  /** Neon sign text, if any. */
  sign: string | null;
  signColor: number;
}

export type PropKind =
  | 'torii' | 'pagoda' | 'sakura' | 'lantern' | 'tower' | 'vending'
  | 'tissuebox' | 'taperoll' | 'eraser' | 'mug';

export interface Prop {
  kind: PropKind;
  x: number;
  z: number;
  rot: number;
}

export interface VehicleSpawn {
  kind: VehicleKind;
  p: Vec3;
  yaw: number;
}

export interface Box3Data {
  min: Vec3;
  max: Vec3;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SIGNS = [
  'ラーメン', 'カラオケ', 'ゲーム', 'すし', 'たこやき', 'まんが', 'コーヒー',
  'ネオン', 'パンダ', 'おもちゃ', 'ガチャ', 'TOKYO', 'アニメ', 'うどん',
];
const SIGN_COLORS = [0xff2fa8, 0x29f0ff, 0xfff23a, 0x7dff5a, 0xff6b2b, 0xb06bff];
const BUILDING_COLORS: Record<District, number[]> = {
  shinjuku: [0x3a4a6b, 0x2e3a55, 0x55607a, 0x434c66],
  akihabara: [0xe8d9c4, 0xd9a07a, 0xc5cfd8, 0xf0c8a0],
  city: [0xd8d2c8, 0xb9c3cc, 0xe6d3b3, 0xa9b4a6, 0xcdb9a9],
  shrine: [0x8a3b2a],
  tower: [0xffffff],
};

/** Blocks between roads, as [min, max] intervals on one axis. */
const BLOCK_SPANS: [number, number][] = [
  [-MAP_HALF, -66], [-54, -6], [6, 54], [66, MAP_HALF],
];

function districtFor(bx: [number, number], bz: [number, number]): District {
  if (bx[0] === -54 && bz[0] === -54) return 'shrine';
  if (bx[0] === 6 && bz[0] === 6) return 'tower';
  if (bx[0] === 6 && bz[0] === -54) return 'shinjuku';
  if (bx[0] === -54 && bz[0] === 6) return 'akihabara';
  return 'city';
}

function generate() {
  const rand = mulberry32(1964);
  const pick = <T>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
  const buildings: Building[] = [];
  const props: Prop[] = [];

  for (const bx of BLOCK_SPANS) {
    for (const bz of BLOCK_SPANS) {
      const district = districtFor(bx, bz);
      const inset = 2;
      const x0 = bx[0] + inset, x1 = bx[1] - inset;
      const z0 = bz[0] + inset, z1 = bz[1] - inset;
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;

      if (district === 'shrine') {
        props.push({ kind: 'torii', x: cx, z: z1 - 4, rot: 0 });
        props.push({ kind: 'torii', x: cx, z: z1 - 14, rot: 0 });
        props.push({ kind: 'pagoda', x: cx, z: z0 + 10, rot: 0 });
        for (const [dx, dz] of [[-12, 6], [12, 6], [-14, -8], [14, -8], [-6, 16], [6, -16], [-16, 16], [16, 16]]) {
          props.push({ kind: 'sakura', x: cx + dx, z: cz + dz, rot: rand() * Math.PI * 2 });
        }
        for (const dz of [-2, 6]) {
          props.push({ kind: 'lantern', x: cx - 4, z: cz + dz, rot: 0 });
          props.push({ kind: 'lantern', x: cx + 4, z: cz + dz, rot: 0 });
        }
        continue;
      }
      if (district === 'tower') {
        props.push({ kind: 'tower', x: cx, z: cz, rot: 0 });
        for (const [dx, dz] of [[-16, -16], [16, -16], [-16, 16], [16, 16], [0, -18], [-18, 0]]) {
          props.push({ kind: 'sakura', x: cx + dx, z: cz + dz, rot: rand() * Math.PI * 2 });
        }
        continue;
      }

      // Split each block into a 2x2 grid of buildings with alleys between them.
      const alley = district === 'akihabara' ? 10 : 8;
      const outer = bx[0] === -MAP_HALF || bx[1] === MAP_HALF || bz[0] === -MAP_HALF || bz[1] === MAP_HALF;
      const cols = outer && (x1 - x0) < 40 ? 1 : 2;
      const rows = outer && (z1 - z0) < 40 ? 1 : 2;
      const cellW = (x1 - x0 - alley * (cols - 1)) / cols;
      const cellD = (z1 - z0 - alley * (rows - 1)) / rows;
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          const w = cellW - rand() * 3;
          const d = cellD - rand() * 3;
          const x = x0 + i * (cellW + alley) + cellW / 2;
          const z = z0 + j * (cellD + alley) + cellD / 2;
          const h =
            district === 'shinjuku' ? 38 + rand() * 32
            : district === 'akihabara' ? 10 + rand() * 10
            : 12 + rand() * 20;
          const hasSign = district !== 'city' || rand() < 0.6;
          buildings.push({
            x, z, w, d, h, district,
            color: pick(BUILDING_COLORS[district]),
            sign: hasSign ? pick(SIGNS) : null,
            signColor: pick(SIGN_COLORS),
          });
        }
      }
      if (district === 'akihabara') {
        props.push({ kind: 'vending', x: cx - 3, z: cz, rot: Math.PI / 2 });
        props.push({ kind: 'vending', x: cx + 3, z: cz, rot: -Math.PI / 2 });
      }
    }
  }

  // Giant household-object cover around the Shibuya-style scramble crossing.
  // Colliders are axis-aligned, so cover is never rotated.
  const cover: [PropKind, number, number][] = [
    ['tissuebox', 3, 26], ['taperoll', -22, -1], ['eraser', 24, 2], ['mug', -2, -24],
    ['tissuebox', 0, 44], ['taperoll', 44, 0], ['eraser', -44, 1], ['mug', -1, -44],
    ['vending', 14, 14], ['vending', -14, -14], ['taperoll', 14, -2], ['mug', -12, 2],
  ];
  for (const [kind, x, z] of cover) props.push({ kind, x, z, rot: 0 });

  return { buildings, props };
}

export const { buildings: BUILDINGS, props: PROPS } = generate();

/** Collision boxes for props that players and vehicles bump into. */
export function propColliders(p: Prop): Box3Data[] {
  const box = (hx: number, h: number, hz: number, ox = 0, oz = 0, y0 = 0): Box3Data => ({
    min: [p.x + ox - hx, y0, p.z + oz - hz],
    max: [p.x + ox + hx, y0 + h, p.z + oz + hz],
  });
  switch (p.kind) {
    case 'torii': return [box(0.5, 7, 0.5, -4), box(0.5, 7, 0.5, 4)];
    case 'pagoda': return [box(5, 18, 5)];
    case 'sakura': return [box(0.5, 3, 0.5)];
    case 'lantern': return [box(0.5, 2.2, 0.5)];
    case 'tower': return [box(1.5, 20, 1.5, -7, -7), box(1.5, 20, 1.5, 7, -7), box(1.5, 20, 1.5, -7, 7), box(1.5, 20, 1.5, 7, 7)];
    case 'vending': return [box(1, 2.4, 1)];
    case 'tissuebox': return [box(2.5, 3, 1.6)];
    case 'taperoll': return [box(2.2, 1.6, 2.2)];
    case 'eraser': return [box(2.6, 1.4, 1.4)];
    case 'mug': return [box(1.6, 3.2, 1.6)];
  }
}

export function allColliders(): Box3Data[] {
  const out: Box3Data[] = BUILDINGS.map((b) => ({
    min: [b.x - b.w / 2, 0, b.z - b.d / 2],
    max: [b.x + b.w / 2, b.h, b.z + b.d / 2],
  }));
  for (const p of PROPS) out.push(...propColliders(p));
  return out;
}

export const LOOT_SPAWNS: Vec3[] = [
  [0, 0.6, 0], [30, 0.6, 0], [-30, 0.6, 0], [0, 0.6, 30], [0, 0.6, -30],
  [60, 0.6, 60], [-60, 0.6, -60], [60, 0.6, -60], [-60, 0.6, 60],
  [60, 0.6, 0], [-60, 0.6, 0], [0, 0.6, 60], [0, 0.6, -60],
  [30, 0.6, -30], [-30, 0.6, 30], [-30, 0.6, -36], [30, 0.6, 16],
  [84, 0.6, 30], [-84, 0.6, -30], [30, 0.6, 84], [-30, 0.6, -84],
];

export const VEHICLE_SPAWNS: VehicleSpawn[] = [
  { kind: 'kart', p: [-3, 0, 10], yaw: 0 },
  { kind: 'kart', p: [3, 0, -10], yaw: Math.PI },
  { kind: 'kart', p: [-60, 0, 20], yaw: 0 },
  { kind: 'car', p: [10, 0, 3], yaw: -Math.PI / 2 },
  { kind: 'car', p: [60, 0, -20], yaw: Math.PI },
  { kind: 'plane', p: [-88, 0, 60], yaw: -Math.PI / 2 },
  { kind: 'plane', p: [88, 0, -60], yaw: Math.PI / 2 },
];

export const PLAYER_SPAWNS: { p: Vec3; yaw: number }[] = [
  { p: [0, 1, 20], yaw: 0 },
  { p: [0, 1, -20], yaw: Math.PI },
  { p: [20, 1, 0], yaw: Math.PI / 2 },
  { p: [-20, 1, 0], yaw: -Math.PI / 2 },
  { p: [-30, 1, -30], yaw: Math.PI / 4 },
  { p: [30, 1, 44], yaw: Math.PI },
  { p: [60, 1, 40], yaw: 0 },
  { p: [-60, 1, -40], yaw: Math.PI },
  { p: [-40, 1, 60], yaw: -Math.PI / 2 },
  { p: [40, 1, -60], yaw: Math.PI / 2 },
];
