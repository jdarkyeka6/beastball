// tests/physics.test.mjs
// ---------------------------------------------------------------------------
// Behavioural tests for the pure simulation core. Physics.js and the Ball
// entity are fully stateless / DOM-free, so they run in plain Node with the
// built-in test runner - no jsdom, no dependencies, no build step:
//
//     node --test
//
// These lock the foundation in place: friction, goal detection, collisions and
// the geometry helper are exactly the numbers that get tuned during balancing,
// so we want them to fail loudly if behaviour changes unintentionally.
// ---------------------------------------------------------------------------

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { Physics } from '../src/core/Physics.js';
import { Ball } from '../src/core/Ball.js';

// A minimal pitch matching the proportions Game.js builds.
function makePitch() {
  return {
    worldWidth: 1000,
    worldHeight: 640,
    left: 70,
    right: 930,
    top: 70,
    bottom: 570,
    centerX: 500,
    centerY: 320,
    goalTop: 245,
    goalBottom: 395,
    goalDepth: 34,
  };
}

// Lightweight player stand-in (Physics only reads these fields).
function player(opts = {}) {
  return { x: 0, y: 0, vx: 0, vy: 0, radius: 15, control: 3, id: 'p1', ...opts };
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

describe('checkGoal', () => {
  const pitch = makePitch();

  it('detects a ball over the left line inside the mouth', () => {
    assert.equal(Physics.checkGoal({ x: pitch.left - 1, y: pitch.centerY, radius: 9 }, pitch), 'left');
  });

  it('detects a ball over the right line inside the mouth', () => {
    assert.equal(Physics.checkGoal({ x: pitch.right + 1, y: pitch.centerY, radius: 9 }, pitch), 'right');
  });

  it('returns null mid-pitch', () => {
    assert.equal(Physics.checkGoal({ x: pitch.centerX, y: pitch.centerY, radius: 9 }, pitch), null);
  });

  it('returns null when over the line but OUTSIDE the mouth (off target)', () => {
    assert.equal(Physics.checkGoal({ x: pitch.left - 1, y: pitch.top + 5, radius: 9 }, pitch), null);
    assert.equal(Physics.checkGoal({ x: pitch.right + 1, y: pitch.bottom - 5, radius: 9 }, pitch), null);
  });
});

describe('pointSegmentDistance', () => {
  it('measures perpendicular distance to the segment interior', () => {
    const r = Physics.pointSegmentDistance(5, 4, 0, 0, 10, 0);
    assert.equal(r.dist, 4);
    assert.ok(Math.abs(r.t - 0.5) < 1e-9);
    assert.ok(Math.abs(r.cx - 5) < 1e-9 && Math.abs(r.cy) < 1e-9);
  });

  it('clamps to the nearest endpoint when the projection falls off the segment', () => {
    const before = Physics.pointSegmentDistance(-3, 0, 0, 0, 10, 0); // left of A
    assert.equal(before.t, 0);
    assert.equal(before.dist, 3);

    const after = Physics.pointSegmentDistance(20, 0, 0, 0, 10, 0); // right of B
    assert.equal(after.t, 1);
    assert.equal(after.dist, 10);
  });
});

describe('updateBall (friction)', () => {
  it('decays speed frame-rate independently: one big step == two half steps', () => {
    const pitch = makePitch();
    const a = new Ball(pitch.centerX, pitch.centerY);
    a.vx = 600;
    const b = new Ball(pitch.centerX, pitch.centerY);
    b.vx = 600;

    Physics.updateBall(a, pitch, 0.5);
    Physics.updateBall(b, pitch, 0.25);
    Physics.updateBall(b, pitch, 0.25);

    // The exponential drag curve must give the same velocity for the same total
    // elapsed time regardless of step size (this is the 60Hz-vs-144Hz guarantee).
    assert.ok(Math.abs(a.vx - b.vx) < 1e-6, `vx mismatch: ${a.vx} vs ${b.vx}`);
  });

  it('snaps the ball to rest below MIN_BALL_SPEED', () => {
    const pitch = makePitch();
    const ball = new Ball(pitch.centerX, pitch.centerY);
    ball.vx = Physics.MIN_BALL_SPEED - 1;
    Physics.updateBall(ball, pitch, 1 / 60);
    assert.equal(ball.speed, 0);
  });

  it('integrates position in the direction of travel', () => {
    const pitch = makePitch();
    const ball = new Ball(pitch.centerX, pitch.centerY);
    ball.vx = 200;
    Physics.updateBall(ball, pitch, 0.1);
    assert.ok(ball.x > pitch.centerX);
  });
});

describe('bounceBallOffWalls', () => {
  it('bounces off the top touchline and reflects velocity (with energy loss)', () => {
    const pitch = makePitch();
    const ball = new Ball(pitch.centerX, pitch.top + 2, 9);
    ball.vy = -100; // heading up into the wall
    Physics.bounceBallOffWalls(ball, pitch);
    assert.equal(ball.y, pitch.top + ball.radius);
    assert.ok(ball.vy > 0, 'velocity should now point back down');
    assert.ok(ball.vy < 100, 'restitution should remove some energy');
  });

  it('does NOT bounce off the side wall inside the goal mouth (lets shots in)', () => {
    const pitch = makePitch();
    const ball = new Ball(pitch.left - 5, pitch.centerY, 9); // crossing the line, on target
    ball.vx = -200;
    Physics.bounceBallOffWalls(ball, pitch);
    assert.equal(ball.vx, -200, 'on-target shot keeps travelling into the net');
  });
});

describe('resolvePlayerBall', () => {
  it('reports no contact when the ball is out of reach', () => {
    const ball = new Ball(100, 100);
    const before = { x: ball.x, y: ball.y, vx: ball.vx, vy: ball.vy };
    const touched = Physics.resolvePlayerBall(player({ x: 0, y: 0 }), ball);
    assert.equal(touched, false);
    assert.deepEqual({ x: ball.x, y: ball.y, vx: ball.vx, vy: ball.vy }, before);
  });

  it('separates the ball to the player edge and records the toucher', () => {
    const p = player({ x: 100, y: 100, id: 'kanga' });
    const ball = new Ball(108, 100); // overlapping (dist 8 < 24)
    const touched = Physics.resolvePlayerBall(p, ball);
    assert.equal(touched, true);
    assert.ok(Math.abs(dist(p, ball) - (p.radius + ball.radius)) < 1e-6);
    assert.equal(ball.lastTouchedBy, 'kanga');
  });

  it('a (near-)stationary player barely nudges the ball - tight control', () => {
    const ball = new Ball(108, 100);
    Physics.resolvePlayerBall(player({ x: 100, y: 100, vx: 0, vy: 0 }), ball);
    assert.ok(ball.speed < 40, `expected gentle rest, got ${ball.speed}`);
  });

  it('a fast-moving player carries the ball (dribble)', () => {
    const ball = new Ball(108, 100);
    Physics.resolvePlayerBall(player({ x: 100, y: 100, vx: 300, vy: 0 }), ball);
    assert.ok(ball.speed > 200, `expected a strong dribble push, got ${ball.speed}`);
  });
});

describe('separatePlayers', () => {
  it('pushes two overlapping players apart symmetrically', () => {
    const a = player({ x: 100, y: 100 });
    const b = player({ x: 110, y: 100 });
    const midBefore = (a.x + b.x) / 2;
    Physics.separatePlayers([a, b]);
    assert.ok(dist(a, b) >= a.radius + b.radius - 1e-6);
    assert.ok(Math.abs((a.x + b.x) / 2 - midBefore) < 1e-6, 'centre of mass preserved');
  });
});

describe('clampToField', () => {
  it('keeps a player inside the touchlines by its radius', () => {
    const pitch = makePitch();
    const p = player({ x: pitch.left - 100, y: pitch.bottom + 100 });
    Physics.clampToField(p, pitch);
    assert.equal(p.x, pitch.left + p.radius);
    assert.equal(p.y, pitch.bottom - p.radius);
  });
});
