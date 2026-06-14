import { Ball } from './Ball.js';
import { Team } from './Team.js';
import { Player } from './Player.js';
import { Physics } from './Physics.js';
import { EventBus, GameEvents } from './EventBus.js';

// ---------------------------------------------------------------------------
// Game.js - the heart of BeastBall.
//
// This class owns ALL gameplay: the pitch geometry, teams, ball, match clock,
// score, the state machine (menu -> playing -> goal -> ended), input handling,
// player abilities, the simple AI and the physics step.
//
// It is deliberately renderer-agnostic. It never imports a renderer, never
// touches the canvas or the DOM. Renderers + the UI read a read-only snapshot
// via getState(). That boundary is what makes the 2D -> 3D upgrade a renderer
// swap instead of a rewrite.
//
// World coordinates (see Player.js / Ball.js for the 3D mapping):
//   x : left -> right,  y : top -> bottom,  heightZ : off-ground
// ---------------------------------------------------------------------------

// --- Tunable gameplay constants (kept together so "feel" is easy to balance) ---
const MATCH_DURATION = 120; // seconds (2 minutes)
const GOAL_CELEBRATION = 1.6; // seconds the "GOAL!" freeze lasts

const SHOT_BASE = 250; // base shot speed (world units/sec)
const SHOT_PER_POWER = 95; // extra shot speed per power stat point
const PASS_BASE = 300; // base pass speed
const PASS_PER_POWER = 26;
const KICK_REACH = 16; // extra reach beyond radii for kicking the ball

const LEAP_SHOT_MULT = 1.5; // kangaroo leap shot strength multiplier
const DASH_SPEED = 560; // bear charge speed (units/sec)
const DASH_TIME = 0.34; // bear charge duration (seconds)
const WEB_RANGE = 360; // spider web reach (units)
const WEB_PULL = 600; // speed the web yanks the ball toward the spider
const WEB_SLOW_TIME = 2.0; // how long a webbed opponent stays slowed
const WEB_HIT_RADIUS = 22; // how close the web line must pass to "hit"

const AI_SHOOT_RANGE = 340; // AI shoots when this close to the goal
const AI_THINK_REACH = 6; // AI "arrived at target" tolerance

export class Game {
  constructor(input) {
    this.input = input;

    // --- Build the pitch (all world units). Goals sit on the left & right. ---
    const W = 1000;
    const H = 640;
    const left = 70;
    const right = 930;
    const top = 70;
    const bottom = 570;
    const cx = (left + right) / 2;
    const cy = (top + bottom) / 2;
    const goalMouth = 150;

    this.pitch = {
      worldWidth: W,
      worldHeight: H,
      left,
      right,
      top,
      bottom,
      centerX: cx,
      centerY: cy,
      goalTop: cy - goalMouth / 2,
      goalBottom: cy + goalMouth / 2,
      goalDepth: 34, // how far the net pokes behind the line
      circleRadius: 78,
      penaltyBoxDepth: 130, // how far the box extends from the goal line
      penaltyBoxHeight: 300,
      goalAreaDepth: 50, // 6-yard box
      goalAreaHeight: 170,
      penaltySpotDist: 95,
    };

    this.ball = new Ball(cx, cy);

    // --- Teams & squads (3v3). Stats/abilities come from AnimalData. ---
    // Team A: blue, attacks toward the RIGHT goal (defends left).
    // Team B: orange, attacks toward the LEFT goal (defends right).
    this.teamA = new Team('A', 'Blue Beasts', '#3b82f6', +1);
    this.teamB = new Team('B', 'Red Fangs', '#f97316', -1);
    this.teams = { A: this.teamA, B: this.teamB };

    this._buildSquads();

    // Flat list for convenient iteration in physics/AI.
    this.players = [...this.teamA.players, ...this.teamB.players];

    // --- Match / UI state ---
    this.phase = 'menu'; // 'menu' | 'playing' | 'goal' | 'ended'
    this.timeLeft = MATCH_DURATION;
    this.goalTimer = 0;
    this.lastGoalTeam = null; // which team just scored (for the banner)
    this.result = null; // { winner: 'A'|'B'|'draw', a, b }

    // The human controls one Team A player at a time.
    this.controlledId = this.teamA.outfield[1]?.id ?? this.teamA.players[0].id;

    // Aim point in WORLD coords (set by main.js from the mouse each frame).
    this.aim = { x: cx + 200, y: cy };

    // Transient visual effects (web lines, kick rings, goal flash). Core owns
    // their lifetimes; the renderer just draws whatever is in this list.
    this.effects = [];

    // Semantic event bus. Core EMITS gameplay events here; renderers / audio /
    // UI subscribe via main.js. Core never knows who (if anyone) is listening.
    this.events = new EventBus();
  }

