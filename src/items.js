// アイテム定義（オリジナル）
// [id, 名前, 未鑑定名, 種類, 価格, 装備可能職(キー文字), 性能, 出現開始階(0=店売り)]
import { parseDice } from './rng.js';

const ALL = 'FMPTBSLN';
const RAW = [
  // 武器
  ['dagger',      '短剣',         '短い刃物', 'weapon', 10,    'FMTBSLN', { dmg: '1d4' }, 0],
  ['staff',       '樫の杖',       '杖',       'weapon', 10,    ALL,       { dmg: '1d5' }, 0],
  ['mace',        '鉄の槌鉾',     '鈍器',     'weapon', 30,    'FPBSL',   { dmg: '1d7' }, 0],
  ['shortsword',  '小剣',         '剣',       'weapon', 15,    'FTSLN',   { dmg: '1d6' }, 0],
  ['longsword',   '長剣',         '剣',       'weapon', 25,    'FSL',     { dmg: '1d8' }, 0],
  ['axe',         '戦斧',         '斧',       'weapon', 60,    'FSL',     { dmg: '1d10', hit: -1 }, 0],
  ['dagger1',     '短剣+1',       '短い刃物', 'weapon', 600,   'FMTBSLN', { dmg: '1d4+1', hit: 1 }, 2],
  ['mace1',       '槌鉾+1',       '鈍器',     'weapon', 1000,  'FPBSL',   { dmg: '1d7+1', hit: 1 }, 2],
  ['shortsword1', '小剣+1',       '剣',       'weapon', 800,   'FTSLN',   { dmg: '1d6+1', hit: 1 }, 2],
  ['longsword1',  '長剣+1',       '剣',       'weapon', 1200,  'FSL',     { dmg: '1d8+1', hit: 1 }, 2],
  ['cursedblade', '血錆の剣',     '剣',       'weapon', 50,    'FSL',     { dmg: '1d8', hit: -3, cursed: true }, 2],
  ['axe1',        '戦斧+1',       '斧',       'weapon', 1500,  'FSL',     { dmg: '1d10+1' }, 3],
  ['staff1',      '杖+1',         '杖',       'weapon', 700,   ALL,       { dmg: '1d5+1', hit: 1 }, 3],
  ['longsword2',  '長剣+2',       '剣',       'weapon', 4000,  'FSL',     { dmg: '1d8+2', hit: 2 }, 4],
  ['mace2',       '槌鉾+2',       '鈍器',     'weapon', 3500,  'FPBSL',   { dmg: '1d7+2', hit: 2 }, 4],
  ['shortsword2', '小剣+2',       '剣',       'weapon', 3000,  'FTSLN',   { dmg: '1d6+2', hit: 2 }, 4],
  ['katana',      '打刀',         '刀',       'weapon', 8000,  'SN',      { dmg: '2d6+1', hit: 2 }, 5],
  ['mageslayer',  '魔断ちの剣',   '剣',       'weapon', 10000, 'FSL',     { dmg: '1d10+2', hit: 3, slay: 'caster' }, 6],
  ['shadowknife', '影縫いの短刀', '短い刃物', 'weapon', 9000,  'TN',      { dmg: '1d6+3', hit: 4 }, 6],
  ['dragonspear', '竜殺しの槍',   '槍',       'weapon', 12000, 'FSL',     { dmg: '2d6+2', hit: 2, slay: 'dragon' }, 7],
  ['holymace',    '聖者の槌',     '鈍器',     'weapon', 15000, 'PBL',     { dmg: '2d6+3', hit: 3, slay: 'undead' }, 7],
  ['longsword3',  '長剣+3',       '剣',       'weapon', 20000, 'FSL',     { dmg: '1d8+3', hit: 3 }, 7],
  ['starsword',   '星鉄の剣',     '剣',       'weapon', 60000, 'FSL',     { dmg: '2d8+4', hit: 5, extraAtk: 1 }, 9],
  ['greatkatana', '無銘の大太刀', '刀',       'weapon', 80000, 'SN',      { dmg: '3d10', hit: 6, crit: 0.1 }, 9],
  // 鎧
  ['robe',        '長衣',         '衣',   'armor', 15,    ALL,       { ac: 1 }, 0],
  ['leather',     '革鎧',         '鎧',   'armor', 50,    'FPTBSLN', { ac: 2 }, 0],
  ['chain',       '鎖帷子',       '鎧',   'armor', 90,    'FPBSL',   { ac: 3 }, 0],
  ['breast',      '胸甲',         '鎧',   'armor', 200,   'FPSL',    { ac: 4 }, 0],
  ['plate',       '板金鎧',       '鎧',   'armor', 750,   'FSL',     { ac: 5 }, 0],
  ['robe1',       '長衣+1',       '衣',   'armor', 400,   ALL,       { ac: 2 }, 2],
  ['leather1',    '革鎧+1',       '鎧',   'armor', 1000,  'FPTBSLN', { ac: 3 }, 2],
  ['chain1',      '鎖帷子+1',     '鎧',   'armor', 1200,  'FPBSL',   { ac: 4 }, 2],
  ['cursedarmor', '重い鎧',       '鎧',   'armor', 50,    'FPSL',    { ac: -2, cursed: true }, 3],
  ['leather2',    '革鎧+2',       '鎧',   'armor', 3000,  'FPTBSLN', { ac: 4 }, 4],
  ['plate1',      '板金鎧+1',     '鎧',   'armor', 6000,  'FSL',     { ac: 6 }, 4],
  ['chain2',      '鎖帷子+2',     '鎧',   'armor', 4000,  'FPBSL',   { ac: 5 }, 5],
  ['plate2',      '板金鎧+2',     '鎧',   'armor', 15000, 'FSL',     { ac: 7 }, 6],
  ['shadowgarb',  '闇の装束',     '衣',   'armor', 12000, 'TN',      { ac: 6 }, 7],
  ['dragonmail',  '竜鱗の鎧',     '鎧',   'armor', 70000, 'FSL',     { ac: 9 }, 9],
  // 盾
  ['smallshield', '小盾',         '盾',   'shield', 20,    'FPBSL', { ac: 1 }, 0],
  ['largeshield', '大盾',         '盾',   'shield', 40,    'FPSL',  { ac: 2 }, 0],
  ['shield1',     '大盾+1',       '盾',   'shield', 1500,  'FPSL',  { ac: 3 }, 3],
  ['shield2',     '大盾+2',       '盾',   'shield', 8000,  'FPSL',  { ac: 4 }, 6],
  ['wardshield',  '守護の盾',     '盾',   'shield', 40000, 'FPL',   { ac: 5 }, 9],
  // 兜
  ['helm',        '鉄兜',         '兜',   'helm', 100,   'FPSL', { ac: 1 }, 0],
  ['helm1',       '鉄兜+1',       '兜',   'helm', 3000,  'FPSL', { ac: 2 }, 4],
  ['helm2',       '鉄兜+2',       '兜',   'helm', 15000, 'FPSL', { ac: 3 }, 8],
  // 籠手
  ['gauntlet',    '鉄の籠手',     '籠手', 'gloves', 2000,  'FPSL',  { ac: 1 }, 3],
  ['silverglove', '銀の籠手',     '籠手', 'gloves', 20000, 'FPSLN', { ac: 3 }, 7],
  // 装身具
  ['ringguard',   '守りの指輪',   '指輪', 'acc', 3000,  ALL, { ac: 1 }, 3],
  ['ringheal',    '癒しの指輪',   '指輪', 'acc', 20000, ALL, { regen: 1 }, 6],
  ['amulet',      '加護の首飾り', '首飾り', 'acc', 25000, ALL, { ac: 2, save: 0.15 }, 8],
  // 消耗品
  ['potion',      '傷薬',         '薬',   'item', 50,   ALL, { use: 'heal', dice: '1d8+2' }, 0],
  ['antidote',    '毒消し',       '薬',   'item', 30,   ALL, { use: 'cure' }, 0],
  ['elixir',      '霊薬',         '薬',   'item', 2000, ALL, { use: 'heal', dice: '6d8+6' }, 4],
];

export const SLOTS = ['weapon', 'armor', 'shield', 'helm', 'gloves', 'acc'];
export const SLOT_NAMES = { weapon: '武器', armor: '鎧', shield: '盾', helm: '兜', gloves: '籠手', acc: '装身具', item: '道具' };

export const ITEMS = {};
for (const [id, name, unknown, type, price, classes, props, floor] of RAW) {
  const it = { id, name, unknown: unknown + '?', type, price, classes, floor, ...props };
  if (props.dmg) it.dmg = parseDice(props.dmg);
  if (props.dice) it.dice = parseDice(props.dice);
  it.hit = props.hit || 0;
  it.ac = props.ac || 0;
  ITEMS[id] = it;
}
export const SHOP_BASE = RAW.filter(r => r[7] === 0).map(r => r[0]);

export function itemName(entry) {
  const it = ITEMS[entry.id];
  return entry.identified ? it.name : it.unknown;
}
