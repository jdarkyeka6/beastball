// UIManager.js
// ---------------------------------------------------------------------------
// Owns all the DOM/HTML UI that sits on top of the canvas: the start menu, the
// in-match HUD (score, timer, selected-player card, controls reminder), the
// "GOAL!" banner and the end-of-match screen.
//
// Keeping the UI in the DOM (rather than painted on the canvas) keeps it crisp,
// accessible and trivial to restyle - and keeps the renderer focused purely on
// the pitch. The UIManager only READS the game-state snapshot; gameplay actions
// (Start / Restart) are surfaced as callbacks so main.js wires them to the Game.
// ---------------------------------------------------------------------------

export class UIManager {
  constructor({ onStart, onRestart }) {
    this.onStart = onStart;
    this.onRestart = onRestart;

    // Grab the elements declared in index.html.
    this.el = {
      menu: document.getElementById('menu'),
      hud: document.getElementById('hud'),
      goalBanner: document.getElementById('goal-banner'),
      end: document.getElementById('end'),

      scoreA: document.getElementById('score-a'),
      scoreB: document.getElementById('score-b'),
      timer: document.getElementById('timer'),

      cardEmoji: document.getElementById('card-emoji'),
      cardName: document.getElementById('card-name'),
      cardAbility: document.getElementById('card-ability'),
      cardCooldownFill: document.getElementById('card-cooldown-fill'),
      cardCooldownText: document.getElementById('card-cooldown-text'),
      playerCard: document.getElementById('player-card'),

      endResult: document.getElementById('end-result'),
      endScore: document.getElementById('end-score'),

      startBtn: document.getElementById('start-btn'),
      restartBtn: document.getElementById('restart-btn'),
    };

    this.el.startBtn.addEventListener('click', () => this.onStart());
    this.el.restartBtn.addEventListener('click', () => this.onRestart());

    this._phase = null; // track last phase to avoid redundant DOM toggling
  }

  /** Called every frame with the read-only game state. */
  update(state) {
    if (state.phase !== this._phase) {
      this._applyPhase(state.phase);
      this._phase = state.phase;
    }

    if (state.phase === 'playing' || state.phase === 'goal') {
      this._updateHUD(state);
    }
    if (state.phase === 'ended') {
      this._updateEnd(state);
    }
  }

  _applyPhase(phase) {
    this._toggle(this.el.menu, phase === 'menu');
    this._toggle(this.el.hud, phase === 'playing' || phase === 'goal');
    this._toggle(this.el.goalBanner, phase === 'goal');
    this._toggle(this.el.end, phase === 'ended');
  }

  _updateHUD(state) {
    this.el.scoreA.textContent = state.score.A;
    this.el.scoreB.textContent = state.score.B;
    this.el.timer.textContent = this._formatTime(state.timeLeft);

    const p = state.controlled;
    if (p) {
      const teamColor = state.teams[p.teamId].color;
      this.el.cardEmoji.textContent = p.emoji;
      this.el.cardName.textContent = `${p.name} · ${this._cap(p.role)}`;
      this.el.playerCard.style.borderColor = teamColor;

      if (!p.abilityId) {
        this.el.cardAbility.textContent = p.abilityName;
        this.el.cardCooldownFill.style.width = '0%';
        this.el.cardCooldownText.textContent = '—';
      } else {
        this.el.cardAbility.textContent = p.abilityName;
        const pct = Math.round(p.cooldownProgress * 100);
        this.el.cardCooldownFill.style.width = `${pct}%`;
        this.el.cardCooldownText.textContent = p.abilityReady
          ? 'READY · Space'
          : `${Math.ceil(p.abilityTimer)}s`;
        this.el.cardCooldownFill.style.background = p.abilityReady ? '#36d399' : '#ffe14d';
      }
    }
  }

  _updateEnd(state) {
    const r = state.result;
    if (!r) return;
    let title = 'Draw!';
    if (r.winner === 'A') title = `${state.teams.A.name} Win!`;
    else if (r.winner === 'B') title = `${state.teams.B.name} Win!`;
    this.el.endResult.textContent = title;
    this.el.endScore.textContent = `${r.a} – ${r.b}`;
  }

  _toggle(node, show) {
    if (!node) return;
    node.classList.toggle('hidden', !show);
  }

  _formatTime(seconds) {
    const s = Math.max(0, Math.ceil(seconds));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${r.toString().padStart(2, '0')}`;
  }

  _cap(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}
