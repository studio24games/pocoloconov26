// v0.52 (26 Oct, client choice "power sweep, combined"): the anticipation burn sits INSIDE the frame. A full-strength
// glow runs all the way round the inside edge (white-hot at the edge, gold, then amber fading towards the centre) from
// the moment it starts, and on top of it one wide bright arc sweeps round fast the whole time, throwing sparks inward.
// Used round a base-game column (one more coin needed), round each of the last empty Hold & Win squares, and round the
// reels that spin on in a Loco Spin. Same interface as before (constructor / start / success / fail / remove).
//
// Performance: one small canvas the size of the box (plus one offscreen layer for the soft bloom), at most 2x device
// resolution; nothing is drawn outside the box.
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const circ = (a, b) => { const d = Math.abs(a - b) % 1; return Math.min(d, 1 - d); };

// v0.53 'flow' look: soft fire texture (value noise, stretched upright so it forms wisps; tileable top to bottom),
// built once and shared. Column 0 is the frame edge; it fades out towards the inside.
const FLOW = { W: 48, H: 512 };
let flowTex = null;
function flowTextures() {
  if (flowTex) return flowTex;
  const { W, H } = FLOW, rnd = (x, y) => { const v = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return v - Math.floor(v); };
  const noise = (x, y, px, py) => {   // value noise, periodic in y with period py cells
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, sx = xf * xf * (3 - 2 * xf), sy = yf * yf * (3 - 2 * yf);
    const g = (a, b) => rnd(a, ((b % py) + py) % py);
    return (g(xi, yi) * (1 - sx) + g(xi + 1, yi) * sx) * (1 - sy) + (g(xi, yi + 1) * (1 - sx) + g(xi + 1, yi + 1) * sx) * sy; };
  const make = (seed, rgb, sharp) => {
    const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'), im = x.createImageData(W, H);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const u = i / W, edge = 1 - u;
      // flame tongues: noise with cells about 2x taller than wide, warped sideways a little, cut by the distance from the
      // edge so each tongue licks inward from the edge with a rounded, tapering tip
      const wy = j / H * 14, wx = i / W * 3.2 + 0.6 * noise(seed + 50, wy * 0.5, 0, 7) ;
      let n = 0, amp = 0.6, fx = 1, fy = 1;
      for (let o = 0; o < 3; o++) { n += amp * noise(seed + wx * fx, wy * fy, 0, 14 * fy); amp *= 0.45; fx *= 2; fy *= 2; }
      const v = rgb[0] < 200   // the dark layer: patches of noise in the middle of the band, never on the edge itself
        ? Math.max(0, Math.min(1, (n - 0.5) / 0.2)) * Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.15)), 1.5)
        : Math.max(0, Math.min(1, (edge * 1.12 - (1 - n) * 1.3 - sharp * 0.25) / 0.3));
      const k = (j * W + i) * 4; im.data[k] = rgb[0]; im.data[k + 1] = rgb[1]; im.data[k + 2] = rgb[2]; im.data[k + 3] = Math.round(255 * v * v * (3 - 2 * v));
    }
    x.putImageData(im, 0, 0); return c; };
  flowTex = { gold: make(3.1, [255, 150, 28], 0.32), hot: make(5.3, [255, 214, 110], 0.48), deep: make(9.7, [190, 70, 10], 0.42) };
  return flowTex;
}

