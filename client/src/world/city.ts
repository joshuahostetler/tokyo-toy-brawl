// Builds the toy Tokyo scene: streets, the scramble crossing, neon buildings, shrine, tower and props.
import * as THREE from 'three';
import {
  BUILDINGS, MAP_HALF, PROPS, ROAD_LINES, ROAD_WIDTH, type Building, type Prop,
} from '../../../shared/map.ts';

export interface City {
  group: THREE.Group;
  update(time: number): void;
}

const WINDOW_CELL = 4; // meters per window cell in the facade texture
const TEX_CELLS = 4;

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return { c, g: c.getContext('2d')! };
}

function facadeTextures() {
  const size = 256;
  const cell = size / TEX_CELLS;
  const { c: colorC, g: color } = canvas(size, size);
  const { c: glowC, g: glow } = canvas(size, size);
  color.fillStyle = '#ffffff';
  color.fillRect(0, 0, size, size);
  glow.fillStyle = '#000000';
  glow.fillRect(0, 0, size, size);
  for (let i = 0; i < TEX_CELLS; i++) {
    for (let j = 0; j < TEX_CELLS; j++) {
      const x = i * cell + cell * 0.15;
      const y = j * cell + cell * 0.2;
      const w = cell * 0.7;
      const h = cell * 0.55;
      const lit = Math.random() < 0.45;
      color.fillStyle = lit ? '#ffe9a8' : '#2b3550';
      color.fillRect(x, y, w, h);
      if (lit) {
        glow.fillStyle = Math.random() < 0.5 ? '#ffd27a' : '#bfe6ff';
        glow.fillRect(x, y, w, h);
      }
    }
  }
  const make = (c: HTMLCanvasElement) => {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  };
  return { map: make(colorC), emissiveMap: make(glowC) };
}

/** Box geometry whose UVs are in world units / texture tile size, so facades tile evenly. */
function worldUvBox(w: number, h: number, d: number) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  const tile = WINDOW_CELL * TEX_CELLS;
  // BoxGeometry face order: +x, -x, +y, -y, +z, -z; 4 verts each.
  const dims: [number, number][] = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, (uv.getX(i) * dims[f][0]) / tile, (uv.getY(i) * dims[f][1]) / tile);
    }
  }
  return geo;
}

