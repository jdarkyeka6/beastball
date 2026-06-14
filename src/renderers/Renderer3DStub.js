// Renderer3DStub.js
// ---------------------------------------------------------------------------
// A PLACEHOLDER for the future Three.js renderer. It deliberately does NOT pull
// in Three.js or render anything yet - it only proves the architecture: it
// exposes the exact same interface as Renderer2D, so switching to 3D later is a
// one-line change in main.js:
//
//     // import { Renderer2D } from './renderers/Renderer2D.js';
//     import { Renderer3D } from './renderers/Renderer3D.js';
//     const renderer = new Renderer3D(container);
//
// The renderer "interface" is just two methods:
//     render(gameState)        -> draw one frame from the read-only snapshot
//     screenToWorld(sx, sy)    -> map a pointer position to world coordinates
//
// Crucially, the core game (Game.js, Player.js, Ball.js, Physics.js) stays
// 100% unchanged when 3D arrives. The renderer is the only thing that knows
// about pixels / meshes / cameras.
// ---------------------------------------------------------------------------

export class Renderer3DStub {
  constructor(container) {
    this.container = container;
    console.warn(
      '[BeastBall] Renderer3DStub active - this is a placeholder. ' +
        'Future Three.js implementation goes here. Using Renderer2D is recommended for the MVP.'
    );

    // ---- Future Three.js setup will live here ----
    // this.scene = new THREE.Scene();
    // this.camera = new THREE.PerspectiveCamera(55, container.clientWidth / container.clientHeight, 0.1, 5000);
    // this.renderer = new THREE.WebGLRenderer({ antialias: true });
    // this.renderer.setSize(container.clientWidth, container.clientHeight);
    // container.appendChild(this.renderer.domElement);
    //
    // // A top-down-ish angled camera looking at the pitch centre.
    // this.camera.position.set(worldWidth / 2, 900, worldHeight / 2 + 600);
    // this.camera.lookAt(worldWidth / 2, 0, worldHeight / 2);
    //
    // // Lights, pitch plane, goal frames, a pool of player + ball meshes...
  }

  /**
   * Draw one frame. Same signature as Renderer2D.render(state).
   *
   * COORDINATE MAPPING (the whole point of the 2D MVP using flat x/y):
   *   core x        -> Three.js x   (horizontal pitch axis)
   *   core y        -> Three.js z   (the "vertical" pitch axis, on the ground)
   *   core heightZ  -> Three.js y   (height off the ground: jumps / lobs)
   *
   * So a player/ball at world (x, y, heightZ) becomes a mesh at
   * THREE.Vector3(x, heightZ, y). No gameplay code changes - only this mapping.
   */
  render(gameState) {
    // Future 3D rendering steps:
    // 1. Draw the pitch as a textured plane (PlaneGeometry) sized to
    //    pitch.worldWidth x pitch.worldHeight, with painted line markings.
    // 2. Draw the ball as a sphere at (ball.x, ball.heightZ, ball.y).
    // 3. Draw each player as a capsule (CapsuleGeometry) coloured by team at
    //    (player.x, player.heightZ, player.y); billboard the animal emoji /
    //    a label sprite above it. The Kangaroo's heightZ already animates, so
    //    a real jump arc works for free.
    // 4. Draw two goal frames as box/line meshes at the goal mouths.
    // 5. Translate state.effects (web lines, kick rings) into line segments /
    //    ring meshes or a particle system.
    // 6. this.renderer.render(this.scene, this.camera);
    //
    // LATER: replace the capsule meshes with low-poly animal models (glTF),
    // keeping this same per-frame update loop.
    void gameState;
  }

  /**
   * Map a pointer position to world coordinates. In 3D this becomes a raycast
   * from the camera through the pointer onto the pitch plane (y = 0), returning
   * the (x, z) hit, which we expose as world (x, y).
   */
  screenToWorld(/* clientX, clientY */) {
    // const ndc = toNormalizedDeviceCoords(clientX, clientY, this.renderer.domElement);
    // raycaster.setFromCamera(ndc, this.camera);
    // const hit = raycaster.intersectObject(this.pitchPlane)[0];
    // return hit ? { x: hit.point.x, y: hit.point.z } : { x: 0, y: 0 };
    return { x: 0, y: 0 };
  }
}
