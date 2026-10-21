// DOM heads-up display: health, ammo, weapon slots, kill feed, scoreboard, prompts and minimap.
import {
  ANIMAL_NAMES, MAX_HEALTH, WEAPONS, WEAPON_IDS,
  type PlayerInfo, type WeaponId,
} from '../../shared/protocol.ts';
import { MAP_HALF, ROAD_LINES, ROAD_WIDTH } from '../../shared/map.ts';

const $ = <T extends HTMLElement>(id: string) => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing HUD element #${id}`);
  return el as T;
};

export interface MinimapDot {
  x: number;
  z: number;
  color: string;
  size: number;
}

export class Hud {
  private health = $('health-fill');
  private healthText = $('health-text');
  private weaponName = $('weapon-name');
  private ammo = $('ammo');
  private slots = $('slots');
  private feed = $('killfeed');
  private prompt = $('prompt');
  private center = $('center-msg');
  private hitmarker = $('hitmarker');
  private vignette = $('vignette');
  private scoreboard = $('scoreboard');
  private crosshair = $('crosshair');
  private minimap = $<HTMLCanvasElement>('minimap');
  private mapCtx = this.minimap.getContext('2d')!;
  private hitTimer = 0;
  private hurtTimer = 0;

  constructor() {
    $('hud').hidden = false;
  }

  setHealth(hp: number) {
    const pct = Math.max(0, hp / MAX_HEALTH) * 100;
    this.health.style.width = `${pct}%`;
    this.health.style.background = pct > 50 ? '#5ee07a' : pct > 25 ? '#ffd23f' : '#ff5470';
    this.healthText.textContent = `${Math.ceil(hp)}`;
  }

  setWeapon(current: WeaponId, owned: Map<WeaponId, number>) {
    const def = WEAPONS[current];
    this.weaponName.textContent = def.name;
    this.ammo.textContent = `${owned.get(current) ?? 0} ${def.ammoName}`;
    this.slots.innerHTML = WEAPON_IDS.map((id, i) => {
      const has = owned.has(id);
      const cls = ['slot', has ? 'owned' : '', id === current ? 'active' : ''].join(' ');
      return `<div class="${cls}"><b>${i + 1}</b>${has ? WEAPONS[id].name : '—'}</div>`;
    }).join('');
  }

  setAiming(aiming: boolean) {
    this.crosshair.classList.toggle('aiming', aiming);
  }

  setCrosshairVisible(visible: boolean) {
    this.crosshair.hidden = !visible;
  }

  feedMessage(html: string) {
    const row = document.createElement('div');
    row.className = 'feed-row';
    row.innerHTML = html;
    this.feed.prepend(row);
    setTimeout(() => row.remove(), 6000);
    while (this.feed.children.length > 6) this.feed.lastChild!.remove();
  }

  setPrompt(text: string | null) {
    this.prompt.textContent = text ?? '';
    this.prompt.hidden = !text;
  }

  setCenter(text: string | null) {
    this.center.innerHTML = text ?? '';
    this.center.hidden = !text;
  }

  hit() {
    this.hitTimer = 0.15;
  }

  hurt() {
    this.hurtTimer = 0.4;
  }

  showScoreboard(show: boolean, players: PlayerInfo[], myId: number) {
    this.scoreboard.hidden = !show;
    if (!show) return;
    const rows = [...players]
      .sort((a, b) => b.splats - a.splats || a.splatted - b.splatted)
      .map((p) => `<tr class="${p.id === myId ? 'me' : ''}"><td>${escapeHtml(p.name)}</td><td>${ANIMAL_NAMES[p.animal]}</td><td>${p.splats}</td><td>${p.splatted}</td></tr>`)
      .join('');
    this.scoreboard.innerHTML = `<table><thead><tr><th>Player</th><th>Animal</th><th>Splats</th><th>Splatted</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  update(dt: number) {
    this.hitTimer = Math.max(0, this.hitTimer - dt);
    this.hurtTimer = Math.max(0, this.hurtTimer - dt);
    this.hitmarker.style.opacity = this.hitTimer > 0 ? '1' : '0';
    this.vignette.style.opacity = `${Math.min(1, this.hurtTimer * 2.5)}`;
  }

  drawMinimap(me: { x: number; z: number; yaw: number }, dots: MinimapDot[]) {
    const g = this.mapCtx;
    const size = this.minimap.width;
    const scale = size / (MAP_HALF * 2);
    const px = (v: number) => (v + MAP_HALF) * scale;
    g.fillStyle = 'rgba(30, 24, 50, 0.85)';
    g.fillRect(0, 0, size, size);
    g.fillStyle = 'rgba(255,255,255,0.25)';
    for (const l of ROAD_LINES) {
      g.fillRect(0, px(l - ROAD_WIDTH / 2), size, ROAD_WIDTH * scale);
      g.fillRect(px(l - ROAD_WIDTH / 2), 0, ROAD_WIDTH * scale, size);
    }
    for (const d of dots) {
      g.fillStyle = d.color;
      g.beginPath();
      g.arc(px(d.x), px(d.z), d.size, 0, Math.PI * 2);
      g.fill();
    }
    // Me: arrow pointing in look direction.
    g.save();
    g.translate(px(me.x), px(me.z));
    g.rotate(-me.yaw);
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(0, -7);
    g.lineTo(5, 5);
    g.lineTo(-5, 5);
    g.closePath();
    g.fill();
    g.restore();
  }
}

export function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
