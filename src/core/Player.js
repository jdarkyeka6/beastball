import { getAnimal } from './AnimalData.js';

let nextId = 1;

// Converts an abstract speed stat (~1-5) into world-units per second.
// Tuning the overall pace of the game = change this one constant.
const SPEED_SCALE = 80;

/**
 * Player
 * ---------------------------------------------------------------------------
 * A pure gameplay entity. It stores world-space position / velocity and stats,
 * but knows NOTHING about how it is drawn. Renderers READ these fields; they
 * must never write gameplay state. That separation is what lets us drop in a
 * 3D renderer later without touching this class.
 *
 * Coordinate system (2D now, 3D-ready):
 *   x        -> horizontal pitch axis   (future Three.js  x)
 *   y        -> vertical pitch axis      (future Three.js  z)
 *   heightZ  -> height off the ground    (future Three.js  y)
 *
 * `heightZ` is unused by 2D physics (collisions stay flat) but is animated by
 * the Kangaroo's leap so the 2D renderer can fake a hop today and a real 3D
 * jump tomorrow - no data model change required.
 */
export class Player {
  constructor({ animalType, teamId, role, x, y, isGoalkeeper = false }) {
    const animal = getAnimal(animalType);

    // Identity
    this.id = `p${nextId++}`;
    this.name = animal.displayName;
    this.animalType = animalType;
    this.emoji = animal.emoji;
    this.teamId = teamId; // 'A' | 'B'
    this.role = role; // 'striker' | 'midfielder' | 'goalkeeper'
    this.isGoalkeeper = isGoalkeeper;

    // World transform
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.heightZ = 0; // off-ground height (jump visual / future 3D y)
    this.facing = teamId === 'A' ? 0 : Math.PI; // radians, for the aim arrow

    // Formation "home" spot - AI returns here and resets snap back to it.
    this.homeX = x;
    this.homeY = y;

    // Physical size (world units)
    this.radius = isGoalkeeper ? 16 : 15;

    // Raw stats (see AnimalData.js)
    this.speed = animal.speed;
    this.power = animal.power;
    this.control = animal.control;
    this.stamina = animal.stamina;

    // Ability
    this.abilityId = animal.abilityId;
    this.abilityName = animal.abilityName;
    this.abilityCooldown = animal.abilityCooldown; // max, seconds
    this.abilityTimer = 0; // remaining cooldown, seconds (0 = ready)

    // Transient state - also read by the renderer to draw effects.
    this.dashTimer = 0; // bear charge: seconds of dash remaining
    this.dashVx = 0;
    this.dashVy = 0;
    this.slowTimer = 0; // spider web slow: seconds remaining
    this.leapTimer = 0; // kangaroo leap: seconds of hop animation remaining

    // Leap shape (single source of truth from AnimalData; harmless defaults for
    // non-leaping animals since their leapTimer never starts).
    this.leapDuration = animal.leapDuration ?? 0.55;
    this.leapPeak = animal.leapPeak ?? 26;
  }

  /** Movement speed in world-units/sec, accounting for the web slow debuff. */
  get moveSpeed() {
    const base = this.speed * SPEED_SCALE;
    return this.slowTimer > 0 ? base * 0.5 : base;
  }

  get abilityReady() {
    return this.abilityId !== null && this.abilityTimer <= 0;
  }

  /** Cooldown progress 0..1 (1 = fully ready). Handy for the UI bar. */
  get cooldownProgress() {
    if (this.abilityCooldown <= 0) return 1;
    return 1 - this.abilityTimer / this.abilityCooldown;
  }

  /** Tick down all per-frame timers + animate the leap hop height. */
  updateTimers(dt) {
    if (this.abilityTimer > 0) this.abilityTimer = Math.max(0, this.abilityTimer - dt);
    if (this.dashTimer > 0) this.dashTimer = Math.max(0, this.dashTimer - dt);
    if (this.slowTimer > 0) this.slowTimer = Math.max(0, this.slowTimer - dt);

    if (this.leapTimer > 0) {
      this.leapTimer = Math.max(0, this.leapTimer - dt);
      // Parabolic hop: 0 -> peak -> 0 across the leap duration. Reads the same
      // duration/peak the ability used to start the timer, so they can't desync.
      const progress = 1 - this.leapTimer / this.leapDuration;
      this.heightZ = Math.sin(Math.max(0, Math.min(1, progress)) * Math.PI) * this.leapPeak;
    } else {
      this.heightZ = 0;
    }
  }

  /**
   * Snap back to a position and clear in-progress motion/effects. Used for BOTH
   * kickoff and post-goal resets, so it deliberately does NOT touch the ability
   * cooldown - a special you just spent shouldn't refill because a goal was
   * scored elsewhere. Fresh-match cooldown resets are handled in Game._kickoff.
   */
  resetTo(x, y) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.heightZ = 0;
    this.dashTimer = 0;
    this.slowTimer = 0;
    this.leapTimer = 0;
  }

  /** Make the ability immediately available again (used only on a fresh match). */
  resetCooldown() {
    this.abilityTimer = 0;
  }
}
