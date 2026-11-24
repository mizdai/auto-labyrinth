// テーマ（階の作り）ごとに、100歩あたりの方向転換の回数を調べる
// 使い方: node tools/turnrate.mjs <開始seed> <seed数> <最大手数>
import { Game } from '../src/game.js';
import { R } from '../src/rng.js';

const s0 = +(process.argv[2] || 7), n = +(process.argv[3] || 6), maxTicks = +(process.argv[4] || 300000);
const by = {};
for (let seed = s0; seed < s0 + n; seed++) {
  R.s = seed;
  const g = Game.newGame({});
  g.seed = seed * 31 + 7;
  const it = g.run();
  let steps = g.stats.steps, turns = 0;
  for (let t = 0; t < maxTicks && !g.cleared; t++) {
    it.next();
    if (g.location !== 'dungeon') continue;
    const th = g.F.theme, b = (by[th] ||= { steps: 0, turns: 0 });
    if (g.stats.steps !== steps) { b.steps += g.stats.steps - steps; steps = g.stats.steps; }
    if ((g.stats.turns || 0) !== turns) { b.turns += (g.stats.turns || 0) - turns; turns = g.stats.turns || 0; }
  }
}
for (const [th, b] of Object.entries(by).sort()) console.log(th, 'steps', b.steps, 'turns per 100 steps', (100 * b.turns / Math.max(1, b.steps)).toFixed(1));
