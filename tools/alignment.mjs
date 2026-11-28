// 友好的な魔物への対応と性格の変化を数える
// 使い方: node tools/alignment.mjs <開始seed> <seed数> <最大手数> [パーティ構成 good/evil/warrior/magic]
import { Game } from '../src/game.js';
import { R } from '../src/rng.js';
import { partyLevel } from '../src/ai.js';

const s0 = +(process.argv[2] || 7), n = +(process.argv[3] || 6), maxTicks = +(process.argv[4] || 400000), composition = process.argv[5] || 'good';
const tot = { friendly: 0, fight: 0, leave: 0, toE: 0, toG: 0, cc: 0 };
for (let seed = s0; seed < s0 + n; seed++) {
  R.s = seed;
  const g = Game.newGame({ composition });
  g.seed = seed * 31 + 7;
  const c = { friendly: 0, fight: 0, leave: 0, toE: 0, toG: 0, cc: 0 };
  const ev = [];
  let t = 0;
  g.onLog = (s) => {
    if (/友好的なようだ/.test(s)) c.friendly++;
    else if (s === 'パーティは襲いかかった！') c.fight++;
    else if (s === 'パーティは立ち去った。') c.leave++;
    else if (/の性格が善から悪/.test(s)) { c.toE++; ev.push(`t${t} 平均Lv${partyLevel(g).toFixed(0)} ${s}`); }
    else if (/の性格が悪から善/.test(s)) { c.toG++; ev.push(`t${t} 平均Lv${partyLevel(g).toFixed(0)} ${s}`); }
    else if (/訓練場で新たな仲間/.test(s)) { const x = g.party[g.party.length - 1]; c.recruit = (c.recruit || '') + x.align; }
    else if (/に転職した/.test(s)) { c.cc++; ev.push(`t${t} 平均Lv${partyLevel(g).toFixed(0)} ${s.replace('訓練場で、', '')}`); }
  };
  const it = g.run();
  for (; t < maxTicks && !g.cleared; t++) it.next();
  console.log(`seed ${seed}: ${g.cleared ? 'クリア' : '未クリア'} t${t} 戦闘${g.stats.battles} 友好${c.friendly}（襲う${c.fight}・立ち去る${c.leave}） 善→悪${c.toE} 悪→善${c.toG} 新人の性格${c.recruit || '-'}`);
  for (const e of ev) console.log('  ' + e);
  console.log('  最終: ' + g.party.map(x => `${x.name}[${x.align}]${x.cls}${x.history ? '(' + x.history.join('/') + ')' : ''}Lv${x.level}`).join(' '));
  for (const k in tot) tot[k] += c[k];
}
console.log(`合計: 友好${tot.friendly}（襲う${tot.fight}・立ち去る${tot.leave}） 善→悪${tot.toE} 悪→善${tot.toG} 転職${tot.cc}`);
