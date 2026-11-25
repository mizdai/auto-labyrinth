// 魔物のブレス・呪文で倒れた仲間の数を数える（戦闘100回あたり）
// 使い方: node tools/aoedeaths.mjs <開始seed> <seed数> <最大手数>
import { Game } from '../src/game.js';
import { R } from '../src/rng.js';

const s0 = +(process.argv[2] || 7), n = +(process.argv[3] || 8), maxTicks = +(process.argv[4] || 300000);
let byBreath = 0, bySpell = 0, other = 0, battles = 0, wards = 0, unresists = 0;
for (let seed = s0; seed < s0 + n; seed++) {
  R.s = seed;
  const g = Game.newGame({});
  g.seed = seed * 31 + 7;
  let last = '';
  g.onLog = (t) => {
    if (/息を吐きかけた/.test(t)) last = 'breath';
    else if (/を唱えた！$/.test(t) && g.battle && ![...g.party].some(c => t.startsWith(c.name + 'は'))) last = 'spell';
    else if (/^(.+)の攻撃|回命中/.test(t)) last = 'melee';
    if (t.endsWith('は死んだ…')) { if (last === 'breath') byBreath++; else if (last === 'spell') bySpell++; else other++; }
    if (/障壁に包まれた/.test(t)) wards++;
    if (/呪文への抵抗-/.test(t)) unresists++;
  };
  const it = g.run();
  for (let t = 0; t < maxTicks && !g.cleared; t++) it.next();
  battles += g.stats.battles;
}
const per = (x) => (100 * x / Math.max(1, battles)).toFixed(2);
console.log(`battles ${battles}, deaths per 100 battles: breath ${per(byBreath)}, enemy spells ${per(bySpell)}, other ${per(other)}; ward casts ${wards}, resist-down casts ${unresists}`);
