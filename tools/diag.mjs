import { Game } from '../src/game.js';
import { R } from '../src/rng.js';
import { partyLevel } from '../src/ai.js';
const seed = +(process.argv[2] || 1), maxTicks = +(process.argv[3] || 1_000_000), composition = process.argv[4] || 'good';
R.s = seed;
const g = Game.newGame({ composition });
g.seed = seed * 31 + 7;
const wipeAt = {}, returnWhy = {}, deaths = {};
let firstReach = {};
g.onLog = (t) => {
  if (t.includes('全滅')) wipeAt[g.floor] = (wipeAt[g.floor] || 0) + 1;
  const m = /^(.+)、地上へ引き返す/.exec(t); if (m) returnWhy[m[1]] = (returnWhy[m[1]] || 0) + 1;
  if (t.endsWith('は死んだ…')) deaths[g.floor] = (deaths[g.floor] || 0) + 1;
  const f = /地下(\d+)階に初めて/.exec(t); if (f) firstReach[f[1]] = `t${(ticks/1000)|0}k lv${partyLevel(g).toFixed(1)}`;
};
const it = g.run();
var ticks = 0;
for (; ticks < maxTicks && !g.cleared; ticks++) it.next();
console.log({ seed, ticks, cleared: g.cleared, lv: partyLevel(g).toFixed(1), wipeAt, deaths, returnWhy, firstReach, battles: g.stats.battles, trips: g.stats.trips });
