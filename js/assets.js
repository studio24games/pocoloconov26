// Production asset manifest. Any entry that is filled in AND loads successfully replaces the built-in
// placeholder; anything missing silently falls back, so the game always runs.
//   client/assets/manifest.json  →  paths are relative to client/assets/

export const ASSETS = { symbols: {}, backgrounds: {}, ui: {}, sfx: {}, music: {}, symbolCanvas: 0, symbolPlace: {} };

const loadImage = src => new Promise(res => {
  const img = new Image();
  img.onload = () => res(src); img.onerror = () => res(null);
  img.src = src;
});

export async function loadManifest() {
  let m;
  try { m = await (await fetch('./assets/manifest.json', { cache: 'no-store' })).json(); } catch { return ASSETS; }
  const jobs = [];
  ASSETS.symbolCanvas = m.symbolCanvas || 0;
  ASSETS.symbolPlace = m.symbolPlace || {};   // v0.34: masters v2 - [left %, top %, size %] of the 300 canvas (placement.json)   // v0.30: symbols drawn on a common padded canvas (300 logical, 222 cell centred)
  // v0.49: with the reel art pack (the default; ?art=v1 restores the old look) the old regular symbols are replaced by
  // the pack's own, so they are not downloaded (about 7 MB). Jackpot coins still come from the old set.
  const artV2 = !(typeof location !== 'undefined' && /[?&]art=v1\b/.test(location.search));
  const skip = (group, id) => artV2 && group === 'symbols' && /^(W|H1|H2|M1|L1|L2|L3|C_CASH)$/.test(id);
  // v0.53 (item 20): the old surround, statues and street background are not shown with the reel art pack; their paths
  // are kept as on/off flags (the layout code checks them) but the files are no longer downloaded
  const flagOnly = (group, id) => artV2 && ((group === 'backgrounds') || (group === 'ui' && /^(statue|statueR|frameSide|frameMid|frieze2|base2|midTop|midBot|rail|stoneDark|stoneBase|stoneBand|surround|urn|urnR|plaque|plinth|panel|lintel)$/.test(id)));
  for (const group of ['symbols', 'backgrounds', 'ui']) {
    for (const [id, file] of Object.entries(m[group] || {})) {
      if (!file || skip(group, id)) continue;
      if (flagOnly(group, id)) { ASSETS[group][id] = `./assets/${file}`; continue; }
      // v0.62e (client): the win-screen art (characters, altar) and the old fallback skull are not needed to start: the
      // path is set now and main.js downloads them in the background once the game has opened
      if (group === 'ui' && /^(altar|skull|char_big|char_mega|char_epic)$/.test(id)) { ASSETS[group][id] = `./assets/${file}`; continue; }
      jobs.push(loadImage(`./assets/${file}`).then(ok => { if (ok) ASSETS[group][id] = ok; else console.warn(`asset missing: ${file}`); }));
    }
  }
  for (const [id, file] of Object.entries(m.sfx || {})) if (file) ASSETS.sfx[id] = `./assets/${file}`;
  for (const [id, v] of Object.entries(m.music || {})) {
    if (!v) continue;
    const e = typeof v === 'string' ? { file: v } : v;
    ASSETS.music[id] = { ...e, url: `./assets/${e.file}` };
  }
  await Promise.all(jobs);
  return ASSETS;
}

/** Report of what is using production art vs placeholder — shown in the developer panel. */
export function assetReport(manifestKeys) {
  return Object.entries(manifestKeys).map(([group, ids]) => ids.map(id => `${ASSETS[group][id] ? '✅' : '▫️'} ${group}/${id}`).join('\n')).join('\n');
}
