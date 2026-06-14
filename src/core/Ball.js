/**
 * Ball
 * ---------------------------------------------------------------------------
 * Just world-space position + velocity. Friction, wall bounces and goal
 * detection are all handled by Physics.js so this stays a dumb data holder.
 * The renderer only reads x / y (and heightZ later, for lofted shots in 3D).
 *
 * Coordinate notes match Player.js:
 *   x -> horizontal pitch axis (future Three.js x)
 *   y -> vertical pitch axis    (future Three.js z)
 *   heightZ -> ball height       (future Three.js y - reserved for lobs)
 */
export class Ball {
  constructor(x, y, radius = 9) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.heightZ = 0; // reserved for future lofted shots
    this.radius = radius;
    this.lastTouchedBy = null; // player id - for future assists / own-goal logic
  }

  get speed() {
    return Math.hypot(this.vx, this.vy);
  }

  /** Apply an instantaneous kick toward a unit direction at a given speed. */
  kick(dirX, dirY, speed, byPlayerId = null) {
    const len = Math.hypot(dirX, dirY) || 1;
    this.vx = (dirX / len) * speed;
    this.vy = (dirY / len) * speed;
    if (byPlayerId) this.lastTouchedBy = byPlayerId;
  }

  reset(x, y) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.heightZ = 0;
    this.lastTouchedBy = null;
  }
}
