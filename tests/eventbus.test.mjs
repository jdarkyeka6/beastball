// tests/eventbus.test.mjs
// Unit tests for the pub/sub bus that decouples core from renderers/audio/UI.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { EventBus, GameEvents } from '../src/core/EventBus.js';

describe('EventBus', () => {
  it('delivers emitted payloads to subscribers', () => {
    const bus = new EventBus();
    let got = null;
    bus.on('ping', (p) => (got = p));
    bus.emit('ping', { n: 42 });
    assert.deepEqual(got, { n: 42 });
  });

  it('calls every subscriber for an event', () => {
    const bus = new EventBus();
    let a = 0;
    let b = 0;
    bus.on('e', () => (a += 1));
    bus.on('e', () => (b += 1));
    bus.emit('e');
    assert.equal(a, 1);
    assert.equal(b, 1);
  });

  it('off() and the returned unsubscribe fn both stop delivery', () => {
    const bus = new EventBus();
    let viaOff = 0;
    let viaReturn = 0;
    const h = () => (viaOff += 1);
    bus.on('x', h);
    const unsub = bus.on('x', () => (viaReturn += 1));

    bus.emit('x');
    bus.off('x', h);
    unsub();
    bus.emit('x');

    assert.equal(viaOff, 1, 'off() stopped the first handler after one emit');
    assert.equal(viaReturn, 1, 'returned unsubscribe stopped the second handler');
  });

  it('emitting with no subscribers is a safe no-op', () => {
    const bus = new EventBus();
    assert.doesNotThrow(() => bus.emit('nobody-home', { x: 1 }));
  });

  it('isolates a throwing subscriber so others still run', () => {
    const bus = new EventBus();
    const originalError = console.error;
    console.error = () => {}; // silence the expected log for clean test output
    try {
      let reached = false;
      bus.on('boom', () => {
        throw new Error('subscriber blew up');
      });
      bus.on('boom', () => (reached = true));
      assert.doesNotThrow(() => bus.emit('boom'));
      assert.ok(reached, 'the second subscriber still ran after the first threw');
    } finally {
      console.error = originalError;
    }
  });

  it('exposes a stable set of event names', () => {
    assert.equal(GameEvents.GOAL, 'goal');
    assert.equal(GameEvents.MATCH_START, 'match:start');
    assert.equal(GameEvents.KICK, 'kick');
  });
});