function signTexture(text: string, color: number, vertical: boolean) {
  const chars = [...text];
  const hex = `#${color.toString(16).padStart(6, '0')}`;
  const cellPx = 96;
  const w = vertical ? cellPx : cellPx * chars.length * 0.8 + 40;
  const h = vertical ? cellPx * chars.length + 30 : cellPx + 20;
  const { c, g } = canvas(w, h);
  g.fillStyle = '#120818';
  g.fillRect(0, 0, w, h);
  g.strokeStyle = hex;
  g.lineWidth = 8;
  g.shadowColor = hex;
  g.shadowBlur = 18;
  g.strokeRect(8, 8, w - 16, h - 16);
  g.fillStyle = '#ffffff';
  g.font = `bold ${cellPx * 0.7}px "Hiragino Sans", "Noto Sans JP", "Yu Gothic", sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  if (vertical) {
    chars.forEach((ch, i) => g.fillText(ch, w / 2, 15 + cellPx * (i + 0.5)));
  } else {
    g.fillText(text, w / 2, h / 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return { texture: t, aspect: w / h };
}

function addRoads(group: THREE.Group) {
  const asphalt = new THREE.MeshStandardMaterial({ color: 0x3a3d44, roughness: 0.95 });
  const sidewalk = new THREE.MeshStandardMaterial({ color: 0x9a9690, roughness: 0.9 });
  const paint = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.6 });
  const yellow = new THREE.MeshStandardMaterial({ color: 0xf5c518, roughness: 0.6 });

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(MAP_HALF * 2 + 60, MAP_HALF * 2 + 60), sidewalk);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  const len = MAP_HALF * 2;
  for (const line of ROAD_LINES) {
    for (const alongX of [true, false]) {
      const road = new THREE.Mesh(new THREE.PlaneGeometry(alongX ? len : ROAD_WIDTH, alongX ? ROAD_WIDTH : len), asphalt);
      road.rotation.x = -Math.PI / 2;
      road.position.set(alongX ? 0 : line, 0.01, alongX ? line : 0);
      road.receiveShadow = true;
      group.add(road);

      // Dashed center line, skipping intersections.
      for (let s = -MAP_HALF + 2; s < MAP_HALF; s += 6) {
        if (ROAD_LINES.some((l) => Math.abs(s + 1.5 - l) < ROAD_WIDTH / 2 + 3)) continue;
        const dash = new THREE.Mesh(new THREE.PlaneGeometry(alongX ? 3 : 0.3, alongX ? 0.3 : 3), yellow);
        dash.rotation.x = -Math.PI / 2;
        dash.position.set(alongX ? s + 1.5 : line, 0.02, alongX ? line : s + 1.5);
        group.add(dash);
      }
    }
  }

  // Zebra crosswalks on every side of every intersection.
  const stripeGeo = new THREE.PlaneGeometry(0.8, 3.5);
  for (const ix of ROAD_LINES) {
    for (const iz of ROAD_LINES) {
      for (const side of [-1, 1]) {
        for (let k = -5; k <= 5; k++) {
          const a = new THREE.Mesh(stripeGeo, paint);
          a.rotation.x = -Math.PI / 2;
          a.position.set(ix + k * 1.1, 0.02, iz + side * (ROAD_WIDTH / 2 + 2));
          group.add(a);
          const b = new THREE.Mesh(stripeGeo, paint);
          b.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
          b.position.set(ix + side * (ROAD_WIDTH / 2 + 2), 0.02, iz + k * 1.1);
          group.add(b);
        }
      }
    }
  }

  // The famous diagonal "scramble" stripes at the center crossing.
  for (const diag of [Math.PI / 4, -Math.PI / 4]) {
    for (let k = -6; k <= 6; k++) {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 3.5), paint);
      s.rotation.set(-Math.PI / 2, 0, diag + Math.PI / 2);
      const off = k * 1.1;
      s.position.set(Math.cos(diag) * off, 0.025, Math.sin(diag) * off);
      group.add(s);
    }
  }
}

function addBuilding(group: THREE.Group, b: Building, facade: ReturnType<typeof facadeTextures>, signs: THREE.Mesh[]) {
  const wall = new THREE.MeshStandardMaterial({
    color: b.color,
    map: facade.map,
    emissiveMap: facade.emissiveMap,
    emissive: 0xffffff,
    emissiveIntensity: 0.55,
    roughness: 0.8,
  });
  const roof = new THREE.MeshStandardMaterial({ color: 0x6b6e75, roughness: 0.9 });
  const mesh = new THREE.Mesh(worldUvBox(b.w, b.h, b.d), [wall, wall, roof, roof, wall, wall]);
  mesh.position.set(b.x, b.h / 2, b.z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);

  // Rooftop clutter: water tank / AC unit.
  const tank = new THREE.Mesh(
    new THREE.CylinderGeometry(1.2, 1.2, 2, 12),
    new THREE.MeshStandardMaterial({ color: 0x8fa3b0 }),
  );
  tank.position.set(b.x + b.w * 0.25, b.h + 1, b.z - b.d * 0.2);
  group.add(tank);

  if (!b.sign) return;
  // Neon sign on the face closest to a road.
  const vertical = b.sign.length <= 5 && !/^[A-Z]+$/.test(b.sign);
  const { texture, aspect } = signTexture(b.sign, b.signColor, vertical);
  const signH = vertical ? Math.min(b.h * 0.6, 3 * b.sign.length) : 4;
  const signW = signH * aspect;
  const mat = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false, side: THREE.DoubleSide });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(signW, signH), mat);
  const gapX = Math.abs(nearestRoad(b.x) - b.x) - b.w / 2;
  const gapZ = Math.abs(nearestRoad(b.z) - b.z) - b.d / 2;
  if (gapX < gapZ) {
    const dir = Math.sign(nearestRoad(b.x) - b.x) || 1;
    sign.position.set(b.x + dir * (b.w / 2 + 0.6), b.h * 0.55, b.z);
    sign.rotation.y = dir * Math.PI / 2;
  } else {
    const dir = Math.sign(nearestRoad(b.z) - b.z) || 1;
    sign.position.set(b.x, b.h * 0.55, b.z + dir * (b.d / 2 + 0.6));
    sign.rotation.y = dir > 0 ? 0 : Math.PI;
  }
  group.add(sign);
  signs.push(sign);
}

function nearestRoad(v: number) {
  return ROAD_LINES.reduce((best, l) => (Math.abs(l - v) < Math.abs(best - v) ? l : best));
}

const std = (color: number, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...extra });

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function buildProp(p: Prop): THREE.Object3D {
  const g = new THREE.Group();
  const red = std(0xd8352a);
  switch (p.kind) {
    case 'torii': {
      const black = std(0x1d1d1d);
      g.add(mesh(new THREE.CylinderGeometry(0.4, 0.45, 7, 12), red, -4, 3.5, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.4, 0.45, 7, 12), red, 4, 3.5, 0));
      g.add(mesh(new THREE.BoxGeometry(11, 0.7, 0.9), black, 0, 7.3, 0));
      g.add(mesh(new THREE.BoxGeometry(9.6, 0.5, 0.6), red, 0, 6.2, 0));
      g.add(mesh(new THREE.BoxGeometry(0.5, 1.1, 0.5), red, 0, 6.7, 0));
      break;
    }
    case 'pagoda': {
      const wood = std(0x9a3324);
      const roof = std(0x2f3b3a);
      for (let i = 0; i < 4; i++) {
        const s = 8 - i * 1.4;
        g.add(mesh(new THREE.BoxGeometry(s * 0.7, 3, s * 0.7), wood, 0, 1.5 + i * 4, 0));
        const r = mesh(new THREE.ConeGeometry(s * 0.85, 1.6, 4), roof, 0, 3.8 + i * 4, 0);
        r.rotation.y = Math.PI / 4;
        g.add(r);
      }
      g.add(mesh(new THREE.CylinderGeometry(0.15, 0.15, 4, 6), std(0xc9a227), 0, 18, 0));
      break;
    }
    case 'sakura': {
      const bark = std(0x5a3a2a);
      const blossom = std(0xffb7d5, { emissive: 0x552233, emissiveIntensity: 0.3 });
      g.add(mesh(new THREE.CylinderGeometry(0.35, 0.5, 4, 8), bark, 0, 2, 0));
      const blobs: [number, number, number, number][] = [[0, 5, 0, 2.6], [1.6, 4.5, 0.6, 1.8], [-1.5, 4.6, -0.5, 1.9], [0.3, 5.2, -1.6, 1.7], [-0.4, 4.7, 1.6, 1.7]];
      for (const [x, y, z, r] of blobs) g.add(mesh(new THREE.IcosahedronGeometry(r, 1), blossom, x, y, z));
      break;
    }
    case 'lantern': {
      const stone = std(0x9b9b94);
      g.add(mesh(new THREE.CylinderGeometry(0.3, 0.45, 1.2, 8), stone, 0, 0.6, 0));
      g.add(mesh(new THREE.BoxGeometry(0.8, 0.6, 0.8), std(0xfff0b3, { emissive: 0xffc35a, emissiveIntensity: 1.2 }), 0, 1.5, 0));
      g.add(mesh(new THREE.ConeGeometry(0.75, 0.5, 4), stone, 0, 2.05, 0));
      break;
    }
    case 'tower': {
      // Tokyo-Tower-style lattice in orange-red and white bands.
      const orange = std(0xff4b1f, { metalness: 0.2 });
      const white = std(0xf4f4f4);
      for (const [x, z] of [[-7, -7], [7, -7], [-7, 7], [7, 7]]) {
        const leg = mesh(new THREE.CylinderGeometry(0.6, 1.4, 22, 6), orange, x * 0.78, 11, z * 0.78);
        leg.rotation.set(z * 0.022, 0, -x * 0.022);
        g.add(leg);
      }
      g.add(mesh(new THREE.BoxGeometry(12, 1.5, 12), white, 0, 20, 0));
      g.add(mesh(new THREE.CylinderGeometry(2.2, 4.5, 26, 4, 1, true), orange, 0, 34, 0).rotateY(Math.PI / 4));
      g.add(mesh(new THREE.BoxGeometry(6, 2, 6), white, 0, 38, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.8, 2.2, 18, 4, 1, true), white, 0, 56, 0).rotateY(Math.PI / 4));
      g.add(mesh(new THREE.CylinderGeometry(0.15, 0.8, 10, 6), orange, 0, 70, 0));
      const beacon = mesh(new THREE.SphereGeometry(0.6, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff3030 }), 0, 75.5, 0);
      g.add(beacon);
      break;
    }
    case 'vending': {
      g.add(mesh(new THREE.BoxGeometry(2, 2.4, 1.6), std(0xe8f1ff), 0, 1.2, 0));
      const front = mesh(new THREE.PlaneGeometry(1.6, 1.4), new THREE.MeshBasicMaterial({ color: 0x9fe3ff, toneMapped: false }), 0, 1.5, 0.81);
      g.add(front);
      for (let i = 0; i < 4; i++) {
        g.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.35, 8), std([0xff4040, 0x40c040, 0xffa020, 0x4070ff][i]), -0.5 + i * 0.33, 1.6, 0.85));
      }
      break;
    }
    case 'tissuebox': {
      g.add(mesh(new THREE.BoxGeometry(5, 3, 3.2), std(0x7fc8f8), 0, 1.5, 0));
      g.add(mesh(new THREE.BoxGeometry(3, 0.05, 1.2), std(0x2b4c66), 0, 3.01, 0));
      const tissue = mesh(new THREE.ConeGeometry(1, 1.8, 5), std(0xffffff), 0, 3.8, 0);
      tissue.rotation.z = 0.2;
      g.add(tissue);
      break;
    }
    case 'taperoll': {
      const tape = mesh(new THREE.TorusGeometry(1.6, 0.6, 12, 32), std(0xd9c9a3, { roughness: 0.4 }), 0, 0.6, 0);
      tape.rotation.x = Math.PI / 2;
      tape.scale.z = 2;
      g.add(tape);
      const core = mesh(new THREE.CylinderGeometry(1.05, 1.05, 1.5, 24, 1, true), std(0x8b6b4a, { side: THREE.DoubleSide }), 0, 0.75, 0);
      g.add(core);
      break;
    }
    case 'eraser': {
      g.add(mesh(new THREE.BoxGeometry(5.2, 1.4, 2.8), std(0xff9fb2), 0, 0.7, 0));
      g.add(mesh(new THREE.BoxGeometry(2.6, 1.5, 2.9), std(0x2d6cdf), 1, 0.75, 0));
      break;
    }
    case 'mug': {
      const cup = std(0xffffff);
      g.add(mesh(new THREE.CylinderGeometry(1.6, 1.4, 3.2, 24), cup, 0, 1.6, 0));
      g.add(mesh(new THREE.CylinderGeometry(1.4, 1.4, 0.05, 24), std(0x5a3418), 0, 3.0, 0));
      const handle = mesh(new THREE.TorusGeometry(0.8, 0.22, 8, 16), cup, 1.7, 1.7, 0);
      g.add(handle);
      g.add(mesh(new THREE.CylinderGeometry(1.62, 1.62, 0.5, 24), std(0xe23b3b), 0, 2.2, 0));
      break;
    }
  }
  g.position.set(p.x, 0, p.z);
  g.rotation.y = p.rot;
  return g;
}

function bigScreen(group: THREE.Group) {
  const { c, g } = canvas(512, 256);
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(16, 8),
    new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }),
  );
  // Mounted on a pole over the north-east corner of the crossing, facing the center.
  screen.position.set(12, 14, -12);
  screen.lookAt(0, 8, 0);
  const pole = mesh(new THREE.BoxGeometry(1, 10, 1), std(0x333333), 12, 5, -12);
  group.add(screen, pole);

  const messages = ['TOKYO TOY BRAWL', 'ようこそ!', 'SPLAT EVERYONE', 'パンダ vs アヒル'];
  let last = -1;
  return (time: number) => {
    const frame = Math.floor(time * 10);
    if (frame === last) return;
    last = frame;
    const hue = (time * 40) % 360;
    const grad = g.createLinearGradient(0, 0, 512, 256);
    grad.addColorStop(0, `hsl(${hue}, 90%, 45%)`);
    grad.addColorStop(1, `hsl(${(hue + 120) % 360}, 90%, 35%)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, 512, 256);
    g.fillStyle = 'white';
    g.font = 'bold 64px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const msg = messages[Math.floor(time / 3) % messages.length];
    g.fillText(msg, 256 + Math.sin(time * 2) * 20, 128);
    texture.needsUpdate = true;
  };
}

