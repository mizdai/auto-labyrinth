// 転職の回数と時期を数える
// 使い方: node tools/classchange.mjs <開始seed> <seed数> <最大手数>
import { Game } from '../src/game.js';
import { R } from '../src/rng.js';
import { partyLevel } from '../src/ai.js';

const s0 = +(process.argv[2] || 7), n = +(process.argv[3] || 6), maxTicks = +(process.argv[4] || 400000);
for (let seed = s0; seed < s0 + n; seed++) {
  R.s = seed;
  const g = Game.newGame({});
  g.seed = seed * 31 + 7;
  const ev = [];
  let t = 0;
  g.onLog = (s) => { if (/に転職した/.test(s)) ev.push(`t${t} 深${g.deepest} 平均Lv${partyLevel(g).toFixed(0)} ${s.replace('訓練場で、', '')}`); };
  const it = g.run();
  for (; t < maxTicks && !g.cleared; t++) it.next();
  console.log(`seed ${seed}: ${g.cleared ? 'クリア' : '未クリア'} t${t} 全滅${g.stats.wipes ?? '?'}`);
  for (const e of ev) console.log('  ' + e);
  console.log('  最終: ' + g.party.map(c => `${c.name}${c.cls}${c.history ? '(' + c.history.join('/') + ')' : ''}Lv${c.level}`).join(' '));
}
