import { baseSpin, params } from '/tmp/claude-0/-home-claude/20f16097-c239-5d4f-8bb8-2d54c7d83e37/scratchpad/wsp/math/engine.js'; import { SeededRNG } from '/tmp/claude-0/-home-claude/20f16097-c239-5d4f-8bb8-2d54c7d83e37/scratchpad/wsp/math/rng.js';
const N = +(process.env.N || 3000000);
for (const prof of ['standard', 'lean']) { const P = params(prof), M = P.MODES.base;
  for (const spread of (process.env.SP || '0,200,350,500').split(',').map(Number)) { const rng = new SeededRNG(5); const MY = { ...P.MYSTERY, ...(process.env.ONE ? { reveal: JSON.parse(process.env.ONE) } : {}), ...(process.env.BOOST ? { screenBoost: +process.env.BOOST } : {}), spread, revealTwo: process.env.TWO ? JSON.parse(process.env.TWO) : null };
    let q = 0, two = 0, qWin = 0, qPay = 0, twoPay = 0, onePay = 0, one = 0;
    for (let i = 0; i < N; i++) { const B = baseSpin(rng, M, P.LOCO, false, MY, P.PAYTABLE); if (!B.mystery) continue; q++;
      const rs = new Set(B.mystery.cells.map(c => c < 3 ? 0 : c < 7 ? 1 : 2)).size, w = B.lines.total;
      if (w > 0) qWin++; qPay += w; if (rs > 1) { two++; twoPay += w; } else { one++; onePay += w; } }
    console.log(JSON.stringify({ prof, spread: spread / 10 + '%', curtain1in: +(N / q).toFixed(1), twoReelShareOfCurtains: +(100 * two / q).toFixed(1), twoReel1in: Math.round(N / two),
      curtainSpinsPay: +(100 * qWin / q).toFixed(1) + '%', curtainRTPpts: +(qPay / N).toFixed(2), avgPayOneReel: +(onePay / one / 100).toFixed(2), avgPayTwoReels: +(twoPay / two / 100).toFixed(2) })); } }