export function buildCity(scene: THREE.Scene): City {
  const group = new THREE.Group();
  addRoads(group);

  const facade = facadeTextures();
  const signs: THREE.Mesh[] = [];
  for (const b of BUILDINGS) addBuilding(group, b, facade, signs);
  for (const p of PROPS) group.add(buildProp(p));
  const updateScreen = bigScreen(group);

  // Mountain silhouette (Fuji!) far beyond the map edge.
  const fuji = new THREE.Mesh(
    new THREE.ConeGeometry(160, 120, 32, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x4a4f7a, fog: false }),
  );
  fuji.position.set(-150, 40, -520);
  const snow = new THREE.Mesh(new THREE.ConeGeometry(50, 38, 32), new THREE.MeshBasicMaterial({ color: 0xf2f0ff, fog: false }));
  snow.position.set(-150, 81, -520);
  group.add(fuji, snow);

  scene.add(group);
  return {
    group,
    update(time) {
      updateScreen(time);
      // Gentle neon flicker.
      for (let i = 0; i < signs.length; i++) {
        const m = signs[i].material as THREE.MeshBasicMaterial;
        const flicker = Math.sin(time * 3 + i * 1.7) > 0.97 ? 0.4 : 1;
        m.color.setScalar(flicker);
      }
    },
  };
}

export function setupSkyAndLights(scene: THREE.Scene) {
  const { c, g } = canvas(2, 256);
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#1b1440');
  grad.addColorStop(0.55, '#7a3e7a');
  grad.addColorStop(1, '#ffae70');
  g.fillStyle = grad;
  g.fillRect(0, 0, 2, 256);
  const sky = new THREE.CanvasTexture(c);
  sky.colorSpace = THREE.SRGBColorSpace;
  scene.background = sky;
  scene.fog = new THREE.Fog(0x8a5a86, 90, 260);

  scene.add(new THREE.HemisphereLight(0xb8c4ff, 0x4a3a40, 1.4));
  const sun = new THREE.DirectionalLight(0xffc9a0, 2.2);
  sun.position.set(60, 80, 30);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const s = sun.shadow.camera;
  s.left = s.bottom = -70;
  s.right = s.top = 70;
  s.near = 1;
  s.far = 250;
  sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);
  return sun;
}
