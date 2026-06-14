// tests/game-events.test.mjs
// Verifies the core game actually announces the key gameplay moments on its bus.
// Game is DOM-free (it only needs an input object), so this runs in plain Node.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { Game } from '../src/core/Game.js';
import { GameEvents } from '../src/core/EventBus.js';

// Minimal scripted input stub (Game only polls these methods).
function fakeInput() {
  return {
    _pressed: new Set(),
    _clicked: { left: false, right: false },
    isDown: () => false,
    pressed(k) {
      return this._pressed.has(k);
    },
    clicked(b) {
      return this._clicked[b];
    },
    endFrame() {
      this._pressed.clear();
      this._clicked.left = false;
      this._clicked.right = false;
    },
  };
}

const record = (game) => {
  const seen = [];
  for (const type of Object.values(GameEvents)) {
    game.events.on(type, (payload) => seen.push({ type, payload }));
  }
  return seen;
};

describe('Game emits gameplay events', () => {
  it('emits MATCH_START on kickoff', () => {
    const game = new Game(fakeInput());
    const seen = record(game);
    game.startMatch();
    assert.ok(seen.some((e) => e.type === GameEvents.MATCH_START));
  });

  it('emits GOAL with the scoring team when the ball crosses the line', () => {
    const game = new Game(fakeInput());
    const seen = record(game);
    game.startMatch();

    // Send the ball over the right line (Team A scores) and step the sim.
    game.ball.reset(game.pitch.right - 15, game.pitch.centerY);
    game.ball.vx = 900;
    game.teamB.goalkeeper.x = game.pitch.centerX; // keep the keeper out of it
    for (let i = 0; i < 30 && game.phase === 'playing'; i++) game.update(1 / 60, { x: game.pitch.right, y: game.pitch.centerY });

    const goal = seen.find((e) => e.type === GameEvents.GOAL);
    assert.ok(goal, 'a GOAL event was emitted');
    assert.equal(goal.payload.teamId, 'A');
  });

  it('emits ABILITY (and starts the cooldown) when a special is used', () => {
    const game = new Game(fakeInput());
    const seen = record(game);
    game.startMatch();

    const kangaroo = game.players.find((p) => p.animalType === 'kangaroo');
    game.controlledId = kangaroo.id;
    kangaroo.abilityTimer = 0;
    game.ball.reset(kangaroo.x + 5, kangaroo.y);
    game.input._pressed.add(' ');
    game.update(1 / 60, { x: kangaroo.x + 200, y: kangaroo.y });

    const ability = seen.find((e) => e.type === GameEvents.ABILITY);
    assert.ok(ability, 'an ABILITY event was emitted');
    assert.equal(ability.payload.abilityId, 'superLeapShot');
    assert.ok(kangaroo.abilityTimer > 0, 'the ability went on cooldown');
  });

  it('emits MATCH_END with a result when the clock runs out', () => {
    const game = new Game(fakeInput());
    const seen = record(game);
    game.startMatch();
    game.timeLeft = 0.1;
    for (let i = 0; i < 20 && game.phase !== 'ended'; i++) game.update(1 / 60, { x: game.pitch.centerX, y: game.pitch.centerY });

    const end = seen.find((e) => e.type === GameEvents.MATCH_END);
    assert.ok(end, 'a MATCH_END event was emitted');
    assert.ok(['A', 'B', 'draw'].includes(end.payload.result.winner));
  });
});
