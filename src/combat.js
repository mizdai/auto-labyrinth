// 戦闘処理（ジェネレーター。yield ごとに1メッセージ分の時間が進む）
import { R, diceAvg } from './rng.js';
import { MONSTERS, monstersForFloor } from './monsters.js';
import { SPELLS, SPELL_BY_ID, CLASSES, ALIGN_NAMES } from './data.js';
import { ITEMS } from './items.js';
import {
  isAlive, canAct, charAC, hitBonus, numAttacks, weaponDice, strBonus, agiBonus,
  saveChance, drainLevel, maxSlots, shiftAlignment,
} from './character.js';
import { chooseActions, friendlyChoice } from './ai.js';

// 友好的なことがある魔物の種別（話の通じる相手）
const FRIENDLY_TYPES = ['human', 'humanoid', 'caster'];

export function makeEncounter(floor, opts = {}) {
  const pool = monstersForFloor(floor);
  let nGroups = 1;
  if (R.chance(floor <= 2 ? 0.08 : 0.15 + floor * 0.04)) nGroups++;
  if (floor >= 3 && R.chance(floor * 0.03)) nGroups++;
  if (opts.lair && floor >= 2) nGroups = Math.min(4, nGroups + 1);
  const groups = [];
  const used = new Set();
  for (let i = 0; i < nGroups; i++) {
    let cand = pool.filter(m => !used.has(m.id));
    if (!cand.length) break;
    // 深い階ほど強い敵が出やすい
    const m = R.weighted(cand, mm => 1 + Math.max(0, mm.lv - floor * 0.6));
    used.add(m.id);
    let n = Math.max(1, Math.min(9, R.roll(m.group)));
    if (opts.lair) n = Math.min(9, n + 1);
    groups.push(makeGroup(m, n));
  }
  return groups;
}
export function makeGroup(m, n) {
  const units = [];
  for (let i = 0; i < n; i++) { const hp = Math.max(1, R.roll(m.hp)); units.push({ hp, max: hp, asleep: 0, silenced: false }); }
  return { mon: m, units };
}
export function bossEncounter() {
  return [
    makeGroup(MONSTERS.abysslord, 1),
    makeGroup(MONSTERS.greaterdemon, 2),
    makeGroup(MONSTERS.lich, 1),
  ];
}

export const liveUnits = (g) => g.units.filter(u => u.hp > 0);
export const liveGroups = (B) => B.groups.filter(g => liveUnits(g).length > 0);
const partyAble = (party) => party.filter(canAct);
const front = (party) => party.slice(0, 3);

function groupLabel(g) { const n = liveUnits(g).length; return n > 1 ? `${g.mon.name}×${n}` : g.mon.name; }

