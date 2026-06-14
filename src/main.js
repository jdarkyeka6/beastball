// main.js
// ---------------------------------------------------------------------------
// Composition root + game loop. This is the ONLY file that knows about every
// part at once. It wires together:
//
//   InputManager (core)  -> raw keyboard/mouse
//   Game        (core)   -> all gameplay, renderer-agnostic
//   Renderer2D  (render) -> draws the world to the canvas  [swap for 3D later]
//   UIManager   (ui)     -> menus / HUD / end screen (DOM)
//
// The loop each frame:
//   1. ask the renderer to convert the mouse position into WORLD coordinates
//   2. update the game by delta time
//   3. render the world, update the UI
//   4. clear one-frame input
// ---------------------------------------------------------------------------

import { InputManager } from './core/InputManager.js';
import { Game } from './core/Game.js';
import { Renderer2D } from './renderers/Renderer2D.js';
// To go 3D later, swap the line below for the real Renderer3D and change the
// `new Renderer2D(...)` call - nothing in core/ needs to change.
// import { Renderer3DStub } from './renderers/Renderer3DStub.js';
import { UIManager } from './ui/UIManager.js';
import { AudioManager } from './audio/AudioManager.js';

const canvas = document.getElementById('game-canvas');

const input = new InputManager();
const game = new Game(input);
const renderer = new Renderer2D(canvas);

// Audio is just another subscriber on the game's event bus - core stays unaware
// of it. Browsers require a user gesture before sound can play, so we unlock()
// the AudioContext from the Start / Play-Again button clicks.
const audio = new AudioManager();
audio.connect(game.events);

const ui = new UIManager({
  onStart: () => {
    audio.unlock();
    game.startMatch();
  },
  onRestart: () => {
    audio.unlock();
    game.restart();
  },
  onToggleMute: () => audio.toggleMute(),
});

// Make sure the very first frame is drawn (menu in the background).
renderer.render(game.getState());
ui.update(game.getState());

let last = performance.now();

function frame(now) {
  // Delta time in seconds, clamped so a background tab / long stall can't
  // teleport entities across the pitch on the next frame.
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;

  // 1. Mouse -> world coords is a rendering concern, so the renderer does it.
  const aim = renderer.screenToWorld(input.pointerX, input.pointerY);

  // 2. Advance gameplay.
  game.update(dt, aim);

  // 3. Draw + refresh UI from the same snapshot.
  const state = game.getState();
  renderer.render(state);
  ui.update(state);

  // 4. Clear one-frame input edges now that the game has consumed them.
  input.endFrame();

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
