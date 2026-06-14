# 🏈 BeastBall — Animal Football Chaos

BeastBall is an animal football game where you collect beasts and play matches
with them. Each animal has stats and a special ability. This repository is the
**2D MVP**: a fully playable 3v3 match on a top-down football pitch, built with
plain HTML / CSS / JavaScript and the Canvas API — **no frameworks, no build
tools**.

The code is deliberately architected so a **3D upgrade (Three.js)** can be added
later by swapping the renderer, **without rewriting the game logic**. See
[Future 3D Upgrade Plan](#-future-3d-upgrade-plan).

---

## ▶️ How to run locally

The project uses native ES modules (`import` / `export`), which browsers only
load over `http(s)://`, not `file://`. So use any tiny static server — **no npm
install, no build step**:

```bash
# from the repository root:

# Python 3 (usually preinstalled)
python3 -m http.server 8000
# then open http://localhost:8000

# …or Node, if you prefer
npx serve .

# …or the VS Code "Live Server" extension → "Open with Live Server"
```

Then open the printed URL and click **Start Match**.

> Opening `index.html` directly (double-click) will be blocked by the browser's
> module security policy on most setups — run one of the one-liners above
> instead. It takes two seconds and needs nothing installed beyond Python/Node.

---

## 🎮 Controls

| Input            | Action                                  |
| ---------------- | --------------------------------------- |
| **W A S D**      | Move the selected player                |
| **Mouse**        | Aim (the dashed line shows your aim)    |
| **Left click**   | Shoot toward the cursor                 |
| **Right click**  | Pass (to a team-mate / aimed direction) |
| **Space**        | Use the selected animal's ability       |
| **Q**            | Switch which player you control         |
| **R**            | Restart (after the match ends)          |

You only ever control **one Team A player** at a time; the rest (and all of
Team B) are run by simple AI.

---

## ⚽ The match

- **Format:** 3v3 — Blue Beasts vs Red Fangs.
- **Length:** 2 minutes. Highest score wins; equal score shows **Draw**.
- **After a goal:** score updates, a **GOAL!** banner shows, then the ball and
  players reset to their starting spots and play resumes.

### Squads & abilities (MVP)

| Team           | Animal          | Role        | Ability                                            |
| -------------- | --------------- | ----------- | -------------------------------------------------- |
| 🟦 Blue Beasts | 🦘 Kangaroo     | Striker     | **Super Leap Shot** — leap + a powerful shot (8s)  |
| 🟦 Blue Beasts | 🐊 Crocodile    | Midfielder  | Strong basic midfielder (Fear Zone planned later)  |
| 🟦 Blue Beasts | 🧤 Keeper       | Goalkeeper  | —                                                  |
| 🟧 Red Fangs   | 🐻 Bear         | Striker     | **Charge Tackle** — dash that knocks the ball loose (10s) |
| 🟧 Red Fangs   | 🕷️ Spider       | Midfielder  | **Web Pass** — web that pulls the ball / slows foes (9s) |
| 🟧 Red Fangs   | 🧤 Keeper       | Goalkeeper  | —                                                  |

---

## 🧱 Architecture

The single most important rule in this codebase:

> **Game logic lives in `src/core`. Rendering lives in `src/renderers`.**
> Core never imports a renderer, never touches the canvas or the DOM.

The game runs a pure simulation in **world coordinates**. Each frame, the active
renderer is handed a read-only snapshot and draws it:

```
InputManager ──▶ Game (core simulation) ──▶ getState() ──▶ Renderer.render(state)
   (raw keys/mouse)      (pitch, ball,                          (Renderer2D now,
                          players, AI, physics)                  Renderer3D later)
                                   │
                                   └─▶ UIManager (DOM: menu / HUD / end screen)
```

`main.js` is the only file that knows about all the pieces; it owns the loop.

### File structure

```
beastball/
├── index.html                     # Stage: canvas + HUD/menu/end overlays
├── style.css                      # Chrome around the canvas (HUD, menus)
├── README.md
└── src/
    ├── main.js                    # Composition root + requestAnimationFrame loop
    ├── core/                      # === GAME LOGIC (renderer-agnostic) ===
    │   ├── Game.js                #   State machine, input handling, AI, abilities
    │   ├── Player.js              #   Player entity (stats, world transform, timers)
    │   ├── Ball.js                #   Ball entity (position + velocity)
    │   ├── Team.js                #   Team grouping + score + attack direction
    │   ├── AnimalData.js          #   All animal stats/abilities (single source)
    │   ├── InputManager.js        #   Keyboard + mouse polling (logical only)
    │   └── Physics.js             #   Friction, collisions, goal detection
    ├── renderers/                 # === RENDERING (swappable) ===
    │   ├── Renderer2D.js          #   Active Canvas 2D renderer
    │   └── Renderer3DStub.js      #   Placeholder w/ the same interface (Three.js TODO)
    └── ui/
        └── UIManager.js           #   DOM overlays: menu, HUD, GOAL!, end screen
```

### World coordinate system (and why it's 2D-now / 3D-ready)

Everything in `core` works in flat world units:

```
x : left (0) ─────────────▶ right (worldWidth)
y : top  (0) ─────────────▶ bottom (worldHeight)
heightZ : off-ground height (jumps / lobs) — animated, unused by 2D physics
```

These axes are chosen specifically so the future 3D mapping is trivial:

| Core (2D)  | Three.js (3D) | Meaning                |
| ---------- | ------------- | ---------------------- |
| `x`        | `x`           | horizontal pitch axis  |
| `y`        | `z`           | along-the-ground depth |
| `heightZ`  | `y`           | height (jumps / lobs)  |

The Kangaroo's leap already animates `heightZ`, so the 2D renderer fakes a hop
today and a real 3D jump arc works for free tomorrow.

### The renderer "interface"

A renderer is any object with two methods:

```js
renderer.render(gameState);              // draw one frame from the snapshot
renderer.screenToWorld(clientX, clientY) // map a pointer to world coords
```

`Renderer2D` and `Renderer3DStub` both implement exactly this, which is what
makes the swap a one-line change in `main.js`.

---

## 🧪 The physics (in `Physics.js`)

Kept clean and stateless (all in world units & seconds, so it's frame-rate
independent):

- Ball has position + velocity; **exponential friction** slows it each second.
- Players **push the ball** on contact (running into it = dribbling).
- **Shooting** kicks the ball toward the mouse; **passing** is softer and
  prefers an aligned team-mate.
- Ball **bounces** off the touchlines but the **goal mouths are open**.
- **Goal detection** fires when the ball crosses a goal line within the mouth.

---

## 🔮 Future 3D Upgrade Plan

The whole point of the flat-world architecture is that going 3D is a
**renderer swap**, not a rewrite.

1. **Add Three.js** (via CDN ES-module import or a local copy — still no bundler
   strictly required):
   ```js
   import * as THREE from 'https://unpkg.com/three/build/three.module.js';
   ```
2. **Implement `Renderer3D.js`** with the same interface as `Renderer2D`
   (`render(state)` + `screenToWorld()`). `Renderer3DStub.js` already sketches
   exactly where the scene, camera, lights and per-frame updates go.
3. **Swap one line in `main.js`:**
   ```js
   // import { Renderer2D } from './renderers/Renderer2D.js';
   import { Renderer3D } from './renderers/Renderer3D.js';
   const renderer = new Renderer3D(canvasOrContainer);
   ```
4. **Leave `core/` completely unchanged.** Game logic, AI, physics and abilities
   keep working as-is.
5. **Map 2D coordinates to the 3D pitch** (see the table above):
   `core x → THREE x`, `core y → THREE z`, `heightZ → THREE y`.
   A world `(x, y, heightZ)` becomes `new THREE.Vector3(x, heightZ, y)`.
6. **Start simple, then upgrade the art:**
   - Pitch → a textured `PlaneGeometry` with painted lines.
   - Ball → a `SphereGeometry`.
   - Players → **capsule meshes** coloured by team (emoji billboarded above).
   - Goals → simple box / line frames at the mouths.
   - Later: **replace the capsules with low-poly animal models** (glTF), keeping
     the same per-frame update loop.
7. `screenToWorld` becomes a **raycast** from the camera through the pointer onto
   the pitch plane (`y = 0`).

---

## 📦 Future systems (scaffolding only — not built yet)

These are intentionally **not implemented** in the MVP. They are documented here
so the data model (stats in `AnimalData.js`, collectible-animal list, etc.)
already leaves room for them.

### Pack / collection system (planned)

- **Earned in-game currency (coins)** from playing matches.
- **Packs bought with earned coins** that reveal animals.
- An **animal rarity system** (common → legendary) layered onto `AnimalData`.
- **Pack-only exclusive variants** (alternate stat lines / cosmetics).
- ❗ **No real-money random packs in the MVP** — coins are earned through play
  only.

`AnimalData.js` already centralises every animal and exposes `COLLECTIBLE_ANIMALS`,
so adding rarity tiers and a roster/inventory is additive, not a refactor.

### Other planned gameplay

- Crocodile's **Fear Zone** ability (currently a strong basic midfielder).
- Goalkeeper abilities, stamina/fatigue (the `stamina` stat already exists),
  player auto-switching, and online/local multiplayer.

---

## ⚠️ Known limitations (MVP)

- **AI is intentionally simple**: one chaser + supporters per team, basic
  shooting/clearing, vertical goalkeepers. It's built for fun, not for being
  unbeatable.
- **No persistence**: no saving, currency, accounts or packs yet.
- **No audio**.
- **Single match type only** (2-minute 3v3 vs AI). No tournaments/seasons.
- **Desktop / mouse + keyboard only** — no touch controls yet.
- Physics is arcade-style (flat 2D collisions); `heightZ` is visual only.
- Requires a local static server because of ES modules (see *How to run*).

---

## 🛣️ What to build next (recommended order)

1. **Audio** — kick / goal / whistle SFX (instant "juice", very low effort).
2. **Smarter AI** — marking, passing lanes, better keeper positioning.
3. **Crocodile's Fear Zone** ability + goalkeeper specials.
4. **Collection meta** — coins, a roster screen, animal rarities (see above).
5. **`Renderer3D.js`** with Three.js, following the upgrade plan.
6. **Touch controls** + mobile layout.
```