// 戦闘本体。result: 'win' | 'fled' | 'wipe' を B.result に入れる
export function* battle(game, groups, opts = {}) {
  const party = game.party;
  const B = { groups, round: 0, partyAC: game.dungeonAC || 0, baseAC: game.dungeonAC || 0, result: null, exp: 0, gold: 0, boss: !!opts.boss, lair: !!opts.lair, noRun: !!opts.noRun || !!opts.boss, ward: game.dungeonWard || 0 };
  game.battle = B;
  for (const c of party) { c._silenced = false; c._acBuff = 0; }
  game.log(groups.map(groupLabel).join('、') + ' が現れた！', 'enc');
  yield 2;

  // 友好的な相手
  const g0 = groups[0].mon;
  // 襲うか立ち去るかはAIが決め、その選択で仲間の性格が変わることがある
  if (!opts.boss && !opts.lair && groups.length === 1 && FRIENDLY_TYPES.includes(g0.type) && R.chance(0.12)) {
    game.log(`${g0.name}たちは友好的なようだ。`);
    yield 1;
    const act = friendlyChoice(game, groups[0]);
    game.log(act === 'fight' ? 'パーティは襲いかかった！' : 'パーティは立ち去った。');
    yield 1;
    for (const c of party) {
      if (shiftAlignment(c, act)) { game.log(`${c.name}の性格が${ALIGN_NAMES[act === 'fight' ? 'G' : 'E']}から${ALIGN_NAMES[c.align]}に変わった。`, 'sys'); yield 1; }
    }
    if (act === 'leave') { B.result = 'fled'; game.battle = null; return B; }
  }

  // 不意打ち判定
  const sr = R.next();
  let surprise = null;
  if (!opts.boss && sr < 0.1) surprise = 'party';
  else if (!opts.boss && sr > 0.92) surprise = 'monster';
  if (surprise === 'party') { game.log('魔物たちはまだこちらに気づいていない！'); yield 1; }
  if (surprise === 'monster') { game.log('魔物に不意を突かれた！'); yield 1; }

  while (!B.result) {
    B.round++;
    const acts = [];
    if (surprise !== 'monster') {
      const choices = chooseActions(game, B);
      for (const c of party) if (canAct(c) && choices.has(c)) acts.push({ who: c, side: 'p', act: choices.get(c), init: R.d(10) + agiBonus(c) * 2 });
    }
    if (surprise !== 'party') {
      for (const g of B.groups) for (const u of g.units) if (u.hp > 0) acts.push({ who: u, g, side: 'm', init: R.d(10) + Math.floor(g.mon.lv / 4) });
    }
    surprise = null;
    acts.sort((a, b) => b.init - a.init);
    for (const a of acts) {
      if (B.result) break;
      if (a.side === 'p') { if (!canAct(a.who)) continue; yield* partyAction(game, B, a.who, a.act); }
      else { if (a.who.hp <= 0) continue; yield* monsterAction(game, B, a.g, a.who); }
      if (!liveGroups(B).length) B.result = 'win';
      else if (!party.some(c => canAct(c) || c.status === 'asleep')) B.result = 'wipe';
    }
    if (B.result) break;
    // ラウンド終了処理
    for (const c of party) {
      if (c.status === 'asleep' && R.chance(0.5)) c.status = 'ok';
      if (isAlive(c) && c.poison) {
        c.hp -= 1;
        if (c.hp <= 0) { c.hp = 0; c.status = 'dead'; game.log(`${c.name}は毒で力尽きた…`, 'bad'); yield 1; }
      }
      const acc = c.equip.acc ? ITEMS[c.equip.acc.id] : null;
      if (acc && acc.regen && isAlive(c)) c.hp = Math.min(c.maxhp, c.hp + acc.regen);
    }
    for (const g of B.groups) for (const u of g.units) {
      if (u.hp <= 0) continue;
      if (u.asleep > 0) u.asleep--;
      if (u.afraid > 0) u.afraid--;
      if (g.mon.flags.regen) u.hp = Math.min(u.max, u.hp + Math.max(1, Math.floor(g.mon.lv / 2)));
    }
    // 死亡・灰・石化・麻痺の仲間はターンの終わりに最後尾へ下げ、動ける仲間を前へ詰める
    {
      const down = (c) => c.status === 'dead' || c.status === 'ash' || c.status === 'stoned' || c.status === 'paralyzed';
      const before = party.map(c => c.id).join(',');
      const ordered = [...party.filter(c => !down(c)), ...party.filter(down)];
      if (ordered.map(c => c.id).join(',') !== before) {
        party.splice(0, party.length, ...ordered);
        game.log('倒れた仲間を後ろへ下げ、隊列を組み直した。');
        yield 1;
      }
    }
    // 前のグループが全滅したら詰める
    B.groups = B.groups.filter(g => liveUnits(g).length > 0);
    if (!B.groups.length) B.result = 'win';
    else if (!party.some(c => canAct(c) || c.status === 'asleep')) B.result = 'wipe';
    if (B.round > 60 && !B.result) { game.log('パーティは戦いを切り上げて退いた。'); B.result = 'fled'; }
  }

  for (const c of party) { if (c.status === 'asleep') c.status = 'ok'; c._silenced = false; c._acBuff = 0; }
  if (B.result === 'win') {
    const alive = party.filter(isAlive);
    const each = Math.floor(B.exp / Math.max(1, alive.length));
    for (const c of alive) c.exp += each;
    game.gold += B.gold;
    game.stats.battles++;
    game.log(`魔物を倒した。経験値${each}を得た。${B.gold}Gを手に入れた。`, 'good');
    yield 2;
  }
  game.battle = null;
  return B;
}

