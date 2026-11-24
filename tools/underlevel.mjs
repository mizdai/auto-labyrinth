// 「最低レベルに届かない仲間を連れて、その階にいた」歩数の割合を調べる
// 使い方: node tools/underlevel.mjs <開始seed> <seed数> <最大手数>
import { Game } from '../src/game.js';
import { R } from '../src/rng.js';
import { isAlive } from '../src/character.js';

const minLv = (f) => Math.max(1, ([0, 1, 3, 5, 7, 8, 9, 11, 12, 13, 15][f] || 15) - 4);
const s0 = +(process.argv[2] || 7), n = +(process.argv[3] || 6), maxTicks = +(process.argv[4] || 300000);
let steps = 0, under = 0, deepUnder = 0;
for (let seed = s0; seed < s0 + n; seed++) {
  R.s = seed;
  const g = Game.newGame({});
  g.seed = seed * 31 + 7;
  const it = g.run();
  let last = g.stats.steps;
  for (let t = 0; t < maxTicks && !g.cleared; t++) {
    it.next();
    if (g.location !== 'dungeon' || g.stats.steps === last) continue;
    last = g.stats.steps; steps++;
    const weakest = Math.min(...g.party.filter(isAlive).map(c => c.level));
    if (weakest < minLv(g.floor)) { under++; if (weakest <= 3 && g.floor >= 5) deepUnder++; }
  }
}
console.log(`steps ${steps}, under minimum ${(100 * under / steps).toFixed(1)}%, Lv3-or-lower on B5+ ${(100 * deepUnder / steps).toFixed(2)}%`);
