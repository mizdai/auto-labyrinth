// ヘッドレスシミュレーション：AIがどこまで進めるかを確認する
import { Game } from '../src/game.js';
import { R } from '../src/rng.js';
import { partyLevel } from '../src/ai.js';
const seed = +(process.argv[2] || 1), maxTicks = +(process.argv[3] || 2_000_000);
R.s = seed;
const g = Game.newGame({ composition: process.argv[4] || 'good', policy: process.argv[5] || 'normal' });
g.seed = seed * 31 + 7;
const verbose = process.env.V;
g.onLog = (t) => { if (verbose) console.log(t); };
const it = g.run();
let ticks = 0, lastReport = 0;
for (; ticks < maxTicks; ticks++) {
  it.next();
  if (g.cleared) break;
  if (ticks - lastReport >= 100000) {
    lastReport = ticks;
    console.log(`t=${ticks} deepest=${g.deepest} lv=${partyLevel(g).toFixed(1)} gold=${g.gold} battles=${g.stats.battles} wipes=${g.stats.wipes} trips=${g.stats.trips} party=${g.party.map(c => c.cls[0] + c.level + (c.status !== 'ok' ? '!' : '')).join(',')}`);
  }
}
console.log(`END t=${ticks} cleared=${g.cleared} deepest=${g.deepest} lv=${partyLevel(g).toFixed(1)} battles=${g.stats.battles} wipes=${g.stats.wipes} lost=${g.stats.deaths}`);