function pickMeleeTarget(B, pref) {
  const gs = B.groups.filter(g => liveUnits(g).length);
  const reach = gs.slice(0, 2);
  let g = reach.includes(pref) ? pref : reach[0];
  return g || null;
}

function* partyAction(game, B, c, act) {
  const party = game.party;
  switch (act.type) {
    case 'fight': {
      const idx = party.indexOf(c);
      if (idx >= 3) { game.log(`${c.name}は身構えている。`); yield 1; return; }
      const g = pickMeleeTarget(B, act.group);
      if (!g) return;
      const tgt = R.pick(liveUnits(g));
      const n = numAttacks(c);
      let hits = 0, dmg = 0, killed = false;
      const w = c.equip.weapon ? ITEMS[c.equip.weapon.id] : null;
      for (let i = 0; i < n && tgt.hp > 0; i++) {
        const roll = R.d(20);
        const need = 15 - hitBonus(c) - g.mon.ac - (g.acMod || 0) - (tgt.asleep || tgt.paralyzed ? 5 : 0);
        if (roll === 20 || (roll !== 1 && roll >= need)) {
          hits++;
          let d = Math.max(1, R.roll(weaponDice(c)) + strBonus(c));
          if (tgt.asleep || tgt.paralyzed) d *= 2;
          if (w && w.slay && (w.slay === g.mon.type || (w.slay === 'undead' && g.mon.flags.undead) || (w.slay === 'caster' && (g.mon.flags.mage || g.mon.flags.priest)))) d *= 2;
          dmg += d; tgt.hp -= d;
          // 忍者・名刀の急所攻撃
          const critP = (c.cls === 'ninja' && !c.equip.weapon ? Math.min(0.4, c.level * 0.02) : 0) + (w && w.crit ? w.crit : 0);
          if (tgt.hp > 0 && critP > 0 && !g.mon.flags.boss && R.chance(critP)) {
            tgt.hp = 0; killed = true;
            game.log(`${c.name}は${g.mon.name}の急所を突いた！ 首をはねた！`, 'good');
          }
        }
      }
      if (hits === 0) game.log(`${c.name}は${g.mon.name}に斬りかかったが、外れた。`);
      else if (!killed) game.log(`${c.name}は${g.mon.name}に${hits}回命中、${dmg}のダメージ。`);
      if (tgt.hp <= 0) { onKill(game, B, g, tgt, c); }
      yield 1;
      return;
    }
    case 'spell': yield* castSpell(game, B, c, SPELL_BY_ID[act.spell], act.target); return;
    case 'parry': return; // 防御は表示を省略
    case 'item': {
      const e = game.bag[act.bagIndex];
      if (!e) return;
      const it = ITEMS[e.id];
      const t = act.target;
      if (it.use === 'heal') { const h = R.roll(it.dice); t.hp = Math.min(t.maxhp, t.hp + h); game.log(`${c.name}は${it.name}を使った。${t.name}のHPが${h}回復。`); }
      else if (it.use === 'cure') { t.poison = false; game.log(`${c.name}は${it.name}を使った。${t.name}の毒が消えた。`); }
      game.bag.splice(act.bagIndex, 1);
      yield 1; return;
    }
    case 'run': {
      if (B.noRun) { game.log('逃げられない！'); yield 1; return; }
      const avgAgi = party.filter(canAct).reduce((s, x) => s + x.stats.agi, 0) / Math.max(1, partyAble(party).length);
      if (R.chance(0.45 + (avgAgi - 10) * 0.03)) { game.log('パーティは逃げ出した！'); B.result = 'fled'; }
      else game.log('逃げ出そうとしたが、回り込まれた！');
      yield 1; return;
    }
  }
}

function onKill(game, B, g, u, killer) {
  u.hp = 0;
  if (!u.summoned) B.exp += g.mon.exp;
  B.gold += Math.round(g.mon.gold * (0.5 + R.next()));
  if (killer) killer.kills = (killer.kills || 0) + 1;
  game.log(`${g.mon.name}を倒した。`);
  if (g.mon.flags.boss) B.bossKilled = true;
}

