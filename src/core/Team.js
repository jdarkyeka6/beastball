/**
 * Team
 * ---------------------------------------------------------------------------
 * Groups players and tracks score + attacking direction. `color` is plain data
 * the renderer happens to read - no drawing logic lives here.
 *
 * attackingDir:
 *   +1 -> this team attacks toward the RIGHT goal (defends the left goal)
 *   -1 -> this team attacks toward the LEFT  goal (defends the right goal)
 * Keeping attack direction as a number lets AI/aim code stay symmetric for both
 * teams ("kick toward attackingDir") instead of branching on team id everywhere.
 */
export class Team {
  constructor(id, name, color, attackingDir) {
    this.id = id; // 'A' | 'B'
    this.name = name;
    this.color = color;
    this.attackingDir = attackingDir; // +1 or -1
    this.players = [];
    this.score = 0;
  }

  add(player) {
    this.players.push(player);
    return player;
  }

  get outfield() {
    return this.players.filter((p) => !p.isGoalkeeper);
  }

  get goalkeeper() {
    return this.players.find((p) => p.isGoalkeeper);
  }
}
