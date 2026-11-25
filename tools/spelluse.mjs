// 仲間が唱えた呪文の回数を数える（新しい呪文が使われているかの確認用）
// 使い方: node tools/spelluse.mjs <開始seed> <seed数> <最大手数>
import { Game } from '../src/game.js';
import { R } from '../src/rng.js';
import { SPELLS } from '../src/data.js';

const s0 = +(process.argv[2] || 7), n = +(process.argv[3] || 6), maxTicks = +(process.argv[4] || 300000);
const count = Object.fromEntries(SPELLS.map(s => [s.name, 0]));
for (let seed = s0; seed < s0 + n; seed++) {
  R.s = seed;
  const g = Game.newGame({});
  g.seed = seed * 31 + 7;
  const names = () => new Set([...g.party, ...g.reserve].map(c => c.name));
  g.onLog = (t) => {
    const m = /^(.+?)は(.+?)を唱えた/.exec(t);
    if (m && names().has(m[1]) && m[2] in count) count[m[2]]++;
  };
  const it = g.run();
  for (let t = 0; t < maxTicks && !g.cleared; t++) it.next();
}
for (const sp of SPELLS) console.log(`${sp.school === 'mage' ? '魔' : '僧'}${sp.lv} ${sp.name.padEnd(6, '　')} ${count[sp.name]}`);
