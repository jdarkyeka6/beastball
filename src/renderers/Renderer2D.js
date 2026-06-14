// Renderer2D.js
// ---------------------------------------------------------------------------
// The active renderer for the MVP. It implements the renderer "interface":
//
//     render(gameState)        -> draw a frame
//     screenToWorld(sx, sy)    -> map a screen/pixel point to world coords
//
// Renderer3DStub.js exposes the SAME two methods, so swapping renderers in
// main.js is a one-line change. This file READS the game state and never mutates
// gameplay - all the numbers it draws come straight from core entities.
//
// It draws in WORLD units (0..worldWidth, 0..worldHeight). A device-pixel-ratio
// aware transform keeps everything crisp while letting the canvas scale to fit
// any screen via CSS.
// ---------------------------------------------------------------------------

export class Renderer2D {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.scale = 1; // world units -> CSS pixels
    this._lastW = 0;
    this._lastH = 0;
    this.worldWidth = 1000; // overwritten from state on first render
    this.worldHeight = 640;

    window.addEventListener('resize', () => this._resize());
  }

  /** Size the backing store for the current CSS box + device pixel ratio. */
  _resize() {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const dpr = window.devicePixelRatio || 1;

    this.canvas.width = Math.round(rect.width * dpr);
    this.canvas.height = Math.round(rect.height * dpr);

    // CSS keeps the canvas at the world aspect ratio, so either axis works.
    this.scale = rect.width / this.worldWidth;
    this.ctx.setTransform(this.scale * dpr, 0, 0, this.scale * dpr, 0, 0);
    this._lastW = rect.width;
    this._lastH = rect.height;
  }

  /** Map a pointer position (client/CSS pixels) to world coordinates. */
  screenToWorld(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width === 0) return { x: 0, y: 0 };
    return {
      x: ((clientX - rect.left) / rect.width) * this.worldWidth,
      y: ((clientY - rect.top) / rect.height) * this.worldHeight,
    };
  }

  // -------------------------------------------------------------------------
  render(state) {
    const { pitch } = state;
    this.worldWidth = pitch.worldWidth;
    this.worldHeight = pitch.worldHeight;

    // Re-fit if the displayed size changed (or on the very first frame).
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width !== this._lastW || rect.height !== this._lastH) this._resize();

    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.worldWidth, this.worldHeight);

    this._drawPitch(ctx, pitch);
    this._drawEffectsUnder(ctx, state.effects);
    this._drawBall(ctx, state.ball);
    this._drawAim(ctx, state);
    this._drawPlayers(ctx, state);
    this._drawEffectsOver(ctx, state.effects);
    this._drawGoalFlash(ctx, state.effects);
  }

  // -------------------------------------------------------------------------
  // Pitch
  // -------------------------------------------------------------------------
  _drawPitch(ctx, p) {
    const W = p.worldWidth;
    const H = p.worldHeight;

    // Stadium surround.
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#0c2417');
    bg.addColorStop(1, '#07160e');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Grass (extends a touch beyond the boundary lines).
    const gx = p.left - 26;
    const gy = p.top - 26;
    const gw = p.right - p.left + 52;
    const gh = p.bottom - p.top + 52;

    ctx.save();
    this._roundRect(ctx, gx, gy, gw, gh, 16);
    ctx.clip();
    ctx.fillStyle = '#2f7d3a';
    ctx.fillRect(gx, gy, gw, gh);

    // Mowing stripes (vertical bands).
    const stripes = 12;
    const sw = gw / stripes;
    for (let i = 0; i < stripes; i++) {
      ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
      ctx.fillRect(gx + i * sw, gy, sw, gh);
    }
    ctx.restore();

    // White markings.
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';

    // Boundary.
    this._strokeRect(ctx, p.left, p.top, p.right - p.left, p.bottom - p.top);

    // Halfway line.
    ctx.beginPath();
    ctx.moveTo(p.centerX, p.top);
    ctx.lineTo(p.centerX, p.bottom);
    ctx.stroke();

    // Centre circle + spot.
    ctx.beginPath();
    ctx.arc(p.centerX, p.centerY, p.circleRadius, 0, Math.PI * 2);
    ctx.stroke();
    this._dot(ctx, p.centerX, p.centerY, 4);

    // Penalty + goal areas + penalty spots (both ends).
    this._drawBoxes(ctx, p, 'left');
    this._drawBoxes(ctx, p, 'right');

    // Goals.
    this._drawGoal(ctx, p, 'left');
    this._drawGoal(ctx, p, 'right');
  }

  _drawBoxes(ctx, p, side) {
    const dir = side === 'left' ? 1 : -1;
    const lineX = side === 'left' ? p.left : p.right;

    // Penalty box (drawn from the goal line inward).
    const pbX = side === 'left' ? lineX : lineX - p.penaltyBoxDepth;
    this._strokeRect(ctx, pbX, p.centerY - p.penaltyBoxHeight / 2, p.penaltyBoxDepth, p.penaltyBoxHeight);

    // Goal area (6-yard).
    const gaX = side === 'left' ? lineX : lineX - p.goalAreaDepth;
    this._strokeRect(ctx, gaX, p.centerY - p.goalAreaHeight / 2, p.goalAreaDepth, p.goalAreaHeight);

    // Penalty spot.
    this._dot(ctx, lineX + dir * p.penaltySpotDist, p.centerY, 3);

    // Penalty arc (the bit outside the box).
    const spotX = lineX + dir * p.penaltySpotDist;
    const boxEdgeX = lineX + dir * p.penaltyBoxDepth;
    ctx.beginPath();
    const a = Math.acos((boxEdgeX - spotX) / 72 * dir) || 0.9;
    ctx.arc(spotX, p.centerY, 72, dir > 0 ? -a : Math.PI - a, dir > 0 ? a : Math.PI + a);
    ctx.stroke();
  }

  _drawGoal(ctx, p, side) {
    const dir = side === 'left' ? -1 : 1; // net pokes outward
    const lineX = side === 'left' ? p.left : p.right;
    const depth = p.goalDepth;
    const x = lineX;
    const yTop = p.goalTop;
    const yBot = p.goalBottom;

    // Net background.
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fillRect(side === 'left' ? x - depth : x, yTop, depth, yBot - yTop);

    // Net mesh.
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    const nx0 = side === 'left' ? x - depth : x;
    for (let gx = 0; gx <= depth; gx += 8) {
      ctx.beginPath();
      ctx.moveTo(nx0 + gx, yTop);
      ctx.lineTo(nx0 + gx, yBot);
      ctx.stroke();
    }
    for (let gy = yTop; gy <= yBot; gy += 8) {
      ctx.beginPath();
      ctx.moveTo(nx0, gy);
      ctx.lineTo(nx0 + depth, gy);
      ctx.stroke();
    }

    // Posts + crossbar-edge (the frame on the goal line).
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x, yTop);
    ctx.lineTo(x + dir * depth, yTop);
    ctx.lineTo(x + dir * depth, yBot);
    ctx.lineTo(x, yBot);
    ctx.stroke();
    // Goal-line posts.
    this._dot(ctx, x, yTop, 4, '#ffffff');
    this._dot(ctx, x, yBot, 4, '#ffffff');
  }

  // -------------------------------------------------------------------------
  // Ball
  // -------------------------------------------------------------------------
  _drawBall(ctx, ball) {
    // Shadow.
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(ball.x, ball.y + ball.radius * 0.6, ball.radius * 0.9, ball.radius * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();

    // Body.
    const g = ctx.createRadialGradient(ball.x - 3, ball.y - 3, 1, ball.x, ball.y, ball.radius);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(1, '#d7d7d7');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // A couple of pentagon dots so it reads as a football.
    ctx.fillStyle = 'rgba(20,20,20,0.85)';
    this._dot(ctx, ball.x, ball.y, ball.radius * 0.32);
    this._dot(ctx, ball.x + ball.radius * 0.55, ball.y - ball.radius * 0.4, ball.radius * 0.16);
    this._dot(ctx, ball.x - ball.radius * 0.55, ball.y + ball.radius * 0.35, ball.radius * 0.16);
  }

  // -------------------------------------------------------------------------
  // Aim helper for the controlled player
  // -------------------------------------------------------------------------
  _drawAim(ctx, state) {
    if (state.phase !== 'playing') return;
    const p = state.controlled;
    if (!p) return;

    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 8]);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(state.aim.x, state.aim.y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Reticle at the aim point.
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.beginPath();
    ctx.arc(state.aim.x, state.aim.y, 9, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // -------------------------------------------------------------------------
  // Players
  // -------------------------------------------------------------------------
  _drawPlayers(ctx, state) {
    for (const p of state.players) {
      const isControlled = p.id === state.controlledId;
      const teamColor = state.teams[p.teamId].color;
      const bodyY = p.y - p.heightZ; // lift the sprite for jumps

      // Shadow (stays on the ground; shrinks as the player rises).
      const shadowScale = 1 - Math.min(0.4, p.heightZ / 80);
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + p.radius * 0.55, p.radius * 0.95 * shadowScale, p.radius * 0.45 * shadowScale, 0, 0, Math.PI * 2);
      ctx.fill();

      // Selection ring for the controlled player.
      if (isControlled) {
        ctx.strokeStyle = '#ffe14d';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(p.x, bodyY, p.radius + 6, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Slow (webbed) indicator.
      if (p.slowTimer > 0) {
        ctx.strokeStyle = 'rgba(180,210,255,0.9)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, bodyY, p.radius + 3, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Body disc.
      const g = ctx.createRadialGradient(p.x - 4, bodyY - 4, 2, p.x, bodyY, p.radius);
      g.addColorStop(0, this._lighten(teamColor, 0.25));
      g.addColorStop(1, teamColor);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, bodyY, p.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Facing tick (where the player is aiming / heading).
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(p.x, bodyY);
      ctx.lineTo(p.x + Math.cos(p.facing) * (p.radius + 7), bodyY + Math.sin(p.facing) * (p.radius + 7));
      ctx.stroke();

      // Animal emoji sitting on the disc.
      ctx.font = `${Math.round(p.radius * 1.7)}px system-ui, "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(p.emoji, p.x, bodyY - p.radius * 0.15);
    }
  }

  // -------------------------------------------------------------------------
  // Effects
  // -------------------------------------------------------------------------
  _drawEffectsUnder(ctx, effects) {
    for (const e of effects) {
      const a = Math.max(0, e.life / e.max);
      if (e.type === 'kickRing' || e.type === 'leapRing') {
        const grow = e.type === 'leapRing' ? 46 : 28;
        const r = (1 - a) * grow + 6;
        ctx.strokeStyle = e.type === 'leapRing' ? `rgba(255,225,77,${a})` : `rgba(255,255,255,${a})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(e.x, e.y, r, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  _drawEffectsOver(ctx, effects) {
    for (const e of effects) {
      if (e.type !== 'web') continue;
      const a = Math.max(0, e.life / e.max);
      ctx.save();
      ctx.strokeStyle = `rgba(245,250,255,${0.85 * a})`;
      ctx.lineWidth = 3;
      ctx.shadowColor = 'rgba(180,210,255,0.9)';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(e.x1, e.y1);
      ctx.lineTo(e.x2, e.y2);
      ctx.stroke();

      // Little cross-threads to read as a web strand.
      const dx = e.x2 - e.x1;
      const dy = e.y2 - e.y1;
      const len = Math.hypot(dx, dy) || 1;
      const px = -dy / len;
      const py = dx / len;
      ctx.lineWidth = 1.5;
      for (let t = 0.2; t < 1; t += 0.2) {
        const cx = e.x1 + dx * t;
        const cy = e.y1 + dy * t;
        ctx.beginPath();
        ctx.moveTo(cx - px * 6, cy - py * 6);
        ctx.lineTo(cx + px * 6, cy + py * 6);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  _drawGoalFlash(ctx, effects) {
    const flash = effects.find((e) => e.type === 'flash');
    if (!flash) return;
    const a = Math.max(0, flash.life / flash.max) * 0.5;
    ctx.fillStyle = `rgba(255,255,255,${a})`;
    ctx.fillRect(0, 0, this.worldWidth, this.worldHeight);
  }

  // -------------------------------------------------------------------------
  // Small drawing helpers
  // -------------------------------------------------------------------------
  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  _strokeRect(ctx, x, y, w, h) {
    ctx.strokeRect(x, y, w, h);
  }

  _dot(ctx, x, y, r, color = 'rgba(255,255,255,0.85)') {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  _lighten(hex, amt) {
    const c = hex.replace('#', '');
    const n = parseInt(c.length === 3 ? c.replace(/(.)/g, '$1$1') : c, 16);
    const r = Math.min(255, ((n >> 16) & 255) + 255 * amt);
    const g = Math.min(255, ((n >> 8) & 255) + 255 * amt);
    const b = Math.min(255, (n & 255) + 255 * amt);
    return `rgb(${r | 0},${g | 0},${b | 0})`;
  }
}
