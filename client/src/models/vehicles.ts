// Cartoon vehicles held together with giant household objects: paperclips, tape, zip ties, spools...
import * as THREE from 'three';
import type { VehicleKind } from '../../../shared/protocol.ts';

export interface VehicleModel {
  root: THREE.Group;
  wheels: THREE.Object3D[];
  propeller: THREE.Object3D | null;
  /** Where the driver's feet go, in vehicle-local space. */
  seat: THREE.Vector3;
  /** Half-size of the collision footprint (x, z) and height. */
  half: { x: number; z: number; h: number };
}

const toon = (color: number, extra: THREE.MeshToonMaterialParameters = {}) =>
  new THREE.MeshToonMaterial({ color, ...extra });

function m(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** A giant paperclip: a wire bent into nested rounded loops, lying in the XZ plane. */
function paperclip(length: number, width: number, color = 0xc0c7cf) {
  const pts: THREE.Vector3[] = [];
  const loops = [
    { l: length, w: width },
    { l: length * 0.82, w: width * 0.66 },
    { l: length * 0.6, w: width * 0.36 },
  ];
  loops.forEach(({ l, w }, i) => {
    const r = w / 2;
    const zTop = -length / 2 + r;
    const zBot = zTop + l - w;
    const startAngle = i % 2 === 0 ? 0 : Math.PI;
    for (let a = 0; a <= Math.PI; a += Math.PI / 10) {
      const ang = startAngle + a;
      const zc = i % 2 === 0 ? zTop : zBot;
      pts.push(new THREE.Vector3(Math.cos(ang) * r, 0, zc - Math.sin(ang) * r * (i % 2 === 0 ? 1 : -1)));
    }
  });
  const curve = new THREE.CatmullRomCurve3(pts);
  return new THREE.Mesh(
    new THREE.TubeGeometry(curve, 120, 0.05, 8, false),
    new THREE.MeshStandardMaterial({ color, metalness: 0.9, roughness: 0.25 }),
  );
}

function zipTie(radius: number, x: number, y: number, z: number, axis: 'x' | 'z') {
  const t = m(new THREE.TorusGeometry(radius, 0.03, 4, 16), toon(0x111111), x, y, z);
  t.rotation[axis === 'x' ? 'y' : 'x'] = Math.PI / 2;
  return t;
}

function bottleCap(r: number) {
  const g = new THREE.Group();
  g.add(m(new THREE.CylinderGeometry(r, r, r * 0.7, 18).rotateZ(Math.PI / 2), toon(0xe53935)));
  g.add(m(new THREE.CylinderGeometry(r * 0.75, r * 0.75, r * 0.72, 18).rotateZ(Math.PI / 2), toon(0xffffff)));
  return g;
}

function spool(r: number) {
  const g = new THREE.Group();
  const wood = toon(0xe0b77c);
  g.add(m(new THREE.CylinderGeometry(r, r, 0.12, 18).rotateZ(Math.PI / 2), wood, -0.2, 0, 0));
  g.add(m(new THREE.CylinderGeometry(r, r, 0.12, 18).rotateZ(Math.PI / 2), wood, 0.2, 0, 0));
  g.add(m(new THREE.CylinderGeometry(r * 0.75, r * 0.75, 0.3, 18).rotateZ(Math.PI / 2), toon(0x8e44ad)));
  return g;
}

function buildKart(): VehicleModel {
  const root = new THREE.Group();
  const clip = paperclip(2.6, 1.3);
  clip.position.y = 0.35;
  root.add(clip);
  const clip2 = paperclip(2.2, 1.0, 0xff6fa0);
  clip2.position.y = 0.42;
  root.add(clip2);
  // Kitchen sponge seat.
  root.add(m(new THREE.BoxGeometry(0.8, 0.25, 0.7), toon(0xffe066), 0, 0.5, 0.35));
  root.add(m(new THREE.BoxGeometry(0.8, 0.08, 0.7), toon(0x2ecc71), 0, 0.66, 0.35));
  root.add(m(new THREE.BoxGeometry(0.8, 0.6, 0.12), toon(0xffe066), 0, 0.8, 0.72));
  // Tape-roll steering wheel on a pencil column.
  const column = m(new THREE.CylinderGeometry(0.04, 0.04, 0.7, 6), toon(0xf4c430), 0, 0.65, -0.45);
  column.rotation.x = 0.6;
  root.add(column);
  const wheel = m(new THREE.TorusGeometry(0.2, 0.06, 8, 20), toon(0xd9c9a3), 0, 0.92, -0.65);
  wheel.rotation.x = 0.9;
  root.add(wheel);
  // AA battery engine, zip-tied to the back.
  root.add(m(new THREE.CylinderGeometry(0.16, 0.16, 0.9, 14).rotateZ(Math.PI / 2), toon(0x222222), 0, 0.5, 1.05));
  root.add(m(new THREE.CylinderGeometry(0.165, 0.165, 0.3, 14).rotateZ(Math.PI / 2), toon(0xc87533), 0.32, 0.5, 1.05));
  root.add(zipTie(0.2, -0.2, 0.5, 1.05, 'x'), zipTie(0.2, 0.15, 0.5, 1.05, 'x'));

  const wheels: THREE.Object3D[] = [];
  for (const [x, z] of [[-0.75, -0.9], [0.75, -0.9], [-0.75, 0.9], [0.75, 0.9]]) {
    const w = bottleCap(0.32);
    w.position.set(x, 0.32, z);
    root.add(w);
    wheels.push(w);
  }
  return { root, wheels, propeller: null, seat: new THREE.Vector3(0, 0.35, 0.3), half: { x: 0.95, z: 1.3, h: 1.2 } };
}

function buildCar(): VehicleModel {
  const root = new THREE.Group();
  // Cardboard tissue/cereal box body with a duct-tape racing stripe.
  root.add(m(new THREE.BoxGeometry(2.1, 1.0, 3.8), toon(0xc8a165), 0, 0.95, 0));
  root.add(m(new THREE.BoxGeometry(2.12, 1.02, 0.5), toon(0x9aa0a6), 0, 0.95, -0.6));
  root.add(m(new THREE.BoxGeometry(0.5, 0.05, 3.82), toon(0xff4d4d), 0, 1.46, 0));
  // Open-top cockpit walls made of folded index cards.
  root.add(m(new THREE.BoxGeometry(2.0, 0.5, 0.06), toon(0xfffbe6), 0, 1.7, -0.25));
  // CD windshield.
  const cd = m(new THREE.CylinderGeometry(0.7, 0.7, 0.03, 32), new THREE.MeshStandardMaterial({ color: 0xd9e6ff, metalness: 1, roughness: 0.1 }), 0, 1.85, -0.5);
  cd.rotation.x = Math.PI / 2 - 0.4;
  root.add(cd);
  // Thumbtack headlights.
  for (const x of [-0.7, 0.7]) {
    root.add(m(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 16).rotateX(Math.PI / 2), toon(0xfff59d, { emissive: 0xfff59d, emissiveIntensity: 0.8 }), x, 1.0, -1.92));
  }
  // Binder clip spoiler.
  root.add(m(new THREE.BoxGeometry(1.8, 0.1, 0.5), toon(0x111111), 0, 1.9, 1.7));
  for (const x of [-0.7, 0.7]) root.add(m(new THREE.BoxGeometry(0.06, 0.45, 0.06), new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.9, roughness: 0.3 }), x, 1.65, 1.7));
  root.add(zipTie(0.6, -1.06, 0.95, 1.2, 'z'), zipTie(0.6, 1.06, 0.95, 1.2, 'z'));

  const wheels: THREE.Object3D[] = [];
  for (const [x, z] of [[-1.15, -1.3], [1.15, -1.3], [-1.15, 1.3], [1.15, 1.3]]) {
    const w = spool(0.48);
    w.position.set(x, 0.48, z);
    root.add(w);
    wheels.push(w);
  }
  return { root, wheels, propeller: null, seat: new THREE.Vector3(0, 0.9, 0.4), half: { x: 1.3, z: 2.0, h: 1.9 } };
}

