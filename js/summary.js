// v0.71 (checklist 19): the Summary window - live-measured maths for a chosen combination of the test toggles.
// The figures come from js/summary-worker.js, which plays whole rounds through the game's own engine in the background
// (paused while a round plays). Finished runs are kept per combination in this browser, so reopening is instant.
// Compare: pin the current combination as A, change toggles, and B is drawn against it (A muted, B bright).

const VER = 'v071a';
const KEY = p => `pocoSummary:${VER}:${p}`;
const PIN = `pocoSummaryPin:${VER}`;
const store = { get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage full or blocked */ } } };

let worker = null, busy = false, cur = null, live = {}, el = null, tab = 'overview', mode = 'base', listeners = new Set();
function ensureWorker() {
  if (worker) return worker;
  worker = new Worker(new URL('./summary-worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = e => { const d = e.data; if (d.type !== 'snap') return;
    live[d.profile] = d.snap; if (d.done) store.set(KEY(d.profile), d.snap);
    for (const f of listeners) f(d.profile); if (el && d.profile === cur?.profile) render(); };
  if (busy) worker.postMessage({ cmd: 'pause' });
  return worker;
}
/** the latest figures for a combination: finished (stored) or still running (live) */
export const snapOf = p => store.get(KEY(p)) || live[p] || null;
/** start measuring a combination (no-op if already finished or running) */
export function measure(profile) { if (store.get(KEY(profile))) return; ensureWorker().postMessage({ cmd: 'run', profile }); }
export const onSnap = f => { listeners.add(f); return () => listeners.delete(f); };
/** the game tells the Summary when a round is playing, so the measurement never competes with it */
export function setBusy(b) { if (b === busy) return; busy = b; worker?.postMessage({ cmd: b ? 'pause' : 'resume' }); }

// ---------- formatting ----------
const f1 = x => (x == null || !isFinite(x) ? '–' : x.toFixed(1)), f2 = x => (x == null || !isFinite(x) ? '–' : x.toFixed(2));
const every = x => (!x || !isFinite(x) ? '–' : `1 in ${x >= 100 ? Math.round(x).toLocaleString('en-GB') : x.toFixed(1)}`);
const xx = x => (x == null || !isFinite(x) ? '–' : `${x >= 100 ? Math.round(x) : x.toFixed(x >= 10 ? 1 : 2)}×`);
const pc = x => (x == null || !isFinite(x) ? '–' : `${x.toFixed(x < 1 ? 2 : 1)}%`);
// red: clearly above 96.9 (even after the margin); amber: above 96.9 but inside the margin so far
export const rtpClass = (r, se) => (r - 2 * se > 96.9 ? 'sm-red' : r > 96.9 ? 'sm-amb' : '');
const rtpCell = (r, se) => (r == null ? '–' : `<b class="${rtpClass(r, se)}">${r.toFixed(2)}%</b> <small>±${(2 * se).toFixed(2)}</small>`);
const pinned = () => store.get(PIN);
const diff = (a, b, fmt, better) => { if (a == null || b == null || !isFinite(a) || !isFinite(b)) return ''; const d = b - a; if (Math.abs(d) < 1e-9) return '';
  return `<span class="sm-d">${d > 0 ? '+' : '−'}${fmt(Math.abs(d))}</span>`; };

// a table row with the A (pinned) value when comparing
function rows(list, A, B) {
  return `<table class="sm-t">${A ? `<tr class="sm-h"><th></th><th>A · pinned</th><th>B · this</th></tr>` : ''}${list.map(([label, get, fmt = f1, note]) => {
    const b = get(B), a = A ? get(A) : null;
    return `<tr><td>${label}${note ? `<em>${note}</em>` : ''}</td>${A ? `<td class="sm-a">${typeof a === 'string' ? a : fmt(a)}</td>` : ''}<td>${typeof b === 'string' ? b : fmt(b)}${A && typeof b === 'number' ? diff(a, b, fmt) : ''}</td></tr>`; }).join('')}</table>`;
}

// ---------- charts (plain SVG) ----------
const C = { a: '#8c7aa3', b: '#ffd35a', band: '#3fbf5a44', grid: '#ffffff1f', txt: '#f3e6d0' };
function bars(groups, { h = 220, max, labels, fmt = f1, band } = {}) {
  // groups: [{ label, a, b }] ; a may be null when not comparing
  const W = 640, pad = 34, bw = (W - pad) / groups.length, mx = max ?? Math.max(1e-9, ...groups.flatMap(g => [g.a ?? 0, g.b ?? 0, band?.[g.label]?.[1] ?? 0]));
  const y = v => h - 26 - (h - 40) * Math.min(1, v / mx);
  let s = `<svg viewBox="0 0 ${W} ${h}" class="sm-svg">`;
  for (let i = 0; i <= 4; i++) { const v = mx * i / 4; s += `<line x1="${pad}" x2="${W}" y1="${y(v)}" y2="${y(v)}" stroke="${C.grid}"/><text x="${pad - 4}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="${C.txt}" opacity=".6">${fmt(v)}</text>`; }
  groups.forEach((g, i) => { const x0 = pad + i * bw + bw * 0.12, w = bw * 0.76, two = g.a != null;
    const bd = band?.[g.label]; if (bd) s += `<rect x="${x0 - 2}" width="${w + 4}" y="${y(bd[1])}" height="${Math.max(2, y(bd[0]) - y(bd[1]))}" fill="${C.band}"><title>Golden Dragon ${fmt(bd[0])}–${fmt(bd[1])}</title></rect>`;
    if (two) s += `<rect x="${x0}" width="${w / 2 - 1}" y="${y(g.a)}" height="${h - 26 - y(g.a)}" fill="${C.a}" data-v="A · ${g.label}: ${fmt(g.a)}"><title>A: ${fmt(g.a)}</title></rect>`;
    s += `<rect x="${two ? x0 + w / 2 + 1 : x0}" width="${two ? w / 2 - 1 : w}" y="${y(g.b ?? 0)}" height="${h - 26 - y(g.b ?? 0)}" fill="${C.b}" data-v="${g.label}: ${fmt(g.b)}"><title>${fmt(g.b)}</title></rect>`;
    s += `<text x="${x0 + w / 2}" y="${h - 9}" text-anchor="middle" font-size="11" fill="${C.txt}">${labels?.[i] ?? g.label}</text>`; });
  return s + '</svg>';
}
function stack(rowsIn, parts, { h = 40 } = {}) {
  // rowsIn: [{ label, v: {part: value} }] ; one horizontal 100% bar per row
  const W = 640, cols = ['#ffd35a', '#f39a3a', '#e05a5a', '#b05ae0', '#5a8ce0', '#3fbf9a', '#9ad05a', '#c9b48a'];
  let s = `<svg viewBox="0 0 ${W} ${rowsIn.length * (h + 10) + 40}" class="sm-svg">`;
  rowsIn.forEach((r, j) => { const tot = parts.reduce((a, [k]) => a + (r.v[k] || 0), 0) || 1; let x = 90;
    s += `<text x="0" y="${j * (h + 10) + h / 2 + 4}" font-size="12" fill="${C.txt}">${r.label}</text>`;
    parts.forEach(([k, l], i) => { const w = (W - 90) * (r.v[k] || 0) / tot; if (w > 0) s += `<rect x="${x}" y="${j * (h + 10)}" width="${w}" height="${h}" fill="${cols[i % cols.length]}" data-v="${r.label} · ${l}: ${f2(r.v[k])}"><title>${l}: ${f2(r.v[k])}</title></rect>`; x += w; }); });
  const ly = rowsIn.length * (h + 10) + 14; let lx = 0;
  parts.forEach(([, l], i) => { s += `<rect x="${lx}" y="${ly}" width="10" height="10" fill="${cols[i % cols.length]}"/><text x="${lx + 14}" y="${ly + 9}" font-size="11" fill="${C.txt}">${l}</text>`; lx += 16 + l.length * 6.2; if (lx > W - 60) lx = 0; });
  return s + '</svg>';
}
function fan(Bs, As) {
  const W = 640, H = 260, pad = 40, F2 = [...(Bs?.fan || []), ...(As?.fan || [])], lo = Math.min(-50, ...F2.map(r => r[0])), hi = Math.max(20, 1.6 * Math.max(...F2.map(r => r[3]), 0));   // the top band is clipped: a few sessions win hundreds of stakes
  const x = i => pad + (W - pad) * (i + 1) / 40, y = v => 10 + (H - 40) * (hi - v) / (hi - lo);
  let s = `<svg viewBox="0 0 ${W} ${H}" class="sm-svg"><defs><clipPath id="smclip"><rect x="${pad}" y="10" width="${W - pad}" height="${H - 40}"/></clipPath></defs><line x1="${pad}" x2="${W}" y1="${y(0)}" y2="${y(0)}" stroke="${C.grid}" stroke-dasharray="4 4"/>`;
  for (const v of [hi, (hi + lo) / 2, lo]) s += `<text x="${pad - 4}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="${C.txt}" opacity=".6">${Math.round(v)}</text>`;
  const draw = (S, col, faint) => { if (!S?.fan?.length) return; const F = S.fan, area = (a, b) => `M${F.map((r, i) => `${x(i)},${y(r[a])}`).join('L')}L${F.map((r, i) => `${x(F.length - 1 - i)},${y(F[F.length - 1 - i][b])}`).join('L')}Z`;
    if (!faint) for (const p of S.examples || []) s += `<path d="M${p.map((v, i) => `${x(i)},${y(v)}`).join('L')}" fill="none" stroke="${col}" stroke-opacity=".25"/>`;
    s += `<path d="${area(0, 4)}" fill="${col}" fill-opacity="${faint ? 0.08 : 0.15}"/><path d="${area(1, 3)}" fill="${col}" fill-opacity="${faint ? 0.12 : 0.25}"/>`;
    s += `<path d="M${F.map((r, i) => `${x(i)},${y(r[2])}`).join('L')}" fill="none" stroke="${col}" stroke-width="2.5"/>`; };
  s += '<g clip-path="url(#smclip)">'; draw(As, C.a, true); draw(Bs, C.b, false); s += '</g>';
  return s + `<text x="${W}" y="${H - 6}" text-anchor="end" font-size="11" fill="${C.txt}" opacity=".7">spins → 2,000 · balance in stakes</text></svg>`;
}

// ---------- tabs ----------
const GD = {   // Golden Dragon's harvested ranges (UGDI_FULLCHECK, 30 Oct; 95% intervals)
  hit: [28.8, 30.6], ge1: [6.6, 7.6], sub1: [21.85, 23.49], baseRet: [26.5, 32.3], bonEvery: [97, 149], locoEvery: [32, 40],
  b1020: [0.30, 0.56], b2050: [0.27, 0.52], buyRtp: [89.6, 104.3], buyMean: [71.7, 83.4], buyPrice: [36, 46], buyHalf: [25, 34], buyX2: [6, 10],
  short1: [1.3, 2.4], short2: [4.0, 5.9], short3: [14.5, 17.5] };
const inR = (v, [lo, hi]) => (v >= lo && v <= hi ? '<b class="sm-ok">OK</b>' : '<b class="sm-red">OUT</b>');
const BKL = ['<0.5×', '0.5–1×', '1–2×', '2–5×', '5–10×', '10–20×', '20–50×', '50–100×', '100×+'];

function tabHtml(S, A) {
  const m = S[mode], am = A?.[mode];
  const M = get => s => get(s?.[mode]);
  if (tab === 'overview') return rows([
    ['RTP · base game', s => rtpCell(s?.base?.rtp, s?.base?.se ?? 0), x => x, '±: 95% range so far'],
    ['RTP · Double Chance', s => rtpCell(s?.double?.rtp, s?.double?.se ?? 0), x => x],
    ['RTP · Buy', s => rtpCell(s?.buy?.rtp, s?.buy?.se ?? 0), x => x],
    ['RTP · Super Buy', s => rtpCell(s?.superbuy?.rtp, s?.superbuy?.se ?? 0), x => x],
    ['Hit rate', M(x => x.hit), pc], ['Spins where nothing happens', M(x => x.nothing), pc],
    ['Hold & Win', M(x => x.bon.every), every], ['Chance of 1,000×+ per spin', M(x => x.bon.x1000), x => (x ? `1 in ${Math.round(100 / x).toLocaleString('en-GB')}` : '–')],
    ['Volatility', M(x => x.sdX), x => `${f1(x)} <small>${x < 8 ? 'low' : x < 14 ? 'medium' : x < 22 ? 'high' : 'very high'}</small>`, 'spread of one spin, in stakes'],
    ['Spins measured', M(x => x.n), x => (x ?? 0).toLocaleString('en-GB')],
  ], A, S);
  if (tab === 'base') return rows([
    ['Hit rate', M(x => x.hit), pc], ['Spins where nothing happens', M(x => x.nothing), pc],
    ...BKL.map((l, i) => [`Wins ${l}`, M(x => x.bk[i].spins), pc, `${f1(m.bk[i].rtp)} pts RTP`]),
    ['Curtains (full reel)', M(x => x.cur.every), every], ['Two-reel curtains', M(x => x.cur.twoEvery), every], ['Small curtain blocks', M(x => x.cur.smallEvery), every],
    ['Curtains that pay', M(x => x.cur.pay), pc], ['Average curtain win', M(x => x.cur.avgX), xx],
    ['Loco Spin', M(x => x.loco.every), every], ['Loco Spin average / median', M(x => `${xx(x.loco.avgX)} / ${xx(x.loco.medX)}`)],
    ['Coin Save', M(x => x.saveEvery), every], ['3-coin screens (no bonus)', M(x => x.nearEvery), every],
  ], A, S);
  if (tab === 'hw') return rows([
    ['Hold & Win · base', s => s?.base?.bon.every, every], ['Hold & Win · Double Chance', s => s?.double?.bon.every, every],
    ['Average', M(x => x.bon.avgX), xx], ['Median', M(x => x.bon.medX), xx], ['1 in 10 under', M(x => x.bon.p10X), xx], ['1 in 10 over', M(x => x.bon.p90X), xx], ['1 in 100 over', M(x => x.bon.p99X), xx],
    ['500×+ bonuses', M(x => x.bon.t500), pc], ['1,000×+', M(x => x.bon.t1000), pc], ['2,000×+', M(x => x.bon.t2000), pc],
    ['Full House', M(x => x.bon.fh), pc, 'of bonuses'], ['Super', M(x => x.bon.supEvery), every], ['Super average', M(x => x.bon.supAvgX), xx],
    ...['MINI', 'MINOR', 'MAJOR', 'GRAND'].map(j => [`${j} per 100 bonuses`, M(x => x.bon.jp[j].per100), f2]),
  ], A, S);
  if (tab === 'buys') return ['buy', 'superbuy'].map(k => `<h4>${k === 'buy' ? 'Buy' : 'Super Buy'} · ${S[k] ? xx(S[k].priceX) : ''}</h4>` + rows([
    ['RTP', s => rtpCell(s?.[k]?.rtp, s?.[k]?.se ?? 0), x => x], ['Average', s => s?.[k]?.avgX, xx], ['Median', s => s?.[k]?.medX, xx], ['1 in 100 over', s => s?.[k]?.p99X, xx],
    ['Under half the price', s => s?.[k]?.half, pc], ['Under the price', s => s?.[k]?.under, pc], ['2× the price +', s => s?.[k]?.x2, pc], ['10× the price +', s => s?.[k]?.x10, pc],
    ['Buys measured', s => s?.[k]?.n, x => (x ?? 0).toLocaleString('en-GB')]], A, S)).join('');
  if (tab === 'sessions') return rows([
    ['500 spins · median return', M(x => 100 * x.sess.med500), pc], ['500 spins · finish up', M(x => x.sess.up500), pc],
    ['2,000 spins · median return', M(x => 100 * x.sess.med2000), pc], ['2,000 spins · finish up', M(x => x.sess.up2000), pc],
    ['2,000 spins · bonuses (middle 90%)', M(x => `${x.sess.bon5}–${x.sess.bon95}`)], ['2,000 spins · longest wait for a bonus', M(x => x.sess.gap2000), x => `${Math.round(x ?? 0)} spins`, 'typical session'],
    ['2,000 spins · biggest win', M(x => x.sess.big2000), xx, 'typical session'], ['Sessions measured', M(x => x.sess.n2000), x => `${x ?? 0}`],
  ], A, S);
  if (tab === 'gd') { const r = (l, v, rg, fmt = f2) => `<tr><td>${l}</td><td>${fmt(rg[0])}–${fmt(rg[1])}</td><td>${fmt(v)}</td><td>${inR(v, rg)}</td></tr>`, b = S.base, bu = S.buy;
    return `<table class="sm-t"><tr class="sm-h"><th></th><th>Golden Dragon</th><th>This</th><th></th></tr>${[
      r('Hit rate %', b.hit, GD.hit), r('Spins paying 1×+ %', b.bk.slice(2).reduce((a, x) => a + x.spins, 0), GD.ge1), r('Spins paying under 1× %', b.bk[0].spins + b.bk[1].spins, GD.sub1),
      r('Base-game return (lines + Loco Spin) %', b.parts.small + b.parts.line1 + b.parts.curtain + b.parts.loco, GD.baseRet),
      r('Spins winning 10–20× %', b.bk[5].spins, GD.b1020), r('Spins winning 20–50× %', b.bk[6].spins, GD.b2050),
      r('Hold & Win, 1 in', b.bon.every, GD.bonEvery, x => Math.round(x)), r('Screens 1 coin short %', b.short[0], GD.short3), r('Screens 2 short %', b.short[1], GD.short2), r('Screens 3 short %', b.short[2], GD.short1),
      r('Buy RTP %', bu.rtp, GD.buyRtp, f1), r('Buy average ×', bu.avgX, GD.buyMean, f1), r('Buys paying the price + %', 100 - bu.under, GD.buyPrice, f1), r('Buys under half the price %', bu.half, GD.buyHalf, f1), r('Buys paying 2×+ %', bu.x2, GD.buyX2, f1),
    ].join('')}</table><p class="sm-cap">Golden Dragon ranges from the 28 Oct harvest (10,000 spins, 400 buys). Its Loco-like wild reel isn't comparable with Poco's Loco Spin, so it's left out.</p>`; }
  if (tab === 'graphs') {
    const P = (s) => s?.[mode], pa = P(A), pb = P(S);
    const cap = t => `<p class="sm-cap">${t}</p>`;
    const partsL = [['small', 'small line wins'], ['line1', 'line wins 1×+'], ['curtain', 'curtains'], ['loco', 'Loco Spin'], ['hw', 'Hold & Win'], ['sup', 'Super']];
    const rtpRows = ['base', 'double'].flatMap(k => [...(A ? [{ label: `A · ${k === 'base' ? 'base' : 'Double'}`, v: A[k].parts }] : []), { label: k === 'base' ? 'base' : 'Double', v: S[k].parts }]);
    const whatL = [['nothing', 'nothing'], ['coins', 'coins only'], ['sub', 'win < stake'], ['curtain', 'curtain'], ['win1', 'win 1×+'], ['loco', 'Loco Spin'], ['near', 'near miss'], ['bonus', 'bonus']];
    const band = { '10–20×': GD.b1020, '20–50×': GD.b2050 };
    const hb = pb.bon.hist, buyG = k => bars(S[k].hist.h.map((v, i) => ({ label: `${f1(S[k].hist.max * i / S[k].hist.h.length)}`, a: A ? A[k].hist.h[i] * 100 : null, b: v * 100 })), { labels: S[k].hist.h.map((_, i) => (i % 4 === 0 ? `${Math.round(S[k].hist.max * i / S[k].hist.h.length)}×` : '')), fmt: f1 });
    const cs = pb.cur.sym, ca = pa?.cur.sym, names = { L1: 'Ring', L2: 'Guitar', L3: 'Maracas', M1: 'Bandido', H2: 'Catrina', H1: 'Mariachi', W: 'Wild' }, ct = o => Object.values(o || {}).reduce((a, x) => a + x, 0) || 1;
    return [
      `<h4>1 · Where the RTP comes from</h4>${stack(rtpRows, partsL)}${cap('Points of RTP from each part of the game, per mode. Jackpots and Full House are inside the Hold & Win figures.')}`,
      `<h4>2 · Base-game win sizes</h4>${bars(BKL.map((l, i) => ({ label: l, a: pa ? pa.bk[i].spins : null, b: pb.bk[i].spins })), { fmt: f2, band })}${cap('% of spins in each win size (of the stake). Green bands: Golden Dragon.')}`
        + `${bars(BKL.map((l, i) => ({ label: l, a: pa ? pa.bk[i].rtp : null, b: pb.bk[i].rtp })), { fmt: f1 })}${cap('Points of RTP carried by each win size.')}`,
      `<h4>3 · What happens on a spin</h4>${stack([...(A ? [{ label: 'A', v: pa.what }] : []), { label: A ? 'B' : 'spins', v: pb.what }], whatL)}${cap('Out of every 100 spins: the first of these that applies to the spin.')}`,
      `<h4>4 · Session paths (2,000 spins)</h4>${fan(pb.sess, pa?.sess)}${cap('Balance over a session, in stakes: median line, middle 50% and 90% bands, and a few real sessions drawn faintly.')}`,
      `<h4>5 · Gaps between bonuses</h4>${bars(pb.bon.gapHist.h.map((v, i) => ({ label: `${i}`, a: pa ? (pa.bon.gapHist.h[i] ?? 0) * 100 : null, b: v * 100 })), { labels: pb.bon.gapHist.h.map((_, i) => (i % 5 === 0 ? `${Math.round(pb.bon.gapHist.max * i / pb.bon.gapHist.h.length)}` : '')), fmt: f1 })}${cap(`Spins between Hold & Wins (% of gaps). Median ${Math.round(pb.bon.gapMed)}; 1 in 10 waits over ${Math.round(pb.bon.gap10)}.`)}`,
      `<h4>6 · Hold & Win results</h4>${bars(hb.h.map((v, i) => ({ label: `${hb.edges[i]}`, a: pa ? pa.bon.hist.h[i] * 100 : null, b: v * 100 })), { labels: hb.edges.slice(0, -1).map(e => `${e}×`), fmt: f1 })}${cap(`Natural bonus wins (% of bonuses). Median ${xx(pb.bon.medX)}, average ${xx(pb.bon.avgX)}, 1 in 10 over ${xx(pb.bon.p90X)}, 1 in 100 over ${xx(pb.bon.p99X)}.`)}`,
      `<h4>7 · Buy results vs the price</h4>${buyG('buy')}${cap(`Buy (${xx(S.buy.priceX)}): % of buys by result. Under half ${pc(S.buy.half)}, under the price ${pc(S.buy.under)}, 2×+ ${pc(S.buy.x2)}.`)}${buyG('superbuy')}${cap(`Super Buy (${xx(S.superbuy.priceX)}): under half ${pc(S.superbuy.half)}, under the price ${pc(S.superbuy.under)}, 2×+ ${pc(S.superbuy.x2)}.`)}`,
      `<h4>8 · Curtains</h4>${bars(Object.keys(names).map(k => ({ label: names[k], a: ca ? 100 * (ca[k] || 0) / ct(ca) : null, b: 100 * (cs[k] || 0) / ct(cs) })), { fmt: f1 })}${cap(`What curtains reveal (% of curtains). ${pc(pb.cur.pay)} pay; ${pc(100 * pb.cur.pay1 / (pb.cur.all || 1))} pay 1×+, ${pc(100 * pb.cur.pay10 / (pb.cur.all || 1))} pay 10×+.`)}`,
      `<h4>9 · Jackpots</h4>${bars(['MINI', 'MINOR', 'MAJOR', 'GRAND'].map(j => ({ label: j, a: pa ? pa.bon.jp[j].per10k : null, b: pb.bon.jp[j].per10k })), { fmt: f2 })}${cap('Jackpots won per 10,000 spins (per 100 bonuses on the Hold & Win tab).')}`,
    ].join('');
  }
  return '';
}

function render() {
  if (!el) return;
  const S = snapOf(cur.profile), A = pinned()?.snap && cur.compare ? pinned().snap : null;
  const tabs = [['overview', 'Overview'], ['base', 'Base game'], ['hw', 'Hold & Win'], ['buys', 'Buys'], ['sessions', 'Sessions'], ['graphs', 'Graphs'], ['gd', 'vs Golden Dragon']];
  const status = !S ? 'Starting…' : S.done ? 'Finished · stored on this device' : busy ? 'Paused while a round plays' : `Measuring… ${(S.base.n / 1000).toFixed(0)}k spins so far`;
  const scroll = el.querySelector('.sm-body')?.scrollTop ?? 0;
  el.innerHTML = `<div class="sm-box" role="dialog" aria-label="Summary"><div class="sm-top"><div><b>SUMMARY</b><span>${cur.label}</span></div><button class="sm-x" data-a="close" aria-label="Close">✕</button></div>
    <div class="sm-tabs">${tabs.map(([k, l]) => `<button data-t="${k}" class="${tab === k ? 'on' : ''}">${l}</button>`).join('')}</div>
    <div class="sm-bar"><span class="sm-st">${status}</span>${['base', 'hw', 'sessions', 'graphs'].includes(tab) ? `<span class="sm-mode"><button data-m="base" class="${mode === 'base' ? 'on' : ''}">Base</button><button data-m="double" class="${mode === 'double' ? 'on' : ''}">Double Chance</button></span>` : ''}
      <span class="sm-cmp"><button data-a="pin">${pinned()?.profile === cur.profile ? 'Pinned as A' : 'Pin as A'}</button>${pinned() && pinned().profile !== cur.profile ? `<button data-a="cmp" class="${cur.compare ? 'on' : ''}">Compare with A</button>` : ''}</span></div>
    ${A ? `<div class="sm-ab">A: ${pinned().label} · B: ${cur.label}</div>` : ''}
    <div class="sm-body">${S && S.base.n > 20000 ? tabHtml(S, A) : '<p class="sm-cap">The first figures appear in a few seconds…</p>'}<p class="sm-val"></p></div></div>`;
  el.querySelector('.sm-body').scrollTop = scroll;
}
/** open the window for a combination; label = a short description of it */
export function openSummary(profile, label) {
  measure(profile);
  const pin = pinned(); cur = { profile, label, compare: !!pin && pin.profile !== profile };
  el?.remove(); el = document.createElement('div'); el.id = 'summary';
  el.addEventListener('click', ev => { ev.stopPropagation(); const b = ev.target.closest('button'), v = ev.target.closest('[data-v]');
    if (v) { const p = el.querySelector('.sm-val'); if (p) p.textContent = v.dataset.v; }
    if (ev.target === el) { close(); return; }
    if (!b) return;
    if (b.dataset.a === 'close') return close();
    if (b.dataset.t) tab = b.dataset.t; if (b.dataset.m) mode = b.dataset.m;
    if (b.dataset.a === 'pin') { const s = snapOf(profile); if (s) store.set(PIN, { profile, label, snap: s }); cur.compare = false; }
    if (b.dataset.a === 'cmp') cur.compare = !cur.compare;
    render(); });
  (document.querySelector('#stage') || document.body).append(el);
  render();
  // the pinned A keeps its latest figures
  const pin2 = pinned(); if (pin2 && pin2.profile !== profile) { const s = snapOf(pin2.profile); if (s && s.at > (pin2.snap.at || 0)) store.set(PIN, { ...pin2, snap: s }); }
}
export function close() { el?.remove(); el = null; }

/** v0.75b: stop the background measurement when nothing is showing it (it kept running between rounds once a card or the
 *  Summary had been opened - work a budget phone does not need while playing). Measurement restarts when reopened. */
export function stopIfUnseen(seen) { if (seen || !worker) return; worker.terminate(); worker = null; }