export class Perimeter {
  /** box in the parent's coordinates (x, y, w, h); r = corner radius */
  constructor(parent, { x, y, w, h, r = 12, z = 6, look = null }) {
    // look (v0.53 option): depth of the static band, depth added by the sweep, strength of the static band, white edge
    // v0.53 (item 21, approved 27 Oct "burn_sides_fire_v2"): left and right edges only, a thin white core, layered gold
    // and orange flames climbing, orange-red patches rising through them, powdery embers. look: false = the v0.52 sweep.
    const FIRE = { sides: 'all', flow: true, depth: 8.6, core: 3.0, hot: 0.45, speed: 0.18, rampFrom: 0.55, ramp: 2.6, bloom: 3, powder: true };   // v0.56: 25 % narrower; starts at 0.55x speed, tops out at 2.6x (was 1.75x)   // v0.55: twice as fast, 5 % thinner   // v0.54: all four sides, clockwise, continuous round the corners
    this.look = { depth: 40, sweep: 34, base: 0.95, white: 1, bloom: 8, ...(look === false ? {} : FIRE), ...(look || {}) };
    this.w = w; this.h = h; this.r = Math.min(r, w / 2, h / 2); this.alive = true; this.state = 'idle'; this.sparks = [];
    const cv = this.cv = document.createElement('canvas'); cv.className = 'perim sweep';
    Object.assign(cv.style, { position: 'absolute', left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px`, pointerEvents: 'none', zIndex: z, opacity: 0, willChange: 'opacity' });
    parent.append(cv);
    this.ctx = cv.getContext('2d'); this.layer = document.createElement('canvas'); this.lctx = this.layer.getContext('2d');
    this.pts = this.sample(); this.resize();
  }
  /** points round the inside edge (about every 4 px) with inward normals and their position round the loop (0..1) */
  sample() {
    if (this.look?.sides === 'lr') {   // v0.53 option: left and right edges only, full height; the loop runs down the right, up the left
      const { w, h } = this, pts = [], n = Math.max(2, Math.round(h / 4));
      for (let i = 0; i < n; i++) pts.push({ x: w, y: h * i / n, nx: -1, ny: 0, s: 0.5 * i / n });
      for (let i = 0; i < n; i++) pts.push({ x: 0, y: h - h * i / n, nx: 1, ny: 0, s: 0.5 + 0.5 * i / n });
      return pts;
    }
    const { w, h, r } = this, pts = [], P = 2 * (w + h - 4 * r) + 2 * Math.PI * r, step = 4; let s = 0;
    const seg = (x0, y0, x1, y1, nx, ny) => { const L = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.round(L / step)); for (let i = 0; i < n; i++) pts.push({ x: x0 + (x1 - x0) * i / n, y: y0 + (y1 - y0) * i / n, nx, ny, s: (s + L * i / n) / P }); s += L; };
    const arc = (cx, cy, a0) => { const L = Math.PI / 2 * r, n = Math.max(2, Math.round(L / step)); for (let i = 0; i < n; i++) { const a = a0 + Math.PI / 2 * i / n; pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, nx: -Math.cos(a), ny: -Math.sin(a), s: (s + L * i / n) / P }); } s += L; };
    seg(r, 0, w - r, 0, 0, 1); arc(w - r, r, -Math.PI / 2); seg(w, r, w, h - r, -1, 0); arc(w - r, h - r, 0);
    seg(w - r, h, r, h, 0, -1); arc(r, h - r, Math.PI / 2); seg(0, h - r, 0, r, 1, 0); arc(r, r, Math.PI);
    return pts;
  }
  resize() {
    const rr = this.cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    const k = rr.width > 0 ? (rr.width / this.w) * dpr : dpr;
    this.k = Math.min(2, Math.max(1, k));
    for (const c of [this.cv, this.layer]) { c.width = Math.round(this.w * this.k); c.height = Math.round(this.h * this.k); }
  }
  /** 'flow' look: per side, a white-gold core on the edge, a gold fire layer scrolling up over it, and a dark layer
   *  scrolling up at a different speed that cuts moving shadows through the glow */
  /** v0.54 (client): the fire runs round all four sides, clockwise (along the top to the right, down the right side,
   *  along the bottom to the left, up the left side). Each side is drawn in its own frame: u = distance in from the
   *  edge, s = distance along it; dir is the way the flames travel along s. look.sides 'lr' keeps the v0.53 two sides. */
  flowSides() {
    // each side's frame runs its s axis in the direction of travel (clockwise), and its texture position continues
    // from the side before it (p0 = distance round the loop), so the flames carry on round each corner unbroken
    const { w, h } = this;
    if (this.look.sides === 'lr') return [{ m: [1, 0, 0, -1, 0, h], len: h, p0: 0 }, { m: [-1, 0, 0, -1, w, h], len: h, p0: 170 }];   // v0.53: both rising
    return [{ m: [0, 1, 1, 0, 0, 0], len: w, p0: 0 },                // top: to the right
            { m: [-1, 0, 0, 1, w, 0], len: h, p0: w },               // right: down
            { m: [0, -1, -1, 0, w, h], len: w, p0: w + h },          // bottom: to the left
            { m: [1, 0, 0, -1, 0, h], len: h, p0: 2 * w + h }];      // left: up
  }
  /** each side is drawn into its own small buffer, then shaped by a mask that fades it out across the 45-degree
   *  diagonal at each corner; the neighbouring side fades in across the same line, so the corners blend smoothly (no
   *  doubled band, no seam) and the fire reads as one continuous loop */
  sideBuf(key, i, sd, D) {
    this.bufs ??= {}; const id = `${key}${i}`, k = this.k, W = Math.max(1, Math.ceil(D * k)), H = Math.max(1, Math.ceil(sd.len * k));
    let b = this.bufs[id];
    if (!b || b.cv.width !== W || b.cv.height !== H) {
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      let mask = null;
      if (this.look.sides !== 'lr') { mask = document.createElement('canvas'); mask.width = W; mask.height = H; const mc = mask.getContext('2d'), im = mc.createImageData(W, H), F = 9;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const u = (x + .5) / k, s2 = (y + .5) / k;
          const t1 = Math.min(1, Math.max(0, .5 + (s2 - u) / F)), t2 = Math.min(1, Math.max(0, .5 + (sd.len - s2 - u) / F));
          im.data[(y * W + x) * 4 + 3] = Math.round(255 * t1 * t2); }
        mc.putImageData(im, 0, 0); }
      b = this.bufs[id] = { cv, ctx: cv.getContext('2d'), mask };
    }
    b.ctx.setTransform(1, 0, 0, 1, 0, 0); b.ctx.globalCompositeOperation = 'source-over'; b.ctx.globalAlpha = 1; b.ctx.clearRect(0, 0, W, H); b.ctx.setTransform(k, 0, 0, k, 0, 0);
    return b;
  }
  finishBuf(b) { if (!b.mask) return; const c = b.ctx; c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.globalCompositeOperation = 'destination-in'; c.drawImage(b.mask, 0, 0); c.globalCompositeOperation = 'source-over'; }
  /** v0.56 (client): the fire starts slow (rampFrom x the base speed) and gets up to full speed early - an ease-out climb
   *  over the first 30 % of the build (at most 0.9 s): speed x (S0 + (R - S0) * (1 - (1 - q)^2)), q = share of that climb
   *  gone, R = look.ramp - then holds the top speed for the rest of the near miss. (v0.55 climbed 1x -> 1.75x as p^2 over
   *  the whole build, so it barely changed until the very end.) Returns the distance in base-speed milliseconds. */
  dist(now) {
    const R = this.look.ramp ?? 1, S0 = this.look.rampFrom ?? 1, B = this.build || 1800, e = Math.max(0, now - (this.t0 || now));
    if (R === 1 && S0 === 1) return now;
    const A = Math.min(0.15 * B, 450), q = Math.min(1, e / A);   // v0.56b (client): a fast, felt acceleration (was 30 % / 0.9 s)
    const d = A * (S0 * q + (R - S0) * (q - (1 - Math.pow(1 - q, 3)) / 3));
    return (this.t0 || 0) + d + Math.max(0, e - A) * R + this.surgeDist(now) * R;
  }
  /** v0.62l (client): super tease - the fire speeds up to `mult` x and burns brighter over `ms` (until the result) */
  // v0.62l (client): no thicker or brighter fire - it shifts from gold to a deep orange, the colour building steadily to the result
  surge(mult = 1.6, ms = 700, colourMs = 2600) { this.sT0 = performance.now(); this.sMult = mult; this.sMs = ms;
    this.cT0 = this.sT0; this.cMs = colourMs; }
  surgeDist(now) { if (!this.sT0) return 0; const t = Math.max(0, now - this.sT0), m = this.sMult - 1, ms = this.sMs;
    return t < ms ? m * t * t / (2 * ms) : m * (ms / 2 + (t - ms)); }
  drawFlow(L, e, t, pulse) {
    const T = flowTextures(), K = this.look, D = K.depth * 3.6, I = Math.min(1, e), th = FLOW.H * 0.9, D2 = this.dist(this.now ?? t) * (this.rm ? 0.35 : 1);
    this.flowSides().forEach((sd, i) => {
      const b = this.sideBuf('f', i, sd, D), c = b.ctx;
      const cw = K.core ?? K.depth, g = c.createLinearGradient(0, 0, cw, 0);   // the white core: a thin line on the edge
      g.addColorStop(0, `rgba(255,252,232,${0.9 * I * pulse})`); g.addColorStop(0.35, `rgba(255,214,110,${0.6 * I})`); g.addColorStop(1, 'rgba(255,140,20,0)');
      c.globalCompositeOperation = 'lighter'; c.fillStyle = g; c.fillRect(0, 0, cw, sd.len);
      const tile = (img, speed, off, alpha) => { const y0 = ((((D2 * speed - sd.p0 + off) % th) + th) % th) - th;
        c.globalAlpha = alpha * I; for (let y = y0; y < sd.len; y += th) c.drawImage(img, 0, y, D, th); c.globalAlpha = 1; };
      tile(T.gold, K.speed ?? 0.16, 0, 0.95);
      tile(T.hot, (K.speed ?? 0.16) * 1.2, 220, K.hot ?? 0.7);
      this.finishBuf(b);
      L.save(); L.transform(...sd.m); L.globalCompositeOperation = 'lighter'; L.drawImage(b.cv, 0, 0, D, sd.len); L.restore();
    });
    L.globalCompositeOperation = 'lighter';
  }
  drawDeep(c, now) {
    const T = flowTextures(), K = this.look, D = K.depth * 3.6, k = this.k, t = now * (this.rm ? 0.35 : 1), I = Math.min(1, this.env(now)), th = FLOW.H * 0.9;
    if (I <= 0.01) return;
    this.flowSides().forEach((sd, i) => {
      const b = this.sideBuf('d', i, sd, D), sp = (K.speed ?? 0.16) * 0.9, y0 = ((((this.dist(now) * (this.rm ? 0.35 : 1) * sp - sd.p0 + 90) % th) + th) % th) - th;
      for (let y = y0; y < sd.len; y += th) b.ctx.drawImage(T.deep, 0, y, D, th);
      this.finishBuf(b);
      c.save(); c.setTransform(k, 0, 0, k, 0, 0); c.transform(...sd.m); c.globalAlpha = 0.85 * I; c.globalCompositeOperation = 'multiply'; c.drawImage(b.cv, 0, 0, D, sd.len); c.restore();
    });
  }
  /** sides-only look: flame tongues that travel UP both edges (a bright head with a tail fading below it), each tongue a
   *  little different in strength; the two sides are offset so they never mirror each other */
  flame(p, t) {
    const K = this.look, sp = K.speed ?? 0.42, gap = K.gap ?? 120;
    const ph = (p.y + t * sp) / gap + (p.x > 0 ? 0.43 : 0), k = Math.floor(ph), f = ph - k;
    const amp = 0.55 + 0.45 * (Math.abs(Math.sin(k * 12.9898 + (p.x > 0 ? 7.1 : 0)) * 43758.5453) % 1);
    return amp * (f < 0.16 ? f / 0.16 : Math.max(0, 1 - (f - 0.16) / 0.62));
  }
  /** strength now: full almost at once while building; a flash on a landing; a fade on a miss */
  env(now) {
    if (this.state === 'build') return Math.min(1, 0.55 + (now - this.t0) / 260);
    if (this.state === 'flare') { const p = Math.min(1, (now - this.t1) / 700); return p < 0.25 ? 1 + 1.6 * p / 0.25 : 2.6 * (1 - (p - 0.25) / 0.75); }
    if (this.state === 'dying') return Math.max(0, 1 - (now - this.t1) / this.fadeMs);
    return 0;
  }
  frame(now) {
    this.now = now;
    if (!this.cv.isConnected) return;
    const e = this.env(now), t = now * (this.rm ? 0.35 : 1), D0 = Math.min(this.w, this.h);
    const L = this.lctx, k = this.k; L.setTransform(k, 0, 0, k, 0, 0); L.clearRect(0, 0, this.w, this.h);
    if (e > 0.005) {
      const a = (t * 0.0016) % 1, pulse = 0.88 + 0.12 * Math.sin(t / 70) * Math.sin(t / 43 + 1);
      const depth = Math.min(1, D0 / 260);                       // a small square gets a proportionally thinner band
      L.globalCompositeOperation = 'lighter';
      if (this.look.flow) { this.drawFlow(L, e, t, pulse); } else
      for (let i = 0; i < this.pts.length; i++) {
        const p = this.pts[i], q = this.pts[(i + 1) % this.pts.length];
        const K = this.look, arcI = K.sides === 'lr' ? this.flame(p, t) : Math.max(0, 1 - circ(p.s, a) / 0.14), I = Math.min(1, e * (K.base * pulse + 1.1 * arcI * arcI));
        const D = (K.depth + K.sweep * arcI) * (0.55 + 0.45 * depth), hue = 205 + 30 * arcI;
        const g = L.createLinearGradient(p.x, p.y, p.x + p.nx * D, p.y + p.ny * D);
        const wI = I * (K.white + (1 - K.white) * arcI);   // the white-hot edge: full in the sweep, reduced elsewhere
        g.addColorStop(0, `rgba(255,252,232,${wI})`); g.addColorStop(0.22, `rgba(255,${hue},95,${I * 0.95})`);
        g.addColorStop(0.6, `rgba(255,${hue - 60},25,${I * 0.55})`); g.addColorStop(1, 'rgba(255,120,0,0)');
        L.strokeStyle = g; L.lineWidth = Math.min(8, Math.hypot(q.x - p.x, q.y - p.y)) + 1.5;   // capped: no wide stroke where the loop jumps sides
        L.beginPath(); L.moveTo(p.x, p.y); L.lineTo(p.x + p.nx * D, p.y + p.ny * D); L.stroke();
      }
      // sparks drawn inward from the sweeping arc
      if (this.look.flow && (this.state === 'build' || this.state === 'flare')) {   // embers rise off the flame heads
        for (let j = 0; j < (this.rm ? 1 : 10); j++) { const p = this.pts[Math.floor(Math.random() * this.pts.length)]; const f = this.look.flow ? Math.random() : this.flame(p, t); if (f < 0.45) continue;
          this.sparks.push({ x: p.x + p.nx * Math.random() * 6, y: p.y, vx: p.nx * (0.15 + Math.random() * 0.45) + (Math.random() - .5) * 0.3, vy: -(0.7 + Math.random() * 1.3), life: 1, r: 0.6 + Math.random() * 0.8, g: 200 + Math.floor(Math.random() * 55) }); }
      } else if (this.state === 'build' || this.state === 'flare') { const n = this.pts.length, i0 = Math.floor(a * n);
        const powder = this.look.powder;
        for (let j = 0; j < (this.rm ? 1 : powder ? 9 : 3); j++) { const p = this.pts[(i0 + Math.floor(Math.random() * (powder ? 22 : 14))) % n];
          // v0.53 'powder': many fine grains with a little drift, each a slightly different size and warmth
          this.sparks.push(powder ? { x: p.x + (Math.random() - .5) * 3, y: p.y + (Math.random() - .5) * 3, vx: p.nx * (0.25 + Math.random() * 0.9) + (Math.random() - .5) * 0.5, vy: p.ny * (0.25 + Math.random() * 0.9) + (Math.random() - .5) * 0.9, life: 1, r: 0.6 + Math.random() * 0.8, g: 200 + Math.floor(Math.random() * 55) }
            : { x: p.x, y: p.y, vx: p.nx * (0.6 + Math.random()), vy: p.ny * (0.6 + Math.random()), life: 1 }); } }
      for (const s of this.sparks) { s.x += s.vx * 2; s.y += s.vy * 2; s.life -= s.r ? 0.045 : 0.035;
        const al = Math.max(0, s.life) * Math.min(1, e);
        if (s.r) { L.fillStyle = `rgba(255,${s.g},${s.g - 70},${Math.min(1, al * 1.1).toFixed(3)})`; L.beginPath(); L.arc(s.x, s.y, s.r * (0.6 + 0.4 * s.life), 0, 6.283); L.fill(); }
        else { L.fillStyle = `rgba(255,235,170,${al.toFixed(3)})`; L.beginPath(); L.arc(s.x, s.y, 2.2, 0, 6.283); L.fill(); } }
      this.sparks = this.sparks.filter(s => s.life > 0).slice(this.look.powder ? -420 : -160);
    }
    // the layer, plus a soft bloom copy (the glow stays inside the box: the canvas is the box)
    const c = this.ctx; c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, this.cv.width, this.cv.height);
    c.globalCompositeOperation = 'lighter';
    // v0.70: the soft bloom without a per-frame canvas blur filter (expensive on phones): the layer is drawn into a
    // canvas a quarter of the size and scaled back up, which softens it about as much, for a fraction of the cost
    if (!this.rm) { const bw = Math.max(1, Math.round(this.cv.width / 4)), bh = Math.max(1, Math.round(this.cv.height / 4));
      if (!this.bloomCv) { this.bloomCv = document.createElement('canvas'); this.bctx = this.bloomCv.getContext('2d'); }
      if (this.bloomCv.width !== bw || this.bloomCv.height !== bh) { this.bloomCv.width = bw; this.bloomCv.height = bh; }
      const B = this.bctx; B.clearRect(0, 0, bw, bh); B.imageSmoothingEnabled = true; B.drawImage(this.layer, 0, 0, bw, bh);
      c.save(); c.globalAlpha = 0.9; c.imageSmoothingEnabled = true; c.drawImage(this.bloomCv, 0, 0, this.cv.width, this.cv.height); c.restore(); }
    c.drawImage(this.layer, 0, 0); c.globalCompositeOperation = 'source-over';
    if (this.cT0) {   // v0.62l (client): super tease - an orange wash over the fire, building to the result (the fire is not thickened)
      const q = Math.min(1, (now - this.cT0) / this.cMs), tint = 1 - Math.pow(1 - q, 2.2);   // turns quickly, keeps deepening to the result
      c.globalCompositeOperation = 'source-atop'; c.fillStyle = `rgba(255, 78, 0, ${(0.86 * tint).toFixed(3)})`; c.fillRect(0, 0, this.cv.width, this.cv.height);
      c.globalCompositeOperation = 'source-over'; }
    if (this.look.flow && this.state !== 'idle') this.drawDeep(c, now);   // dark amber smoke-like patches rising over the glow
    if ((this.state === 'dying' && e <= 0) || (this.state === 'flare' && now - this.t1 > 760)) { this.remove(); return; }
    this.raf = requestAnimationFrame(tt => this.frame(tt));
  }
  /** start at (nearly) full strength at once; `build` is kept for the interface (the reel's own slow-down sets the time) */
  start(build = 1800) {
    this.build = Math.max(400, build); this.rm = reduced(); this.t0 = performance.now(); this.state = 'build';
    this.cv.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 120, easing: 'ease-out', fill: 'forwards' });
    this.raf = requestAnimationFrame(t => this.frame(t));
    return this;
  }
  /** the coin landed: one bright flash round the whole edge, then it clears */
  success() { if (!this.alive || this.state === 'flare') return; this.state = 'flare'; this.t1 = performance.now(); }
  /** the opportunity passed: the burn fades out */
  fail(ms = 260) { if (!this.alive || this.state === 'dying') return; this.state = 'dying'; this.t1 = performance.now(); this.fadeMs = Math.max(ms, 420); }
  remove() {
    if (!this.alive) return;
    this.alive = false; cancelAnimationFrame(this.raf); this.cv.remove(); this.sparks = []; this.layer.width = this.layer.height = 0; if (this.bloomCv) this.bloomCv.width = this.bloomCv.height = 0; this.bufs = null;
  }
}