  // -------------------------------------------------------------------------
  // Squad / formation setup
  // -------------------------------------------------------------------------
  _buildSquads() {
    const { left, right, centerX: cx, centerY: cy } = this.pitch;

    // Team A (attacks right). Striker sits just left of centre to take kickoff.
    this.teamA.add(new Player({ animalType: 'goalkeeper', teamId: 'A', role: 'goalkeeper', x: left + 28, y: cy, isGoalkeeper: true }));
    this.teamA.add(new Player({ animalType: 'crocodile', teamId: 'A', role: 'midfielder', x: cx - 230, y: cy }));
    this.teamA.add(new Player({ animalType: 'kangaroo', teamId: 'A', role: 'striker', x: cx - 90, y: cy }));

    // Team B (attacks left).
    this.teamB.add(new Player({ animalType: 'goalkeeper', teamId: 'B', role: 'goalkeeper', x: right - 28, y: cy, isGoalkeeper: true }));
    this.teamB.add(new Player({ animalType: 'spider', teamId: 'B', role: 'midfielder', x: cx + 230, y: cy }));
    this.teamB.add(new Player({ animalType: 'bear', teamId: 'B', role: 'striker', x: cx + 110, y: cy }));
  }

  // -------------------------------------------------------------------------
  // Match flow
  // -------------------------------------------------------------------------
  startMatch() {
    this._kickoff(true);
  }

  restart() {
    this._kickoff(true);
  }

  _kickoff(fullReset) {
    if (fullReset) {
      this.teamA.score = 0;
      this.teamB.score = 0;
      this.timeLeft = MATCH_DURATION;
      this.result = null;
      // Abilities start a fresh match ready; mid-match (post-goal) cooldowns
      // are intentionally preserved (see Player.resetTo).
      for (const p of this.players) p.resetCooldown();
    }
    this.resetPositions();
    this.controlledId = this.teamA.outfield[1]?.id ?? this.teamA.players[0].id;
    this.effects.length = 0;
    this.lastGoalTeam = null;
    this.phase = 'playing';
    this.events.emit(GameEvents.MATCH_START, {});
    // Swallow the click/keypress that triggered start so it isn't read as a shot.
    this.input.endFrame();
  }

  resetPositions() {
    for (const p of this.players) p.resetTo(p.homeX, p.homeY);
    this.ball.reset(this.pitch.centerX, this.pitch.centerY);
  }

  _scoreGoal(scoringTeamId) {
    this.teams[scoringTeamId].score += 1;
    this.lastGoalTeam = scoringTeamId;
    this.phase = 'goal';
    this.goalTimer = GOAL_CELEBRATION;
    this._addEffect({ type: 'flash', life: 0.5, max: 0.5 });
    this.events.emit(GameEvents.GOAL, { teamId: scoringTeamId, x: this.ball.x, y: this.ball.y });
  }

  _endMatch() {
    const a = this.teamA.score;
    const b = this.teamB.score;
    let winner = 'draw';
    if (a > b) winner = 'A';
    else if (b > a) winner = 'B';
    this.result = { winner, a, b };
    this.phase = 'ended';
    this.events.emit(GameEvents.MATCH_END, { result: this.result });
  }

  // -------------------------------------------------------------------------
  // Main update - called once per frame by main.js with delta time + world aim
  // -------------------------------------------------------------------------
  update(dt, aim) {
    if (aim) this.aim = aim;

    // Effects + ability cooldowns tick in every phase so they look alive.
    this._updateEffects(dt);

    switch (this.phase) {
      case 'playing':
        this._updatePlaying(dt);
        break;
      case 'goal':
        this.goalTimer -= dt;
        if (this.goalTimer <= 0) {
          this.resetPositions();
          this.phase = 'playing';
        }
        break;
      case 'ended':
        if (this.input.pressed('r')) this.restart();
        break;
      // 'menu' waits for the Start button (handled via UI callback).
    }
  }

