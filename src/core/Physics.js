// Physics.js
// ---------------------------------------------------------------------------
// Pure, renderer-agnostic physics helpers. Everything works in WORLD UNITS and
// SECONDS (dt), so the simulation behaves identically regardless of frame rate
// or which renderer is attached. No DOM, no canvas, no drawing - just math.
//
// Top-down coordinate system:
//   x : left (0)  -> right (worldWidth)
//   y : top  (0)  -> bottom (worldHeight)
// (For the future 3D renderer these become x and z; heightZ becomes y.)
//
// All methods are static because this module holds no state - it just transforms
// the entities it is handed.
// ---------------------------------------------------------------------------

export class Physics {
  // Fraction of ball speed retained per second (exponential friction).
  static BALL_DRAG = 0.42;
  // Energy kept when the ball bounces off a wall (0 = dead, 1 = perfect).
  static BALL_RESTITUTION = 0.55;
  // Below this speed the ball is snapped to rest (avoids endless crawling).
  static MIN_BALL_SPEED = 5;

  /** Advance the ball one step: friction, integrate, then wall bounces. */
  static updateBall(ball, pitch, dt) {
    const drag = Math.pow(Physics.BALL_DRAG, dt); // frame-rate independent
    ball.vx *= drag;
    ball.vy *= drag;

    if (ball.speed < Physics.MIN_BALL_SPEED) {
      ball.vx = 0;
      ball.vy = 0;
    }

    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;

    Physics.bounceBallOffWalls(ball, pitch);
  }

  /** Bounce the ball off the four walls, leaving the goal mouths open. */
  static bounceBallOffWalls(ball, pitch) {
    const r = ball.radius;

    // Top / bottom touchlines.
    if (ball.y - r < pitch.top) {
      ball.y = pitch.top + r;
      ball.vy = Math.abs(ball.vy) * Physics.BALL_RESTITUTION;
    } else if (ball.y + r > pitch.bottom) {
      ball.y = pitch.bottom - r;
      ball.vy = -Math.abs(ball.vy) * Physics.BALL_RESTITUTION;
    }

    // Left / right walls bounce ONLY outside the goal mouth, so on-target shots
    // can pass the goal line (Game.checkGoal then fires).
    const inMouth = ball.y > pitch.goalTop && ball.y < pitch.goalBottom;
    if (!inMouth) {
      if (ball.x - r < pitch.left) {
        ball.x = pitch.left + r;
        ball.vx = Math.abs(ball.vx) * Physics.BALL_RESTITUTION;
      } else if (ball.x + r > pitch.right) {
        ball.x = pitch.right - r;
        ball.vx = -Math.abs(ball.vx) * Physics.BALL_RESTITUTION;
      }
    } else {
      // Inside the mouth: stop the ball at the back of the net so it doesn't fly
      // off to infinity between the goal frame firing and the reset.
      if (ball.x < pitch.left - pitch.goalDepth) {
        ball.x = pitch.left - pitch.goalDepth;
        ball.vx = 0;
        ball.vy = 0;
      } else if (ball.x > pitch.right + pitch.goalDepth) {
        ball.x = pitch.right + pitch.goalDepth;
        ball.vx = 0;
        ball.vy = 0;
      }
    }
  }

  /** Which goal line did the ball cross? Returns 'left' | 'right' | null. */
  static checkGoal(ball, pitch) {
    const inMouth = ball.y > pitch.goalTop && ball.y < pitch.goalBottom;
    if (!inMouth) return null;
    if (ball.x < pitch.left) return 'left';
    if (ball.x > pitch.right) return 'right';
    return null;
  }

  /**
   * Player <-> ball contact. If they overlap, push the ball clear of the player
   * and impart velocity: the player's own momentum (so running into the ball
   * dribbles it) blended with a control-flavoured nudge along the contact
   * normal. Returns true when contact happened.
   */
  static resolvePlayerBall(player, ball) {
    const dx = ball.x - player.x;
    const dy = ball.y - player.y;
    const dist = Math.hypot(dx, dy) || 0.0001;
    const minDist = player.radius + ball.radius;
    if (dist >= minDist) return false;

    const nx = dx / dist;
    const ny = dy / dist;

    // Separate.
    ball.x = player.x + nx * minDist;
    ball.y = player.y + ny * minDist;

    // Impart velocity. The push is dominated by the player's OWN speed, with
    // only a tiny base, so a (near-)stationary player barely nudges the ball -
    // it rests at their feet for tighter close control, while running carries
    // the ball along as a dribble.
    const playerSpeed = Math.hypot(player.vx, player.vy);
    const push = 10 + playerSpeed * 1.25 + player.control * 4;
    // Keep some of the ball's prior momentum so a fast ball isn't fully killed.
    ball.vx = ball.vx * 0.3 + nx * push;
    ball.vy = ball.vy * 0.3 + ny * push;
    ball.lastTouchedBy = player.id;
    return true;
  }

  /** Soft, symmetric separation so players don't stack on one pixel. */
  static separatePlayers(players) {
    for (let i = 0; i < players.length; i++) {
      for (let j = i + 1; j < players.length; j++) {
        const a = players[i];
        const b = players[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy) || 0.0001;
        const minDist = a.radius + b.radius;
        if (dist < minDist) {
          const overlap = (minDist - dist) / 2;
          const nx = dx / dist;
          const ny = dy / dist;
          a.x -= nx * overlap;
          a.y -= ny * overlap;
          b.x += nx * overlap;
          b.y += ny * overlap;
        }
      }
    }
  }

  /** Keep a player inside the touchlines (goalkeepers included). */
  static clampToField(p, pitch) {
    p.x = Math.max(pitch.left + p.radius, Math.min(pitch.right - p.radius, p.x));
    p.y = Math.max(pitch.top + p.radius, Math.min(pitch.bottom - p.radius, p.y));
  }

  /**
   * Distance from point P to segment AB plus the closest point and the param
   * t (0..1) along the segment. Used by the spider web ("does the line hit the
   * ball / an opponent, and which is nearer the spider?") and bear-charge maths.
   */
  static pointSegmentDistance(px, py, ax, ay, bx, by) {
    const abx = bx - ax;
    const aby = by - ay;
    const apx = px - ax;
    const apy = py - ay;
    const abLen2 = abx * abx + aby * aby || 0.0001;
    let t = (apx * abx + apy * aby) / abLen2;
    t = Math.max(0, Math.min(1, t));
    const cx = ax + abx * t;
    const cy = ay + aby * t;
    return { dist: Math.hypot(px - cx, py - cy), cx, cy, t };
  }
}