function buildPlane(): VehicleModel {
  const root = new THREE.Group();
  const cardboard = toon(0xb98b5a);
  const ruler = toon(0xf2d16b);
  // Paper-towel-tube fuselage.
  root.add(m(new THREE.CylinderGeometry(0.55, 0.45, 4.6, 16).rotateX(Math.PI / 2), cardboard, 0, 1.2, 0));
  root.add(m(new THREE.CylinderGeometry(0.56, 0.56, 0.3, 16).rotateX(Math.PI / 2), toon(0x9aa0a6), 0, 1.2, -1.4));
  // Ruler wings with tick marks.
  root.add(m(new THREE.BoxGeometry(7.5, 0.08, 0.9), ruler, 0, 1.25, -0.4));
  for (let i = -3.5; i <= 3.5; i += 0.5) root.add(m(new THREE.BoxGeometry(0.03, 0.09, 0.25), toon(0x333333), i, 1.27, -0.75));
  // Popsicle-stick tail.
  root.add(m(new THREE.BoxGeometry(2.4, 0.06, 0.5), ruler, 0, 1.3, 2.1));
  root.add(m(new THREE.BoxGeometry(0.06, 1.1, 0.6), toon(0xe8c9a0), 0, 1.8, 2.1));
  // Plastic-spoon propeller on a binder-clip hub.
  const propeller = new THREE.Group();
  propeller.position.set(0, 1.2, -2.4);
  propeller.add(m(new THREE.SphereGeometry(0.18, 10, 8), toon(0x111111)));
  for (const a of [0, Math.PI]) {
    const blade = m(new THREE.SphereGeometry(0.25, 10, 8), toon(0xff5ea8), 0, 0, 0);
    blade.scale.set(0.5, 2.6, 0.15);
    blade.position.set(0, Math.cos(a) * 0.6, 0);
    propeller.add(blade);
  }
  root.add(propeller);
  // Shirt-button wheels on straw struts.
  const wheels: THREE.Object3D[] = [];
  for (const [x, z] of [[-0.9, -0.8], [0.9, -0.8], [0, 2.0]]) {
    root.add(m(new THREE.CylinderGeometry(0.05, 0.05, 0.9, 6), toon(0x4fc3f7), x, 0.55, z));
    const w = m(new THREE.CylinderGeometry(0.25, 0.25, 0.12, 14).rotateZ(Math.PI / 2), toon(0x7e57c2), x, 0.25, z);
    root.add(w);
    wheels.push(w);
  }
  root.add(zipTie(0.6, 0, 1.2, -0.4, 'z'), zipTie(0.6, 0, 1.2, 0.5, 'z'));
  return { root, wheels, propeller, seat: new THREE.Vector3(0, 1.1, 0.4), half: { x: 1.2, z: 2.4, h: 2.2 } };
}

export function buildVehicle(kind: VehicleKind): VehicleModel {
  switch (kind) {
    case 'kart': return buildKart();
    case 'car': return buildCar();
    case 'plane': return buildPlane();
  }
}

export const VEHICLE_NAMES: Record<VehicleKind, string> = {
  kart: 'Paperclip Go-Kart',
  car: 'Cardboard Cruiser',
  plane: 'Paper-Towel Plane',
};