  _updatePlaying(dt) {
    // 1. Decide velocities + handle one-shot actions.
    this._updateControlled(dt);
    this._updateAI(dt);

    // 2. Tick timers (cooldowns, dash, slow, leap hop) for everyone.
    for (const p of this.players) p.updateTimers(dt);

    // 3. Integrate movement and keep players on the pitch.
    for (const p of this.players) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      Physics.clampToField(p, this.pitch);
    }

    // 4. Bear-charge knockbacks, then gentle player separation.
    for (const p of this.players) {
      if (p.dashTimer > 0) this._applyDashImpacts(p);
    }
    Physics.separatePlayers(this.players);
    for (const p of this.players) Physics.clampToField(p, this.pitch);

    // 5. Ball: contact with every player, then friction + walls.
    for (const p of this.players) Physics.resolvePlayerBall(p, this.ball);
    Physics.updateBall(this.ball, this.pitch, dt);

    // 6. Goals.
    const goal = Physics.checkGoal(this.ball, this.pitch);
    if (goal === 'left') this._scoreGoal('B'); // right team scores in left net
    else if (goal === 'right') this._scoreGoal('A');

    // 7. Match clock.
    this.timeLeft -= dt;
    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      this._endMatch();
    }
  }

  // -------------------------------------------------------------------------
  // Human-controlled player
  // -------------------------------------------------------------------------
  getControlledPlayer() {
    return this.players.find((p) => p.id === this.controlledId) || null;
  }

  _updateControlled(dt) {
    const p = this.getControlledPlayer();
    if (!p) return;

    // Switch player (Q) - cycle through Team A.
    if (this.input.pressed('q')) {
      this._switchControlled();
      return; // next frame the new player responds
    }

    // While dashing (bear charge), motion is locked to the dash velocity.
    if (p.dashTimer > 0) {
      p.vx = p.dashVx;
      p.vy = p.dashVy;
    } else {
      // WASD movement.
      let dx = 0;
      let dy = 0;
      if (this.input.isDown('w')) dy -= 1;
      if (this.input.isDown('s')) dy += 1;
      if (this.input.isDown('a')) dx -= 1;
      if (this.input.isDown('d')) dx += 1;
      const len = Math.hypot(dx, dy);
      if (len > 0) {
        p.vx = (dx / len) * p.moveSpeed;
        p.vy = (dy / len) * p.moveSpeed;
      } else {
        p.vx = 0;
        p.vy = 0;
      }
    }

    // Face the aim cursor so the shooting arrow always points at the mouse.
    p.facing = Math.atan2(this.aim.y - p.y, this.aim.x - p.x);

    // Actions (one-shot, only when within reach of the ball where relevant).
    if (this.input.clicked('left')) this._shoot(p);
    if (this.input.clicked('right')) this._pass(p);
    if (this.input.pressed(' ')) this._useAbility(p);
  }

  _switchControlled() {
    const squad = this.teamA.players;
    const idx = squad.findIndex((p) => p.id === this.controlledId);
    const next = squad[(idx + 1) % squad.length];
    this.controlledId = next.id;
    this.events.emit(GameEvents.SWITCH, { playerId: next.id });
  }

  _canKick(player) {
    const d = Math.hypot(this.ball.x - player.x, this.ball.y - player.y);
    return d <= player.radius + this.ball.radius + KICK_REACH;
  }

  _shoot(player) {
    if (!this._canKick(player)) return;
    const speed = SHOT_BASE + player.power * SHOT_PER_POWER;
    this._kickBallToward(player, this.aim.x, this.aim.y, speed);
    this.events.emit(GameEvents.KICK, { kind: 'shot', x: this.ball.x, y: this.ball.y, teamId: player.teamId });
  }

  _pass(player) {
    if (!this._canKick(player)) return;
    // Prefer a team-mate roughly in the aim direction; otherwise pass to aim.
    const target = this._bestPassTarget(player) || { x: this.aim.x, y: this.aim.y };
    const speed = PASS_BASE + player.power * PASS_PER_POWER;
    this._kickBallToward(player, target.x, target.y, speed);
    this.events.emit(GameEvents.KICK, { kind: 'pass', x: this.ball.x, y: this.ball.y, teamId: player.teamId });
  }

  _kickBallToward(player, tx, ty, speed) {
    const dx = tx - this.ball.x;
    const dy = ty - this.ball.y;
    this.ball.kick(dx, dy, speed, player.id);
    this._addEffect({ type: 'kickRing', x: this.ball.x, y: this.ball.y, life: 0.3, max: 0.3 });
  }

  _bestPassTarget(player) {
    const aimDx = this.aim.x - player.x;
    const aimDy = this.aim.y - player.y;
    const aimLen = Math.hypot(aimDx, aimDy) || 1;
    const ax = aimDx / aimLen;
    const ay = aimDy / aimLen;

    let best = null;
    let bestScore = -Infinity;
    for (const mate of this.teams[player.teamId].players) {
      if (mate.id === player.id) continue;
      const dx = mate.x - player.x;
      const dy = mate.y - player.y;
      const dist = Math.hypot(dx, dy) || 1;
      const dot = (dx / dist) * ax + (dy / dist) * ay; // alignment with aim
      if (dot < 0.25) continue; // only pass roughly where we're aiming
      const score = dot * 2 - dist / 600; // favour aligned + nearer mates
      if (score > bestScore) {
        bestScore = score;
        best = mate;
      }
    }
    return best;
  }

  // -------------------------------------------------------------------------
  // Abilities (only the three MVP specials are implemented)
  // -------------------------------------------------------------------------
  _useAbility(player) {
    if (!player.abilityReady) return;

    switch (player.abilityId) {
      case 'superLeapShot':
        this._abilityLeapShot(player);
        break;
      case 'chargeTackle':
        this._abilityChargeTackle(player);
        break;
      case 'webPass':
        this._abilityWebPass(player);
        break;
      default:
        return; // no ability - don't trigger cooldown
    }
    player.abilityTimer = player.abilityCooldown;
    this.events.emit(GameEvents.ABILITY, { abilityId: player.abilityId, teamId: player.teamId, x: player.x, y: player.y });
  }

  // Kangaroo: leap + (if near the ball) a powerful shot toward the cursor.
  _abilityLeapShot(player) {
    // Drive the hop AND its ring from the one shared duration so the ring no
    // longer disappears before the kangaroo lands.
    player.leapTimer = player.leapDuration;
    this._addEffect({ type: 'leapRing', x: player.x, y: player.y, life: player.leapDuration, max: player.leapDuration });
    if (this._canKick(player)) {
      const speed = (SHOT_BASE + player.power * SHOT_PER_POWER) * LEAP_SHOT_MULT;
      this._kickBallToward(player, this.aim.x, this.aim.y, speed);
    }
  }

  // Bear: dash toward the aim direction. Impacts are resolved in _applyDashImpacts.
  _abilityChargeTackle(player) {
    const dx = this.aim.x - player.x;
    const dy = this.aim.y - player.y;
    const len = Math.hypot(dx, dy) || 1;
    player.dashVx = (dx / len) * DASH_SPEED;
    player.dashVy = (dy / len) * DASH_SPEED;
    player.dashTimer = DASH_TIME;
    player.dashHit = false; // so the tackle sound fires at most once per charge
  }

  // While dashing the bear plows opponents aside and knocks the ball loose.
  _applyDashImpacts(dasher) {
    const len = Math.hypot(dasher.dashVx, dasher.dashVy) || 1;
    const dirX = dasher.dashVx / len;
    const dirY = dasher.dashVy / len;
    let impacted = false;

    for (const other of this.players) {
      if (other === dasher) continue;
      const dist = Math.hypot(other.x - dasher.x, other.y - dasher.y);
      const isOpponent = other.teamId !== dasher.teamId;

      if (dist < dasher.radius + other.radius + 4 && isOpponent) {
        // Shove the opponent forward along the charge and stagger them briefly.
        other.x += dirX * 16;
        other.y += dirY * 16;
        other.slowTimer = Math.max(other.slowTimer, 0.5);
        impacted = true;

        // If they were on the ball, it pops loose ahead of the bear.
        if (Math.hypot(this.ball.x - other.x, this.ball.y - other.y) < other.radius + this.ball.radius + 12) {
          this.ball.kick(dirX, dirY, 460, dasher.id);
        }
      }
    }

    // Charging straight through the ball blasts it forward.
    if (Math.hypot(this.ball.x - dasher.x, this.ball.y - dasher.y) < dasher.radius + this.ball.radius + 6) {
      this.ball.kick(dirX, dirY, 520, dasher.id);
      impacted = true;
    }

    // Fire the tackle event only on the first contact of this charge.
    if (impacted && !dasher.dashHit) {
      dasher.dashHit = true;
      this.events.emit(GameEvents.TACKLE, { x: dasher.x, y: dasher.y });
    }
  }

  // Spider: cast a web line toward the cursor. Whatever it hits first (nearest
  // along the line) gets the effect: the ball is yanked toward the spider, an
  // opponent is slowed.
  _abilityWebPass(player) {
    const dx = this.aim.x - player.x;
    const dy = this.aim.y - player.y;
    const len = Math.hypot(dx, dy) || 1;
    const ex = player.x + (dx / len) * WEB_RANGE;
    const ey = player.y + (dy / len) * WEB_RANGE;

    // Find the nearest valid target along the web (smallest t wins).
    let hitType = null;
    let hitT = Infinity;
    let slowTarget = null;

    const ballHit = Physics.pointSegmentDistance(this.ball.x, this.ball.y, player.x, player.y, ex, ey);
    if (ballHit.dist < WEB_HIT_RADIUS + this.ball.radius && ballHit.t > 0.02) {
      hitType = 'ball';
      hitT = ballHit.t;
    }

    for (const opp of this.players) {
      if (opp.teamId === player.teamId) continue;
      const h = Physics.pointSegmentDistance(opp.x, opp.y, player.x, player.y, ex, ey);
      if (h.dist < WEB_HIT_RADIUS + opp.radius && h.t > 0.02 && h.t < hitT) {
        hitType = 'opponent';
        hitT = h.t;
        slowTarget = opp;
      }
    }

    if (hitType === 'ball') {
      // Reel the ball back toward the spider (regain possession at range).
      this.ball.kick(player.x - this.ball.x, player.y - this.ball.y, WEB_PULL, player.id);
    } else if (hitType === 'opponent' && slowTarget) {
      slowTarget.slowTimer = Math.max(slowTarget.slowTimer, WEB_SLOW_TIME);
    }

    this._addEffect({ type: 'web', x1: player.x, y1: player.y, x2: ex, y2: ey, hit: hitType, life: 0.35, max: 0.35 });
  }

  // -------------------------------------------------------------------------
  // AI - intentionally simple, just enough to make the match fun.
  // -------------------------------------------------------------------------
  _updateAI(dt) {
    for (const p of this.players) {
      if (p.id === this.controlledId) continue; // human drives this one
      if (p.dashTimer > 0) {
        p.vx = p.dashVx;
        p.vy = p.dashVy;
        continue;
      }
      if (p.isGoalkeeper) this._goalkeeperAI(p);
      else this._outfieldAI(p);
    }
  }

  // The single closest outfield player on a team is its "chaser".
  _teamChaser(team) {
    let best = null;
    let bestD = Infinity;
    for (const p of team.outfield) {
      const d = Math.hypot(this.ball.x - p.x, this.ball.y - p.y);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  }

  _outfieldAI(p) {
    const team = this.teams[p.teamId];
    const chaser = this._teamChaser(team);
    const goalX = team.attackingDir > 0 ? this.pitch.right : this.pitch.left;
    const goalY = this.pitch.centerY;

    if (chaser && chaser.id === p.id) {
      // CHASER: approach the ball from the goal-side so contact pushes it forward.
      const approachX = this.ball.x - team.attackingDir * (p.radius + this.ball.radius);
      this._moveToward(p, approachX, this.ball.y);

      // On the ball? Shoot if in range, otherwise just keep driving it forward.
      if (this._canKick(p)) {
        const distToGoal = Math.hypot(goalX - this.ball.x, goalY - this.ball.y);
        const towardOwnGoal =
          (team.attackingDir > 0 && this.ball.vx < -20) ||
          (team.attackingDir < 0 && this.ball.vx > 20);
        if (distToGoal < AI_SHOOT_RANGE || towardOwnGoal) {
          // Aim at the goal, nudging toward a corner of the mouth.
          const aimY = goalY + (this.ball.y > goalY ? 40 : -40);
          const speed = SHOT_BASE + p.power * SHOT_PER_POWER;
          this.ball.kick(goalX - this.ball.x, aimY - this.ball.y, speed, p.id);
          this._addEffect({ type: 'kickRing', x: this.ball.x, y: this.ball.y, life: 0.3, max: 0.3 });
          this.events.emit(GameEvents.KICK, { kind: 'shot', x: this.ball.x, y: this.ball.y, teamId: p.teamId });
        }
      }
    } else {
      // SUPPORT: hold a spot between home and the ball, biased toward attack.
      const tx = p.homeX * 0.45 + this.ball.x * 0.55 + team.attackingDir * 40;
      const ty = p.homeY * 0.4 + this.ball.y * 0.6;
      this._moveToward(p, tx, ty);
    }
  }

  _goalkeeperAI(p) {
    const team = this.teams[p.teamId];
    const lineX = team.attackingDir > 0 ? this.pitch.left + 30 : this.pitch.right - 30;
    const ballOnOurSide =
      (team.attackingDir > 0 && this.ball.x < this.pitch.centerX) ||
      (team.attackingDir < 0 && this.ball.x > this.pitch.centerX);

    // Track the ball vertically, clamped to the goal mouth.
    let targetY = Math.max(this.pitch.goalTop + 6, Math.min(this.pitch.goalBottom - 6, this.ball.y));
    let targetX = lineX;

    // Rush out a little to smother a close ball, then clear it upfield.
    const distToBall = Math.hypot(this.ball.x - p.x, this.ball.y - p.y);
    if (ballOnOurSide && distToBall < 150) {
      targetX = lineX + team.attackingDir * Math.min(60, 150 - distToBall);
      // Smother toward the ball BUT stay tied to the goal mouth (+ a little), so
      // dragging the ball wide can't lure the keeper away and leave an open net.
      targetY = Math.max(this.pitch.goalTop - 14, Math.min(this.pitch.goalBottom + 14, this.ball.y));
      if (this._canKick(p)) {
        // Clear toward the opposite half / centre.
        this.ball.kick(team.attackingDir, this.ball.y > this.pitch.centerY ? -0.4 : 0.4, 560, p.id);
        this._addEffect({ type: 'kickRing', x: this.ball.x, y: this.ball.y, life: 0.3, max: 0.3 });
        this.events.emit(GameEvents.SAVE, { x: this.ball.x, y: this.ball.y });
      }
    }
    this._moveToward(p, targetX, targetY);
  }

  /** Set a player's velocity to head toward (tx, ty); stop when close. */
  _moveToward(p, tx, ty) {
    const dx = tx - p.x;
    const dy = ty - p.y;
    const dist = Math.hypot(dx, dy);
    if (dist > AI_THINK_REACH) {
      p.vx = (dx / dist) * p.moveSpeed;
      p.vy = (dy / dist) * p.moveSpeed;
      p.facing = Math.atan2(dy, dx);
    } else {
      p.vx = 0;
      p.vy = 0;
    }
  }

  // -------------------------------------------------------------------------
  // Effects (transient visuals owned by core, drawn by the renderer)
  // -------------------------------------------------------------------------
  _addEffect(effect) {
    this.effects.push(effect);
  }

  _updateEffects(dt) {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      this.effects[i].life -= dt;
      if (this.effects[i].life <= 0) this.effects.splice(i, 1);
    }
  }

  // -------------------------------------------------------------------------
  // Read-only snapshot for renderers + UI. References live objects (no per-frame
  // deep copy needed) - consumers must treat it as read-only.
  // -------------------------------------------------------------------------
  getState() {
    return {
      phase: this.phase,
      pitch: this.pitch,
      ball: this.ball,
      players: this.players,
      teams: this.teams,
      score: { A: this.teamA.score, B: this.teamB.score },
      timeLeft: this.timeLeft,
      goalTimer: this.goalTimer,
      lastGoalTeam: this.lastGoalTeam,
      controlledId: this.controlledId,
      controlled: this.getControlledPlayer(),
      aim: this.aim,
      effects: this.effects,
      result: this.result,
    };
  }
}
