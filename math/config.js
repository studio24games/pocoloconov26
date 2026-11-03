// Game 002 — Hold & Win maths configuration (math 0.8.0, 29 Oct 2026; 0.7.0 27 Oct; 0.6.0 26 Oct; 0.5.0 25 Oct; 0.4.x 24-25 Oct; 0.3.0 23 Oct).
//
// UNITS: every pay value in this file is in "bet units" (BU): 1 BU = 1/100 of the BASE total bet.
//   e.g. 50 BU = 0.5x bet, 2000 BU = 20x bet. All engine arithmetic is integer.
//   The server converts to money with floor(BU * betMinor / 100).
//
// GEOMETRY: 3-4-3. Cell indices (used everywhere, incl. the client):
//   reel 0: rows 0..2 -> cells 0,1,2
//   reel 1: rows 0..3 -> cells 3,4,5,6
//   reel 2: rows 0..2 -> cells 7,8,9
//
// DESIGN (agreed 23 Oct, see the "Poco Loco: maths check and magic features" doc):
//   same money, different journeys, with momentum. Value moves from line pays and plain coin values into
//   visible events: frames that level up, a skull that adds value as the bonus goes on, a rarer Full House that
//   multiplies the win, and a Super bonus. Every value shown is a genuine draw.
//
// 0.8.0 (29 Oct): retuned to the play profile of Betsoft's Ultimate Golden Dragon Inferno (UGDI; see
// docs/UGDI_COMPARISON_2026-10-29.md and tools/math/ugdi_scorecard.mjs). No candle meter: the Super is a random
// upgrade of a natural trigger. More, smaller base wins; a frequent, smaller Loco Spin; Hold & Win about 1 spin in 110;
// UGDI-shaped bonus and buy; GRAND 2,000x (never doubled); base coins that can't trigger show more jackpot values.

import { STRIPS } from './strips.generated.js';

export const GAME_ID = 'S24-002';
export const MATH_VERSION = '0.11.0';   // v0.66: full-reel premium curtains, rarer bigger Loco Spin, the Experiment version (lean)

export const REEL_ROWS = [3, 4, 3];
export const CELL_COUNT = 10;
export const cellIndex = (reel, row) => [0, 3, 7][reel] + row;
export const cellPos = c => (c < 3 ? [0, c] : c < 7 ? [1, c - 3] : [2, c - 7]);

// 10 fixed lines, read left -> right as [row on reel0, row on reel1, row on reel2].
export const LINES = [
  [0, 0, 0], [0, 1, 0], [0, 1, 1], [1, 1, 0], [1, 1, 1],
  [1, 2, 1], [1, 2, 2], [2, 2, 1], [2, 2, 2], [2, 3, 2],
];

export const SYM = {
  WILD: 'W', H1: 'H1', H2: 'H2', M1: 'M1', L1: 'L1', L2: 'L2', L3: 'L3', COIN: 'C', MYSTERY: 'Q',
};

// 0.8.0 (item 3, UGDI's mystery stacks): Mystery symbols (Q, the marigold) sit in stacks on the reels. When the reels
// stop, every Mystery on screen turns into the same symbol, drawn from this table (never a Wild or a coin). Lows more
// often than highs, so most of the extra hits are small wins.
export const MYSTERY = {
  // v0.66 (30 Oct): curtains are rare and come in big blocks, and only ever reveal a premium symbol - the Mariachi or the
  // Catrina, now and then a Wild - so a curtain block landing next to a matching premium can make a real win.
  reveal: [['H1', 45], ['H2', 45], ['W', 10]],
  revealBig: [['H1', 45], ['H2', 45], ['W', 10]],
  bigFrom: 99,
  // a premium already on screen is (1 + screenBoost x its count) times as likely to be revealed (the "will it match?"
  // moment); 0 = off
  screenBoost: 2,
  expandReel: true,   // v0.66: a curtain anywhere on a reel draws across the whole reel (coins and Wilds stay)
}

// 3-of-a-kind line pays, in BU (per line, as a multiple of TOTAL bet).
// v0.66 (30 Oct): refitted with the full-reel curtains (reelopt63 gd_base): Wild 10.88x, Mariachi 3.04x, Catrina 1x (a
// single Catrina line now pays the stake back), Bandana 0.28x, lows 0.08-0.2x. The Experiment version has its own table
// (PROFILES.lean.PAYTABLE).
// 0.8.0 (29 Oct, item 3): a flat, UGDI-like table in whole coins (multiples of 4 BU = 1/25 bet): lows 0.08-0.28x so
// most line wins are small and frequent (about 1 spin in 4 pays a line, 19% of spins under 0.5x); the Mariachi 4.4x
// and Wild 8.2x are the line hits; the Catrina 0.96x keeps 1x+ wins near UGDI's 7%. Fitted with the reels by tools/math/reelopt63.mjs.
// 0.6.0 (26 Oct): small wins kept (lows 0.2-0.3x, the bandana 0.5x), the 1x pay gone (1-2x wins about 1 in 80 spins),
// the money moved into 2x+ wins (Catrina 2x, Mariachi 6.5x, Wild 30x). Line wins carry about 26% of RTP; the Loco Spin
// (about 10 points) carries many of the base game's 5x+ wins.
export const PAYTABLE = {
  W: 1088, H1: 304, H2: 100, M1: 28, L1: 20, L2: 8, L3: 8,
};

// Jackpot face values. In a bonus the skull can double a plaque (0.4.0): once per plaque in a standard bonus, up to x4
// in a Super bonus. The doubled value lasts until that bonus ends.
// 0.8.0 (item 8): MAJOR 100x -> 200x, GRAND 500x -> 2,000x (top / bottom 100, UGDI 133). The GRAND is fixed: the skull
// never doubles it.
export const JACKPOTS = { MINI: 2000, MINOR: 5000, MAJOR: 20000, GRAND: 200000 };
export const JACKPOT_KEYS = ['MINI', 'MINOR', 'MAJOR', 'GRAND'];
export const JACKPOT_FIXED = ['GRAND'];

