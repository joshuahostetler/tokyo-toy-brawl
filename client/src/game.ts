// Core game loop: local player, remote players, projectiles, vehicles, loot, camera and networking.
import * as THREE from 'three';
import {
  MAX_HEALTH, PICKUP_RADIUS, SNAPSHOT_HZ, STARTING_WEAPON, VEHICLE_ENTER_RADIUS, WEAPONS, WEAPON_IDS,
  type AnimalId, type AnimState, type LootGrant, type LootState, type PlayerInfo, type Quat,
  type ServerMsg, type Vec3, type VehicleState, type WeaponDef, type WeaponId,
} from '../../shared/protocol.ts';
import { Effects } from './effects.ts';
import { Hud, escapeHtml, type MinimapDot } from './hud.ts';
import { Input } from './input.ts';
import { animateAnimal, buildAnimal, type AnimalRig } from './models/animals.ts';
import { buildLootBox, buildProjectile, buildWeapon, randomPaint } from './models/items.ts';
import { VEHICLE_NAMES, buildVehicle, type VehicleModel } from './models/vehicles.ts';
import type { Net } from './net.ts';
import * as sfx from './sfx.ts';
import { buildCity, setupSkyAndLights, type City } from './world/city.ts';
import { GRAVITY, groundBelow, isSupported, moveBody, overlapsAny, segmentCast } from './world/physics.ts';

const EYE = 1.55;
const PLAYER_R = 0.4;
const PLAYER_H = 1.7;
const WALK = 6;
const SPRINT = 10;
const AIM_WALK = 3.5;
const JUMP = 9;
const FOV = 75;
const AIM_FOV = 45;
const LOOK_SENS = 0.0022;
const SLINGSHOT_REGEN = 1.5; // seconds per free pellet, so nobody is ever fully unarmed
const SLINGSHOT_REGEN_CAP = 10;

const GROUND_VEHICLE = {
  kart: { maxSpeed: 24, accel: 20, turn: 2.6 },
  car: { maxSpeed: 30, accel: 16, turn: 2.0 },
};
const PLANE = { maxSpeed: 48, stallSpeed: 17, accel: 14, turn: 1.3, ceiling: 140 };

interface RemotePlayer {
  info: PlayerInfo;
  rig: AnimalRig;
  tag: THREE.Sprite;
  tagCtx: CanvasRenderingContext2D;
  tagTexture: THREE.CanvasTexture;
  weapon: WeaponId | null;
  weaponModel: THREE.Object3D | null;
  target: THREE.Vector3;
  targetYaw: number;
  pitch: number;
  anim: AnimState;
  vehicle: number | null;
  seen: boolean;
  lastPos: THREE.Vector3;
}

interface VehicleObj {
  state: VehicleState;
  model: VehicleModel;
  targetPos: THREE.Vector3;
  targetQuat: THREE.Quaternion;
  lastPos: THREE.Vector3;
  // Local simulation, used only while we drive it.
  speed: number;
  yaw: number;
  pitch: number;
  roll: number;
  vy: number;
  throttle: number;
}

interface LootObj {
  state: LootState;
  mesh: THREE.Group;
  pendingUntil: number;
}

interface Projectile {
  obj: THREE.Object3D;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  def: WeaponDef;
  mine: boolean;
  ownerId: number;
  bounces: number;
  life: number;
  paint: number;
}

const tmpV = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

function forwardFrom(yaw: number, pitch = 0) {
  return new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
}

const toVec3 = (v: THREE.Vector3): Vec3 => [v.x, v.y, v.z];
const toQuat = (q: THREE.Quaternion): Quat => [q.x, q.y, q.z, q.w];

