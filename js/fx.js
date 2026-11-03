// Lightweight canvas particle system (coins, confetti, sparks). Runs only while particles exist.
const COLORS = ['#ff2f92', '#ff9a1f', '#1fd1c8', '#8a3ffc', '#a6e22e', '#ffd35a'];

export class FX {
  constructor(canvas) {
    this.c = canvas; this.g = canvas.getContext('2d'); this.W = canvas.width; this.H = canvas.height; this.p = []; this.running = false; this.rain = null;
    this.R = 1; this.LW = canvas.width; this.LH = canvas.height;   // logical (game px) size; R = device px per game px
  }
  /** v0.72: a different logical size / x offset (the wide layout's full-width top layer); CSS follows */
  resize(LW, LH, left = 0, top = 0) {
    LW = Math.round(LW); LH = Math.round(LH);
    if (this.LW === LW && this.LH === LH && (this.left ?? 0) === left && (this.top ?? 0) === top) return;
    this.LW = LW; this.LH = LH; this.left = left; this.top = top; this.c.style.left = `${left}px`; this.c.style.top = `${top}px`; this.c.style.width = `${LW}px`; this.c.style.height = `${LH}px`;
    this.c.width = Math.round(LW * this.R); this.c.height = Math.round(LH * this.R); this.W = this.c.width; this.H = this.c.height;
  }
  /** Brief s14B: draw at device resolution (no enlarged low-res canvas). R is capped for mobile fill-rate. */
  setResolution(R, min = 1) {   // v0.72: min < 1 lets the wide layout's full-frame top layer draw a little softer (memory)
    R = Math.max(min, Math.min(2, R || 1)); if (Math.abs(R - this.R) < 0.05) return;
    this.R = R; this.c.width = Math.round(this.LW * R); this.c.height = Math.round(this.LH * R);
  }
  /**
   * Brief s14B: one reusable gold ribbon — a continuous tapered stroke with a bright leading point, a luminous core,
   * a soft outer glow and a few restrained sparks. Curved path, smooth acceleration, the tail fades and dissipates
   * after arrival. Resolves on arrival. opts: ms, bend, width, tail (fraction of path), accel (forceful finish), sparks.
   */
  ribbon(x0, y0, x1, y1, { ms = 420, bend = -150, width = 13, tail = 0.36, accel = false, sparks = 0.45, glow = '#ff9a1f', core = '#ffd35a' } = {}) {
    return new Promise(res => {
      const cx = (x0 + x1) / 2 + bend * 0.35, cy = Math.min(y0, y1) + bend;
      this.ribbons = this.ribbons || [];
      this.ribbons.push({ x0, y0, x1, y1, cx, cy, t0: performance.now(), ms, width, tail, accel, sparks, glow, core, res, done: false });
      this.start();
    });
  }
  burst(x, y, { count = 24, kind = 'spark', speed = 7, colors = COLORS, gravity = 0.25, life = 60, size = 6 } = {}) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2, s = speed * (0.4 + Math.random() * 0.8);
      this.p.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - speed * 0.4, g: gravity, life, max: life, kind,
        col: colors[i % colors.length], size: size * (0.6 + Math.random() * 0.8), rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4 });
    }
    this.start();
  }
  /** Upward fountain of coins from (x, y). */
  fountain(x, y, count = 40) {
    for (let i = 0; i < count; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.6, s = 8 + Math.random() * 8;
      this.p.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, g: 0.32, life: 140, max: 140, kind: 'coin', col: '#ffd35a', size: 8 + Math.random() * 7, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4 });
    }
    this.start();
  }
  /**
   * Gold streak (comet) from (x0,y0) to (x1,y1) along a curve, shedding sparks. Resolves on arrival.
   * Used for coins flying up into the logo skull and for the skull spitting coins onto the grid.
   */
  streak(x0, y0, x1, y1, { ms = 520, bend = -160, size = 16, color = '#ffd35a', tail = 0 } = {}) {
    return new Promise(res => {
      const cx = (x0 + x1) / 2 + bend * 0.35, cy = Math.min(y0, y1) + bend;
      this.streaks = this.streaks || [];
      this.streaks.push({ x0, y0, x1, y1, cx, cy, t0: performance.now(), ms, size, color, res, tail, trail: [] });
      this.start();
    });
  }
  /** v0.23 failed Coin Rescue: a billowing puff of smoke (soft clouds that swell, rise and fade) with a few dying sparks. */
  smoke(x, y, { count = 16, spread = 1, linger = 1, big = 1 } = {}) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2, s = (2.6 + Math.random() * 4.6) * spread;
      const life = Math.round((50 + Math.floor(Math.random() * 30)) * linger);
      this.p.push({ x: x + Math.cos(a) * 8, y: y + Math.sin(a) * 6, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.7 - 1, g: -0.03, drag: 0.92, life, max: life,
        kind: 'smoke', size: (16 + Math.random() * 20) * big, grow: 1.5 + Math.random() * 1.3, shade: Math.floor(175 + Math.random() * 55), rot: 0, vr: 0 });
    }
    this.p.push({ x, y, vx: 0, vy: 0, g: 0, life: 18, max: 18, kind: 'ring', size: 10, rot: 0, vr: 0 });   // the "poof" pop
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (Math.random() - .5) * 2.4, s = 2 + Math.random() * 3;
      this.p.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, g: 0.18, life: 22 + Math.floor(Math.random() * 8), max: 30, kind: 'spark', col: i % 2 ? '#ffb21f' : '#fff4b8', size: 2.5, rot: 0, vr: 0 });
    }
    this.start();
  }
  clear() { this.p = []; this.rain = null; this.fadeEnd = 0; }
  /** v0.35: let everything on screen fade out within `frames` (a calm reading moment without a hard cut) */
  // checklist 4: time-based (independent of the frame rate), so the settled amount always gets its clear reading moment
  fade(frames = 40) { this.fadeMs = frames * 1000 / 60; this.fadeEnd = performance.now() + this.fadeMs; }
  coinRain(on, intensity = 1) {
    this.rain = on ? intensity : null; if (on) this.fadeEnd = 0;
    if (on) this.start();
  }
  start() { if (!this.running) { this.running = true; requestAnimationFrame(t => this.tick(t)); } }
  tick() {
    const g = this.g, W = this.W = this.LW, H = this.H = this.LH;
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, this.c.width, this.c.height); g.setTransform(this.R, 0, 0, this.R, 0, 0);
    if (this.ribbons?.length) this.drawRibbons(g);
    if (this.rain) for (let i = 0; i < 2 * this.rain; i++) {
      this.p.push({ x: Math.random() * W, y: -30, vx: (Math.random() - 0.5) * 2, vy: 4 + Math.random() * 5, g: 0.12, life: 200, max: 200,
        kind: Math.random() < 0.7 ? 'coin' : 'confetti', col: COLORS[Math.floor(Math.random() * 6)], size: 14 + Math.random() * 10, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3 });
    }
    if (this.streaks?.length) {
      const now = performance.now();
      this.streaks = this.streaks.filter(k => {
        const t = Math.min(1, (now - k.t0) / k.ms), e = t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2, u = 1 - e;
        const x = u * u * k.x0 + 2 * u * e * k.cx + e * e * k.x1, y = u * u * k.y0 + 2 * u * e * k.cy + e * e * k.y1;
        for (let i = 0; i < 3; i++) this.p.push({ x: x + (Math.random() - .5) * 8, y: y + (Math.random() - .5) * 8, vx: (Math.random() - .5) * 1.6, vy: (Math.random() - .5) * 1.6, g: 0.02, life: 22, max: 22, kind: 'spark', col: i ? '#ffb21f' : '#fff4b8', size: k.size * 0.42, rot: 0, vr: 0 });
        if (k.tail) {   // v0.22 comet tail (Mayan coin flight): a tapering glowing trail behind the head
          k.trail.push([x, y]); if (k.trail.length > k.tail) k.trail.shift();
          const n = k.trail.length;
          for (let i = 0; i < n - 1; i++) { const f = (i + 1) / n, [tx, ty] = k.trail[i];
            g.globalAlpha = f * .75; g.fillStyle = i % 2 ? '#ffd35a' : '#ffb21f';
            g.beginPath(); g.arc(tx, ty, k.size * (0.35 + f * 1.05), 0, 7); g.fill(); }
          g.globalAlpha = 1;
        }
        const gr = g.createRadialGradient(x, y, 0, x, y, k.size * 2.2);
        gr.addColorStop(0, '#fffbe6'); gr.addColorStop(.35, k.color); gr.addColorStop(1, 'rgba(255,154,31,0)');
        g.fillStyle = gr; g.beginPath(); g.arc(x, y, k.size * 2.2, 0, 7); g.fill();
        if (t >= 1) { k.res(); return false; }
        return true;
      });
    }
    let gf = 1;
    if (this.fadeEnd) { gf = (this.fadeEnd - performance.now()) / this.fadeMs; if (gf <= 0) { this.p = []; this.fadeEnd = 0; gf = 1; } }
    this.p = this.p.filter(q => q.life > 0 && q.y < H + 40);
    for (const q of this.p) {
      if (q.drag) { q.vx *= q.drag; q.vy *= q.drag; }
      q.vy += q.g; q.x += q.vx; q.y += q.vy; q.rot += q.vr; q.life--;
      if (q.kind === 'smoke') {
        const t = 1 - q.life / q.max, r = q.size * (1 + q.grow * Math.sqrt(t)), al = Math.min(1, q.life / (q.max * .55)) * (t < .08 ? t / .08 : 1) * .72;
        const c = q.shade, gr = g.createRadialGradient(q.x, q.y, 0, q.x, q.y, r);
        gr.addColorStop(0, `rgba(${c},${c - 6},${c - 14},${al})`); gr.addColorStop(.55, `rgba(${c - 40},${c - 44},${c - 50},${al * .55})`); gr.addColorStop(1, `rgba(${c - 60},${c - 62},${c - 66},0)`);
        g.globalAlpha = 1; g.fillStyle = gr; g.beginPath(); g.arc(q.x, q.y, r, 0, 7); g.fill();
        // cartoon shading: a lighter dome on the upper side of each puff so the cloud reads as round billows
        const hx = q.x - r * .22, hy = q.y - r * .28, hr = r * .62, gh = g.createRadialGradient(hx, hy, 0, hx, hy, hr);
        gh.addColorStop(0, `rgba(255,250,240,${al * .8})`); gh.addColorStop(1, 'rgba(255,250,240,0)');
        g.fillStyle = gh; g.beginPath(); g.arc(hx, hy, hr, 0, 7); g.fill();
        continue;
      }
      if (q.kind === 'ring') {
        const t = 1 - q.life / q.max; g.globalAlpha = (1 - t) * .9; g.strokeStyle = '#fffaf0'; g.lineWidth = 7 * (1 - t) + 1;
        g.beginPath(); g.arc(q.x, q.y, 16 + t * 150, 0, 7); g.stroke(); g.globalAlpha = 1;
        continue;
      }
      const a = Math.min(1, q.life / (q.max * 0.3)) * gf;
      g.globalAlpha = a;
      if (q.kind === 'coin') {
        const w = Math.abs(Math.cos(q.rot)) * q.size;
        g.fillStyle = '#c7801a'; g.beginPath(); g.ellipse(q.x, q.y, w + 1.5, q.size + 1.5, 0, 0, 7); g.fill();
        g.fillStyle = '#ffd04a'; g.beginPath(); g.ellipse(q.x, q.y, w, q.size, 0, 0, 7); g.fill();
        g.fillStyle = '#fff4b8'; g.beginPath(); g.ellipse(q.x - w * 0.3, q.y - q.size * 0.3, w * 0.3, q.size * 0.3, 0, 0, 7); g.fill();
      } else if (q.kind === 'confetti') {
        g.save(); g.translate(q.x, q.y); g.rotate(q.rot); g.fillStyle = q.col; g.fillRect(-q.size / 2, -q.size / 4, q.size, q.size / 2); g.restore();
      } else {
        g.fillStyle = q.col; g.beginPath(); g.arc(q.x, q.y, Math.max(0, q.size * a), 0, 7); g.fill();
      }
    }
    g.globalAlpha = 1;
    if (this.p.length || this.rain || this.streaks?.length || this.ribbons?.length) requestAnimationFrame(t => this.tick(t));
    else { this.running = false; g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, this.c.width, this.c.height); }
  }
  drawRibbons(g) {
    const now = performance.now(), FADE = 200, N = 26;
    const at = (k, u) => { const v = 1 - u; return [v * v * k.x0 + 2 * v * u * k.cx + u * u * k.x1, v * v * k.y0 + 2 * v * u * k.cy + u * u * k.y1]; };
    this.ribbons = this.ribbons.filter(k => {
      const t = (now - k.t0) / k.ms;
      // accel 'strong' (checklist 19): visibly leaves the source (small initial speed), then accelerates hard into the target
      const ease = x => (k.accel === 'strong' ? 0.1 * x + 0.9 * Math.pow(x, 2.4) : k.accel ? x * x * (1.6 - 0.6 * x) : x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
      const head = ease(Math.min(1, t));
      let a = 1, tailU = Math.max(0, head - k.tail);
      if (t >= 1) {
        if (!k.done) { k.done = true; k.res(); }
        const f = Math.min(1, (now - k.t0 - k.ms) / FADE); a = 1 - f; tailU = Math.min(1, tailU + (1 - tailU) * f);
        if (f >= 1) return false;
      }
      const pts = []; for (let i = 0; i <= N; i++) pts.push(at(k, tailU + (head - tailU) * (i / N)));
      g.save(); g.globalCompositeOperation = 'lighter'; g.lineCap = 'round'; g.lineJoin = 'round';
      for (const [wk, col, al] of [[2.7, k.glow, 0.22], [1.0, k.core, 0.85], [0.38, '#fffbe6', 1]]) {
        g.strokeStyle = col;
        for (let i = 1; i <= N; i++) { const f = i / N;
          g.globalAlpha = al * a * (0.15 + 0.85 * f); g.lineWidth = k.width * wk * (0.18 + 0.82 * Math.pow(f, 1.2));
          g.beginPath(); g.moveTo(pts[i - 1][0], pts[i - 1][1]); g.lineTo(pts[i][0], pts[i][1]); g.stroke(); }
      }
      const [hx, hy] = pts[N]; const r = k.width * 1.9 * (t >= 1 ? 1 + (1 - a) * 0.8 : 1);
      const gr = g.createRadialGradient(hx, hy, 0, hx, hy, r);
      gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.3, '#fff3b8'); gr.addColorStop(0.65, k.core); gr.addColorStop(1, 'rgba(255,154,31,0)');
      g.globalAlpha = a; g.fillStyle = gr; g.beginPath(); g.arc(hx, hy, r, 0, 7); g.fill();
      g.restore();
      if (t < 1 && Math.random() < k.sparks) this.p.push({ x: hx + (Math.random() - .5) * 6, y: hy + (Math.random() - .5) * 6, vx: (Math.random() - .5) * 1.4, vy: (Math.random() - .5) * 1.4, g: 0.03, life: 18, max: 18, kind: 'spark', col: Math.random() < .5 ? '#ffd35a' : '#fff4b8', size: k.width * 0.22, rot: 0, vr: 0 });
      return true;
    });
  }
}
