// Weapon models, projectile meshes and glowing loot boxes.
import * as THREE from 'three';
import type { WeaponId } from '../../../shared/protocol.ts';

const toon = (color: number, extra: THREE.MeshToonMaterialParameters = {}) =>
  new THREE.MeshToonMaterial({ color, ...extra });

function m(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
}

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const cyl = (r: number, len: number, seg = 12) => new THREE.CylinderGeometry(r, r, len, seg).rotateX(Math.PI / 2);

/** A weapon model whose barrel points down -z with the grip at the origin. */
export function buildWeapon(id: WeaponId): THREE.Group {
  const g = new THREE.Group();
  switch (id) {
    case 'slingshot': {
      const wood = toon(0x9b6a3c);
      const band = toon(0xff6fa0);
      g.add(m(new THREE.CylinderGeometry(0.03, 0.035, 0.22, 8), wood, 0, -0.05, 0));
      for (const s of [-1, 1]) {
        const prong = m(new THREE.CylinderGeometry(0.025, 0.03, 0.16, 8), wood, s * 0.05, 0.11, 0);
        prong.rotation.z = -s * 0.45;
        g.add(prong);
      }
      g.add(m(box(0.2, 0.015, 0.015), band, 0, 0.17, 0.04));
      g.add(m(new THREE.SphereGeometry(0.04, 8, 8), toon(0xfff4e0), 0, 0.17, 0.06));
      g.rotation.x = -0.3;
      break;
    }
    case 'watergun': {
      g.add(m(box(0.09, 0.12, 0.38), toon(0x2ecc71), 0, 0.05, -0.12));
      g.add(m(cyl(0.08, 0.26), toon(0xff8c1a, { transparent: true, opacity: 0.85 }), 0, 0.17, -0.06));
      g.add(m(cyl(0.025, 0.14), toon(0xf1c40f), 0, 0.06, -0.37));
      g.add(m(box(0.06, 0.14, 0.07), toon(0x27ae60), 0, -0.05, 0));
      break;
    }
    case 'foam': {
      g.add(m(box(0.1, 0.13, 0.42), toon(0xff7a1a), 0, 0.05, -0.14));
      g.add(m(cyl(0.035, 0.18), toon(0x1e88e5), 0, 0.07, -0.42));
      g.add(m(new THREE.CylinderGeometry(0.09, 0.09, 0.1, 10).rotateZ(Math.PI / 2), toon(0xfdd835), 0, 0.05, -0.1));
      g.add(m(box(0.06, 0.14, 0.07), toon(0x1e88e5), 0, -0.05, 0));
      break;
    }
    case 'paintball': {
      g.add(m(box(0.08, 0.11, 0.3), toon(0x2b2b2b), 0, 0.05, -0.1));
      g.add(m(cyl(0.025, 0.32), toon(0x555555), 0, 0.07, -0.38));
      g.add(m(new THREE.SphereGeometry(0.09, 12, 10), toon(0xff2fa8, { transparent: true, opacity: 0.8 }), 0, 0.19, -0.05));
      g.add(m(box(0.06, 0.14, 0.07), toon(0x2b2b2b), 0, -0.05, 0));
      break;
    }
    case 'duckzooka': {
      g.add(m(cyl(0.11, 0.7, 16), toon(0x29b6f6), 0, 0.12, -0.15));
      g.add(m(new THREE.TorusGeometry(0.11, 0.025, 8, 16), toon(0xffd400), 0, 0.12, -0.5));
      const duck = buildRubberDuck(0.5);
      duck.position.set(0, 0.12, -0.5);
      g.add(duck);
      g.add(m(box(0.06, 0.14, 0.07), toon(0x0277bd), 0, -0.02, 0));
      break;
    }
  }
  return g;
}

export function buildRubberDuck(scale = 1): THREE.Group {
  const g = new THREE.Group();
  const yellow = toon(0xffd400);
  const body = m(new THREE.SphereGeometry(0.3, 12, 10), yellow);
  body.scale.set(1, 0.8, 1.2);
  g.add(body);
  g.add(m(new THREE.SphereGeometry(0.18, 12, 10), yellow, 0, 0.25, -0.2));
  g.add(m(new THREE.ConeGeometry(0.08, 0.16, 8).rotateX(-Math.PI / 2), toon(0xff7a00), 0, 0.23, -0.4));
  g.add(m(new THREE.SphereGeometry(0.03, 6, 6), toon(0x111111), -0.09, 0.3, -0.33));
  g.add(m(new THREE.SphereGeometry(0.03, 6, 6), toon(0x111111), 0.09, 0.3, -0.33));
  g.scale.setScalar(scale);
  return g;
}

const PAINT_COLORS = [0xff2fa8, 0x29f0ff, 0xfff23a, 0x7dff5a, 0xff6b2b, 0xb06bff];
export const randomPaint = () => PAINT_COLORS[Math.floor(Math.random() * PAINT_COLORS.length)];

const sphereGeo = new THREE.SphereGeometry(1, 10, 8);
const waterMat = new THREE.MeshBasicMaterial({ color: 0x6fd3ff, transparent: true, opacity: 0.75 });
const mochiMat = new THREE.MeshToonMaterial({ color: 0xfff4e0 });
const dartBody = new THREE.MeshToonMaterial({ color: 0xff7a1a });
const dartTip = new THREE.MeshToonMaterial({ color: 0x1e88e5 });

