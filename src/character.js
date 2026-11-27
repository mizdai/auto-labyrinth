// キャラクター生成・能力計算
import { R, diceAvg } from './rng.js';
import { RACES, CLASSES, STATS, STAT_NAMES, SPELLS, SPELL_BY_ID, NAME_SYLLABLES, NAME_ENDINGS } from './data.js';
import { ITEMS, SLOTS } from './items.js';

let nextId = 1;
export function setNextId(n) { nextId = n; }
export function getNextId() { return nextId; }

export function randomName(used = new Set()) {
  for (let t = 0; t < 50; t++) {
    let n = '';
    const len = R.range(2, 3);
    for (let i = 0; i < len; i++) n += R.pick(NAME_SYLLABLES);
    n += R.pick(NAME_ENDINGS);
    if (n.length <= 6 && !used.has(n)) return n;
  }
  return 'ナナシ' + nextId;
}

export function rollBonus() {
  let b = R.range(5, 9);
  if (R.chance(0.12)) b += 10;
  if (R.chance(0.03)) b += 20;
  return b;
}

export function meetsReq(stats, cls) {
  const req = CLASSES[cls].req;
  return Object.entries(req).every(([k, v]) => stats[k] >= v);
}

// 目標職に就けるよう自動でボーナスを振る。成功時は stats を返す
export function allocate(race, cls, bonus) {
  const base = { ...RACES[race].base };
  const req = CLASSES[cls].req;
  let need = 0;
  for (const k of STATS) need += Math.max(0, (req[k] || 0) - base[k]);
  if (need > bonus) return null;
  const st = { ...base };
  for (const k of STATS) st[k] = Math.max(st[k], req[k] || 0);
  let rest = bonus - need;
  // 残りの振り方：
  // 1. 職業の優先する能力値を、順番に1点ずつ15まで（15あれば十分。18まではレベルアップで伸びる）
  // 2. 将来の転職先（魔術師→君主、僧侶→侍など）の条件に届くまで
  // 3. まだ余れば、優先する能力値を18まで、それでも余れば残りの能力値へ
  const raise = (keys, cap) => {
    let moved = true;
    while (rest > 0 && moved) {
      moved = false;
      for (const k of keys) if (rest > 0 && st[k] < cap) { st[k]++; rest--; moved = true; }
    }
  };
  const prio = CLASSES[cls].prio;
  raise(prio, 15);
  const future = FUTURE_CLASS[cls];
  if (future) {
    const freq = CLASSES[future].req;
    for (const k of STATS) while (rest > 0 && freq[k] && st[k] < freq[k]) { st[k]++; rest--; }
  }
  raise(prio, 18);
  raise(STATS, 18);
  return st;
}
// 能力値が余ったときに見据える、将来の転職先
const FUTURE_CLASS = { mage: 'lord', priest: 'samurai', samurai: 'lord', fighter: 'samurai' };

const RACE_FOR = {
  fighter: ['dwarf', 'human'], mage: ['elf', 'human', 'gnome'], priest: ['gnome', 'dwarf', 'elf'],
  thief: ['halfling', 'gnome'], bishop: ['elf', 'gnome'], samurai: ['dwarf', 'human'],
  lord: ['dwarf', 'human'], ninja: ['human', 'dwarf'],
};

// 職業 cls のキャラを作成。上位職は振り直しを繰り返し、だめなら fallback 職
export function createCharacter(cls, opts = {}) {
  const { align = null, fallback = null, tries = 150, used = new Set() } = opts;
  const races = RACE_FOR[cls];
  let stats = null, race = null, target = cls;
  for (let t = 0; t < tries && !stats; t++) {
    race = R.pick(races);
    stats = allocate(race, cls, rollBonus());
  }
  if (!stats && fallback) { target = fallback; race = R.pick(RACE_FOR[fallback]); stats = allocate(race, fallback, 30) || { ...RACES[race].base }; }
  if (!stats) { stats = allocate(race, cls, 40) || { ...RACES[race].base }; }
  const c = CLASSES[target];
  let al = align && c.align.includes(align) ? align : (c.align.includes('G') ? 'G' : c.align[0]);
  const ch = {
    id: nextId++, name: randomName(used), race, cls: target, align: al,
    level: 1, exp: 0, stats, age: RACES[race].age + R.int(4), weeks: 0,
    hp: 0, maxhp: 0, status: 'ok', poison: false,
    equip: { weapon: null, armor: null, shield: null, helm: null, gloves: null, acc: null },
    mp: { mage: [0, 0, 0, 0, 0, 0, 0], priest: [0, 0, 0, 0, 0, 0, 0] },
    kills: 0,
  };
  ch.maxhp = Math.max(3, c.hd + R.int(Math.ceil(c.hd * 0.5)) + vitBonus(ch));
  ch.hp = ch.maxhp;
  restoreMP(ch);
  return ch;
}