// Coin value tables: [[valueOrJackpotKey, integerWeight], ...]
// Feature coins depend on how full the grid is when they land ("early" up to 5 held, "late" 6-7, "last" 8-9), so a
// bonus that is filling up looks modest until the Full House multiplier lifts it. Stated in the game rules.
export const COIN_TABLES = {
  // Pot collectors (3 Nov): the coins a base-game pot collects - the base table without the GRAND
  potBase: [
    [50, 1205], [100, 1805], [200, 1600], [300, 1400], [500, 1300], [800, 798], [1000, 293],
    ['MINI', 95], ['MINOR', 22], ['MAJOR', 4],
  ],
  // Coins landing in the paid base game (they start the bonus).
  // 0.5 (25 Oct): jackpots half as often in the base game, so a bonus rarely starts with one (about 1 in 8); they land in the respins instead
  // 0.8.0 (item 10, UGDI): these are the values on coins that START a bonus (UGDI shows jackpots on 1.4% of them).
  base: [
    [50, 1205], [100, 1805], [200, 1600], [300, 1400], [500, 1300], [800, 798], [1000, 293],
    ['MINI', 95], ['MINOR', 22], ['MAJOR', 4], ['GRAND', 1],
  ],
  // 0.8.0 (item 10, UGDI): coins on a spin that does NOT start the bonus (they pay nothing). Jackpot plaques on about
  // 17% of them, average about 11x (UGDI: 17%, 9.6x).
  tease: [
    [50, 900], [100, 1300], [200, 1300], [300, 1100], [500, 1100], [800, 900], [1000, 700],
    ['MINI', 1000], ['MINOR', 400], ['MAJOR', 60], ['GRAND', 10],
  ],
  // 0.4.0: coins no longer thin out as the grid fills ("late" = "early"; "last" only slightly smaller), and fewer
  // straight MAJORs land: the skull's jackpot doubling (a doubled MINOR is worth a MAJOR) takes their place.
  // 0.5: more MINORs in the respins (the skull can double one already on the grid: an upgrade story)
  early: [
    [50, 950], [100, 1805], [200, 1600], [300, 1400], [500, 1300], [800, 798], [1000, 293],
    ['MINI', 420], ['MINOR', 250], ['MAJOR', 18], ['GRAND', 3],
  ],
  late: [
    [50, 950], [100, 1805], [200, 1600], [300, 1400], [500, 1300], [800, 798], [1000, 293],
    ['MINI', 420], ['MINOR', 250], ['MAJOR', 18], ['GRAND', 3],
  ],
  last: [
    [50, 1400], [100, 1900], [200, 1600], [300, 1300], [500, 1150], [800, 650], [1000, 230],
    ['MINI', 380], ['MINOR', 90], ['MAJOR', 12], ['GRAND', 3],
  ],
  // Super bonus (0.4.1): fewer 0.5x / 1x coins than the standard bonus (replaces the old hidden value scale).
  superEarly: [
    [50, 800], [100, 1560], [200, 1600], [300, 1400], [500, 1300], [800, 798], [1000, 293],
    ['MINI', 420], ['MINOR', 100], ['MAJOR', 14], ['GRAND', 3],
  ],
  superLast: [
    [50, 960], [100, 1638], [200, 1600], [300, 1300], [500, 1150], [800, 650], [1000, 230],
    ['MINI', 380], ['MINOR', 90], ['MAJOR', 12], ['GRAND', 3],
  ],
  // Faster pace comparison build (0.4.1): many more 0.5x / 1x coins and fewer jackpots: a smaller, more frequent bonus.
  paceEarly: [
    [50, 2500], [100, 2500], [200, 1600], [300, 1400], [500, 1300], [800, 798], [1000, 293],
    ['MINI', 260], ['MINOR', 110], ['MAJOR', 12], ['GRAND', 2],
  ],
  paceLast: [
    [50, 2750], [100, 2625], [200, 1600], [300, 1300], [500, 1150], [800, 650], [1000, 230],
    ['MINI', 234], ['MINOR', 99], ['MAJOR', 10], ['GRAND', 2],
  ],
  // Bought bonus (0.4.0): no 0.5x / 1x / 2x coins, so a bought bonus rarely collects a run of small values, and
  // jackpots a little less often than in a natural bonus. With the buy's own frames, collectors and jackpot doubling
  // (MODES.buy.feature) this keeps the agreed shape: typical buy ~77x, ~1 in 8 under 50x, ~1 in 8 at 150x+.
  // 0.5 bought bonus starting coins (4 mostly): 5x / 8x / 10x cash, a jackpot rarely, so every buy opens with 20x+ on the grid
  buyStart: [
    [500, 1500], [800, 1200], [1000, 600], ['MINI', 60], ['MINOR', 12],
  ],
  // 0.5 bought bonus respin coins: smaller cash values, more MINOR / MAJOR (the floor comes from the stronger starting coins)
  // v0.68 option jpGD (menu: Jackpots "GD-like"): jackpot coins about as often as in Golden Dragon - bought rounds end with
  // a MINI / MINOR / MAJOR+ about 40 / 30 / 5.6% of the time (was about 19 / 14 / 0.6%), natural rounds with a MINOR
  // about 18% (was 8%). The bonus shapes keep every total's spread, so the payout is unchanged.
  gdBuyEarly: [
    [200, 1900], [300, 2000], [500, 1100], [800, 300], [1000, 60], ['MINI', 480], ['MINOR', 700],
    ['MAJOR', 230], ['GRAND', 4],
  ],
  gdBuyLast: [
    [300, 1129], [500, 1300], [800, 700], [1000, 250],
    ['MINI', 1400], ['MINOR', 330], ['MAJOR', 86], ['GRAND', 4],
  ],
  gdEarly: [
    [50, 950], [100, 1805], [200, 1600], [300, 1400], [500, 1300], [800, 798], [1000, 293],
    ['MINI', 420], ['MINOR', 950], ['MAJOR', 18], ['GRAND', 3],
  ],
  gdLast: [
    [50, 1400], [100, 1900], [200, 1600], [300, 1300], [500, 1150], [800, 650], [1000, 230],
    ['MINI', 380], ['MINOR', 340], ['MAJOR', 12], ['GRAND', 3],
  ],
  buyEarly: [
    [200, 1900], [300, 2000], [500, 1100], [800, 300], [1000, 60], ['MINI', 100], ['MINOR', 150],
    ['MAJOR', 24], ['GRAND', 2],
  ],
  buyLate: [
    [200, 1900], [300, 2000], [500, 1100], [800, 300], [1000, 60], ['MINI', 100], ['MINOR', 150],
    ['MAJOR', 24], ['GRAND', 2],
  ],
  buyLast: [
    [300, 1129], [500, 1300], [800, 700], [1000, 250],
    ['MINI', 296], ['MINOR', 70], ['MAJOR', 9], ['GRAND', 2],
  ],
};

// Multiplier ladder. A frame levels up one step when a coin lands on it, or when the skull levels it.
export const FRAME_LADDER = [2, 3, 5, 10, 20, 50, 100];
// Full House multiplier steps. Standard bonus: fixed x2. Super bonus: starts at x3 and the skull steps it up.
export const FULL_HOUSE_STEPS = [2, 3, 4, 5, 7, 10];

