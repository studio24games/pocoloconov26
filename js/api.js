// The RGS the game talks to. main.js only ever calls this object; it never decides outcomes.
//  - Launched by Tequity (their launch URL, or ?rgs=tequity): the Tequity Connector adapter (api-tequity.js). The game
//    server decides outcomes and the operator's wallet holds the balance.
//  - Anywhere else (the Vercel demo, localhost): the in-browser demo RGS (api-local.js). Demo only, play money.
import { RGS as LocalRGS } from './api-local.js';
import { TequityRGS, isTequityLaunch } from './api-tequity.js';

export const IS_TEQUITY = isTequityLaunch();

export class RGS {
  constructor() { this.impl = IS_TEQUITY ? new TequityRGS() : new LocalRGS(); }
  get tequity() { return IS_TEQUITY; }
  /** The demo's in-browser wallet. Undefined on Tequity, which switches off the demo-only balance tools. */
  get session() { return this.impl.session; }
  init() { return this.impl.init(); }
  play(bet, mode, force = null, profile = 'standard') { return this.impl.play(bet, mode, force, profile); }
  meter(bet, mode, profile = 'standard') { return this.impl.meter(bet, mode, profile); }
  history() { return this.impl.history(); }
  // Connector events. No-ops in the demo.
  bindGame(hooks) { this.impl.bindGame?.(hooks); }
  gameLoaded() { this.impl.gameLoaded?.(); }
  sync(s) { this.impl.sync?.(s); }
  openHistory() { this.impl.openHistory?.(); }
}
