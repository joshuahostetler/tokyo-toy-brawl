# Tokyo Toy Brawl 🐼🦆

A browser-based multiplayer first-person shooter with **no lethal weapons**. Cartoon Japanese animals soak, splat and bonk each other across a toy-sized Tokyo using slingshots, water guns, foam darts, paintballs and a rubber-duck bazooka. Getting "splatted" just sends you back to respawn in 3 seconds.

Built with TypeScript, [Three.js](https://threejs.org) and a small Node.js WebSocket server. Every model is built from code, so there are no asset files to download.

## Play

```bash
npm install
npm run dev        # game server on :3000 + Vite dev client on :5173
```

Open http://localhost:5173 in two browser tabs (or on two computers on the same network, using your machine's IP address) to play against yourself or a friend.

### Production / hosting

```bash
npm run build      # type-checks and builds the client into dist/
npm start          # serves dist/ and the game WebSocket on $PORT (default 3000)
```

Any Node host that supports WebSockets works (Render, Fly.io, Railway, a VPS). Set the start command to `npm start` and the build command to `npm install && npm run build`. Players open the server's URL.

## Controls

| Key | Action |
| --- | --- |
| W A S D | Move |
| Space | Jump (hop in cars, climb in planes, bounce higher on the pogo stick) |
| Shift | Sprint (boost in vehicles) |
| Hold right click | Aim (zoom and tighter spread) |
| Left click | Shoot |
| 1–5 / mouse wheel | Switch weapon |
| E | Enter or exit a vehicle |
| V | Toggle third-person view |
| Tab | Scoreboard |
| C | Dive (in planes) |

## What's in this prototype

- **Animals:** Panda, Duck, Shiba Inu, Tanuki, Snow Monkey, each with procedural walk, jump, aim and sitting animations.
- **Weapons** (`shared/protocol.ts`):
  - Slingshot (mochi pellets, arcing shots; refills slowly so you're never unarmed)
  - Super Soaker (rapid water stream)
  - Foam Dart Blaster
  - Paintball Marker (leaves paint splats on the city)
  - Rubber Duckzooka (bouncy ducks with big knockback)
- **Glowing loot boxes:** 21 around the city. Each gives health, an ammo refill for everything you own, or a random weapon, and respawns after 20 seconds.
- **Vehicles made of household junk:**
  - Paperclip Go-Kart (bottle-cap wheels, sponge seat, AA-battery engine)
  - Cardboard Cruiser (thread-spool wheels, CD windshield, binder-clip spoiler)
  - Paper-Towel Plane (ruler wings, spoon propeller)
  - Ramming players with a vehicle "bonks" them away.
  - When someone drives a vehicle off, a fresh one appears at its spawn spot. Empty vehicles left elsewhere (like a plane parked on a roof) vanish after 30 seconds.
- **The Pogo Stick:** one per map, marked by a giant rainbow light beacon that everyone can see (it shows on the minimap too). Grab it by walking into it. Riders bounce constantly, and holding Space makes each bounce bigger, up to about 75 m, high enough to reach any rooftop. You keep it until you're splatted. It then drops where you fell, and the race starts again. Pogo riders can't drive vehicles.
- **Toy Tokyo map (200 × 200 m):** Shibuya-style scramble crossing with a giant video screen, the neon Shinjuku towers, Akihabara shops with vending machines, a shrine park with torii gates, a pagoda and cherry trees, a Tokyo-Tower-style lattice tower, Mt. Fuji on the horizon, and giant tissue boxes, tape rolls, erasers and mugs as cover.
- **Multiplayer:** 2–8 players per server. Clients simulate their own movement and hit detection. The server owns health, scores, loot and vehicle seats.

## Project layout

```
shared/    protocol.ts (constants, weapons, message types) · map.ts (deterministic city layout)
server/    index.ts (HTTP static server + WebSocket game server)
client/    index.html, public/style.css
  src/     main.ts (lobby) · game.ts (game loop) · hud.ts · effects.ts · sfx.ts · input.ts · net.ts
  src/world/   city.ts (scene building) · physics.ts (box collisions, raycasts)
  src/models/  animals.ts · vehicles.ts · items.ts (weapons, projectiles, loot boxes)
```

## Known limitations / next steps

- Hit detection is client-trusted, which is fine among friends but not cheat-proof for public servers.
- There's a single game room per server process.
- Models are made from simple primitives. Swapping in real glTF models later only means changing `models/*.ts`.
- Ideas for later: more animals (red panda, crane, frog), more quirky weapons (bubble wand, confetti cannon, water balloons), more vehicles (bathtub boat, shopping-cart racer), match timer and rounds, mobile controls.
