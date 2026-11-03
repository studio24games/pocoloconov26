// v0.71 (checklist 18): the info card behind every test-menu row. Text explains the row; the numbers are never typed in:
// they are the live measurement of the combination currently chosen in the menu (js/summary-worker.js), so a change shows
// its effect before APPLY. what = what it changes; lv = each level; watch = what to look for; with = interactions;
// rtp = its effect on RTP; live(s, m) = the row's own measured figures [label, value] for snapshot s, mode m.
const x = v => (v == null || !isFinite(v) ? '–' : `${v >= 100 ? Math.round(v) : v.toFixed(v >= 10 ? 1 : 2)}×`);
const pc = v => (v == null || !isFinite(v) ? '–' : `${v.toFixed(1)}%`);
const ev = v => (!v || !isFinite(v) ? '–' : `1 in ${v >= 100 ? Math.round(v) : v.toFixed(1)}`);
const HELD = 'RTP held: the final balance (v0.71) trims the bonus spread so every combination lands near 96.8%.';
const PRES = 'Presentation only: no effect on outcomes or RTP.';
export const CARDS = {
  version: { what: 'How often the base game pays something smaller than the stake.', lv: ['Fewer · 13%: about 13% of spins pay under the stake; the three lows pay 0.08× each.', 'GD · 22%: Golden Dragon-like: about 22% of spins pay under the stake; the Guitar pays 0.20×.'],
    watch: 'Does the base game feel alive between bigger moments, or busy with wins that don\'t matter?', with: 'Bandido pays and Curtain reveals change the same part of the game.', rtp: HELD,
    live: (s, m) => [['Hit rate', pc(s[m].hit)], ['Wins under the stake', pc(s[m].bk[0].spins + s[m].bk[1].spins)], ['Nothing happens', pc(s[m].nothing)]] },
  curtains: { what: 'How often a curtain spreads to a second reel.', lv: ['Single: curtains cover one reel.', 'A · 22%: a share of curtains cover two reels.', 'B · 36%: two-reel curtains more often.'],
    watch: 'Does a two-column curtain feel like an event?', with: 'Curtain reveals sets what two-reel curtains reveal; Curtain rate sets how often curtains come.', rtp: HELD,
    live: (s, m) => [['Curtains', ev(s[m].cur.every)], ['Two-reel curtains', ev(s[m].cur.twoEvery)]] },
  cv: { what: 'What a curtain can reveal.', lv: ['Premium only: Mariachi or Catrina, now and then a Wild (most pay nothing).', 'Mixed: every symbol, about 45% lows, Bandido 25%, premiums and Wild the rest.', 'GD-like: mostly lows, like Golden Dragon\'s mystery.'],
    watch: 'The "will it match?" moment. Does an open reveal light up a line often enough, without feeling cheap?', with: 'Curtain rate (how often); Bandido pays (Bandido reveals pay his level). Suggested: Bandido Mid + Mixed + Standard (default); Stake + Mixed + Rare; As now + GD-like + Often.', rtp: 'Curtains keep their share of the RTP (frequency is fitted), then the final balance.',
    live: (s, m) => [['Curtains', ev(s[m].cur.every)], ['Curtains that pay', pc(s[m].cur.pay)], ['Average curtain win', x(s[m].cur.avgX)]] },
  cfreq: { what: 'How often curtains come, against how much they pay.', lv: ['Rare · pays more: about a third fewer curtains; the reveal is always one that lights a line (it can still be a small line).', 'Standard: as now.', 'Often · small blocks: 2–3-square curtains on about 1 spin in 4, mostly low symbols, on top of the full curtains.'],
    watch: 'Rare: is every curtain an event? Often: does the base game get Golden Dragon\'s texture, or become noise?', with: 'Curtain reveals; Curtains (two-reel share).', rtp: 'Curtains keep their share of the RTP (fitted), then the final balance.',
    live: (s, m) => [['Full curtains', ev(s[m].cur.every)], ['Small blocks', ev(s[m].cur.smallEvery)], ['Curtains that pay', pc(s[m].cur.pay)]] },
  loco: { what: 'The Loco Spin (wild reel).', lv: ['Rare · big: about 1 in 90 spins, average about 9×.', 'Often · small: Golden Dragon-like, about 1 in 34, average about 4×.'],
    watch: 'Is the Loco Spin a moment, or texture?', with: 'Mid wins changes how often a Loco Spin pays 10–50×.', rtp: HELD,
    live: (s, m) => [['Loco Spin', ev(s[m].loco.every)], ['Average / median', `${x(s[m].loco.avgX)} / ${x(s[m].loco.medX)}`]] },
  top: { what: 'Trims the very top of natural bonuses to free RTP for the base game.', lv: ['As now.', '600×+ half: natural bonuses of 600×+ come half as often; the freed RTP goes where Freed RTP says.'],
    watch: 'Does the base game gain more than the rare huge bonus loses?', with: 'Needed by Freed RTP.', rtp: HELD,
    live: (s, m) => [['Bonuses 500×+', pc(s[m].bon.t500)], ['Bonuses 1,000×+', pc(s[m].bon.t1000)]] },
  fdest: { what: 'Where the RTP freed by "Top wins 600×+ half" goes.', lv: ['More: more curtains.', 'Pay more: Wild reveals about twice as likely, so more curtains pay (works with every Curtain reveals level).', '×2 wins: some paying curtains double.'],
    watch: 'Which feels best: more curtains, or better ones?', with: 'Only with Top wins 600×+.', rtp: HELD,
    live: (s, m) => [['Curtains', ev(s[m].cur.every)], ['Curtains that pay', pc(s[m].cur.pay)], ['Average curtain win', x(s[m].cur.avgX)]] },
  band: { what: 'What a line of Bandidos pays. He lands less often as he pays more, so the hit rate holds: the lines he loses come back as Guitar and Ring lines.', lv: ['As now: 0.52× (Fewer small wins) / 0.28× (GD).', 'Mid: 0.75×.', 'Stake: 1×, the same as the Catrina.'],
    watch: 'Does a Bandido line now feel like a premium win? Does Bandido = Catrina at Stake feel wrong?', with: 'Curtain reveals: Bandido reveals pay his level.', rtp: HELD,
    live: (s, m) => [['Hit rate', pc(s[m].hit)], ['Spins paying 1×+', pc(s[m].bk.slice(2).reduce((a, b) => a + b.spins, 0))]] },
  mid: { what: 'How often a Loco Spin pays 10–50× (Golden Dragon rows F and G).', lv: ['Fewer: Loco Spins of 10×+ about 0.6× as often.', 'As now.', 'More: about 1.6× as often.'],
    watch: 'Do the 10–50× wins feel like a step up from line wins, and how often?', with: 'Loco Spin. The RTP moved comes from / goes to the bonus (balance).', rtp: HELD,
    live: (s, m) => [['Spins winning 10–20×', pc(s[m].bk[5].spins)], ['Spins winning 20–50×', pc(s[m].bk[6].spins)]] },
  near: { what: '"One coin short" screens. Extra non-paying third coins land on some two-coin spins.', lv: ['As now: about 1 spin in 25.', 'More: about 1 in 17.', 'GD-like: about 1 in 10 (Golden Dragon shows them 2–3× as often as Poco now).'],
    watch: 'Tension, or nagging? Flames still show whenever reels 1–2 hold 3 coins.', with: 'Coin Save and Hold & Win frequency don\'t change. With Super = Meter, only natural near misses light a candle.', rtp: 'Almost none (these coins pay nothing); balance as usual.',
    live: (s, m) => [['3-coin screens', ev(s[m].nearEvery)], ['Coin Save', ev(s[m].saveEvery)], ['Hold & Win', ev(s[m].bon.every)]] },
  wpop: { what: 'Base-game wins shown large over the grid, then swooshed into the win bar.', lv: ['Off.', '2×+: wins of 2× the stake or more.', '5×+: wins of 5× or more.'], watch: 'Quick enough for the pace of the game?', with: 'Win pop style. BIG WIN (15×+) keeps its own celebration.', rtp: PRES, live: (s, m) => [['Spins winning 2–10×', pc(s[m].bk[3].spins + s[m].bk[4].spins)]] },
  wpstyle: { what: 'The look of the win pop.', lv: ['Gold: gold numerals, the grid dims a little.', 'Plaque: on a dark plaque like the jackpots.', 'Burst: bigger, with a gold flare and sparks.'], watch: 'Legible over busy symbols?', with: 'Needs Win pop on.', rtp: PRES },
  bonus: { what: 'How often the Hold & Win comes.', lv: ['Often: about 1 in 92.', '1 in 110: as now.', 'Rare: about 1 in 150.'], watch: 'Wait between bonuses (Sessions tab, Graphs 5).', with: 'Bonuses are re-weighted so each level keeps the RTP.', rtp: HELD,
    live: (s, m) => [['Hold & Win', ev(s[m].bon.every)], ['Average bonus', x(s[m].bon.avgX)]] },
  fh: { what: 'When a Full House can happen.', lv: ['Any bonus.', 'Big wins: only in bonuses that already pay well (120×+ natural).'], watch: 'Is a Full House a special event?', with: '', rtp: HELD, live: (s, m) => [['Full House', `${pc(s[m].bon.fh)} of bonuses`]] },
  jp: { what: 'How often jackpot coins end a bonus.', lv: ['As now.', 'GD-like: MINOR and up more often, as in Golden Dragon.'], watch: 'Do jackpots feel reachable?', with: '', rtp: HELD,
    live: (s, m) => [['MINI / MINOR per 100 bonuses', `${s[m].bon.jp.MINI.per100.toFixed(1)} / ${s[m].bon.jp.MINOR.per100.toFixed(1)}`], ['MAJOR / GRAND per 100', `${s[m].bon.jp.MAJOR.per100.toFixed(2)} / ${s[m].bon.jp.GRAND.per100.toFixed(2)}`]] },
  st: { what: 'How often the Super tease (the last-hole build-up) really lands the Super coin.', lv: ['1 in 2.', '1 in 3: as now.', '1 in 4.'], watch: 'Does the tease still make you lean in?', with: '', rtp: PRES },
  super: { what: 'How a Super Hold & Win starts.', lv: ['Random: any natural bonus can become a Super.', 'Meter: near misses light candles; the bonus after a full meter is the Super.'], watch: 'Does the meter give a reason to keep spinning?', with: 'Near misses: added near misses light no candle.', rtp: HELD, live: (s, m) => [['Super', ev(s[m].bon.supEvery)], ['Super average', x(s[m].bon.supAvgX)]] },
  shape: { what: 'How bonus results are spread around the same average.', lv: ['Steady: fewer tiny and fewer huge bonuses.', 'Standard: as originally fitted.', 'Volatile: more small and more big bonuses, fewer in the middle.'], watch: 'Graphs 6: the shape of bonus results.', with: '', rtp: HELD,
    live: (s, m) => [['Median / average', `${x(s[m].bon.medX)} / ${x(s[m].bon.avgX)}`], ['1 in 10 under / over', `${x(s[m].bon.p10X)} / ${x(s[m].bon.p90X)}`]] },
  bw: { what: 'What bought-bonus celebrations measure against.', lv: ['vs price.', 'vs bet.'], watch: '', with: '', rtp: PRES },
  spin: { what: 'Reel spin time and the gaps between reels stopping.', lv: ['Brisk: about 20% quicker.', 'As now.', 'Relaxed: about 20% slower.'], watch: 'Spins per minute against anticipation.', with: 'Near-miss and Loco Spin build-ups keep their own length.', rtp: PRES },
  wcount: { what: 'How long the Big Win count takes per level.', lv: ['As now.', 'Slower: 1.6× as long.', 'Slowest: 2× as long.'], watch: 'Will it cross the next level? Can you tell before it stops?', with: '', rtp: PRES },
  stats: { what: 'A small session-stats panel.', lv: ['Off.', 'On.'], watch: '', with: 'Two levels: it is a switch.', rtp: PRES },
  reveal: { what: 'The curtain reveal animation.', lv: ['Glow: the curtains snap open with a gold puff.', 'Swirl: the older swirl reveal.'], watch: '', with: '', rtp: PRES },
};