// Standard Hold & Win.
export const FEATURE = {
  triggerCount: 4,
  // Coin Save on exactly 3 base-game coins (num is per mode: MODES.*.rescue3Num).
  rescue3: { den: 1000, add: [[1, 85], [2, 15]] },
  // Chance (num/den) that EACH empty cell lands a coin on a respin, by coins already held.
  // 0.4.0: 8 and 9 held are lower so the Full House is rarer (about 1 bonus in 20-25).
  cellHit: { den: 1000, byHeld: { 3: 102, 4: 102, 5: 104, 6: 106, 7: 108, 8: 9, 9: 7 } },
  lives: 3,
  rescueFail: { share: 0.2 }, // cosmetic share of Coin Save animations that fizzle
  rescueDead: { num: 22, den: 100, add: [[1, 90], [2, 10]] },
  // Opening frames: 1-2, mostly x2 / x3. The skull adds bigger ones as the bonus goes on (momentum).
  openingFrames: { count: [[1, 60], [2, 40]], mult: [[2, 65], [3, 35]] },
  // Skull frame drops during the bonus: chance per respin rises with the respin number (momentum).
  // num/den = min(start + perRespin * (index - 1), cap) / 1000. 0.4.0: fewer x2s, more x5 / x10, rare x20 / x50.
  // Frames of x`bigOnEmpty.from`+ go to an empty position `num` times in 1000 (they still have to be won).
  frames: { start: 130, perRespin: 25, cap: 350, den: 1000, max: 6,
    mult: [[2, 160], [3, 230], [5, 320], [10, 300], [20, 60], [50, 25]], bigOnEmpty: { from: 10, num: 1000 } }, // 0.5: x10 in about 1 bonus in 2
  levelMax: 10, // 0.4.0: coins step frames up to x10; x20 / x50 only arrive as skull drops on empty positions
  multiplyJackpots: true, // a jackpot on a multiplier is always multiplied
  // How often a coin landing on a frame is a jackpot, per mille of the normal weight, by frame value: more often on x2,
  // much less on x10 and above. Frames of x5 or more are not placed on a jackpot already held. Stated in the rules.
  framedJackpots: { 2: 1500, 3: 900, 5: 450, 10: 150, 20: 80, 50: 50, 100: 50 },
  framesAvoidJackpots: 5,
  // Occasional jackpot doubling: chance per respin, then which plaque doubles (each plaque at most `jackpotDoubles` times).
  jackpotGrow: { num: 34, den: 1000, which: [['MINI', 30], ['MINOR', 55], ['MAJOR', 12]] },   // 0.8.0: never the GRAND
  jackpotDoubles: 1,
  jackpotHeldPick: 850, // 0.5: with a jackpot coin on the grid, the skull doubles that one 85% of the time (upgrade story)
  collector: null, // 0.5 (25 Oct): collector coin removed
  fullHouseMult: 2,
  // 0.8.0 (item 1): the Super's touches now and then in a standard bonus - a 4th life (num in 1000 bonuses) or a x10
  // opening frame. The payout shape (SHAPES.standard) is unchanged by them.
  sprinkle: { fourthLife: 50, bigOpen: { num: 30, mult: [[10, 1]] } },
};

// Super Hold & Win. 0.8.0 (item 1): a random upgrade of a natural trigger, decided when the trigger lands (`upgrade`,
// num / den; a mode can override num with MODES.*.superNum). It carries the top of the bonus range (SHAPES.super).
export const SUPER = {
  upgrade: { num: 11, den: 100 },
  lives: 4,
  // Opening: 4 frames, one x10 and three x2.
  openingFrames: { count: [[4, 1]], first: [[10, 1]], mult: [[2, 1]],
    // v0.62j (client): variety - one of five opening sets of equal value (each simulated alone at the same Super buy
    // RTP, 300k each: 96.51 / 96.74 / 96.41 / 96.82 / 96.45 %); about 1 Super in 4 opens with no x10 (two x5s instead)
    // Super buy (4-6 start coins): 96.51 / 96.74 / 96.41 / 96.82 / 96.45 % each; mix 96.59 % = current 96.59 % (800k each)
    setsBuy: [[[10, 2, 2, 2], 25], [[10, 3, 2, 2], 20], [[10, 5, 2, 2], 20], [[10, 3, 3, 2], 10], [[5, 5, 3, 3, 2], 25]],
    // meter Super (3 start coins): 198.1 / 197.8 / 197.0 / 196.1 / 201.1x each; mix 198.1x = current 198.1x (250k each)
    // 0.8.0: a natural Super now starts from 4+ coins like the Super buy, so it uses the same opening sets
    sets: [[[10, 2, 2, 2], 25], [[10, 3, 2, 2], 20], [[10, 5, 2, 2], 20], [[10, 3, 3, 2], 10], [[5, 5, 3, 3, 2], 25]] },
  openingJackpot: [['MINI', 40], ['MINOR', 35], ['MAJOR', 25]], // one plaque doubled at the start (0.8.0: never the GRAND)
  jackpotDoubles: 2, // a plaque can double twice in a Super bonus (x4)
  collector: null, // 0.5: removed
  jackpotHeldPick: 700,
  bigOnEmpty: { from: 10, num: 850 },
  fullHouseStart: 3,
  // A Super Full House should stay special despite the 4th life: lower late-fill chances than the standard bonus.
  cellHit: { byHeld: { 8: 28, 9: 18 } },
  max: 10, // frames: every square can be framed
  levelMax: 20, // level-ups stop at x20; x50 and x100 only arrive as rare skull drops late in the bonus
  // The skull acts as host on most dead respins and some landing ones; bigger actions late in the bonus.
  act: { dead: 600, landed: 250, den: 1000 },
  late: { held: 7, respin: 7 }, // late phase starts at 7 held or respin 7
  actions: {
    early: [['frame', 35], ['level', 15], ['jackpot', 45], ['fullHouse', 5]],
    late: [['frame', 35], ['level', 15], ['jackpot', 35], ['fullHouse', 15]], // 0.4.0: collector coins replace the skull pot
  },
  frameMult: {
    early: [[2, 60], [3, 30], [5, 10]],
    late: [[2, 60], [3, 60], [5, 30], [10, 8], [20, 2], [50, 1], [100, 1]],
  },
  jackpotWhich: {
    early: [['MINI', 50], ['MINOR', 35], ['MAJOR', 15]],
    late: [['MINI', 30], ['MINOR', 35], ['MAJOR', 35]],
  },
  framedJackpots: FEATURE.framedJackpots,
  framesAvoidJackpots: FEATURE.framesAvoidJackpots,
  tables: { early: 'superEarly', late: 'superEarly', last: 'superLast' }, // 0.4.1: Super's own coin weights
};

// 0.8.0: the Calavera candle meter is removed (item 1); see SUPER.upgrade.