// 今の職業・レベル・生命力で、最大HPを1から振り直した値（1レベル目は作成時と同じ振り方）
export function rollMaxHP(c) {
  const hd = CLASSES[c.cls].hd, vb = vitBonus(c);
  let t = Math.max(3, hd + R.int(Math.ceil(hd * 0.5)) + vb);
  for (let l = 2; l <= c.level; l++) t += Math.max(1, R.d(hd) + vb);
  return t;
}
export const vitBonus = (c) => { const v = c.stats.vit; return v <= 3 ? -2 : v <= 5 ? -1 : v >= 18 ? 3 : v >= 17 ? 2 : v >= 16 ? 1 : 0; };
export const strBonus = (c) => { const v = c.stats.str; return v <= 5 ? -1 : v >= 18 ? 3 : v >= 17 ? 2 : v >= 16 ? 1 : 0; };
export const agiBonus = (c) => { const v = c.stats.agi; return v <= 5 ? -1 : v >= 18 ? 3 : v >= 16 ? 2 : v >= 14 ? 1 : 0; };

export const isAlive = (c) => c.status !== 'dead' && c.status !== 'ash' && c.status !== 'lost';
export const canAct = (c) => c.status === 'ok';
export const isHealthy = (c) => c.status === 'ok' || c.status === 'asleep';

// 今の職業とレベルで使える呪文の回数（転職前に覚えた呪文は含まない）
function classSlots(c) {
  const res = { mage: [0, 0, 0, 0, 0, 0, 0], priest: [0, 0, 0, 0, 0, 0, 0] };
  const sp = CLASSES[c.cls].spells;
  for (const school of Object.keys(sp)) {
    const [start, step] = sp[school];
    for (let s = 1; s <= 7; s++) {
      const first = start + step * (s - 1);
      if (c.level >= first) res[school][s - 1] = Math.min(9, 1 + Math.floor((c.level - first) / step));
    }
  }
  return res;
}
// 呪文の回数。転職前に覚えた呪文（c.learned）があるレベルは、その呪文の数だけは回数が残る
export function maxSlots(c) {
  const res = classSlots(c);
  if (c.learned && c.learned.length) {
    const cnt = { mage: [0, 0, 0, 0, 0, 0, 0], priest: [0, 0, 0, 0, 0, 0, 0] };
    for (const id of c.learned) { const s = SPELL_BY_ID[id]; if (s) cnt[s.school][s.lv - 1]++; }
    for (const sc of ['mage', 'priest']) for (let i = 0; i < 7; i++) res[sc][i] = Math.max(res[sc][i], Math.min(9, cnt[sc][i]));
  }
  return res;
}
// 仲間としての有用さ（レベル相当）。控えの復帰や蘇生の順番に使う。
// レベルに加えて、転職前に覚えた呪文（今の職業ではまだ使えない最高レベル×1.5）と、
// 職業・レベルの割に高いHP（1レベル分の平均の伸びで割った値×0.7）を足す
export function charValue(c) {
  const own = classSlots(c);
  let v = c.level;
  for (const sc of ['mage', 'priest']) {
    let hi = 0;
    for (const id of c.learned || []) { const s = SPELL_BY_ID[id]; if (s && s.school === sc && own[sc][s.lv - 1] === 0) hi = Math.max(hi, s.lv); }
    v += hi * 1.5;
  }
  const hd = CLASSES[c.cls].hd, perLv = hd / 2 + 0.5;
  const expected = hd * 1.25 + perLv * (c.level - 1);
  v += Math.max(0, c.maxhp - expected) / perLv * 0.7;
  return v;
}
export const knowsSpell = (c, sp) => classSlots(c)[sp.school][sp.lv - 1] > 0 || !!(c.learned && c.learned.includes(sp.id));
export function restoreMP(c) { const m = maxSlots(c); c.mp = { mage: [...m.mage], priest: [...m.priest] }; }
export function knownSpells(c) {
  const m = classSlots(c);
  return SPELLS.filter(s => m[s.school][s.lv - 1] > 0 || (c.learned && c.learned.includes(s.id)));
}
export function canCast(c, sp) {
  return canAct(c) && c.mp[sp.school][sp.lv - 1] > 0 && knowsSpell(c, sp);
}