function* castSpell(game, B, c, sp, target) {
  if (c._silenced) { game.log(`${c.name}は呪文を唱えられない！`); yield 1; return; }
  c.mp[sp.school][sp.lv - 1]--;
  game.log(`${c.name}は${sp.name}を唱えた！`, 'spell');
  yield 1;
  const party = game.party;
  switch (sp.effect) {
    case 'damage': {
      let targets = [];
      if (sp.target === 'enemy') { const g = B.groups.includes(target) && liveUnits(target).length ? target : liveGroups(B)[0]; if (g) targets = [[g, R.pick(liveUnits(g))]]; }
      else if (sp.target === 'group') { const g = B.groups.includes(target) && liveUnits(target).length ? target : liveGroups(B)[0]; if (g) targets = liveUnits(g).map(u => [g, u]); }
      else if (sp.target === 'all') { for (const g of liveGroups(B)) for (const u of liveUnits(g)) targets.push([g, u]); }
      if (sp.only === 'undead' && targets.length && !targets[0][0].mon.flags.undead) {
        game.log(`${targets[0][0].mon.name}には効かない。`); yield 1; return;
      }
      // グループごとに「〇〇3体に6〜35のダメージ。2体を倒した。」の1行にまとめる
      const byGroup = new Map();
      for (const [g, u] of targets) {
        const r = byGroup.get(g) || { ds: [], kills: 0, resisted: 0, n: 0 };
        byGroup.set(g, r); r.n++;
        if (isResisted(B, g)) { r.resisted++; continue; }
        const d = R.roll(sp.dice);
        u.hp -= d; r.ds.push(d);
        if (u.hp <= 0) { r.kills++; onKillQuiet(B, g, u, c); }
      }
      for (const [g, r] of byGroup) {
        const name = g.mon.name;
        if (!r.ds.length) { game.log(`${name}には呪文が効かなかった。`); continue; }
        let msg = `${name}${r.n > 1 ? r.n + '体' : ''}に${rangeStr(r.ds)}のダメージ。`;
        if (r.kills) msg += r.n > 1 ? `${r.kills}体を倒した。` : '倒した。';
        if (r.resisted) msg += `${r.resisted}体には効かなかった。`;
        game.log(msg);
      }
      yield 1; return;
    }
    case 'sleep': {
      const g = B.groups.includes(target) ? target : liveGroups(B)[0];
      if (!g) return;
      let n = 0;
      const one = sp.target === 'enemy';
      const pool = liveUnits(g);
      if (!pool.length) return;
      for (const u of one ? [R.pick(pool)] : pool) {
        if (g.mon.flags.noSleep || g.mon.flags.boss || (isResisted(B, g))) continue;
        if (R.chance((one ? 0.95 : 0.75) - g.mon.lv * 0.05)) { u.asleep = R.range(2, one ? 5 : 4); n++; }
      }
      game.log(n ? `${g.mon.name}が${n}体眠った。` : `${g.mon.name}は眠らなかった。`);
      yield 1; return;
    }
    case 'silence': {
      const gs = sp.target === 'all' ? liveGroups(B) : [B.groups.includes(target) ? target : liveGroups(B)[0]].filter(Boolean);
      if (!gs.length) return;
      let n = 0;
      for (const g of gs) for (const u of liveUnits(g)) if (!(isResisted(B, g)) && R.chance(0.7 - g.mon.lv * 0.03)) { u.silenced = true; n++; }
      const who = sp.target === 'all' ? '魔物たち' : gs[0].mon.name;
      game.log(n ? `${who}${n}体の呪文を封じた。` : `${who}には効かなかった。`);
      yield 1; return;
    }
    case 'death': {
      const g = B.groups.includes(target) ? target : liveGroups(B)[0];
      if (!g) return;
      let n = 0;
      for (const u of liveUnits(g)) {
        if (g.mon.lv > sp.maxLv || g.mon.flags.boss || (isResisted(B, g))) continue;
        if (R.chance(0.7)) { n++; onKillQuiet(B, g, u, c); }
      }
      game.log(n ? `${g.mon.name}${n}体の命を奪った。` : `${g.mon.name}には効かなかった。`);
      yield 1; return;
    }
    case 'dispel': {
      const g = B.groups.includes(target) ? target : liveGroups(B)[0];
      if (!g) return;
      if (!g.mon.flags.undead) { game.log(`${g.mon.name}には効かない。`); yield 1; return; }
      let n = 0;
      for (const u of liveUnits(g)) if (!g.mon.flags.boss && R.chance(0.95 - g.mon.lv * 0.05 + c.level * 0.02)) { n++; onKillQuiet(B, g, u, c); }
      game.log(n ? `${g.mon.name}${n}体が塵と消えた。` : `${g.mon.name}は祓えなかった。`);
      yield 1; return;
    }
    case 'ac': {
      if (sp.target === 'party') { B.partyAC += sp.amount; game.log(`パーティの守りが固くなった（AC-${sp.amount}）。`); }
      else {
        const t = sp.target === 'self' ? c : target;
        if (t && isAlive(t)) { t._acBuff = (t._acBuff || 0) + sp.amount; game.log(`${t.name}の守りが固くなった（AC-${sp.amount}）。`); }
      }
      yield 1; return;
    }
    case 'ward': {
      const add = Math.min(0.4, 0.25 + c.level * 0.01);
      B.ward = Math.min(0.75, (B.ward || 0) + add);
      game.log(`パーティは障壁に包まれた（呪文・ブレスを${Math.round(B.ward * 100)}%軽減）。`);
      yield 1; return;
    }
    case 'unresist': {
      B.resistDown = Math.min(1, (B.resistDown || 0) + 0.1);
      game.log(`魔物たちの守りの力が弱まった（呪文への抵抗-${Math.round(B.resistDown * 100)}%）。`);
      yield 1; return;
    }
    case 'debuff':
    case 'fear': {
      const gs = sp.target === 'all' ? liveGroups(B) : [B.groups.includes(target) && liveUnits(target).length ? target : liveGroups(B)[0]].filter(Boolean);
      for (const g of gs) {
        g.acMod = (g.acMod || 0) + sp.amount;
        if (sp.effect === 'fear') for (const u of liveUnits(g)) if (!g.mon.flags.boss && !(isResisted(B, g)) && R.chance(0.6)) u.afraid = R.range(2, 3);
      }
      const who = sp.target === 'all' ? '魔物たち' : (gs[0] ? gs[0].mon.name : '魔物');
      game.log(sp.effect === 'fear' ? `${who}は怯えている（AC+${sp.amount}）。` : `${who}は闇に包まれた（AC+${sp.amount}）。`);
      yield 1; return;
    }
    case 'stone':
    case 'paralyze': {
      const g = B.groups.includes(target) && liveUnits(target).length ? target : liveGroups(B)[0];
      if (!g) return;
      let n = 0;
      for (const u of liveUnits(g)) {
        if (g.mon.flags.boss || (isResisted(B, g))) continue;
        const p = (sp.effect === 'stone' ? 0.7 : 0.65) - g.mon.lv * 0.03;
        if (!R.chance(p)) continue;
        n++;
        if (sp.effect === 'stone') onKillQuiet(B, g, u, c); else u.paralyzed = true;
      }
      game.log(n ? `${g.mon.name}${n}体が${sp.effect === 'stone' ? '石になった' : '麻痺した'}。` : `${g.mon.name}には効かなかった。`);
      yield 1; return;
    }
    case 'deathOne':
    case 'deathGroup':
    case 'banish': {
      const g = B.groups.includes(target) && liveUnits(target).length ? target : liveGroups(B)[0];
      if (!g) return;
      if (sp.effect === 'banish' && g.mon.type !== 'demon') { game.log(`${g.mon.name}には効かない。`); yield 1; return; }
      const tough = ['undead', 'demon', 'insect', 'golem'].includes(g.mon.type) || g.mon.flags.undead;
      const units = sp.effect === 'deathGroup' ? liveUnits(g) : [R.pick(liveUnits(g))];
      let n = 0;
      for (const u of units) {
        if (g.mon.flags.boss || (isResisted(B, g))) continue;
        const p = sp.effect === 'banish' ? 0.9 : sp.effect === 'deathOne' ? (tough ? 0.3 : 0.9) : (tough ? 0.15 : 0.4);
        if (R.chance(p)) { n++; onKillQuiet(B, g, u, c); }
      }
      game.log(n ? `${g.mon.name}${n > 1 ? n + '体' : ''}の命を奪った。` : `${g.mon.name}には効かなかった。`);
      yield 1; return;
    }
    case 'chaos': {
      // 敵1体ごとに、眠り・麻痺・呪文封じ・恐怖・石化のどれかをランダムにかける（ボスには効かない）
      const counts = { 眠った: 0, 麻痺した: 0, 呪文を封じられた: 0, 怯えた: 0, 石になった: 0 };
      for (const g of liveGroups(B)) for (const u of liveUnits(g)) {
        if (g.mon.flags.boss || isResisted(B, g) || !R.chance(0.8 - g.mon.lv * 0.02)) continue;
        const r = R.next();
        if (r < 0.25) { if (g.mon.flags.noSleep) continue; u.asleep = R.range(2, 4); counts.眠った++; }
        else if (r < 0.45) { u.paralyzed = true; counts.麻痺した++; }
        else if (r < 0.7) { u.silenced = true; counts.呪文を封じられた++; }
        else if (r < 0.92) { u.afraid = R.range(2, 3); counts.怯えた++; }
        else { onKillQuiet(B, g, u, c); counts.石になった++; }
      }
      const parts = Object.entries(counts).filter(([, n]) => n).map(([k, n]) => `${n}体が${k}`);
      game.log(parts.length ? `魔物たちの心と体が乱れた。${parts.join('、')}。` : '魔物たちには効かなかった。');
      yield 1; return;
    }
    case 'deathAll': {
      let n = 0, total = 0;
      for (const g of liveGroups(B)) for (const u of liveUnits(g)) {
        total++;
        if (g.mon.flags.boss || isResisted(B, g)) continue;
        if (R.chance(0.3)) { n++; onKillQuiet(B, g, u, c); }
      }
      game.log(n ? `死の風が吹き抜けた。魔物${n}体の命を奪った。` : '死の風は魔物たちに届かなかった。');
      yield 1; return;
    }
    case 'drain': {
      const g = B.groups.includes(target) && liveUnits(target).length ? target : liveGroups(B)[0];
      if (!g) return;
      const u = R.pick(liveUnits(g));
      if (g.mon.flags.boss || (isResisted(B, g))) { game.log(`${g.mon.name}には効かなかった。`); yield 1; return; }
      const left = Math.min(u.hp, R.d(8));
      const taken = u.hp - left;
      u.hp = left;
      c.hp = Math.min(c.maxhp, c.hp + taken);
      game.log(`${g.mon.name}の生命力を${taken}吸い取った。`);
      yield 1; return;
    }
    case 'heal': {
      if (sp.target === 'party') {
        for (const t of party) if (isAlive(t)) t.hp = Math.min(t.maxhp, t.hp + R.roll(sp.dice));
        game.log('パーティの傷が癒えた。');
      } else {
        const t = target && isAlive(target) ? target : null;
        if (t) { const h = R.roll(sp.dice); t.hp = Math.min(t.maxhp, t.hp + h); game.log(`${t.name}のHPが${h}回復した。`); }
      }
      yield 1; return;
    }
    case 'fullheal': {
      const t = target;
      if (t && isAlive(t)) { t.hp = t.maxhp; t.poison = false; if (t.status === 'paralyzed') t.status = 'ok'; game.log(`${t.name}は完全に回復した。`); }
      yield 1; return;
    }
    case 'cure': {
      const t = target;
      if (t) {
        const cures = sp.cures || ['poison', 'paralyzed'];
        if (cures.includes('poison')) t.poison = false;
        if (cures.includes('paralyzed') && t.status === 'paralyzed') t.status = 'ok';
        game.log(`${t.name}の体が楽になった。`);
      }
      yield 1; return;
    }
  }
}
function onKillQuiet(B, g, u, killer) {
  u.hp = 0;
  if (!u.summoned) B.exp += g.mon.exp;
  B.gold += Math.round(g.mon.gold * (0.5 + R.next()));
  if (killer) killer.kills = (killer.kills || 0) + 1;
  if (g.mon.flags.boss) B.bossKilled = true;
}