// Loco Spin. v0.66 (30 Oct): rarer and bigger - about 1 base spin in 90 the Mariachi turns the middle reel fully Wild,
// adds 0-3 extra Wilds on the outer reels and reveals a multiplier. Its pay follows SHAPES.loco: never under 4x,
// typical about 6.5x, average about 9.7x, at most 50x (0.8.0 was UGDI's frequent, small wild reel: 1 in 36, typical
// 2.4x - too small for the build-up).
export const LOCO = { num: 1, den: 90,
  wilds: [[0, 30], [1, 35], [2, 25], [3, 10]], mult: [[2, 740], [3, 160], [5, 65], [8, 25], [10, 14]] };

// Prize-led shapes (see shapedDraw in engine.js). Bands are lower edges in BU; `w` are integer weights per band (a
// complete play in band b is kept with chance w[b] / max w, otherwise drawn again). null = natural.
// 0.8.0 (items 1, 4, 6): fitted by tools/math/fit63.mjs to UGDI's measured payouts.
//  - standard + super together = UGDI's natural Hold & Win (1 in 10 under 9x, median 68x, 1 in 10 over 117x, 1 in 100
//    over about 255x); the Super (SUPER.upgrade, 11% of bonuses) is most of the top: never under 90x, average about 162x.
//  - buy = UGDI's bought rounds in x bet (1 in 10 under 19x, median 65x, 1 in 10 over 145x, average about 78x).
export const SHAPES = {
  standard: { edges: [0, 1000, 2000, 3000, 4500, 6000, 7500, 9000, 10500, 12000, 15000, 20000, 25000, 35000, 50000, 100000, 200000],
    w: [93410, 15436, 13852, 18403, 35492, 62884, 100000, 96589, 88097, 14694, 6273, 3831, 1524, 1419, 794, 1000, 277] },
  super: { edges: [0, 1000, 2000, 3000, 4500, 6000, 7500, 9000, 10500, 12000, 15000, 20000, 25000, 35000, 50000, 100000, 200000],
    w: [0, 0, 0, 0, 0, 0, 0, 31029, 100000, 66539, 57138, 43639, 13377, 8525, 3405, 2824, 1643] },
  buy: { edges: [0, 1000, 1900, 3000, 4000, 5200, 6500, 8000, 10000, 12000, 14500, 16000, 20000, 25000, 35000, 50000, 100000],
    w: [100000, 27624, 11400, 13652, 11179, 16458, 20521, 30943, 55313, 62180, 38327, 36182, 20547, 7512, 6256, 1835, 1088] },
  superbuy: { edges: [0, 1000, 2000, 3000, 4500, 6000, 7500, 9000, 10500, 12000, 15000, 20000, 25000, 35000, 50000, 100000, 200000],
    w: [0, 0, 0, 0, 0, 0, 0, 31559, 100000, 65721, 57613, 43617, 13273, 8560, 3474, 2894, 1631] },
  // Loco Spin (v0.66, tools/math/fitloco63.mjs): never under 4x, typical about 6.5x, average about 9.7x, at most 50x
  // bands (x bet):  <4   4-5   5-6   6-8   8-10  10-15 15-20 20-30 30-50 >50
  loco: { edges: [0, 400, 500, 600, 800, 1000, 1500, 2000, 3000, 5001],
    w: [0, 58766, 100000, 44788, 71418, 46194, 36648, 8650, 4201, 0] },
  loco_double: { edges: [0, 400, 500, 600, 800, 1000, 1500, 2000, 3000, 5001],
    w: [0, 43458, 100000, 28697, 42988, 27144, 25894, 5836, 2748, 0] },   // Double Chance reels, same shape
};

export const MODES = {
  base:   { costPct: 100, strips: 'base', rescue3Num: 55, loco: true },   // v0.66c: Coin Save 55 in 1,000 (Hold & Win about 1 in 110)
  // Double Chance (0.8.0): 1.6x stake, Hold & Win about 1.8x as often (its own reels: more coins; Coin Save 52)
  double: { costPct: 160, strips: 'double', rescue3Num: 57, loco: true },   // v0.66c: Coin Save 57
  // Bought bonus (math 0.5, 25 Oct): opens with mostly 4 coins (strong ones) and at most 2 frames, 4 lives, more coins
  // landing early (longer rounds), skull x5 / x10 frames, MINOR upgrade stories, no collector.
  // 0.8.0 (item 6): starts like a natural trigger (base coin values), so a bought bonus can also come in small (UGDI:
  // 1 in 10 under 19x); its own respin tables, frames and lives keep it the richer bonus. Price set by fit63.mjs.
  buy:    { costPct: 8000, startCoins: [[4, 80], [5, 20]], extraOpeningFrames: 0, coinTable: 'base',
            tables: { early: 'buyEarly', late: 'buyLate', last: 'buyLast' },
            // 0.6.1: 3 spins like the standard bonus (was 4); coins land and the skull drops frames more often, so results stay the same
            feature: { lives: 3, levelMax: 5, framedJackpots: { 2: 1000, 3: 500, 5: 250 },
              openingFrames: { count: [[2, 80], [1, 20]], mult: [[2, 70], [3, 25], [5, 5]] }, // at most 2 at the start
              cellHit: { byHeld: { 4: 163, 5: 163, 6: 156, 7: 150, 8: 3, 9: 2 } },   // 0.6.1: x1.3 (8-9 held x1.5) for 3 spins
              jackpotGrow: { num: 25, which: [['MINI', 30], ['MINOR', 55], ['MAJOR', 12]] },
              jackpotHeldPick: 850,
              collector: null,
              // frames from the skull; x10s (skull drops only) always go to an empty position
              frames: { start: 146, perRespin: 24, cap: 346, max: 5,   // 0.6.1: x1.33 per respin (fewer respins, same frames)
                 mult: [[2, 470], [3, 260], [5, 130], [10, 200]], bigOnEmpty: { from: 10, num: 1000 } } } },
  // Super buy: a Super Hold & Win started like a natural trigger (4-6 coins). 0.8.0: price = the Super's average / RTP.
  superbuy: { costPct: 16000, startCoins: [[4, 85], [5, 13], [6, 2]], coinTable: 'base' },   // v0.71: 160x = twice the Buy (was 167x); RTP held by the balance (BAL)
};

