// 再発防止の確認用：まだ倒していない玄室の部屋の中から始めて、往復せずに戦闘→先へ進むことを確かめる
// まだ倒していない玄室の部屋の中に立っているとき、AIがどの目的地を選び、どう動くか
import { Game } from '../src/game.js';
import { R } from '../src/rng.js';
import { getFloor, W } from '../src/dungeon.js';

R.s = 5;
const g = Game.newGame({});
g.seed = 5 * 31 + 7;
for (const c of g.party) { c.level = 2; c.maxhp = c.hp = 300; c.exp = 0; }
g.location = 'dungeon'; g.floor = 1; g.deepest = 1;
const F = getFloor(g.seed, 1);
const lair = F.lairs[0];
const r = F.rooms[lair.id];
g.x = r.x; g.y = r.y;
const k = g.knownMap(); for (let i = 0; i < W * W; i++) k[i] = 1;
g.lairsCleared = F.lairs.filter(l => l.id !== lair.id).map(l => l.id);
console.log('first goal:', g.chooseGoal().label, 'at', g.x, g.y, 'in lair room', g.lairIdAt(F, g.x, g.y));
const logs = [];
g.onLog = (t) => logs.push(t);
const it = g.run();
const pos = [];
let last = g.stats.steps;
for (let t = 0; t < 600 && g.location === 'dungeon'; t++) {
  it.next();
  if (g.stats.steps !== last) { last = g.stats.steps; pos.push(`${g.x},${g.y}`); }
}
console.log('moves:', pos.slice(0, 40).join(' '));
console.log('inside lair room cells visited:', pos.filter(p => { const [x, y] = p.split(',').map(Number); return g.lairIdAt(F, x, y) === lair.id; }).length, 'cleared:', g.lairsCleared.includes(lair.id));
console.log(logs.slice(0, 6).join('\n'));
