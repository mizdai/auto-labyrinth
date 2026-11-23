// 迷宮の中で、狭い範囲を延々と歩き回って進まなくなる状態を探す
// 使い方: node tools/loopcheck.mjs <開始seed> <seed数> <最大手数>
import { Game } from '../src/game.js';
import { R } from '../src/rng.js';

const s0 = +(process.argv[2] || 1), n = +(process.argv[3] || 10), maxTicks = +(process.argv[4] || 200000);
const WINDOW = +(process.env.WIN || 400);  // この歩数のあいだに
const LIMIT = +(process.env.LIM || 6);     // 歩いた区画がこれ以下なら「うろうろ」とみなす

for (let seed = s0; seed < s0 + n; seed++) {
  R.s = seed;
  const g = Game.newGame({});
  g.seed = seed * 31 + 7;
  const tail = [];
  g.onLog = (t) => { tail.push(t); if (tail.length > 12) tail.shift(); };
  const it = g.run();
  let lastSteps = 0, window = [], found = null;
  for (let t = 0; t < maxTicks && !g.cleared && !found; t++) {
    it.next();
    if (g.location !== 'dungeon' || g.battle) { window = []; continue; }
    if (g.stats.steps !== lastSteps) {
      lastSteps = g.stats.steps;
      window.push(`${g.floor}:${g.x},${g.y}`);
      if (window.length > WINDOW) window.shift();
      if (window.length === WINDOW && new Set(window).size <= LIMIT) {
        found = { t, floor: g.floor, x: g.x, y: g.y, mode: g.mode, cells: [...new Set(window)], tail: [...tail] };
      }
    }
  }
  console.log(JSON.stringify({ seed, loop: !!found, ...(found || {}) }));
}