// 転職：レベル1・経験値0に戻り、能力値は種族の基本値に戻る。
// 最大HPと、それまでに覚えた呪文は残る（呪文の回数は、覚えている呪文の数だけ残る）
export function changeClass(c, cls) {
  const from = c.cls;
  c.learned = [...new Set([...(c.learned || []), ...knownSpells(c).map(s => s.id)])];
  c.history = [...(c.history || []), from];
  c.cls = cls;
  c.level = 1; c.exp = 0;
  c.stats = { ...RACES[c.race].base };
  c.status = 'ok'; c.hp = c.maxhp;
  const removed = [];
  for (const s of SLOTS) {
    const e = c.equip[s];
    if (e && !canEquip(c, ITEMS[e.id])) { removed.push(e); c.equip[s] = null; }
  }
  restoreMP(c);
  return { from, removed };
}
export function hasMP(c) { return c.mp.mage.some(v => v > 0) || c.mp.priest.some(v => v > 0); }
export function mpRatio(c) {
  const m = maxSlots(c); let a = 0, b = 0;
  for (const sc of ['mage', 'priest']) for (let i = 0; i < 7; i++) { a += c.mp[sc][i] * (i + 1); b += m[sc][i] * (i + 1); }
  return b ? a / b : 1;
}

export function equipItems(c) { return SLOTS.map(s => c.equip[s]).filter(Boolean).map(e => ITEMS[e.id]); }

export function charAC(c, buff = 0) {
  let ac = 10;
  for (const it of equipItems(c)) ac -= it.ac;
  if (c.cls === 'ninja') {
    const armored = c.equip.armor || c.equip.shield;
    ac -= armored ? Math.floor(c.level / 5) : Math.floor(c.level / 3) + 2;
  }
  ac -= agiBonus(c) > 1 ? 1 : 0;
  return ac - buff;
}
export function hitBonus(c) {
  const cl = CLASSES[c.cls];
  const w = c.equip.weapon ? ITEMS[c.equip.weapon.id] : null;
  return cl.hitBase + Math.floor(c.level / cl.hitDiv) + strBonus(c) + (w ? w.hit : 0);
}
export function numAttacks(c) {
  const cl = CLASSES[c.cls];
  const w = c.equip.weapon ? ITEMS[c.equip.weapon.id] : null;
  let n = cl.atkDiv ? 1 + Math.floor(c.level / cl.atkDiv) : 1;
  n = Math.min(cl.maxAtk, n) + (w && w.extraAtk ? w.extraAtk : 0);
  return n;
}
export function weaponDice(c) {
  const w = c.equip.weapon ? ITEMS[c.equip.weapon.id] : null;
  if (w) return w.dmg;
  if (c.cls === 'ninja') return [2, 4 + Math.floor(c.level / 4), 0];
  return [1, 2, 0];
}

export function canEquip(c, item) { return item.classes.includes(CLASSES[c.cls].key); }

