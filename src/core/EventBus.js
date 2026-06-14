// EventBus.js
// ---------------------------------------------------------------------------
// A tiny synchronous publish/subscribe bus. It lets the core game announce
// *semantic* events ("a goal happened", "a shot was kicked") without knowing or
// caring who listens. Renderers, audio, UI, analytics or a future replay system
// can subscribe - none of them are coupled to the simulation, and the
// simulation isn't coupled to them.
//
// This is what keeps `core` honest: Game emits onto the bus; AudioManager (and
// anything else) consumes from it. No DOM, no rendering, fully unit-testable.
// ---------------------------------------------------------------------------

// Canonical event names + their payload shapes (kept here so emitters and
// listeners share one spelling and can't drift):
//   MATCH_START {}                              - kickoff / restart
//   MATCH_END   { result:{winner,a,b} }         - final whistle
//   GOAL        { teamId, x, y }                - a goal was scored
//   KICK        { kind:'shot'|'pass', x, y, teamId } - the ball was struck
//   ABILITY     { abilityId, teamId, x, y }     - a special was used
//   TACKLE      { x, y }                         - a bear charge connected
//   SAVE        { x, y }                         - a keeper cleared the ball
//   SWITCH      { playerId }                     - the human switched player
export const GameEvents = {
  MATCH_START: 'match:start',
  MATCH_END: 'match:end',
  GOAL: 'goal',
  KICK: 'kick',
  ABILITY: 'ability',
  TACKLE: 'tackle',
  SAVE: 'save',
  SWITCH: 'switch',
};

export class EventBus {
  constructor() {
    this._handlers = new Map(); // type -> Set<fn>
  }

  /** Subscribe. Returns an unsubscribe function for convenience. */
  on(type, handler) {
    let set = this._handlers.get(type);
    if (!set) {
      set = new Set();
      this._handlers.set(type, set);
    }
    set.add(handler);
    return () => this.off(type, handler);
  }

  off(type, handler) {
    this._handlers.get(type)?.delete(handler);
  }

  /**
   * Fire an event. Handlers are copied before iterating so a listener can
   * safely unsubscribe during dispatch, and a throwing listener is isolated
   * (logged, not propagated) so a buggy subscriber can never break the game
   * loop that emitted the event.
   */
  emit(type, payload) {
    const set = this._handlers.get(type);
    if (!set || set.size === 0) return;
    for (const handler of [...set]) {
      try {
        handler(payload);
      } catch (err) {
        console.error(`[EventBus] handler for "${type}" threw:`, err);
      }
    }
  }
}