// Faster pace: the comparison build (?math=pace). 0.8.0: every bonus total now follows the published shapes, so this
// profile no longer pays differently - it keeps only its own coin mix and skull pace inside the bonus (same odds and
// RTP as 'standard'). A candidate for removal.
export const PROFILES = {
  standard: {},
  // Pot collectors (client 3 Nov 09:21; menu "Pot collectors"). Bonus: multipliers + jackpot doublings at the start, 1-3
  // collector pots (same total), Full House fixed x2. Base: pot wins (a pot collects the coins on the reels) and pot teases
  // (no coins, mostly on reels 1-2). potsA: replaces the Clover Spin, curtains land already revealed. potsB: Clover Spin
  // kept, curtains land already revealed. potsH: the bonus only. potMk: the Full House make-back comes from the pots
  // (each collection adds `extra` per mille); without it the RTP balance makes it back through the bonus values.
  potsA: { LOCO: { num: 0 }, POTS: { base: { win: 13, tease: 70, plainCurtain: true, col: [[0, 40], [1, 40], [2, 20]], teaseCol: [[0, 55], [1, 45]], coins: [[1, 50], [2, 35], [3, 15]], table: 'potBase' },
    bonus: { fh: 2, count: [[1, 45], [2, 40], [3, 15]] } } },
  potsB: { POTS: { base: { win: 4, tease: 70, plainCurtain: true, col: [[0, 40], [1, 40], [2, 20]], teaseCol: [[0, 55], [1, 45]], coins: [[1, 50], [2, 35], [3, 15]], table: 'potBase' },
    bonus: { fh: 2, count: [[1, 45], [2, 40], [3, 15]] } } },
  potsH: { POTS: { bonus: { fh: 2, count: [[1, 45], [2, 40], [3, 15]] } } },
  potMk: { POTS: { bonus: { extra: 7 } } },
  // v0.64 link switches (combinable; see OPTION_ORDER in engine.js).
  // v0.66 'lean' = the Experiment version (?version=experiment): fewer wins below the stake (about 13-14% of spins, was
  // 22%), the saving moved into 1-3x wins; its own reels and paytable. Filled in below by reelopt63.mjs / fitloco63.mjs.
  lean: { MODES: { base: { strips: 'baseLean', rescue3Num: 55 }, double: { strips: 'doubleLean', rescue3Num: 42 } },
    PAYTABLE: { W: 896, H1: 428, H2: 100, M1: 52, L1: 8, L2: 8, L3: 8 }, SHAPES: {
      loco: { edges: [0, 400, 500, 600, 800, 1000, 1500, 2000, 3000, 5001], w: [0, 35263, 100000, 37950, 42121, 38157, 13265, 7139, 2751, 0] },
      loco_double: { edges: [0, 400, 500, 600, 800, 1000, 1500, 2000, 3000, 5001], w: [0, 42542, 100000, 43996, 36030, 20643, 7715, 4292, 1700, 0] } } },
  // shape=steady (tools/math/fit_steady63.mjs): the standard bonus and the Buy take the Super's spread relative to its
  // average, at their own average - few results under about 30x (Buy: 40x), fewer very big ones; same RTP.
  steady: { SHAPES: {
    standard: { edges: [0, 1500, 2500, 3500, 4500, 5500, 6500, 7500, 8500, 10000, 12000, 15000, 20000, 30000, 50000, 100000, 200000],
      w: [0, 0, 1526, 79573, 100000, 70452, 55518, 45675, 41826, 18293, 12358, 11174, 4721, 7029, 5255, 5831, 1592] },
    buy: { edges: [0, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000, 11500, 13000, 15000, 20000, 30000, 50000, 100000, 200000],
      w: [0, 0, 20759, 100000, 87894, 70228, 63234, 71381, 71762, 43377, 26972, 19609, 13091, 12754, 12234, 9605, 2934] } } },
  // the meter: candles per mode (a Super about every 980 spins in the base game, as with the random upgrade)
  // v0.66: candles per reel set (each version's near-miss rate), so the meter still gives a Super about every 980 spins
  meter: { METER: { candles: { base: 32, double: 27, baseLean: 34, doubleLean: 24 } } },
  // v0.66e double curtains (menu: Double curtains 22% / 36%; link ?curtains=22 / 36). Curtains still land on about 1 spin in
  // 12; 22% / 36% of them cover two reels (was 3%: about 1 spin in 56 / 34, was 1 in 440). A two-reel curtain reveals the
  // Catrina; a single one reveals fewer Wilds (dbl36 also drops the on-screen boost), so the curtains' share of the RTP stays
  // at about 6.1-6.4 points as before (tools/math/curtain_doubles66e.mjs, 3M spins per setting).
  dbl22: { MYSTERY: { spread: 200, revealTwo: [['H2', 1]], reveal: [['H1', 40], ['H2', 55], ['W', 5]] } },
  dbl36: { MYSTERY: { spread: 350, revealTwo: [['H2', 1]], reveal: [['H1', 40], ['H2', 55], ['W', 5]], screenBoost: 0 } },
  // v0.67 Loco Spin like Golden Dragon's wild reel (menu: Loco Spin "Often, small"; link ?loco=often): 1 in 34, never a
  // blank, typical about 2.2x, average about 3.6x, at most 40x (tools/math/fitloco_gd67.mjs on each reel set) - about the
  // same 10.6 points of RTP as the standard 1 in 90, 4-50x Loco Spin.
  loco34: { LOCO: { den: 34, shapeSet: 'locoGD' }, SHAPES: {
    locoGD_base: { edges: [0, 100, 150, 200, 300, 400, 600, 800, 1200, 2000, 4001], w: [0, 80510, 100000, 89483, 82815, 53048, 45691, 56544, 19728, 2966, 0] },
    locoGD_double: { edges: [0, 100, 150, 200, 300, 400, 600, 800, 1200, 2000, 4001], w: [0, 78000, 97909, 88926, 100000, 59782, 41995, 48206, 18220, 2769, 0] },
    locoGD_baseLean: { edges: [0, 100, 150, 200, 300, 400, 600, 800, 1200, 2000, 4001], w: [0, 50103, 100000, 43297, 40901, 25295, 26860, 23332, 6912, 1090, 0] },
    locoGD_doubleLean: { edges: [0, 100, 150, 200, 300, 400, 600, 800, 1200, 2000, 4001], w: [0, 56780, 100000, 66171, 65397, 39342, 43727, 23416, 5408, 898, 0] } } },
  // v0.67 checklist 4 + 5 (menu: Full House "Big wins only"; link ?fh=big): a Full House, and a standard bonus's 4th life,
  // only on a bonus paying at least 120x the bet (natural) or 1.5x the price (Buy / Super Buy). Bonus shapes corrected
  // so the published spread of bonus wins stays the same (tools/math/fit_bigfh67.mjs).
  // v0.68 (menu: Curtain rate "Often · modest"; link cfreq=often): on a spin the reels give no curtain, an extra
  // full-reel curtain on 155 in 1000 (curtains on about 1 spin in 4.5, was 1 in 12), revealing a modest symbol (Bandana,
  // Guitar, Maracas, Ring). Base-game payout unchanged (+0.05 / +0.27 points, fewer / GD small wins; 1.5M spins).
  curtOften: { MYSTERY: { extra: { num: 155, reveal: [['M1', 30], ['L1', 30], ['L2', 20], ['L3', 20]] } } },
  // v0.68 (menu: Hold & Win "Often · smaller" / "Rare · bigger"; link bonus=often / rare): base game about 1 in 80 /
  // 1 in 150 (was 1 in 110). Often: Coin Save rescues more near misses; rare: about a third of natural triggers are
  // redrawn as a fresh spin. The natural bonus shapes are tilted (TILT) so the Hold & Win keeps its share of the RTP.
  bonusOften: { MODES: { base: { rescue3Num: 98 }, double: { rescue3Num: 101 } }, TILT: -4.3 },   // about 1 in 92 (Double Chance 1 in 50), average ~61x
  bonusRare: { TRIG: { thin: 360, thinDouble: 310 }, TILT: 0.86 },
  // v0.68 (menu: Top wins "Trimmed" / "Lean top"; link top=trim / lean): bonus results of 250x+ kept about half / a quarter
  // as often, the results from just under each bonus type's average up to 250x raised so every bonus type keeps its
  // average (same RTP): the money of the rare top wins goes to the good bonuses most players see. tools/math/fit_top68.mjs.
  topTrim: { SHAPEF: {"standard:0,1000,2000,3000,4500,6000,7500,9000,10500,12000,15000,20000,25000,35000,50000,100000,200000": [1, 1, 1, 1, 1, 1.018, 1.018, 1.018, 1.018, 1.018, 1.018, 1.018, 0.5, 0.5, 0.5, 0.5, 0.5], "standard:0,1500,2500,3500,4500,5500,6500,7500,8500,10000,12000,15000,20000,30000,50000,100000,200000": [1, 1, 1, 1, 1, 1.1549, 1.1549, 1.1549, 1.1549, 1.1549, 1.1549, 1.1549, 1.1549, 0.5, 0.5, 0.5, 0.5], "super:0,1000,2000,3000,4500,6000,7500,9000,10500,12000,15000,20000,25000,35000,50000,100000,200000": [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2.1053, 2.1053, 0.5, 0.5, 0.5, 0.5, 0.5], "buy:0,1000,1900,3000,4000,5200,6500,8000,10000,12000,14500,16000,20000,25000,35000,50000,100000": [1, 1, 1, 1, 1, 1, 1.0751, 1.0751, 1.0751, 1.0751, 1.0751, 1.0751, 1.0751, 0.5, 0.5, 0.5, 0.5], "buy:0,3000,4000,5000,6000,7000,8000,9000,10000,11500,13000,15000,20000,30000,50000,100000,200000": [1, 1, 1, 1, 1, 1.1976, 1.1976, 1.1976, 1.1976, 1.1976, 1.1976, 1.1976, 1.1976, 0.5, 0.5, 0.5, 0.5], "superbuy:0,1000,2000,3000,4500,6000,7500,9000,10500,12000,15000,20000,25000,35000,50000,100000,200000": [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2.1036, 2.1036, 0.5, 0.5, 0.5, 0.5, 0.5]} },
  topLean: { SHAPEF: {"standard:0,1000,2000,3000,4500,6000,7500,9000,10500,12000,15000,20000,25000,35000,50000,100000,200000": [1, 1, 1, 1, 1, 1.027, 1.027, 1.027, 1.027, 1.027, 1.027, 1.027, 0.25, 0.25, 0.25, 0.25, 0.25], "standard:0,1500,2500,3500,4500,5500,6500,7500,8500,10000,12000,15000,20000,30000,50000,100000,200000": [1, 1, 1, 1, 1, 1.2324, 1.2324, 1.2324, 1.2324, 1.2324, 1.2324, 1.2324, 1.2324, 0.25, 0.25, 0.25, 0.25], "super:0,1000,2000,3000,4500,6000,7500,9000,10500,12000,15000,20000,25000,35000,50000,100000,200000": [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2.6579, 2.6579, 0.25, 0.25, 0.25, 0.25, 0.25], "buy:0,1000,1900,3000,4000,5200,6500,8000,10000,12000,14500,16000,20000,25000,35000,50000,100000": [1, 1, 1, 1, 1, 1, 1.1126, 1.1126, 1.1126, 1.1126, 1.1126, 1.1126, 1.1126, 0.25, 0.25, 0.25, 0.25], "buy:0,3000,4000,5000,6000,7000,8000,9000,10000,11500,13000,15000,20000,30000,50000,100000,200000": [1, 1, 1, 1, 1, 1.2964, 1.2964, 1.2964, 1.2964, 1.2964, 1.2964, 1.2964, 1.2964, 0.25, 0.25, 0.25, 0.25], "superbuy:0,1000,2000,3000,4500,6000,7500,9000,10500,12000,15000,20000,25000,35000,50000,100000,200000": [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2.6554, 2.6554, 0.25, 0.25, 0.25, 0.25, 0.25]} },
  // v0.69 (menu: Top wins "600x+ half"; link top=600): natural Hold & Win results of 600x+ kept half as often (500x wins
  // untouched; buys unchanged). Frees about 0.9 points of the base game's RTP, which goes to the curtains through ONE of:
  top600: { TOPCUT: { from: 60000, k: 0.5 } },
  // Each puts back the 0.66 points the trim frees in the base game (par63: 97.28 -> 96.62); with Double Chance the trim
  // frees more (1.15 per stake) than they put back (about 0.4), so Double Chance ends about 0.7 lower (shown in the rules).
  fMore: { MYSTERY: { extraPremium: 10 } },   // "More curtains": curtains 1 in 12.4 -> about 1 in 11, same value each
  fPay: { MYSTERY: { wildX: 2.2 } },   // "Curtains pay more often": Wild reveals 2.2x as likely in whichever reveal table applies (v0.71: works with every Curtain reveals level; was a premium-only table, which Mixed / GD-like replaced)
  fBig: { MYSTERY: { curtainX2: 115 } },
  // v0.71 (checklist 16) "Bandido pays": a line of Bandidos pays BANDIDO (BU) and lands less often - each Bandido on screen
  // is swapped for a Guitar or a Gold Ring with chance M1SUB/1000, chosen so his share of the RTP stays about the same
  // (pay x (1 - q)^3 = old pay); the lost hits come back as low-symbol lines, so the hit rate holds. RTP finished by the
  // balance step.
  // v0.71 (checklist 17) Curtain reveals: what a curtain can turn into. Mixed / GD-like reveal every symbol (two-reel
  // curtains lean premium); extra curtains (MYSTERY.extraMix, added to any extraPremium) keep the curtains' share of the RTP. Fitted by
  // tools/math/fit_curtains71.mjs.
  cvMix: { MYSTERY: { reveal: [['L1', 15], ['L2', 15], ['L3', 15], ['M1', 25], ['H2', 15], ['H1', 10], ['W', 5]],
    revealTwo: [['L1', 8], ['L2', 8], ['L3', 8], ['M1', 22], ['H2', 28], ['H1', 20], ['W', 6]], thinMix: 200 } },   // fit: 164 (base) / 248 (Double Chance)
  cvGD: { MYSTERY: { reveal: [['L1', 18], ['L2', 19], ['L3', 18], ['M1', 15], ['H2', 15], ['H1', 10], ['W', 5]],
    revealTwo: [['L1', 11], ['L2', 11], ['L3', 11], ['M1', 17], ['H2', 25], ['H1', 19], ['W', 6]], extraMix: 4 } },   // fit: 6 (base) / 1 (Double Chance)
  // Curtain rate: Rare · pays more (the reveal always connects for a line, though a line can still pay little; MYSTERY.thin per 1000 full curtains redrawn)
  // / Often · small blocks (2-3-square curtains on spins without one, mostly low symbols; full curtains thinned to pay
  // for them). Fitted by tools/math/fit_curtains71.mjs.
  crRare: { MYSTERY: { connect: true, thin: 325 } },   // fit: 323 / 330
  crSmall: { MYSTERY: { small: { num: 300, reveal: [['L1', 26], ['L2', 27], ['L3', 27], ['M1', 14], ['H2', 5], ['H1', 1]] }, thin: 0 } },   // fit: num 300 needs no thinning (small block 1 in 3.7 spins)
  // v0.71 Mid wins (checklist 20a): Loco Spin results of 10-50x kept 0.6x / 1.6x as often (RTP moved to / from the bonus by the balance)
  midLess: { MIDW: 0.6 }, midMore: { MIDW: 1.6 },
  // v0.71 Near misses (checklist 20b): extra non-paying 3-coin screens added to 2-coin spins (per 1000); fitted to about
  // 1.5x (More) and 2.4x (GD-like) the 3-coin screens. Coin Save and Hold & Win frequencies unchanged.
  nearMore: { NEAR: { num: 116, numDouble: 116 } }, nearGD: { NEAR: { num: 326, numDouble: 326 } },
  // v0.71 Bonus spread "Volatile" (checklist 20c), on the standard spread
  volatile: { VOL: { k: 0.35, at: 4000, tilt: 0.03 } },   // standard bonus only; tilt fitted 31 Oct with real start coins so the average holds
  band75: { BANDIDO: 75 },
  band100: { BANDIDO: 100 },   // "Bigger curtain wins": about 1 paying curtain in 9 doubles its win (x2)
  jpGD: { SHAPEF: {"standard:0,1000,2000,3000,4500,6000,7500,9000,10500,12000,15000,20000,25000,35000,50000,100000,200000": [1.0237, 1.0981, 1.1942, 1.2512, 1.2632, 0.9601, 0.8679, 0.8924, 0.8028, 0.7325, 0.6262, 0.6461, 0.5447, 0.5677, 0.4773, 0.4247, 0.804], "standard:0,1500,2500,3500,4500,5500,6500,7500,8500,10000,12000,15000,20000,30000,50000,100000,200000": [1.0542, 1.1473, 1.2196, 1.2683, 1.2933, 1.1214, 0.9156, 0.8676, 0.8784, 0.8304, 0.7325, 0.6262, 0.6259, 0.5238, 0.4773, 0.4247, 0.804], "buy:0,1000,1900,3000,4000,5200,6500,8000,10000,12000,14500,16000,20000,25000,35000,50000,100000": [1.0346, 1.2565, 1.6201, 1.7488, 1.6245, 1.4278, 1.0013, 0.7572, 0.6958, 0.6009, 0.6014, 0.5316, 0.3284, 0.2777, 0.2246, 0.1644, 0.2314], "buy:0,3000,4000,5000,6000,7000,8000,9000,10000,11500,13000,15000,20000,30000,50000,100000,200000": [1.4857, 1.7488, 1.632, 1.5081, 1.2224, 0.9408, 0.7921, 0.7122, 0.7117, 0.6301, 0.5802, 0.5488, 0.309, 0.2451, 0.1644, 0.1448, 0.4125]},   // per-band shape factors keeping each band's share (tools/math/fit_jp68.mjs)
    FEATURE: { tables: { early: 'gdEarly', late: 'gdEarly', last: 'gdLast' } },
    MODES: { buy: { tables: { early: 'gdBuyEarly', late: 'gdBuyEarly', last: 'gdBuyLast' } } } },
  bigFH: { FEATURE: { bigOnly: { betBU: 12000, buyPct: 150 }, sprinkle: { fourthLife: 100 } } },   // 4th life offered twice as often (more would raise the RTP: longer bonuses within each band)
  pace: {
    FEATURE: { tables: { early: 'paceEarly', late: 'paceEarly', last: 'paceLast' },
      frames: { start: 100, perRespin: 18, cap: 280 } },
  },
};