export class Game {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 900);
  private viewScene = new THREE.Scene();
  private viewCamera = new THREE.PerspectiveCamera(60, 1, 0.01, 10);
  private viewModel = new THREE.Group();
  private viewWeapon: THREE.Object3D | null = null;
  private sun: THREE.DirectionalLight;
  private city: City;
  private input: Input;
  private hud = new Hud();
  private effects: Effects;
  private clock = new THREE.Clock();
  private time = 0;

  // Local player
  private readonly myId: number;
  private players = new Map<number, PlayerInfo>();
  private pos = new THREE.Vector3(0, 0, 20);
  private vel = new THREE.Vector3();
  private yaw = 0;
  private pitch = 0;
  private alive = false;
  private health = MAX_HEALTH;
  private grounded = true;
  private aiming = false;
  private sprinting = false;
  private moving = false;
  private thirdPerson = false;
  private owned = new Map<WeaponId, number>();
  private weapon: WeaponId = STARTING_WEAPON;
  private lastFire = -10;
  private regenTimer = 0;
  private recoil = 0;
  private bob = 0;
  private myRig: AnimalRig;
  private myVehicle: number | null = null;
  private respawnAt = 0;
  private lastBonk = new Map<number, number>();

  private remotes = new Map<number, RemotePlayer>();
  private vehicles = new Map<number, VehicleObj>();
  private loot = new Map<number, LootObj>();
  private projectiles: Projectile[] = [];
  private sendTimer = 0;

  constructor(
    canvas: HTMLCanvasElement,
    private readonly net: Net,
    welcome: Extract<ServerMsg, { t: 'welcome' }>,
    animal: AnimalId,
  ) {
    this.myId = welcome.id;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.autoClear = false;

    this.sun = setupSkyAndLights(this.scene);
    this.city = buildCity(this.scene);
    this.effects = new Effects(this.scene);
    this.input = new Input(canvas);
    this.camera.rotation.order = 'YXZ';

    this.viewScene.add(new THREE.HemisphereLight(0xffffff, 0x664466, 2.2));
    this.viewScene.add(this.viewModel);
    const paw = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 10), new THREE.MeshToonMaterial({ color: 0x222222 }));
    paw.name = 'paw';
    this.viewModel.add(paw);

    this.myRig = buildAnimal(animal);
    this.myRig.root.visible = false;
    this.scene.add(this.myRig.root);

    for (const p of welcome.players) this.players.set(p.id, p);
    for (const p of welcome.players) if (p.id !== this.myId) this.addRemote(p);
    for (const v of welcome.vehicles) this.addVehicle(v);
    for (const l of welcome.loot) this.addLoot(l);

    this.resetLoadout();
    net.onMessage = (msg) => this.onMessage(msg);
    net.onClose = () => {
      this.hud.setCenter('Disconnected from server.<br><small>Refresh the page to rejoin.</small>');
    };

    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.hud.setHealth(this.health);
    this.hud.feedMessage('Welcome to <b>Tokyo Toy Brawl</b>! Find the glowing boxes for loot.');
    this.renderer.setAnimationLoop(() => this.frame());
  }

  // ---------------------------------------------------------------- setup helpers

  private resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = this.viewCamera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.viewCamera.updateProjectionMatrix();
  }

  private resetLoadout() {
    this.owned.clear();
    this.owned.set(STARTING_WEAPON, WEAPONS[STARTING_WEAPON].startAmmo);
    this.equip(STARTING_WEAPON);
  }

  private equip(id: WeaponId) {
    if (!this.owned.has(id)) return;
    this.weapon = id;
    if (this.viewWeapon) this.viewModel.remove(this.viewWeapon);
    this.viewWeapon = buildWeapon(id);
    this.viewWeapon.scale.setScalar(0.75);
    this.viewModel.add(this.viewWeapon);
    this.attachWeapon(this.myRig, id);
    this.hud.setWeapon(id, this.owned);
  }

  private attachWeapon(rig: AnimalRig, id: WeaponId) {
    rig.hand.clear();
    const model = buildWeapon(id);
    model.rotation.x = -Math.PI / 2;
    model.scale.setScalar(1.5);
    rig.hand.add(model);
    return model;
  }

  private addRemote(info: PlayerInfo) {
    const rig = buildAnimal(info.animal);
    rig.root.visible = false;
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 64;
    const tagTexture = new THREE.CanvasTexture(c);
    tagTexture.colorSpace = THREE.SRGBColorSpace;
    const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tagTexture, depthWrite: false }));
    tag.scale.set(2, 0.5, 1);
    tag.position.y = 2.3;
    rig.root.add(tag);
    this.scene.add(rig.root);
    const remote: RemotePlayer = {
      info, rig, tag, tagCtx: c.getContext('2d')!, tagTexture,
      weapon: null, weaponModel: null,
      target: new THREE.Vector3(), targetYaw: 0, pitch: 0,
      anim: { moving: false, sprint: false, aiming: false, grounded: true },
      vehicle: null, seen: false, lastPos: new THREE.Vector3(),
    };
    this.remotes.set(info.id, remote);
    this.drawTag(remote);
  }

  private drawTag(r: RemotePlayer) {
    const g = r.tagCtx;
    g.clearRect(0, 0, 256, 64);
    g.fillStyle = 'rgba(20,10,30,0.55)';
    g.fillRect(28, 0, 200, 64);
    g.fillStyle = '#ffffff';
    g.font = 'bold 26px sans-serif';
    g.textAlign = 'center';
    g.fillText(r.info.name, 128, 30);
    g.fillStyle = '#333';
    g.fillRect(48, 42, 160, 12);
    const pct = r.info.health / MAX_HEALTH;
    g.fillStyle = pct > 0.5 ? '#5ee07a' : pct > 0.25 ? '#ffd23f' : '#ff5470';
    g.fillRect(48, 42, 160 * pct, 12);
    r.tagTexture.needsUpdate = true;
  }

  private addVehicle(state: VehicleState) {
    const model = buildVehicle(state.kind);
    model.root.position.set(...state.p);
    model.root.quaternion.set(...state.q);
    this.scene.add(model.root);
    const euler = new THREE.Euler().setFromQuaternion(model.root.quaternion, 'YXZ');
    this.vehicles.set(state.id, {
      state, model,
      targetPos: model.root.position.clone(),
      targetQuat: model.root.quaternion.clone(),
      lastPos: model.root.position.clone(),
      speed: 0, yaw: euler.y, pitch: 0, roll: 0, vy: 0, throttle: 0,
    });
  }

  private addLoot(state: LootState) {
    const mesh = buildLootBox();
    mesh.position.set(...state.p);
    mesh.visible = state.active;
    this.scene.add(mesh);
    this.loot.set(state.id, { state, mesh, pendingUntil: 0 });
  }

  // ---------------------------------------------------------------- networking

  private onMessage(msg: ServerMsg) {
    switch (msg.t) {
      case 'welcome':
      case 'full':
        return;

      case 'joined':
        this.players.set(msg.player.id, msg.player);
        this.addRemote(msg.player);
        this.hud.feedMessage(`<b>${escapeHtml(msg.player.name)}</b> joined the brawl`);
        return;

      case 'left': {
        const r = this.remotes.get(msg.id);
        if (r) {
          this.scene.remove(r.rig.root);
          this.remotes.delete(msg.id);
          this.hud.feedMessage(`<b>${escapeHtml(r.info.name)}</b> left`);
        }
        this.players.delete(msg.id);
        return;
      }

      case 'snap': {
        for (const r of this.remotes.values()) r.seen = false;
        for (const s of msg.players) {
          const r = this.remotes.get(s.id);
          if (!r) continue;
          if (!r.rig.root.visible) {
            r.rig.root.position.set(...s.p);
            r.lastPos.set(...s.p);
          }
          r.seen = true;
          r.target.set(...s.p);
          r.targetYaw = s.yaw;
          r.pitch = s.pitch;
          r.anim = s.anim;
          r.vehicle = s.vehicle;
          if (r.weapon !== s.weapon) {
            r.weapon = s.weapon;
            r.weaponModel = this.attachWeapon(r.rig, s.weapon);
          }
        }
        for (const r of this.remotes.values()) r.rig.root.visible = r.seen;
        for (const vs of msg.vehicles) {
          const v = this.vehicles.get(vs.id);
          if (!v || vs.id === this.myVehicle) continue;
          v.state.driver = vs.driver;
          v.targetPos.set(...vs.p);
          v.targetQuat.set(...vs.q);
        }
        return;
      }

      case 'fire': {
        const dist = this.pos.distanceTo(tmpV.set(...msg.origin));
        sfx.playFire(msg.weapon, Math.max(0, 1 - dist / 80));
        const origin = new THREE.Vector3(...msg.origin);
        const paint = randomPaint();
        for (const d of msg.dirs) this.spawnProjectile(msg.weapon, origin, new THREE.Vector3(...d), msg.id, false, paint);
        return;
      }

      case 'health': {
        const info = this.players.get(msg.id);
        if (info) info.health = msg.health;
        if (msg.id === this.myId) {
          const lost = msg.health < this.health;
          this.health = msg.health;
          this.hud.setHealth(msg.health);
          if (lost) {
            this.hud.hurt();
            sfx.playHurt();
            if (msg.knock && this.myVehicle === null) {
              this.vel.x += msg.knock[0];
              this.vel.z += msg.knock[2];
              this.vel.y += Math.max(msg.knock[1], 0) + Math.min(4, Math.hypot(msg.knock[0], msg.knock[2]) * 0.4);
            }
          }
        } else {
          const r = this.remotes.get(msg.id);
          if (r) this.drawTag(r);
        }
        return;
      }

      case 'splat': {
        for (const p of msg.players) {
          const existing = this.players.get(p.id);
          if (existing) Object.assign(existing, p);
        }
        const target = this.players.get(msg.target);
        const attacker = msg.attacker !== null ? this.players.get(msg.attacker) : null;
        const how = msg.weapon === 'bonk' ? 'bonked' : `soaked with a <i>${WEAPONS[msg.weapon].name}</i>`;
        const tName = `<b>${escapeHtml(target?.name ?? '???')}</b>`;
        this.hud.feedMessage(
          attacker && attacker.id !== msg.target
            ? `<b>${escapeHtml(attacker.name)}</b> ${how} ${tName} 💦`
            : `${tName} got splatted`,
        );
        const where = msg.target === this.myId ? this.pos : this.remotes.get(msg.target)?.rig.root.position;
        if (where) {
          this.effects.splash(where.clone().add(new THREE.Vector3(0, 1, 0)), randomPaint(), 40, 8, 0.15);
          this.effects.splash(where.clone().add(new THREE.Vector3(0, 1, 0)), 0x6fd3ff, 30, 6, 0.12);
          sfx.playSplat();
        }
        const r = this.remotes.get(msg.target);
        if (r) r.rig.root.visible = false;
        if (msg.target === this.myId) this.onSplatted(attacker ?? null);
        return;
      }

      case 'respawn': {
        if (msg.id === this.myId) {
          this.pos.set(...msg.p);
          this.vel.set(0, 0, 0);
          this.yaw = msg.yaw;
          this.pitch = 0;
          this.alive = true;
          this.health = MAX_HEALTH;
          this.hud.setHealth(MAX_HEALTH);
          this.hud.setCenter(null);
          this.resetLoadout();
        } else {
          const info = this.players.get(msg.id);
          if (info) {
            info.health = MAX_HEALTH;
            info.alive = true;
          }
          const r = this.remotes.get(msg.id);
          if (r) {
            r.rig.root.position.set(...msg.p);
            r.target.set(...msg.p);
            this.drawTag(r);
          }
        }
        return;
      }

      case 'loot': {
        const l = this.loot.get(msg.id);
        if (!l) return;
        l.state.active = msg.active;
        l.mesh.visible = msg.active;
        if (!msg.active) this.effects.splash(l.mesh.position, 0xff9cf0, 16, 5, 0.1);
        if (msg.by === this.myId && msg.grant) this.applyGrant(msg.grant);
        return;
      }

      case 'driver': {
        const v = this.vehicles.get(msg.vehicle);
        if (!v) return;
        v.state.driver = msg.driver;
        if (msg.driver === this.myId) {
          this.myVehicle = v.state.id;
          const e = new THREE.Euler().setFromQuaternion(v.model.root.quaternion, 'YXZ');
          v.yaw = e.y;
          v.pitch = 0;
          v.roll = 0;
          v.speed = 0;
          v.vy = 0;
          v.throttle = 0;
          this.yaw = v.yaw;
          this.pitch = -0.2;
          this.hud.feedMessage(`You hopped into the <b>${VEHICLE_NAMES[v.state.kind]}</b>`);
          sfx.playHonk();
        } else if (msg.driver === null && this.myVehicle === v.state.id) {
          // Server kicked us out (e.g. we got splatted): park it where it is.
          this.leaveVehicle(false);
        }
        return;
      }
    }
  }

  private applyGrant(grant: LootGrant) {
    sfx.playPickup();
    switch (grant.kind) {
      case 'health':
        this.hud.feedMessage(`🍙 +${grant.amount} health`);
        return;
      case 'ammo':
        for (const [id, ammo] of this.owned) this.owned.set(id, Math.min(WEAPONS[id].maxAmmo, ammo + WEAPONS[id].boxAmmo));
        this.hud.feedMessage('🎒 Ammo refilled for all your blasters');
        this.hud.setWeapon(this.weapon, this.owned);
        return;
      case 'weapon': {
        const def = WEAPONS[grant.weapon];
        const had = this.owned.get(grant.weapon);
        this.owned.set(grant.weapon, Math.min(def.maxAmmo, (had ?? 0) + grant.amount));
        this.hud.feedMessage(had === undefined ? `✨ New weapon: <b>${def.name}</b>!` : `🎒 More ${def.ammoName}`);
        this.equip(grant.weapon);
        return;
      }
    }
  }

  private onSplatted(by: PlayerInfo | null) {
    this.alive = false;
    this.respawnAt = this.time + 3;
    if (this.myVehicle !== null) this.leaveVehicle(false);
    this.hud.setCenter(`💦 SPLATTED${by && by.id !== this.myId ? ` by ${escapeHtml(by.name)}` : ''}! 💦<br><small id="respawn-count"></small>`);
  }

  private sendState() {
    const v = this.myVehicle !== null ? this.vehicles.get(this.myVehicle)! : null;
    const p = v ? v.model.root.localToWorld(v.model.seat.clone()) : this.pos;
    this.net.send({
      t: 'state',
      p: toVec3(p),
      yaw: this.yaw,
      pitch: this.pitch,
      anim: { moving: this.moving, sprint: this.sprinting, aiming: this.aiming, grounded: this.grounded },
      weapon: this.weapon,
      veh: v ? { p: toVec3(v.model.root.position), q: toQuat(v.model.root.quaternion) } : null,
    });
  }

  // ---------------------------------------------------------------- main loop

  private frame() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.time += dt;
    const input = this.input;

    if (input.locked) {
      const sens = LOOK_SENS * (this.aiming ? 0.55 : 1);
      const v = this.myVehicle !== null ? this.vehicles.get(this.myVehicle)! : null;
      if (!(v && v.state.kind === 'plane')) {
        this.yaw -= input.mouseDX * sens;
        this.pitch = THREE.MathUtils.clamp(this.pitch - input.mouseDY * sens, -1.5, 1.5);
      }
    }

    this.aiming = input.rightDown && this.alive;
    this.hud.setAiming(this.aiming);

    if (this.myVehicle !== null) this.driveVehicle(dt);
    else if (this.alive) this.movePlayer(dt);

    if (this.alive) {
      this.handleWeapons(dt);
      this.handleInteract();
      this.checkPickups();
    } else {
      const left = Math.max(0, Math.ceil(this.respawnAt - this.time));
      const el = document.getElementById('respawn-count');
      if (el) el.textContent = left > 0 ? `Drying off... back in ${left}` : 'Respawning...';
    }
    if (input.wasPressed('KeyV')) this.thirdPerson = !this.thirdPerson;

    this.updateProjectiles(dt);
    this.updateRemotes(dt);
    this.updateVehicles(dt);
    this.updateLoot(dt);
    this.effects.update(dt);
    this.city.update(this.time);
    this.updateCamera(dt);
    this.updateViewModel(dt);

    this.sendTimer += dt;
    if (this.sendTimer >= 1 / SNAPSHOT_HZ && this.alive) {
      this.sendTimer = 0;
      this.sendState();
    }

    this.hud.update(dt);
    this.hud.showScoreboard(input.down('Tab'), [...this.players.values()], this.myId);
    this.drawMinimap();
    document.getElementById('click-to-play')!.hidden = input.locked;

    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    const showViewModel = this.alive && this.myVehicle === null && !this.thirdPerson;
    if (showViewModel) {
      this.renderer.clearDepth();
      this.renderer.render(this.viewScene, this.viewCamera);
    }
    input.endFrame();
  }

  // ---------------------------------------------------------------- local player

  private movePlayer(dt: number) {
    const input = this.input;
    const fwd = forwardFrom(this.yaw);
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const wish = new THREE.Vector3();
    if (input.down('KeyW')) wish.add(fwd);
    if (input.down('KeyS')) wish.sub(fwd);
    if (input.down('KeyD')) wish.add(right);
    if (input.down('KeyA')) wish.sub(right);
    this.moving = wish.lengthSq() > 0;
    if (this.moving) wish.normalize();

    this.sprinting = input.down('ShiftLeft') || input.down('ShiftRight');
    this.sprinting &&= input.down('KeyW') && !this.aiming;
    const speed = this.aiming ? AIM_WALK : this.sprinting ? SPRINT : WALK;

    this.grounded = isSupported(this.pos, PLAYER_R) && this.vel.y <= 0;
    const control = this.grounded ? 12 : 2.5;
    const k = Math.min(1, control * dt);
    this.vel.x += (wish.x * speed - this.vel.x) * k;
    this.vel.z += (wish.z * speed - this.vel.z) * k;

    if (input.wasPressed('Space') && this.grounded) {
      this.vel.y = JUMP;
      this.grounded = false;
      sfx.playJump();
    }
    this.vel.y -= GRAVITY * dt;
    const res = moveBody(this.pos, this.vel, PLAYER_R, PLAYER_H, dt);
    this.grounded = res.grounded;

    if (this.moving && this.grounded) this.bob += dt * (this.sprinting ? 14 : 9);
  }

  private handleWeapons(dt: number) {
    const input = this.input;
    WEAPON_IDS.forEach((id, i) => {
      if (input.wasPressed(`Digit${i + 1}`)) this.equip(id);
    });
    if (input.wheel !== 0) {
      const list = WEAPON_IDS.filter((id) => this.owned.has(id));
      const idx = list.indexOf(this.weapon);
      this.equip(list[(idx + input.wheel + list.length) % list.length]);
    }

    // Free slingshot pellets trickle in so you can always fight back.
    this.regenTimer += dt;
    if (this.regenTimer >= SLINGSHOT_REGEN) {
      this.regenTimer = 0;
      const pellets = this.owned.get('slingshot') ?? 0;
      if (pellets < SLINGSHOT_REGEN_CAP) {
        this.owned.set('slingshot', pellets + 1);
        if (this.weapon === 'slingshot') this.hud.setWeapon(this.weapon, this.owned);
      }
    }

    const v = this.myVehicle !== null ? this.vehicles.get(this.myVehicle)! : null;
    if (!(input.leftDown || input.leftClicked) || (v && v.state.kind === 'plane')) return;
    const def = WEAPONS[this.weapon];
    if (this.time - this.lastFire < def.fireInterval) return;
    const ammo = this.owned.get(this.weapon) ?? 0;
    if (ammo <= 0) {
      if (this.time - this.lastFire > 0.6) {
        this.lastFire = this.time;
        this.hud.feedMessage(`Out of ${def.ammoName}! Find a glowing box or switch weapons.`);
      }
      return;
    }
    this.lastFire = this.time;
    this.owned.set(this.weapon, ammo - 1);
    this.hud.setWeapon(this.weapon, this.owned);

    const { origin, aim } = this.aimRay();
    const spread = this.aiming ? def.aimSpread : def.spread;
    const dirs: THREE.Vector3[] = [];
    for (let i = 0; i < def.pellets; i++) {
      const d = aim.clone();
      d.x += (Math.random() - 0.5) * 2 * spread;
      d.y += (Math.random() - 0.5) * 2 * spread;
      d.z += (Math.random() - 0.5) * 2 * spread;
      dirs.push(d.normalize());
    }
    const paint = randomPaint();
    for (const d of dirs) this.spawnProjectile(this.weapon, origin, d, this.myId, true, paint);
    this.net.send({ t: 'fire', weapon: this.weapon, origin: toVec3(origin), dirs: dirs.map(toVec3) });
    sfx.playFire(this.weapon);
    this.recoil = Math.min(1, this.recoil + (def.id === 'duckzooka' ? 1 : 0.35));
  }

  /** Where shots come from and which way they go, converging on what the crosshair points at. */
  private aimRay() {
    const camFwd = new THREE.Vector3();
    this.camera.getWorldDirection(camFwd);
    const far = this.camera.position.clone().addScaledVector(camFwd, 200);
    const hit = segmentCast(this.camera.position, far);
    const aimPoint = hit ? hit.point : far;
    const v = this.myVehicle !== null ? this.vehicles.get(this.myVehicle)! : null;
    const head = v
      ? v.model.root.localToWorld(v.model.seat.clone()).add(new THREE.Vector3(0, 1.4, 0))
      : this.pos.clone().add(new THREE.Vector3(0, EYE - 0.15, 0));
    const origin = head.addScaledVector(camFwd, 0.6);
    const aim = aimPoint.sub(origin);
    if (aim.dot(camFwd) <= 0.1) aim.copy(camFwd); // target is behind the muzzle (point blank)
    return { origin, aim: aim.normalize() };
  }

  private handleInteract() {
    if (!this.input.wasPressed('KeyE')) return;
    if (this.myVehicle !== null) {
      this.leaveVehicle(true);
      return;
    }
    let best: VehicleObj | null = null;
    let bestDist = VEHICLE_ENTER_RADIUS;
    for (const v of this.vehicles.values()) {
      const d = v.model.root.position.distanceTo(this.pos);
      if (v.state.driver === null && d < bestDist) {
        best = v;
        bestDist = d;
      }
    }
    if (best) this.net.send({ t: 'enter', vehicle: best.state.id });
  }

  private nearbyVehicle(): VehicleObj | null {
    for (const v of this.vehicles.values()) {
      if (v.state.driver === null && v.model.root.position.distanceTo(this.pos) < VEHICLE_ENTER_RADIUS) return v;
    }
    return null;
  }

  /** Get out of our vehicle, parking it on the ground. `voluntary` = we pressed E (vs. got splatted). */
  private leaveVehicle(voluntary: boolean) {
    const v = this.vehicles.get(this.myVehicle!)!;
    this.myVehicle = null;
    const root = v.model.root;

    // Find a clear spot beside the vehicle to step out.
    const right = new THREE.Vector3(Math.cos(v.yaw), 0, -Math.sin(v.yaw));
    const candidates = [
      root.position.clone().addScaledVector(right, v.model.half.x + 1),
      root.position.clone().addScaledVector(right, -(v.model.half.x + 1)),
      root.position.clone().add(new THREE.Vector3(0, v.model.half.h + 0.1, 0)),
    ];
    const exitP = candidates.find((c) => !overlapsAny(c, PLAYER_R, PLAYER_H)) ?? candidates[2];

    // Planes and airborne karts drop straight down and settle level.
    root.position.y = groundBelow(root.position.x, root.position.z, root.position.y + 0.5);
    root.quaternion.setFromAxisAngle(UP, v.yaw);
    v.targetPos.copy(root.position);
    v.targetQuat.copy(root.quaternion);
    v.speed = 0;
    v.throttle = 0;
    v.state.driver = null;

    this.net.send({ t: 'exit', p: toVec3(exitP), veh: { p: toVec3(root.position), q: toQuat(root.quaternion) } });
    if (voluntary) {
      this.pos.copy(exitP);
      this.vel.set(0, 0, 0);
    }
  }

  private driveVehicle(dt: number) {
    const v = this.vehicles.get(this.myVehicle!)!;
    const input = this.input;
    const throttle = (input.down('KeyW') ? 1 : 0) - (input.down('KeyS') ? 1 : 0);
    const steer = (input.down('KeyA') ? 1 : 0) - (input.down('KeyD') ? 1 : 0);
    const boost = input.down('ShiftLeft') || input.down('ShiftRight');
    const root = v.model.root;
    const vel = new THREE.Vector3();
    this.moving = false;
    this.grounded = true;

    if (v.state.kind === 'plane') {
      v.throttle = THREE.MathUtils.clamp(v.throttle + throttle * dt * 0.6, 0, 1);
      v.speed += (v.throttle * PLANE.maxSpeed * (boost ? 1.25 : 1) - v.speed) * Math.min(1, dt * PLANE.accel / 20);
      const flying = v.speed >= PLANE.stallSpeed;
      const airborne = root.position.y > 0.3;
      const turnIn = steer + -this.input.mouseDX * 0.04;
      v.yaw += turnIn * PLANE.turn * dt * (airborne ? 1 : 0.6);
      if (flying) {
        v.pitch = THREE.MathUtils.clamp(v.pitch - this.input.mouseDY * 0.003 + ((input.down('Space') ? 1 : 0) - (input.down('KeyC') ? 1 : 0)) * dt, -0.9, 0.9);
        v.vy = 0;
      } else {
        v.pitch += ((airborne ? -0.5 : 0) - v.pitch) * Math.min(1, dt * 1.5);
        v.vy = airborne ? v.vy - GRAVITY * 0.5 * dt : 0;
      }
      if (!airborne && v.pitch < 0) v.pitch = 0;
      v.roll += (-turnIn * 0.7 - v.roll) * Math.min(1, dt * 4);
      vel.copy(forwardFrom(v.yaw, v.pitch)).multiplyScalar(v.speed);
      vel.y += v.vy;
      const res = moveBody(root.position, vel, v.model.half.x, v.model.half.h, dt, false);
      if (res.hitWall && v.speed > 12) {
        this.effects.splash(root.position.clone().add(new THREE.Vector3(0, 1.5, 0)), 0xd9c9a3, 30, 6, 0.12);
        sfx.playSplat();
        v.speed = 0;
        v.throttle = 0;
        this.hud.feedMessage('💥 Crunch! Cardboard is not very aerodynamic.');
      }
      if (res.grounded) v.vy = 0;
      root.position.y = Math.min(root.position.y, PLANE.ceiling);
      root.quaternion.setFromEuler(new THREE.Euler(v.pitch, v.yaw, v.roll, 'YXZ'));
      this.yaw = v.yaw;
      this.pitch = v.pitch - 0.15;
    } else {
      const spec = GROUND_VEHICLE[v.state.kind];
      const max = spec.maxSpeed * (boost ? 1.3 : 1);
      if (throttle !== 0) {
        const braking = Math.sign(throttle) !== Math.sign(v.speed) && Math.abs(v.speed) > 0.5;
        v.speed += throttle * spec.accel * (braking ? 2.5 : 1) * dt;
      } else {
        v.speed *= 1 - Math.min(1, 1.5 * dt);
      }
      v.speed = THREE.MathUtils.clamp(v.speed, -10, max);
      v.yaw += steer * spec.turn * THREE.MathUtils.clamp(v.speed / 10, -1, 1) * dt;
      const grounded = isSupported(root.position, v.model.half.x);
      if (input.wasPressed('Space') && grounded) {
        v.vy = 7;
        sfx.playHonk();
      }
      v.vy -= GRAVITY * dt;
      vel.copy(forwardFrom(v.yaw)).multiplyScalar(v.speed);
      vel.y = v.vy;
      const res = moveBody(root.position, vel, v.model.half.x, v.model.half.h, dt);
      v.vy = vel.y;
      if (res.hitWall && Math.abs(v.speed) > 6) {
        v.speed *= -0.35;
        sfx.playSquish();
      }
      v.roll += (-steer * v.speed * 0.012 - v.roll) * Math.min(1, dt * 6);
      root.quaternion.setFromEuler(new THREE.Euler(res.grounded ? 0 : -0.15, v.yaw, v.roll, 'YXZ'));
    }

    // Keep our body with the vehicle (it is what others hit and what our camera follows).
    this.pos.copy(root.localToWorld(v.model.seat.clone()));
    this.vel.set(0, 0, 0);
    this.bonkCheck(v);
  }

  /** Ramming someone with a vehicle bonks them away. */
  private bonkCheck(v: VehicleObj) {
    if (Math.abs(v.speed) < 8) return;
    const vp = v.model.root.position;
    const reach = Math.max(v.model.half.x, v.model.half.z) + 0.6;
    for (const r of this.remotes.values()) {
      if (!r.rig.root.visible || r.vehicle !== null) continue;
      const rp = r.rig.root.position;
      if (Math.hypot(rp.x - vp.x, rp.z - vp.z) > reach || Math.abs(rp.y - vp.y) > 2.5) continue;
      if (this.time - (this.lastBonk.get(r.info.id) ?? -10) < 1) continue;
      this.lastBonk.set(r.info.id, this.time);
      const dir = new THREE.Vector3(rp.x - vp.x, 0, rp.z - vp.z).normalize();
      this.net.send({ t: 'bonk', target: r.info.id, dir: toVec3(dir) });
      sfx.playHonk();
    }
  }

  private checkPickups() {
    const now = this.time;
    for (const l of this.loot.values()) {
      if (!l.state.active || now < l.pendingUntil) continue;
      if (l.mesh.position.distanceTo(tmpV.copy(this.pos).setY(this.pos.y + 0.6)) < PICKUP_RADIUS) {
        l.pendingUntil = now + 1;
        this.net.send({ t: 'pickup', loot: l.state.id });
      }
    }
  }

  // ---------------------------------------------------------------- projectiles

  private spawnProjectile(weapon: WeaponId, origin: THREE.Vector3, dir: THREE.Vector3, ownerId: number, mine: boolean, paint: number) {
    const def = WEAPONS[weapon];
    const obj = buildProjectile(weapon, def.size, paint);
    obj.position.copy(origin);
    this.scene.add(obj);
    this.projectiles.push({
      obj, def, mine, ownerId, paint,
      pos: origin.clone(),
      vel: dir.clone().multiplyScalar(def.speed),
      bounces: def.bounces,
      life: def.lifetime,
    });
  }

  private updateProjectiles(dt: number) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.removeProjectile(i);
        continue;
      }
      p.vel.y -= GRAVITY * p.def.gravity * dt;
      const next = p.pos.clone().addScaledVector(p.vel, dt);

      const target = this.projectileHitsPlayer(p, next);
      if (target) {
        const where = target.at;
        this.effects.splash(where, p.def.id === 'watergun' ? 0x6fd3ff : p.def.id === 'paintball' ? p.paint : p.def.color, 12, 4);
        if (p.mine && target.id !== null) {
          this.net.send({ t: 'hit', target: target.id, weapon: p.def.id, dir: toVec3(p.vel.clone().normalize()) });
          this.hud.hit();
          sfx.playHitMarker();
        }
        this.removeProjectile(i);
        continue;
      }

      const hit = segmentCast(p.pos, next);
      if (hit) {
        if (p.bounces > 0) {
          p.bounces--;
          p.vel.reflect(hit.normal).multiplyScalar(0.6);
          p.pos.copy(hit.point).addScaledVector(hit.normal, 0.02);
          if (p.def.id === 'duckzooka') sfx.playSquish();
        } else {
          const color = p.def.id === 'paintball' ? p.paint : p.def.id === 'watergun' ? 0x6fd3ff : p.def.color;
          this.effects.splash(hit.point.clone().addScaledVector(hit.normal, 0.05), color, 8, 3, 0.06);
          if (p.def.splats) this.effects.paint(hit.point, hit.normal, p.paint, 0.55);
          if (p.def.id === 'watergun') this.effects.paint(hit.point, hit.normal, 0x3a6d8a, 0.25);
          this.removeProjectile(i);
        }
        continue;
      }
      p.pos.copy(next);
      p.obj.position.copy(p.pos);
      p.obj.lookAt(tmpV.copy(p.pos).add(p.vel));
    }
  }

  /**
   * Checks the segment against every player's body. Only our own shots report hits to the server;
   * other players' shots just stop visually when they reach someone.
   */
  private projectileHitsPlayer(p: Projectile, next: THREE.Vector3): { id: number | null; at: THREE.Vector3 } | null {
    const bodies: { id: number; feet: THREE.Vector3 }[] = [];
    for (const r of this.remotes.values()) {
      if (r.rig.root.visible && r.info.id !== p.ownerId) bodies.push({ id: r.info.id, feet: r.rig.root.position });
    }
    if (this.alive && p.ownerId !== this.myId) bodies.push({ id: this.myId, feet: this.pos });

    const len = p.pos.distanceTo(next);
    const steps = Math.max(1, Math.ceil(len / 0.25));
    const reach = 0.5 + p.def.size;
    for (let s = 0; s <= steps; s++) {
      const pt = p.pos.clone().lerp(next, s / steps);
      for (const b of bodies) {
        const y = THREE.MathUtils.clamp(pt.y, b.feet.y + 0.3, b.feet.y + 1.4);
        if (Math.hypot(pt.x - b.feet.x, pt.y - y, pt.z - b.feet.z) < reach) {
          return { id: p.mine ? b.id : null, at: pt };
        }
      }
    }
    return null;
  }

  private removeProjectile(i: number) {
    this.scene.remove(this.projectiles[i].obj);
    this.projectiles.splice(i, 1);
  }

  // ---------------------------------------------------------------- world objects

  private updateRemotes(dt: number) {
    const k = 1 - Math.exp(-dt * 14);
    for (const r of this.remotes.values()) {
      if (!r.rig.root.visible) continue;
      const root = r.rig.root;
      const v = r.vehicle !== null ? this.vehicles.get(r.vehicle) : undefined;
      if (v) {
        root.position.copy(v.model.root.localToWorld(v.model.seat.clone()));
        root.quaternion.copy(v.model.root.quaternion);
      } else {
        root.position.lerp(r.target, k);
        const q = new THREE.Quaternion().setFromAxisAngle(UP, r.targetYaw);
        root.quaternion.slerp(q, k);
      }
      const speed = Math.hypot(root.position.x - r.lastPos.x, root.position.z - r.lastPos.z) / Math.max(dt, 1e-4);
      r.lastPos.copy(root.position);
      animateAnimal(r.rig, dt, speed, r.anim, r.pitch, this.time, !!v);
    }

    // Our own body, visible in third person and while driving.
    const rig = this.myRig;
    const v = this.myVehicle !== null ? this.vehicles.get(this.myVehicle)! : null;
    rig.root.visible = this.alive && (this.thirdPerson || v !== null);
    if (rig.root.visible) {
      if (v) {
        rig.root.position.copy(v.model.root.localToWorld(v.model.seat.clone()));
        rig.root.quaternion.copy(v.model.root.quaternion);
      } else {
        rig.root.position.copy(this.pos);
        rig.root.quaternion.setFromAxisAngle(UP, this.yaw);
      }
      const anim = { moving: this.moving, sprint: this.sprinting, aiming: this.aiming, grounded: this.grounded };
      animateAnimal(rig, dt, Math.hypot(this.vel.x, this.vel.z), anim, this.pitch, this.time, v !== null);
    }
  }

  private updateVehicles(dt: number) {
    const k = 1 - Math.exp(-dt * 12);
    for (const v of this.vehicles.values()) {
      const root = v.model.root;
      if (v.state.id !== this.myVehicle) {
        root.position.lerp(v.targetPos, k);
        root.quaternion.slerp(v.targetQuat, k);
      }
      // Spin wheels by distance travelled along the vehicle's forward axis.
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(root.quaternion);
      const travelled = tmpV.subVectors(root.position, v.lastPos).dot(fwd);
      v.lastPos.copy(root.position);
      for (const w of v.model.wheels) w.rotation.x -= travelled / 0.4;
      if (v.model.propeller) {
        const spinning = v.state.driver !== null;
        v.model.propeller.rotation.z += dt * (spinning ? 25 + v.speed : 0);
      }
    }
  }

  private updateLoot(dt: number) {
    for (const l of this.loot.values()) {
      if (!l.mesh.visible) continue;
      const cube = l.mesh.getObjectByName('cube')!;
      cube.rotation.y += dt * 1.5;
      cube.rotation.x = Math.sin(this.time + l.state.id) * 0.3;
      l.mesh.position.y = l.state.p[1] + 0.4 + Math.sin(this.time * 2 + l.state.id) * 0.2;
    }
  }

  // ---------------------------------------------------------------- camera, view model, HUD

  private updateCamera(dt: number) {
    const targetFov = this.aiming && this.myVehicle === null ? AIM_FOV : FOV;
    this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 12);
    this.camera.updateProjectionMatrix();

    const v = this.myVehicle !== null ? this.vehicles.get(this.myVehicle)! : null;
    let pivot: THREE.Vector3;
    let distance: number;
    if (v) {
      pivot = v.model.root.position.clone().add(new THREE.Vector3(0, v.state.kind === 'plane' ? 2.5 : 2.2, 0));
      distance = v.state.kind === 'plane' ? 11 : v.state.kind === 'car' ? 7 : 5.5;
    } else if (this.thirdPerson || !this.alive) {
      pivot = this.pos.clone().add(new THREE.Vector3(0, EYE, 0));
      distance = this.alive ? 3.5 : 6;
    } else {
      this.camera.position.copy(this.pos).add(new THREE.Vector3(0, EYE, 0));
      this.camera.rotation.set(this.pitch, this.yaw, 0);
      this.moveSun();
      return;
    }

    // Orbit camera that pulls in when something is in the way.
    const fwd = forwardFrom(this.yaw, this.pitch);
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x).normalize();
    const shoulder = v ? 0 : 0.6;
    const desired = pivot.clone().addScaledVector(fwd, -distance).addScaledVector(right, shoulder);
    const block = segmentCast(pivot, desired);
    this.camera.position.copy(block ? pivot.lerp(desired, Math.max(0, block.t - 0.1)) : desired);
    if (this.camera.position.y < 0.3) this.camera.position.y = 0.3;
    this.camera.rotation.set(this.pitch, this.yaw, 0);
    this.moveSun();
  }

  private moveSun() {
    const c = this.camera.position;
    this.sun.position.set(c.x + 60, 80, c.z + 30);
    this.sun.target.position.set(c.x, 0, c.z);
  }

  private updateViewModel(dt: number) {
    this.recoil = Math.max(0, this.recoil - dt * 5);
    const bobX = Math.sin(this.bob) * 0.012;
    const bobY = Math.abs(Math.cos(this.bob)) * 0.012;
    const hip = new THREE.Vector3(0.26, -0.26, -0.62);
    const ads = new THREE.Vector3(0, -0.17, -0.52);
    const target = this.aiming ? ads : hip;
    this.viewModel.position.lerp(new THREE.Vector3(target.x + bobX, target.y - bobY, target.z + this.recoil * 0.08), Math.min(1, dt * 16));
    this.viewModel.rotation.set(this.recoil * 0.25, 0, 0);
    const paw = this.viewModel.getObjectByName('paw')!;
    paw.position.set(0, -0.06, 0.02);
    const color = (this.myRig.armR.children[0] as THREE.Mesh).material as THREE.MeshToonMaterial;
    (paw as THREE.Mesh).material = color;
  }

  private drawMinimap() {
    const dots: MinimapDot[] = [];
    for (const l of this.loot.values()) {
      if (l.state.active) dots.push({ x: l.state.p[0], z: l.state.p[2], color: '#ff8cf0', size: 2.5 });
    }
    for (const v of this.vehicles.values()) {
      const p = v.model.root.position;
      dots.push({ x: p.x, z: p.z, color: v.state.driver === null ? '#ffd23f' : '#ff9f43', size: 3 });
    }
    for (const r of this.remotes.values()) {
      if (r.rig.root.visible) dots.push({ x: r.rig.root.position.x, z: r.rig.root.position.z, color: '#ff5470', size: 3.5 });
    }
    this.hud.drawMinimap({ x: this.pos.x, z: this.pos.z, yaw: this.yaw }, dots);

    // Contextual prompt.
    if (!this.alive) this.hud.setPrompt(null);
    else if (this.myVehicle !== null) {
      const v = this.vehicles.get(this.myVehicle)!;
      this.hud.setPrompt(v.state.kind === 'plane'
        ? `W/S throttle ${Math.round(v.throttle * 100)}% · Mouse or SPACE/C to climb/dive · A/D turn · E to bail out`
        : 'W/S drive · A/D steer · SHIFT boost · SPACE hop · Click to shoot · E to get out');
    } else {
      const near = this.nearbyVehicle();
      this.hud.setPrompt(near ? `Press E to drive the ${VEHICLE_NAMES[near.state.kind]}` : null);
    }
    this.hud.setCrosshairVisible(this.alive && !(this.myVehicle !== null && this.vehicles.get(this.myVehicle)!.state.kind === 'plane'));
  }
}