export const EXP_SCALE = 0.3;
// 経験値テーブル（Lv に到達するのに必要な累計経験値）
export function expFor(cls, level) {
  if (level <= 1) return 0;
  const base = Math.round(CLASSES[cls].exp * EXP_SCALE);
  let t = base;
  for (let l = 3; l <= Math.min(level, 13); l++) t = Math.round(t * 1.72);
  if (level > 13) {
    // Lv13以降：Lv13→14の必要量を基準に、1レベルごとに必要量を10%ずつ増やす
    const t13 = expFor(cls, 13), inc = Math.round(t13 * 0.6), n = level - 13;
    t = t13 + Math.round(inc * (n + 0.1 * n * (n - 1) / 2));
  }
  return t;
}
export const expNext = (c) => expFor(c.cls, c.level + 1);

// 宿で呼ぶ。上がった場合はメッセージ配列を返す
// 宿屋で呼ぶ。上がった場合は、1レベルごとに
//   「〇〇はレベル6に上がった！」「HP 53→71　力 15→16」「イヤシの呪文を覚えた！」
// の形のメッセージを返す（2行目は変化した値だけ、3行目は覚えた呪文があるときだけ）
export function tryLevelUp(c) {
  const msgs = [];
  while (c.exp >= expNext(c)) {
    const beforeSpells = new Set(knownSpells(c).map(s => s.id));
    const hpBefore = c.maxhp;
    c.level++;
    const statChanges = [];
    for (const k of STATS) {
      const r = R.next();
      const downP = c.age >= 40 ? 0.15 : 0.04;
      const old = c.stats[k];
      if (r < 0.28 && c.stats[k] < 18) c.stats[k]++;
      else if (r > 1 - downP && c.stats[k] > 3) c.stats[k]--;
      if (c.stats[k] !== old) statChanges.push(`${STAT_NAMES[k]} ${old}→${c.stats[k]}`);
    }
    // HP：全レベル分を振り直し、今の最大HPより高ければその値に、届かなければ1だけ増える
    const rolled = rollMaxHP(c);
    const gain = Math.max(1, rolled - c.maxhp);
    c.maxhp += gain; c.hp += gain;
    const changes = [`HP ${hpBefore}→${c.maxhp}`, ...statChanges];
    const m = maxSlots(c);
    for (const sc of ['mage', 'priest']) for (let i = 0; i < 7; i++) c.mp[sc][i] = Math.max(c.mp[sc][i], m[sc][i]);
    const learned = knownSpells(c).filter(s => !beforeSpells.has(s.id)).map(s => s.name);
    msgs.push(`${c.name}はレベル${c.level}に上がった！`);
    msgs.push(changes.join('　'));
    if (learned.length) msgs.push(`${learned.join('、')}の呪文を覚えた！`);
  }
  return msgs;
}

export function drainLevel(c, n) {
  for (let i = 0; i < n && c.level > 1; i++) {
    c.level--;
    const loss = Math.max(1, Math.round(CLASSES[c.cls].hd / 2 + 0.5));
    c.maxhp = Math.max(1, c.maxhp - loss);
    c.hp = Math.min(c.hp, c.maxhp);
  }
  c.exp = Math.min(c.exp, Math.max(0, expFor(c.cls, c.level + 1) - 1));
  const m = maxSlots(c);
  for (const sc of ['mage', 'priest']) for (let i = 0; i < 7; i++) c.mp[sc][i] = Math.min(c.mp[sc][i], m[sc][i]);
}

export function itemScore(c, item) {
  if (!canEquip(c, item) || item.cursed) return -1;
  if (item.type === 'weapon') {
    let s = diceAvg(item.dmg) + item.hit * 1.2;
    if (item.extraAtk) s += 8;
    if (item.crit) s += 6;
    if (item.slay) s += 2;
    return s;
  }
  if (item.type === 'acc') return (item.ac || 0) * 3 + (item.regen ? 8 : 0) + (item.save ? 4 : 0);
  return item.ac * 3;
}
export function saveChance(c) {
  let s = 0.1 + c.level * 0.03 + (c.stats.luk - 8) * 0.02;
  const acc = c.equip.acc ? ITEMS[c.equip.acc.id] : null;
  if (acc && acc.save) s += acc.save;
  return Math.max(0.05, Math.min(0.9, s));
}

export function roleOf(c) {
  const k = c.cls;
  return { fighter: 'front', samurai: 'front', lord: 'front', ninja: 'front', priest: 'mid', thief: 'back', mage: 'back', bishop: 'back' }[k];
}
