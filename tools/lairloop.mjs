// 玄室での逃走の繰り返しと全滅を数える
import { Game } from '../src/game.js';
import { R } from '../src/rng.js';
const seed = +(process.argv[2] || 1), maxTicks = +(process.argv[3] || 300000);
R.s = seed;
const g = Game.newGame({}); g.seed = seed * 31 + 7;
let inLair = false, lairFlees = 0, repeatFlees = 0, wipes = 0, wipeInReturn = 0;
const fledAt = new Set();
g.onLog = (t) => {
  if (t === '玄室に入った。' || t.startsWith('避けられない玄室')) inLair = true;
  if (t.endsWith('が現れた！') && !inLair) inLair = false;
  if (t === '一行は逃げ出した！' && inLair) {
    lairFlees++;
    const key = `${g.floor}:${g.x},${g.y}:${g.stats.trips}`;
    if (fledAt.has(key)) repeatFlees++;
    fledAt.add(key);
  }
  if (t.startsWith('魔物を倒した') || t === '一行は逃げ出した！') inLair = false;
  if (t.includes('全滅')) { wipes++; if (g.mode === 'return') wipeInReturn++; }
};
const it = g.run();
for (let i = 0; i < maxTicks && !g.cleared; i++) it.next();
console.log(JSON.stringify({ steps: g.stats.steps, seed, lairFlees, repeatFlees, wipes, wipeInReturn, deepest: g.deepest, cleared: g.cleared }));
