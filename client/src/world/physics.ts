// Minimal axis-aligned collision world: everything solid is a box, the ground is y = 0.
import * as THREE from 'three';
import { MAP_HALF, allColliders, type Box3Data } from '../../../shared/map.ts';

export const GRAVITY = 24;
const STEP_HEIGHT = 0.6;
const EPS = 0.001;

export interface Collider {
  min: THREE.Vector3;
  max: THREE.Vector3;
}

export const colliders: Collider[] = allColliders().map((b: Box3Data) => ({
  min: new THREE.Vector3(...b.min),
  max: new THREE.Vector3(...b.max),
}));

/**
 * Moves an axis-aligned body (half-width `r`, height `h`, feet at `pos.y`) by `vel * dt`,
 * resolving collisions per axis. Mutates `pos` and zeroes blocked velocity components.
 * Returns which directions were blocked.
 */
export function moveBody(pos: THREE.Vector3, vel: THREE.Vector3, r: number, h: number, dt: number, canStep = true) {
  const result = { grounded: false, hitWall: false };

  for (const axis of ['x', 'z'] as const) {
    pos[axis] += vel[axis] * dt;
    for (const c of colliders) {
      if (!overlaps(pos, r, h, c)) continue;
      if (canStep && c.max.y - pos.y <= STEP_HEIGHT && !blockedAbove(pos, r, h, c.max.y)) {
        pos.y = c.max.y + EPS;
        continue;
      }
      pos[axis] = vel[axis] > 0 ? c.min[axis] - r - EPS : c.max[axis] + r + EPS;
      vel[axis] = 0;
      result.hitWall = true;
    }
    const limit = MAP_HALF - r;
    if (Math.abs(pos[axis]) > limit) {
      pos[axis] = Math.sign(pos[axis]) * limit;
      vel[axis] = 0;
      result.hitWall = true;
    }
  }

  pos.y += vel.y * dt;
  for (const c of colliders) {
    if (!overlaps(pos, r, h, c)) continue;
    if (vel.y <= 0) {
      pos.y = c.max.y + EPS;
      result.grounded = true;
    } else {
      pos.y = c.min.y - h - EPS;
    }
    vel.y = 0;
  }
  if (pos.y <= 0) {
    pos.y = 0;
    if (vel.y < 0) vel.y = 0;
    result.grounded = true;
  }
  return result;
}

function overlaps(pos: THREE.Vector3, r: number, h: number, c: Collider) {
  return (
    pos.x + r > c.min.x && pos.x - r < c.max.x &&
    pos.z + r > c.min.z && pos.z - r < c.max.z &&
    pos.y + h > c.min.y && pos.y < c.max.y
  );
}

function blockedAbove(pos: THREE.Vector3, r: number, h: number, y: number) {
  const probe = new THREE.Vector3(pos.x, y + EPS, pos.z);
  return colliders.some((c) => overlaps(probe, r, h, c));
}

/** True when standing on something (used to allow jumping off rooftops and props). */
export function isSupported(pos: THREE.Vector3, r: number) {
  if (pos.y <= 0.02) return true;
  return colliders.some(
    (c) => Math.abs(c.max.y - pos.y) < 0.05 &&
      pos.x + r > c.min.x && pos.x - r < c.max.x && pos.z + r > c.min.z && pos.z - r < c.max.z,
  );
}

export interface RayHit {
  t: number;
  point: THREE.Vector3;
  normal: THREE.Vector3;
}

/** First intersection of segment `from -> to` with the world (boxes and ground), or null. */
export function segmentCast(from: THREE.Vector3, to: THREE.Vector3): RayHit | null {
  const dir = new THREE.Vector3().subVectors(to, from);
  let best: RayHit | null = null;

  if (to.y < 0 && from.y >= 0) {
    const t = from.y / (from.y - to.y);
    best = { t, point: from.clone().addScaledVector(dir, t), normal: new THREE.Vector3(0, 1, 0) };
  }

  for (const c of colliders) {
    let tmin = 0;
    let tmax = best ? best.t : 1;
    let hitAxis = -1;
    let hitSign = 0;
    let missed = false;
    for (let a = 0; a < 3; a++) {
      const o = from.getComponent(a);
      const d = dir.getComponent(a);
      const lo = c.min.getComponent(a);
      const hi = c.max.getComponent(a);
      if (Math.abs(d) < 1e-9) {
        if (o < lo || o > hi) { missed = true; break; }
        continue;
      }
      let t1 = (lo - o) / d;
      let t2 = (hi - o) / d;
      let sign = -1;
      if (t1 > t2) { [t1, t2] = [t2, t1]; sign = 1; }
      if (t1 > tmin) { tmin = t1; hitAxis = a; hitSign = sign; }
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) { missed = true; break; }
    }
    if (missed || hitAxis < 0) continue;
    const normal = new THREE.Vector3();
    normal.setComponent(hitAxis, hitSign);
    best = { t: tmin, point: from.clone().addScaledVector(dir, tmin), normal };
  }
  return best;
}

/** True if a body at `pos` would intersect any solid box. */
export function overlapsAny(pos: THREE.Vector3, r: number, h: number) {
  return colliders.some((c) => overlaps(pos, r, h, c));
}

/** Height of the highest surface directly below (x, fromY, z). */
export function groundBelow(x: number, z: number, fromY: number) {
  const hit = segmentCast(new THREE.Vector3(x, fromY, z), new THREE.Vector3(x, -1, z));
  return hit ? Math.max(0, hit.point.y) : 0;
}
