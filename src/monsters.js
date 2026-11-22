// モンスター定義（オリジナル）
// [id, 名前, Lv, HP, AC, 攻撃, 出現数, 出現階, 種別, 特殊能力]
// 特殊能力: poison paralyze stone sleep drainN crit breath regen mageN priestN resistN noSleep flee call undead boss
import { parseDice } from './rng.js';

const RAW = [
  ['rat',        '大ネズミ',       1, '1d4',  8, '1d3',           '2d3', '1-2', 'beast', ''],
  ['bat',        '洞窟コウモリ',   1, '1d3',  7, '1d2',           '2d4', '1-2', 'beast', 'flee'],
  ['slime',      '青い粘塊',       1, '2d4',  9, '1d4',           '1d4', '1-2', 'slime', 'noSleep'],
  ['kobold',     '犬頭の小鬼',     1, '1d6',  8, '1d4',           '1d5', '1-3', 'humanoid', ''],
  ['footpad',    '追い剥ぎ',       1, '1d6',  9, '1d5',           '1d3', '1-2', 'human', 'flee'],
  ['apprentice', '見習い呪術師',   1, '1d4', 10, '1d3',           '1d3', '1-3', 'caster', 'mage1'],
  ['bonedog',    '骨犬',           2, '2d4',  7, '1d4',           '1d3', '1-3', 'undead', 'undead noSleep'],
  ['goblin',     '小鬼の戦士',     2, '2d6',  6, '1d6',           '2d3', '2-4', 'humanoid', ''],
  ['wilddog',    '飢えた野犬',     2, '2d6',  7, '1d5',           '2d3', '2-3', 'beast', ''],
  ['viper',      '毒蛇',           2, '2d5',  6, '1d3',           '1d3', '2-4', 'beast', 'poison'],
  ['zombie',     '腐れ死体',       2, '2d8',  9, '1d6',           '1d4', '2-4', 'undead', 'undead noSleep'],
  ['acolyte',    '堕ちた修道士',   2, '2d6',  8, '1d4',           '1d3', '2-4', 'caster', 'priest1'],
  ['skeleton',   '骸骨兵',         3, '3d6',  5, '1d7',           '2d3', '3-5', 'undead', 'undead noSleep'],
  ['bandit',     '鎧の野盗',       3, '3d8',  5, '1d8',           '1d4', '3-5', 'human', ''],
  ['spider',     '大毒蜘蛛',       3, '3d6',  6, '1d4',           '1d3', '3-5', 'insect', 'paralyze'],
  ['sorcerer',   '呪術師',         3, '3d4',  9, '1d4',           '1d4', '3-5', 'caster', 'mage2'],
  ['beetle',     '鋼甲虫',         3, '3d8',  3, '1d6',           '1d3', '3-5', 'insect', ''],
  ['orc',        '豚鬼の戦士',     4, '4d8',  5, '1d8',           '2d3', '4-6', 'humanoid', ''],
  ['ghoul',      '屍喰らい',       4, '4d6',  6, '1d3,1d3,1d6',   '1d4', '4-6', 'undead', 'undead paralyze noSleep'],
  ['wisp',       '鬼火',           4, '3d6',  2, '1d6',           '1d4', '4-6', 'spirit', 'resist30 noSleep mage2'],
  ['magician',   '魔術師',         5, '4d6',  8, '1d4',           '1d4', '4-6', 'caster', 'mage3'],
  ['werewolf',   '人狼',           5, '5d8',  5, '1d4,1d4,1d6',   '1d3', '4-6', 'beast', ''],
  ['vampbat',    '吸血大蝙蝠',     5, '4d8',  4, '1d6',           '2d3', '5-6', 'beast', 'poison flee'],
  ['basilisk',   '石眼トカゲ',     6, '5d8',  4, '1d6',           '1d3', '5-7', 'beast', 'stone'],
  ['troll',      '洞窟トロル',     6, '6d8',  4, '1d6,1d6,2d6',   '1d3', '5-7', 'giant', 'regen'],
  ['darkpriest', '黒衣の司祭',     6, '5d8',  5, '1d6',           '1d4', '5-7', 'caster', 'priest4'],
  ['minotaur',   '牛頭鬼',         7, '7d8',  4, '2d6,1d10',      '1d2', '5-7', 'giant', ''],
  ['wraith',     '亡霊騎士',       7, '7d8',  2, '1d10',          '1d3', '6-8', 'undead', 'undead drain1 noSleep'],
  ['firespirit', '炎の精',         7, '6d8',  3, '2d6',           '1d2', '6-8', 'spirit', 'breath noSleep resist20'],
  ['chimera',    '合成獣',         8, '8d8',  3, '1d8,1d8,2d6',   '1d2', '6-8', 'beast', 'breath'],
  ['archmage',   '大魔術師',       8, '6d8',  4, '1d6',           '1d3', '6-8', 'caster', 'mage5 resist20'],
  ['golem',      '岩の巨像',       8, '10d8', 1, '3d6',           '1d1', '6-8', 'golem', 'noSleep resist40'],
  ['youngdragon','若き竜',         9, '9d8',  0, '1d10,1d10,2d8', '1d2', '7-9', 'dragon', 'breath'],
  ['vampire',    '吸精鬼',        10, '10d8', 0, '1d10',          '1d2', '7-9', 'undead', 'undead drain2 regen mage3 noSleep'],
  ['gargoyle',   '石像鬼',         8, '8d8',  0, '1d6,1d6,1d8',   '1d4', '7-9', 'demon', 'noSleep'],
  ['assassin',   '影の暗殺者',     9, '8d8',  0, '1d8,1d8',       '1d3', '7-9', 'human', 'crit poison'],
  ['frostgiant', '霜の巨人',      11, '12d8', 2, '3d8,3d8',       '1d2', '8-10', 'giant', 'breath'],
  ['lesserdemon','下級魔神',      11, '11d8',-1, '2d6,2d6',       '1d3', '8-10', 'demon', 'mage5 resist30 call'],
  ['necromancer','死霊術師',      12, '9d8',  2, '1d8',           '1d2', '8-10', 'caster', 'mage6 priest4 resist20'],
  ['poisondragon','毒竜',         12, '12d8',-1, '2d8,2d8,3d6',   '1d2', '8-10', 'dragon', 'breath poison'],
  ['elderdragon','古の竜',        15, '15d10',-3, '3d8,3d8,4d6',  '1d2', '9-10', 'dragon', 'breath resist30'],
  ['lich',       '不死の王',      15, '12d10',-2, '1d10',         '1d1', '9-10', 'undead', 'undead drain2 paralyze mage7 resist50 noSleep'],
  ['greaterdemon','上級魔神',     16, '14d10',-4, '3d6,3d6',      '1d2', '9-10', 'demon', 'mage6 resist50 call noSleep'],
  ['shadowmaster','闇忍びの頭目', 14, '12d8',-4, '2d8,2d8',       '1d3', '9-10', 'human', 'crit'],
  ['abysslord',  '深淵の主ザル=ガドラ', 20, '40d10+60', -6, '4d8,4d8', '1d1', '0-0', 'demon', 'mage7 priest5 resist60 noSleep boss breath'],
];

