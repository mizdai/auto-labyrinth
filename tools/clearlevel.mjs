// クリアしたときのパーティの平均レベルを調べる
// 使い方: node tools/clearlevel.mjs <開始seed> <seed数> <最大手数>
import { Game } from '../src/game.js';
import { R } from '../src/rng.js';
import { partyLevel } from '../src/ai.js';

const s0 = +(process.argv[2] || 7), n = +(process.argv[3] || 8), maxTicks = +(process.argv[4] || 400000);
const lv = [];
for (let seed = s0; seed < s0 + n; seed++) {
  R.s = seed;
  const g = Game.newGame({});
  g.seed = seed * 31 + 7;
  let reached10 = null;
  g.onLog = (t) => { if (!reached10 && /地下10階に初めて/.test(t)) reached10 = partyLevel(g); };
  const it = g.run();
  for (let t = 0; t < maxTicks && !g.cleared; t++) it.next();
  if (g.cleared) lv.push(partyLevel(g));
  console.log(JSON.stringify({ seed, cleared: g.cleared, reached10: reached10 && +reached10.toFixed(1), lvAtClear: +partyLevel(g).toFixed(1) }));
}
if (lv.length) console.log('average level at clear', (lv.reduce((a, b) => a + b, 0) / lv.length).toFixed(1));
