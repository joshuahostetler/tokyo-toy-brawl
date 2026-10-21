// Lobby: pick a name and an animal, preview it, then connect and start the game.
import * as THREE from 'three';
import { ANIMALS, ANIMAL_NAMES, type AnimalId, type ServerMsg } from '../../shared/protocol.ts';
import { Game } from './game.ts';
import { animateAnimal, buildAnimal, type AnimalRig } from './models/animals.ts';
import { buildWeapon } from './models/items.ts';
import { Net } from './net.ts';
import { initAudio } from './sfx.ts';

const lobby = document.getElementById('lobby')!;
const nameInput = document.getElementById('name') as HTMLInputElement;
const picker = document.getElementById('animal-picker')!;
const playBtn = document.getElementById('play') as HTMLButtonElement;
const errorEl = document.getElementById('lobby-error')!;
const previewCanvas = document.getElementById('preview') as HTMLCanvasElement;

let selected: AnimalId = (localStorage.getItem('animal') as AnimalId | null) ?? 'panda';
if (!ANIMALS.includes(selected)) selected = 'panda';
nameInput.value = localStorage.getItem('name') ?? '';

// --- Rotating 3D preview of the chosen animal ---
const preview = new THREE.WebGLRenderer({ canvas: previewCanvas, antialias: true, alpha: true });
preview.setPixelRatio(Math.min(window.devicePixelRatio, 2));
const pScene = new THREE.Scene();
pScene.add(new THREE.HemisphereLight(0xffffff, 0x664466, 2.5));
const key = new THREE.DirectionalLight(0xffffff, 1.5);
key.position.set(2, 3, -3);
pScene.add(key);
const pCam = new THREE.PerspectiveCamera(35, 1, 0.1, 50);
pCam.position.set(0, 1.4, -4.2);
pCam.lookAt(0, 0.95, 0);
let rig: AnimalRig | null = null;
let running = true;

function showAnimal(id: AnimalId) {
  if (rig) pScene.remove(rig.root);
  rig = buildAnimal(id);
  const w = buildWeapon('watergun');
  w.rotation.x = -Math.PI / 2;
  w.scale.setScalar(1.5);
  rig.hand.add(w);
  pScene.add(rig.root);
}

const clock = new THREE.Clock();
function renderPreview() {
  if (!running) return;
  const dt = clock.getDelta();
  const t = clock.elapsedTime;
  const size = previewCanvas.clientWidth;
  if (previewCanvas.width !== size * preview.getPixelRatio()) preview.setSize(size, size, false);
  if (rig) {
    rig.root.rotation.y = Math.sin(t * 0.8) * 0.6;
    animateAnimal(rig, dt, 0, { moving: false, sprint: false, aiming: false, grounded: true }, 0.1, t);
  }
  preview.render(pScene, pCam);
  requestAnimationFrame(renderPreview);
}

for (const id of ANIMALS) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'animal';
  btn.dataset.id = id;
  btn.textContent = ANIMAL_NAMES[id];
  btn.addEventListener('click', () => select(id));
  picker.append(btn);
}

function select(id: AnimalId) {
  selected = id;
  for (const b of picker.querySelectorAll<HTMLButtonElement>('.animal')) {
    b.classList.toggle('selected', b.dataset.id === id);
  }
  showAnimal(id);
}

select(selected);
renderPreview();

document.getElementById('lobby-form')!.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = nameInput.value.trim() || `${ANIMAL_NAMES[selected]} ${Math.floor(Math.random() * 100)}`;
  localStorage.setItem('name', name);
  localStorage.setItem('animal', selected);
  playBtn.disabled = true;
  errorEl.textContent = '';
  initAudio();

  try {
    const net = await Net.connect();
    const welcome = await new Promise<Extract<ServerMsg, { t: 'welcome' }>>((resolve, reject) => {
      net.onMessage = (msg) => {
        if (msg.t === 'welcome') resolve(msg);
        else if (msg.t === 'full') reject(new Error('That game is full (8 players max). Try again soon!'));
      };
      net.onClose = () => reject(new Error('The server closed the connection.'));
      net.send({ t: 'join', name, animal: selected });
    });
    running = false;
    preview.dispose();
    lobby.hidden = true;
    const canvas = document.getElementById('game') as HTMLCanvasElement;
    const game = new Game(canvas, net, welcome, selected);
    // Expose the game in dev builds for debugging from the browser console.
    if (import.meta.env.DEV) Object.assign(window, { game });
    canvas.requestPointerLock();
  } catch (err) {
    errorEl.textContent = err instanceof Error ? err.message : String(err);
    playBtn.disabled = false;
  }
});