// --- 魔物の行動 ---
// 魔物が唱える呪文（名前は呪文の定義から引くので、名前を変えると連動する）
const MON_MAGE = [
  null,
  [{ id: 'hibana', single: [1, 8] }, { id: 'nemuri', sleep: true }],
  [{ id: 'tsurara', single: [3, 6] }],
  [{ id: 'homura', all: [4, 6] }],
  [{ id: 'hyouga', all: [6, 6] }],
  [{ id: 'raimei', all: [8, 6] }],
  [{ id: 'gouka', all: [9, 6] }],
  [{ id: 'metsubou', all: [10, 10] }],
];
const MON_PRIEST = [
  null,
  [{ id: 'iyashi', heal: [1, 8] }],
  [{ id: 'shizume', silence: true }],
  [{ id: 'naoshi', heal: [2, 8] }],
  [{ id: 'ooiyashi', heal: [4, 8] }],
  [{ id: 'ikazuchi', single: [6, 8] }],
];

function* monsterAction(game, B, g, u) {
  const m = g.mon;
  const party = game.party;
  if (u.asleep > 0 || u.paralyzed) return;
  if (u.afraid > 0 && R.chance(0.6)) { game.log(`${m.name}は怯えて動けない。`); yield 1; return; }
  const idx = B.groups.indexOf(g);
  // 逃走
  if (m.flags.flee && u.hp < u.max / 2 && R.chance(0.3)) { u.hp = 0; game.log(`${m.name}は逃げ出した。`); yield 1; return; }
  // 仲間を呼ぶ
  if (m.flags.call && g.units.length < 6 && R.chance(0.12)) { { const nu = makeGroup(m, 1).units[0]; nu.summoned = true; g.units.push(nu); } game.log(`${m.name}は仲間を呼んだ！`, 'bad'); yield 1; return; }
  // ブレス
  if (m.flags.breath && R.chance(0.3)) {
    game.log(`${m.name}は息を吐きかけた！`, 'bad');
    yield 1;
    const base = Math.max(2, Math.floor(u.hp / (m.flags.boss ? 4 : 2)));
    const hits = [];
    for (const c of party) {
      if (!isAlive(c)) continue;
      hits.push([c, wardCut(B, R.chance(saveChance(c)) ? Math.floor(base / 2) : base)]);
      if (m.flags.poison && R.chance(0.5)) c.poison = true;
    }
    damageParty(game, hits);
    yield 1; return;
  }
  // 呪文
  const mlv = m.flags.mage || 0, plv = m.flags.priest || 0;
  if ((mlv || plv) && !u.silenced && R.chance(m.flags.boss ? 0.55 : 0.45)) {
    const pool = [];
    for (let l = Math.max(1, mlv - 2); l <= mlv; l++) if (MON_MAGE[l]) pool.push(...MON_MAGE[l]);
    for (let l = Math.max(1, plv - 2); l <= Math.min(plv, 5); l++) if (MON_PRIEST[l]) pool.push(...MON_PRIEST[l]);
    let sp = R.pick(pool);
    if (sp.heal && !g.units.some(x => x.hp > 0 && x.hp < x.max * 0.6)) sp = pool.find(s => !s.heal) || sp;
    game.log(`${m.name}は${SPELL_BY_ID[sp.id].name}を唱えた！`, 'bad');
    yield 1;
    const alive = party.filter(isAlive);
    if (sp.single) { const t = R.pick(alive); if (t) damageChar(game, t, wardCut(B, R.dice(sp.single[0], sp.single[1]))); }
    else if (sp.all) damageParty(game, alive.map(t => { let d = R.dice(sp.all[0], sp.all[1]); if (R.chance(saveChance(t))) d = Math.floor(d / 2); return [t, wardCut(B, d)]; }));
    else if (sp.sleep) { let n = 0; for (const t of alive) if (t.status === 'ok' && !R.chance(saveChance(t)) && !wardBlocks(B)) { t.status = 'asleep'; n++; } game.log(n ? `${n}人が眠ってしまった。` : '誰も眠らなかった。'); }
    else if (sp.silence) { let n = 0; for (const t of alive) if (!R.chance(saveChance(t)) && !wardBlocks(B)) { t._silenced = true; n++; } game.log(n ? `${n}人が呪文を封じられた。` : '呪文封じは効かなかった。'); }
    else if (sp.heal) { const t = g.units.filter(x => x.hp > 0).sort((a, b) => a.hp / a.max - b.hp / b.max)[0]; if (t) t.hp = Math.min(t.max, t.hp + R.dice(sp.heal[0], sp.heal[1])); game.log(`${m.name}の傷が癒えた。`); }
    yield 1; return;
  }
  // 打撃：前列にいる（グループ番号0,1）魔物のみ
  if (idx > 1) return;
  const targets = front(party).filter(isAlive);
  const pool = targets.length ? targets : party.filter(isAlive);
  const t = R.pick(pool);
  if (!t) return;
  let hits = 0, dmg = 0;
  for (const a of m.atk) {
    const roll = R.d(20);
    const need = 19 - m.lv - charAC(t, B.partyAC + (t._acBuff || 0)) + (t.status === 'asleep' ? -5 : 0);
    if (roll === 20 || (roll !== 1 && roll >= need)) { hits++; dmg += R.roll(a); }
  }
  if (!hits) { game.log(`${m.name}の攻撃。${t.name}はかわした。`); yield 1; return; }
  game.log(`${m.name}は${t.name}に${hits}回命中、${dmg}のダメージ。`, 'hurt');
  damageChar(game, t, dmg, true);
  if (isAlive(t)) {
    if (m.flags.poison && !t.poison && !R.chance(saveChance(t))) { t.poison = true; game.log(`${t.name}は毒に冒された。`, 'bad'); }
    if (m.flags.paralyze && t.status === 'ok' && !R.chance(saveChance(t))) { t.status = 'paralyzed'; game.log(`${t.name}は麻痺した！`, 'bad'); }
    if (m.flags.stone && t.status !== 'stoned' && !R.chance(saveChance(t))) { t.status = 'stoned'; game.log(`${t.name}は石になった！`, 'bad'); }
    if (m.flags.drain && !R.chance(saveChance(t))) { drainLevel(t, m.flags.drain); game.log(`${t.name}はレベルを吸い取られた！（Lv${t.level}）`, 'bad'); }
    if (m.flags.crit && R.chance(0.05 + m.lv * 0.005) && !R.chance(saveChance(t))) { t.hp = 0; t.status = 'dead'; game.log(`${m.name}は${t.name}の急所を貫いた！`, 'bad'); }
  }
  yield 1;
}

