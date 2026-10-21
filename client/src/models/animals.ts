// Cartoon animals built from primitives, with simple procedural animation.
import * as THREE from 'three';
import type { AnimalId, AnimState } from '../../../shared/protocol.ts';

export interface AnimalRig {
  root: THREE.Group;
  body: THREE.Object3D;
  head: THREE.Object3D;
  armL: THREE.Object3D;
  armR: THREE.Object3D;
  legL: THREE.Object3D;
  legR: THREE.Object3D;
  /** Attachment point in the right hand for the held weapon. */
  hand: THREE.Object3D;
  tail: THREE.Object3D | null;
  phase: number;
}

const toon = (color: number) => new THREE.MeshToonMaterial({ color });

function part(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  m.castShadow = true;
  return m;
}

const sphere = new THREE.SphereGeometry(1, 20, 16);
const cyl = new THREE.CylinderGeometry(1, 1, 1, 12);
const cone = new THREE.ConeGeometry(1, 1, 12);

interface Palette {
  body: number;
  belly: number;
  limbs: number;
  head: number;
  ears: number;
  muzzle: number;
}

const PALETTES: Record<AnimalId, Palette> = {
  panda: { body: 0xf7f7f2, belly: 0xf7f7f2, limbs: 0x1d1d1f, head: 0xf7f7f2, ears: 0x1d1d1f, muzzle: 0xffffff },
  duck: { body: 0xffe14d, belly: 0xfff3a8, limbs: 0xffe14d, head: 0xffe14d, ears: 0xffe14d, muzzle: 0xff8a1f },
  shiba: { body: 0xd9883a, belly: 0xfff4e4, limbs: 0xd9883a, head: 0xd9883a, ears: 0xd9883a, muzzle: 0xfff4e4 },
  tanuki: { body: 0x8a6a4c, belly: 0xd9c2a0, limbs: 0x3b2c22, head: 0x8a6a4c, ears: 0x3b2c22, muzzle: 0xe8d8bf },
  monkey: { body: 0x9b8f86, belly: 0xc9beb4, limbs: 0x8a7f77, head: 0x9b8f86, ears: 0xe88b8b, muzzle: 0xec7b7b },
};

function limb(mat: THREE.Material, length: number, radius: number, x: number, y: number, z: number) {
  const pivot = new THREE.Group();
  pivot.position.set(x, y, z);
  const m = part(cyl, mat, 0, -length / 2, 0, radius, length, radius);
  const end = part(sphere, mat, 0, -length, 0, radius * 1.15, radius * 1.15, radius * 1.15);
  pivot.add(m, end);
  return pivot;
}

