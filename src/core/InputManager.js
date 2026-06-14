// InputManager.js
// ---------------------------------------------------------------------------
// Collects raw keyboard + mouse state and exposes a tiny, polling-friendly API.
// It lives in core because it is purely LOGICAL input (no rendering).
//
// IMPORTANT: pointer coordinates are stored in *screen* pixels. Converting them
// to world coordinates depends on how the scene is drawn, so that is a renderer
// concern - the active renderer exposes `screenToWorld()` and main.js does the
// mapping each frame. This keeps the same InputManager usable by a future 3D
// renderer (which would ray-cast instead).
//
// Edge events ("just pressed", "just clicked") are valid for exactly one frame.
// The game reads them during update(), then main.js calls endFrame() to clear.
// ---------------------------------------------------------------------------

export class InputManager {
  constructor() {
    this.keys = new Set(); // currently held key names
    this.justPressedKeys = new Set(); // pressed during the current frame

    // Start the pointer near the screen centre so aim is sane before first move.
    this.pointerX = window.innerWidth / 2;
    this.pointerY = window.innerHeight / 2;

    this.mouse = { left: false, right: false }; // held
    this.justClicked = { left: false, right: false }; // pressed this frame

    this._bindEvents();
  }

  _bindEvents() {
    window.addEventListener('keydown', (e) => {
      const k = this._normKey(e);
      if (!this.keys.has(k)) this.justPressedKeys.add(k);
      this.keys.add(k);
      // Stop Space / arrows from scrolling the page mid-match.
      if (k === ' ' || k.startsWith('arrow')) e.preventDefault();
    });

    window.addEventListener('keyup', (e) => {
      this.keys.delete(this._normKey(e));
    });

    window.addEventListener('mousemove', (e) => {
      this.pointerX = e.clientX;
      this.pointerY = e.clientY;
    });

    window.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this.mouse.left = true;
        this.justClicked.left = true;
      } else if (e.button === 2) {
        this.mouse.right = true;
        this.justClicked.right = true;
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.left = false;
      else if (e.button === 2) this.mouse.right = false;
    });

    // Right-click is "pass", so suppress the browser context menu.
    window.addEventListener('contextmenu', (e) => e.preventDefault());

    // If the tab loses focus, drop held keys so the player doesn't run forever.
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouse.left = false;
      this.mouse.right = false;
    });
  }

  _normKey(e) {
    // Letters -> 'a'..'z', Space -> ' ', named keys -> e.g. 'arrowup', 'shift'.
    return e.key.toLowerCase();
  }

  isDown(key) {
    return this.keys.has(key);
  }

  pressed(key) {
    return this.justPressedKeys.has(key);
  }

  clicked(button) {
    return this.justClicked[button];
  }

  /** Clear one-frame edge state. Call AFTER the game has read input this frame. */
  endFrame() {
    this.justPressedKeys.clear();
    this.justClicked.left = false;
    this.justClicked.right = false;
  }
}