// 魔物の呪文への抵抗（ヤブリで下がる）
function isResisted(B, g) {
  const r = Math.max(0, (g.mon.flags.resist || 0) - (B.resistDown || 0));
  return r > 0 && R.chance(r);
}
// 味方の障壁（ケッカイ）：魔物の呪文・ブレスのダメージを減らし、効果を防ぐ
const wardCut = (B, d) => Math.max(0, Math.round(d * (1 - (B.ward || 0))));
const wardBlocks = (B) => (B.ward || 0) > 0 && R.chance(B.ward);

const rangeStr = (ds) => { const lo = Math.min(...ds), hi = Math.max(...ds); return lo === hi ? `${lo}` : `${lo}〜${hi}`; };

// 何人かにまとめてダメージを与え、ログは1行にまとめる（倒れた仲間だけは1人ずつ書く）
// hits: [[仲間, ダメージ], ...]
export function damageParty(game, hits) {
  hits = hits.filter(([c]) => isAlive(c));
  if (!hits.length) return;
  const everyone = hits.length === game.party.filter(isAlive).length && hits.length > 1;
  const who = everyone ? 'パーティは' : hits.length <= 2 ? hits.map(([c]) => c.name).join('と') + 'は' : `${hits.length}人が`;
  game.log(`${who}${rangeStr(hits.map(([, d]) => d))}のダメージを受けた。`, 'hurt');
  for (const [c, d] of hits) damageChar(game, c, d, true);
}

export function damageChar(game, c, d, quiet = false) {
  if (!isAlive(c)) return;
  c.hp -= d;
  if (!quiet) game.log(`${c.name}は${d}のダメージを受けた。`, 'hurt');
  if (c.hp <= 0) {
    c.hp = 0; c.status = 'dead'; c.poison = false;
    game.log(`${c.name}は死んだ…`, 'bad');
  }
}