export const MAX_WIN_BU = 500000; // 5000x

// Theoretical RTP per mode from the latest PAR run (docs/PAR.md). Update after every maths change.
export const PUBLISHED_RTP = { base: 96.65, double: 96.53, buy: 96.48, superbuy: 96.52 };   // v0.71: the default set, measured after the balance // math 0.9.0 (30 Oct): tools/math/par63.mjs (exact reels + 300k shaped bonuses; +/-0.1-0.2)
// 0.8.0: the pace profile has the same odds (every bonus total follows the shapes), so the same figures.
// v0.64 link options (tools/math/par63.mjs, 250k shaped bonuses each, +/-0.1-0.25): lite changes the base / Double
// Chance figures, steady the Buy's; the meter option has the same odds as the random Super. Combinations take each part.
// v0.66: lean (the Experiment) changes the base / Double Chance figures, steady the Buy's; the meter option has the same
// odds as the random Super. Combinations take each part. (Filled in from tools/math/par63.mjs.)
const RTP_LEAN = { base: 96.84, double: 96.95 }, RTP_STEADY_BUY = 96.94;
// v0.68 (checklist 7): the rules show the RTP of the toggled combination - the client's default set measured directly
// (tools/math/par63.mjs, lean+steady+bigFH; curtains A added from its own line measurement) plus each option's measured
// effect against it (par63 runs of 80-200k shaped bonuses, 30 Oct; each figure about +/-0.3). Re-measure after any
// maths change and at the final RTP balance.
export const RTP_MODEL = {
  // v0.71 (31 Oct): re-measured with tools/math/model71.mjs, which plays bonuses exactly as the game does (each one shaped
  // from its own start coins). The old figures (par63) read the base game about 1.4 points low. BEFORE the balance:
  // the default set (lean+steady+dbl22+bigFH+band75+cvMix), 12M base rounds + 800k bonuses per mode (+/-0.1); buys 400k.
  ref: { base: 99.07, double: 99.01, buy: 96.81, superbuy: 100.91 },   // calibrated to the two verification runs (base -0.33, Double Chance +0.42, Buy -0.11)
  // options the default set has: the effect of turning them OFF (2-4M rounds, 300k bonuses each; +/-0.15-0.25)
  off: { lean: { base: 2.36, double: 1.64 },                                       // GD small wins
    steady: { base: 0.04, double: -0.06, buy: 0.83, superbuy: -0.04 },             // standard bonus spread
    bigFH: { base: -0.45, double: -0.30, buy: -0.21, superbuy: 0.13 },             // Full House on any bonus
    dbl22: { base: -2.75, double: -2.09 },                                         // single curtains
    band75: { base: -0.32, double: -0.08 },                                        // Bandido as now
    cvMix: { base: 0.16, double: -0.38 } },                                        // premium-only reveals
  // options the default set doesn't have: the effect of turning them ON (a swap = the other option's OFF + this ON)
  on: {
    // pot collectors (3 Nov, tools/math/model71.mjs before the balance, 3M base rounds + 200k bonuses per mode): the bonus's
    // Full House fixed at x2 costs base -0.20 / double -0.46 / buy -0.45 / super buy -1.15; potsA's pot wins (1 in 77) replace
    // the Clover Spin's ~9.5 points; potsB's (1 in 250) add ~2.9; potMk (0.7% per collection) adds ~0.5
    potsA: { base: -0.25, double: -0.66, buy: -0.45, superbuy: -1.15 },
    potsB: { base: 2.71, double: 1.39, buy: -0.45, superbuy: -1.15 },
    potsH: { base: -0.20, double: -0.46, buy: -0.45, superbuy: -1.15 },
    potMk: { base: 0.44, double: 0.52, buy: 0.63, superbuy: 0.63 }, dbl36: { base: 1.99, double: 1.88 }, band100: { base: 0.98, double: 0.51 }, cvGD: { base: 0.62, double: 1.12 },
    crRare: { base: 0.36, double: 0.41 }, crSmall: { base: 0.49, double: 0.13 },
    loco34: { base: -1.58, double: -1.97 },   // line part +0.38 / +0.41, but bonuses come less often (1 in 112 / 60.5: a Loco Spin's Wild reel covers coins) - whole-round runs, 31 Oct
    midLess: { base: -1.16, double: -0.71 }, midMore: { base: 1.33, double: 0.84 }, nearMore: {}, nearGD: {},
    bonusOften: { base: 1.05, double: 0.0 }, bonusRare: { base: -2.11, double: -2.11 }, jpGD: { base: 0.04, double: 0.10, buy: 0.19, superbuy: -0.04 },
    meter: { base: -0.06, double: 0.41 }, volatile: {}, top600: { base: -0.91, double: -0.99 },
    fMore: { base: 0.10, double: 0.30 }, fPay: { base: 1.02, double: 0.68 }, fBig: { base: 0.62, double: 0.52 },
    curtOften: {}, pace: {}, topTrim: {}, topLean: {} },
};
// v0.71: per-combination corrections from the direct verification runs (measured after the balance - target), so the
// verified combinations land on the target exactly; filled in from tools/math/model71.mjs runs (31 Oct)
export const RTP_CAL = {
  'lean+steady+dbl22+bigFH+top600+fPay+band75+cvMix': { base: 0.08, double: -0.06 },     // Poco style
};
export const PRE_BALANCE_RTP = p => {
    const parts = p === 'standard' ? [] : p.split('+'), out = { ...RTP_MODEL.ref };
    const add = d => { for (const k of Object.keys(out)) out[k] += d?.[k] ?? 0; };
    for (const o of Object.keys(RTP_MODEL.off)) if (!parts.includes(o)) add(RTP_MODEL.off[o]);
    for (const o of parts) add(RTP_MODEL.on[o]);
    add(RTP_CAL[p] ?? RTP_CAL[p.replace(/\+(potsA|potsB|potsH|potMk)/g, '')]);   // pots: the measured correction of the same set without them   // v0.71: combinations measured directly (the default set and both presets) are corrected to their measurement
    for (const k of Object.keys(out)) out[k] = +out[k].toFixed(2);
    return out; };