export const MONSTERS = {};
for (const [id, name, lv, hp, ac, atk, grp, fl, type, flags] of RAW) {
  const [f1, f2] = fl.split('-').map(Number);
  const m = {
    id, name, lv, ac, type,
    hp: parseDice(hp),
    atk: atk.split(',').map(parseDice),
    group: parseDice(grp),
    floors: [f1, f2],
    flags: {},
  };
  for (const tok of flags.split(/\s+/).filter(Boolean)) {
    const mm = /^([a-zA-Z]+)(\d+)?$/.exec(tok);
    m.flags[mm[1]] = mm[2] ? parseInt(mm[2], 10) : true;
  }
  if (m.flags.resist) m.flags.resist /= 100;
  // 経験値・所持金はLvと能力から算出
  let bonus = 1;
  for (const k of ['poison', 'paralyze', 'stone', 'drain', 'crit', 'breath', 'regen', 'mage', 'priest', 'call']) if (m.flags[k]) bonus += 0.25;
  m.exp = Math.round((Math.pow(lv, 2.1) * 30 + 10) * bonus);
  m.gold = lv * 6 + 4;
  MONSTERS[id] = m;
}

export function monstersForFloor(floor) {
  return Object.values(MONSTERS).filter(m => m.floors[0] <= floor && floor <= m.floors[1]);
}
