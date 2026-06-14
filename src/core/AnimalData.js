// AnimalData.js
// ---------------------------------------------------------------------------
// Central catalogue of every animal in BeastBall.
//
// All animal stats / abilities live HERE rather than being hardcoded around the
// codebase, so balancing the game or adding a new beast is a single-file change.
// This file is pure data + tiny lookup helpers - it never touches rendering or
// the DOM, which keeps it usable from both the 2D and the future 3D renderer.
//
// Stats are abstract gameplay numbers (roughly 1-5). They are converted into
// concrete world-units-per-second / impulse values inside Player.js & Game.js,
// so tuning the "feel" never means editing the data table below.
//
//   speed    - how fast the animal runs
//   power    - shot / tackle strength
//   control  - dribble tightness & passing accuracy
//   stamina  - reserved for a future fatigue system (unused in the MVP)
//
// `abilityId` links a beast to an ability implemented in Game.js. `null` means
// "no special move yet" (basic player / goalkeeper).
// ---------------------------------------------------------------------------

export const ANIMALS = {
  kangaroo: {
    id: 'kangaroo',
    displayName: 'Kangaroo',
    emoji: '🦘',
    speed: 3.4,
    power: 4.2,
    control: 3.0,
    stamina: 3.5,
    abilityId: 'superLeapShot',
    abilityName: 'Super Leap Shot',
    abilityCooldown: 8, // seconds
  },

  crocodile: {
    id: 'crocodile',
    displayName: 'Crocodile',
    emoji: '🐊',
    speed: 3.0,
    power: 4.0,
    control: 3.6,
    stamina: 4.0,
    // Crocodile is a strong basic midfielder for the MVP.
    // Its "Fear Zone" ability is planned for a later release.
    abilityId: null,
    abilityName: 'Fear Zone (coming soon)',
    abilityCooldown: 0,
  },

  bear: {
    id: 'bear',
    displayName: 'Bear',
    emoji: '🐻',
    speed: 3.1,
    power: 4.6,
    control: 2.6,
    stamina: 3.8,
    abilityId: 'chargeTackle',
    abilityName: 'Charge Tackle',
    abilityCooldown: 10,
  },

  spider: {
    id: 'spider',
    displayName: 'Spider',
    emoji: '🕷️',
    speed: 3.6,
    power: 2.8,
    control: 3.4,
    stamina: 3.4,
    abilityId: 'webPass',
    abilityName: 'Web Pass',
    abilityCooldown: 9,
  },

  // A generic "keeper" beast so goalkeepers still have stats and a sprite.
  // Goalkeepers have no special ability in the MVP.
  goalkeeper: {
    id: 'goalkeeper',
    displayName: 'Keeper',
    emoji: '🧤',
    speed: 2.9,
    power: 3.8,
    control: 3.0,
    stamina: 4.2,
    abilityId: null,
    abilityName: 'None',
    abilityCooldown: 0,
  },
};

/** Safe lookup that throws on typos instead of silently returning undefined. */
export function getAnimal(type) {
  const animal = ANIMALS[type];
  if (!animal) throw new Error(`[AnimalData] Unknown animal type: "${type}"`);
  return animal;
}

/** List of the animal ids that are actually collectible (excludes the keeper). */
export const COLLECTIBLE_ANIMALS = Object.keys(ANIMALS).filter(
  (id) => id !== 'goalkeeper'
);