// the rules screen: measured figures where a combination was run directly (MEASURED_RTP), else the model after the balance
export const MEASURED_RTP = {   // v0.71: whole-round runs through playRound after the balance (31 Oct; 25-80M rounds per mode, 1.5M buys; +/-0.1-0.2)
  'lean+steady+dbl22+bigFH+band75+cvMix': { base: 96.65, double: 96.53, buy: 96.48, superbuy: 96.52 },                   // default set
  'lean+steady+dbl22+bigFH+top600+fPay+band75+cvMix': { base: 96.72, double: 96.72, buy: 96.48, superbuy: 96.52 },       // Poco style
  'lean+steady+dbl22+loco34+bigFH+band75+cvGD': { base: 96.38, double: 96.28, buy: 96.48, superbuy: 96.52 },             // GD style
};
export const PUBLISHED_RTP_BY_PROFILE = new Proxy({}, {
  get: (t, p) => { if (typeof p !== 'string') return undefined;
    if (MEASURED_RTP[p]) return MEASURED_RTP[p];
    const pre = PRE_BALANCE_RTP(p), out = {};
    for (const m of Object.keys(pre)) { const th = BALANCE.sens?.[m] ? Math.max(-BALANCE.max, Math.min(BALANCE.max, (BALANCE.target - pre[m]) / BALANCE.sens[m])) : 0;
      out[m] = +(pre[m] + th * (BALANCE.sens?.[m] ?? 0)).toFixed(2); }
    return out; } });
// v0.71 (checklist 2): the final balance. sens = RTP points per unit of tilt for each mode (measured on the default set);
// the tilt is limited to +/-max so no combination is bent far from its own shape.
export const BALANCE = { target: 96.6, sens: { base: 14.1, double: 15.4, buy: 19.9, superbuy: 19.3 }, max: 0.8 };   // sens: measured at tilt -0.3 on the default set (31 Oct)
export function balanceTilt(profile) {
  if (!BALANCE.sens) return null;
  const pre = PRE_BALANCE_RTP(profile), out = {};
  for (const m of Object.keys(BALANCE.sens)) out[m] = Math.max(-BALANCE.max, Math.min(BALANCE.max, +((BALANCE.target - pre[m]) / BALANCE.sens[m]).toFixed(3)));
  return out;
}
export { STRIPS };