/** Projectile mesh, oriented so it can `lookAt` along its velocity (forward is -z). */
export function buildProjectile(id: WeaponId, size: number, paint: number): THREE.Object3D {
  switch (id) {
    case 'slingshot': {
      const s = new THREE.Mesh(sphereGeo, mochiMat);
      s.scale.setScalar(size);
      return s;
    }
    case 'watergun': {
      const s = new THREE.Mesh(sphereGeo, waterMat);
      s.scale.set(size, size, size * 2.2);
      return s;
    }
    case 'foam': {
      const g = new THREE.Group();
      g.add(m(cyl(size * 0.6, size * 4), dartBody));
      g.add(m(new THREE.SphereGeometry(size * 0.7, 8, 6), dartTip, 0, 0, -size * 2));
      return g;
    }
    case 'paintball': {
      const s = new THREE.Mesh(sphereGeo, new THREE.MeshToonMaterial({ color: paint }));
      s.scale.setScalar(size);
      return s;
    }
    case 'duckzooka':
      return buildRubberDuck(size * 2.2);
  }
}

let questionTexture: THREE.CanvasTexture | null = null;
function lootTexture() {
  if (questionTexture) return questionTexture;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffb3f0';
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = '#ffffff';
  g.lineWidth = 10;
  g.strokeRect(5, 5, 118, 118);
  g.fillStyle = '#ffffff';
  g.font = 'bold 96px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('?', 64, 70);
  questionTexture = new THREE.CanvasTexture(c);
  questionTexture.colorSpace = THREE.SRGBColorSpace;
  return questionTexture;
}

let glowTexture: THREE.CanvasTexture | null = null;
function haloTexture() {
  if (glowTexture) return glowTexture;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,220,255,1)');
  grad.addColorStop(0.4, 'rgba(255,120,230,0.5)');
  grad.addColorStop(1, 'rgba(255,120,230,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  glowTexture = new THREE.CanvasTexture(c);
  return glowTexture;
}

export function buildLootBox(): THREE.Group {
  const g = new THREE.Group();
  const cube = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 0.9, 0.9),
    new THREE.MeshStandardMaterial({ map: lootTexture(), emissive: 0xff66dd, emissiveIntensity: 0.9, emissiveMap: lootTexture() }),
  );
  cube.name = 'cube';
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: haloTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
  }));
  halo.scale.setScalar(3.2);
  g.add(halo, cube);
  return g;
}

export function sharedHaloTexture() {
  return haloTexture();
}

/** Pogo stick standing upright with its tip at the origin and foot pegs at y = POGO_LIFT. */
export const POGO_LIFT = 0.5;

export function buildPogo(): THREE.Group {
  const g = new THREE.Group();
  const chrome = new THREE.MeshStandardMaterial({ color: 0xdfe6ee, metalness: 0.9, roughness: 0.25 });
  g.add(m(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 10), chrome, 0, 0.9, 0));
  g.add(m(new THREE.CylinderGeometry(0.07, 0.04, 0.2, 10), toon(0x222222), 0, 0.1, 0));
  // Spring: a helix tube around the lower pole.
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 120; i++) {
    const a = (i / 120) * Math.PI * 2 * 8;
    pts.push(new THREE.Vector3(Math.cos(a) * 0.11, 0.2 + (i / 120) * 0.35, Math.sin(a) * 0.11));
  }
  const spring = m(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 240, 0.018, 6), chrome);
  spring.name = 'spring';
  g.add(spring);
  // Foot pegs and rainbow handlebar grips.
  g.add(m(new THREE.BoxGeometry(0.6, 0.05, 0.12), toon(0xff4fb8), 0, POGO_LIFT, 0));
  g.add(m(new THREE.CylinderGeometry(0.035, 0.035, 0.7, 8).rotateZ(Math.PI / 2), chrome, 0, 1.65, 0));
  const colors = [0xff3b3b, 0xffa63b, 0xfff23a, 0x4cff6a, 0x3bc8ff, 0x9b6bff];
  colors.forEach((c, i) => {
    const x = (i < 3 ? -1 : 1) * (0.2 + (i % 3) * 0.05);
    g.add(m(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 10).rotateZ(Math.PI / 2), toon(c), x, 1.65, 0));
  });
  return g;
}

/** A huge rainbow light pillar that can be seen from anywhere on the map. */
export function buildRainbowBeacon(): { mesh: THREE.Mesh; update(time: number): void } {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, 256);
  ['#ff3b3b', '#ffa63b', '#fff23a', '#4cff6a', '#3bc8ff', '#9b6bff', '#ff3b3b'].forEach((col, i, arr) =>
    grad.addColorStop(i / (arr.length - 1), col));
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  const texture = new THREE.CanvasTexture(c);
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 6);
  texture.colorSpace = THREE.SRGBColorSpace;
  const height = 400;
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(1.6, 1.6, height, 16, 1, true).translate(0, height / 2, 0),
    new THREE.MeshBasicMaterial({
      map: texture, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false,
    }),
  );
  return {
    mesh,
    update(time) {
      texture.offset.y = -time * 0.3;
      mesh.scale.x = mesh.scale.z = 1 + Math.sin(time * 4) * 0.15;
    },
  };
}