export function buildAnimal(id: AnimalId): AnimalRig {
  const pal = PALETTES[id];
  const root = new THREE.Group();
  const bodyMat = toon(pal.body);
  const limbMat = toon(pal.limbs);
  const black = toon(0x111111);
  const white = toon(0xffffff);

  const body = new THREE.Group();
  body.position.y = 0.55;
  root.add(body);
  body.add(part(sphere, bodyMat, 0, 0.35, 0, 0.48, 0.55, 0.42));
  body.add(part(sphere, toon(pal.belly), 0, 0.3, -0.2, 0.36, 0.42, 0.28));

  const head = new THREE.Group();
  head.position.set(0, 0.95, 0);
  body.add(head);
  head.add(part(sphere, toon(pal.head), 0, 0.15, 0, 0.42, 0.38, 0.4));

  // Eyes (shared for everyone), positioned on the front (-z) of the head.
  const eye = (x: number) => {
    head.add(part(sphere, white, x, 0.2, -0.34, 0.09, 0.1, 0.06));
    head.add(part(sphere, black, x, 0.2, -0.39, 0.05, 0.06, 0.03));
  };

  let tail: THREE.Object3D | null = null;
  const tailPivot = new THREE.Group();
  tailPivot.position.set(0, 0.2, 0.4);

  switch (id) {
    case 'panda': {
      head.add(part(sphere, black, -0.16, 0.2, -0.32, 0.12, 0.14, 0.06));
      head.add(part(sphere, black, 0.16, 0.2, -0.32, 0.12, 0.14, 0.06));
      head.add(part(sphere, toon(pal.ears), -0.3, 0.48, 0, 0.14, 0.14, 0.08));
      head.add(part(sphere, toon(pal.ears), 0.3, 0.48, 0, 0.14, 0.14, 0.08));
      head.add(part(sphere, black, 0, 0.05, -0.4, 0.06, 0.04, 0.04));
      body.add(part(sphere, limbMat, 0, 0.62, 0, 0.47, 0.18, 0.4)); // black shoulder band
      tailPivot.add(part(sphere, white, 0, 0, 0, 0.1, 0.1, 0.1));
      tail = tailPivot;
      break;
    }
    case 'duck': {
      head.add(part(sphere, toon(pal.muzzle), 0, 0.05, -0.42, 0.2, 0.07, 0.18));
      head.add(part(sphere, bodyMat, 0, 0.55, 0.05, 0.06, 0.1, 0.06)); // hair tuft
      tailPivot.add(part(cone, bodyMat, 0, 0.05, 0.08, 0.15, 0.3, 0.12).rotateX(Math.PI / 2.5));
      tail = tailPivot;
      break;
    }
    case 'shiba': {
      head.add(part(sphere, toon(pal.muzzle), 0, 0.02, -0.33, 0.2, 0.15, 0.16));
      head.add(part(sphere, black, 0, 0.08, -0.48, 0.05, 0.04, 0.04));
      head.add(part(cone, toon(pal.ears), -0.23, 0.52, 0, 0.12, 0.25, 0.08));
      head.add(part(cone, toon(pal.ears), 0.23, 0.52, 0, 0.12, 0.25, 0.08));
      const curl = part(new THREE.TorusGeometry(0.13, 0.06, 8, 16), bodyMat, 0, 0.12, 0.05);
      curl.rotation.y = Math.PI / 2;
      tailPivot.add(curl);
      tail = tailPivot;
      break;
    }
    case 'tanuki': {
      head.add(part(sphere, toon(0x2b2018), 0, 0.17, -0.3, 0.33, 0.12, 0.1)); // eye mask
      head.add(part(sphere, toon(pal.muzzle), 0, 0.0, -0.33, 0.17, 0.12, 0.12));
      head.add(part(sphere, black, 0, 0.05, -0.45, 0.05, 0.04, 0.04));
      head.add(part(sphere, toon(pal.ears), -0.27, 0.45, 0, 0.11, 0.11, 0.07));
      head.add(part(sphere, toon(pal.ears), 0.27, 0.45, 0, 0.11, 0.11, 0.07));
      // Big striped tail.
      for (let i = 0; i < 4; i++) {
        tailPivot.add(part(sphere, i % 2 ? toon(0x3b2c22) : bodyMat, 0, -0.05 - i * 0.02, 0.1 + i * 0.16, 0.18, 0.18, 0.12));
      }
      tail = tailPivot;
      break;
    }
    case 'monkey': {
      head.add(part(sphere, toon(pal.muzzle), 0, 0.12, -0.27, 0.27, 0.27, 0.16)); // red face
      head.add(part(sphere, toon(pal.ears), -0.42, 0.15, 0, 0.09, 0.12, 0.06));
      head.add(part(sphere, toon(pal.ears), 0.42, 0.15, 0, 0.09, 0.12, 0.06));
      head.add(part(sphere, toon(0xb5aaa1), 0, 0.42, 0, 0.36, 0.14, 0.34)); // fluffy fur cap
      tailPivot.add(part(sphere, bodyMat, 0, 0, 0.02, 0.08, 0.08, 0.08));
      tail = tailPivot;
      break;
    }
  }
  eye(-0.16);
  eye(0.16);
  if (tail) body.add(tail);

  const armMat = id === 'duck' ? bodyMat : limbMat;
  const armL = limb(armMat, 0.42, 0.11, -0.45, 0.6, 0);
  const armR = limb(armMat, 0.42, 0.11, 0.45, 0.6, 0);
  const hand = new THREE.Group();
  hand.position.set(0, -0.45, 0);
  armR.add(hand);
  body.add(armL, armR);

  const legMat = id === 'duck' ? toon(pal.muzzle) : limbMat;
  const legL = limb(legMat, 0.42, 0.13, -0.2, 0.42, 0);
  const legR = limb(legMat, 0.42, 0.13, 0.2, 0.42, 0);
  legL.position.y = legR.position.y = 0.5;
  root.add(legL, legR);
  if (id === 'duck') {
    for (const leg of [legL, legR]) leg.add(part(sphere, legMat, 0, -0.45, -0.12, 0.14, 0.05, 0.22));
  }

  return { root, body, head, armL, armR, legL, legR, hand, tail, phase: 0 };
}

/** Advance procedural animation. `speed` is horizontal m/s, `pitch` is look pitch in radians. */
export function animateAnimal(rig: AnimalRig, dt: number, speed: number, anim: AnimState, pitch: number, time: number, sitting = false) {
  const moving = !sitting && anim.moving && speed > 0.5;
  rig.phase += dt * (moving ? (anim.sprint ? 14 : 9) : 0);
  const swing = moving ? Math.sin(rig.phase) * (anim.sprint ? 0.9 : 0.6) : 0;

  if (sitting) {
    rig.legL.rotation.x = rig.legR.rotation.x = Math.PI / 2;
  } else if (!anim.grounded) {
    rig.legL.rotation.x = -0.6;
    rig.legR.rotation.x = 0.3;
  } else {
    rig.legL.rotation.x = swing;
    rig.legR.rotation.x = -swing;
  }
  rig.body.position.y = 0.55 + (moving ? Math.abs(Math.cos(rig.phase)) * 0.08 : Math.sin(time * 2) * 0.015);
  rig.body.rotation.x = moving && anim.sprint ? -0.15 : 0;

  // Arms hold the weapon forward and follow the aim pitch.
  const armX = Math.PI / 2 + pitch * 0.9 - (anim.aiming ? 0 : 0.25);
  rig.armR.rotation.x = armX;
  rig.armL.rotation.x = armX + 0.1;
  rig.armL.rotation.z = -0.5;
  rig.armR.rotation.z = 0.1;
  rig.head.rotation.x = pitch * 0.5;
  if (rig.tail) rig.tail.rotation.y = Math.sin(time * (moving ? 12 : 4)) * 0.4;
}
