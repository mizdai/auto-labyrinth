// 再発防止の確認用：帰還中に、地図に載っていない離れた場所へ飛ばされても、上り階段まで帰れることを確かめる
import { Game } from '../src/game.js';
import { R } from '../src/rng.js';
import { getFloor, W, H } from '../src/dungeon.js';

let ok = 0, ng = 0, total = 0;
for (let seed = 1; seed <= 20; seed++) {
  R.s = seed;
  const g = Game.newGame({});
  g.seed = seed * 31 + 7;
  for (const c of g.party) { c.level = 15; c.maxhp = c.hp = 999; }
  const floor = 1 + (seed % 9);
  const F = getFloor(g.seed, floor);
  g.location = 'dungeon'; g.floor = floor; g.deepest = floor; g.mode = 'return';
  // 上り階段から一番遠い区画へ飛ばされた状態（地図は上り階段のまわりだけ既知）
  const dist = F.distances(F.up.x, F.up.y);
  let far = 0; for (let i = 0; i < W * H; i++) if (dist[i] > dist[far]) far = i;
  g.x = far % W; g.y = (far / W) | 0;
  const known = g.knownMap(); known[F.up.y * W + F.up.x] = 1; known[far] = 1;
  const it = g.run();
  let t = 0;
  for (; t < 20000 && g.location === 'dungeon' && g.floor === floor; t++) it.next();
  const back = g.location !== 'dungeon' || g.floor < floor;
  if (back) { ok++; total += t; } else ng++;
  if (!back) console.log('stuck seed', seed, 'floor', floor, 'at', g.x, g.y);
}
console.log(`returned ${ok} / ${ok + ng}, average ticks ${Math.round(total / Math.max(1, ok))}`);
