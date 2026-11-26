// AI：プレイヤーの代わりにすべての判断を行う
import { SPELLS, SPELL_BY_ID } from './data.js';
import { ITEMS } from './items.js';
import { diceAvg } from './rng.js';
import { isAlive, canAct, canCast, mpRatio, maxSlots } from './character.js';

// 方針ごとのパラメータ
export const POLICIES = {
  careful: { name: '慎重', retreatHp: 0.6, levelMargin: 2, spellThreshold: 0.5, runDanger: 1.4 },
  normal:  { name: '普通', retreatHp: 0.45, levelMargin: 0, spellThreshold: 0.8, runDanger: 2.0 },
  bold:    { name: '強気', retreatHp: 0.3, levelMargin: -2, spellThreshold: 1.2, runDanger: 3.5 },
};
export const SPELL_USE = {
  save: { name: '温存', mult: 1.6 },
  normal: { name: '普通', mult: 1.0 },
  full: { name: '全力', mult: 0.4 },
};

export const policy = (game) => POLICIES[game.settings.policy] || POLICIES.normal;
const liveUnits = (g) => g.units.filter(u => u.hp > 0);

function groupThreat(g) {
  const m = g.mon;
  let t = m.lv * 1.2;
  if (m.flags.breath) t *= 1.6;
  if (m.flags.mage || m.flags.priest) t *= 1.3 + Math.max(m.flags.mage || 0, m.flags.priest || 0) * 0.1;
  if (m.flags.drain || m.flags.stone || m.flags.paralyze || m.flags.crit) t *= 1.4;
  return t * liveUnits(g).reduce((s, u) => s + u.hp / u.max, 0);
}
export function danger(game, B) {
  const threat = B.groups.reduce((s, g) => s + groupThreat(g), 0);
  const power = game.party.filter(canAct).reduce((s, c) => s + c.level * (c.hp / c.maxhp), 0) + 1;
  return threat / power;
}

const HEALS = ['iyashi', 'naoshi', 'ooiyashi', 'kaifuku'].map(id => SPELL_BY_ID[id]);
// ---- 帰還の呪文（キカン・テンイ）の温存 ----
// どちらもレベル6で、同じレベル6の呪文（カイフク・ゴウカ）と回数を共有している。
// 迷宮の中では、パーティ全体で帰還の呪文を最低1回分残す。非常時と城下町では温存しない。
let reserveCtx = null;   // { game, emergency }
function returnSlots(game) {
  let n = 0;
  for (const m of game.party) {
    if (!canAct(m)) continue;
    const ms = maxSlots(m);
    if (ms.priest[5] > 0) n += m.mp.priest[5];   // キカン
    if (ms.mage[5] > 0) n += m.mp.mage[5];       // テンイ
  }
  return n;
}
function reserveOK(c, sp) {
  const ctx = reserveCtx;
  if (!ctx || ctx.emergency || ctx.game.location !== 'dungeon') return true;
  if (sp.lv !== 6 || sp.effect === 'return') return true;
  const total = returnSlots(ctx.game);
  if (total === 0) return true;                  // そもそも唱えられる人がいない
  return total - 1 >= 1;                         // 唱えたあとも1回分残るなら使ってよい
}
const usable = (c, sp) => canCast(c, sp) && reserveOK(c, sp);

export function bestHeal(c, need) {
  let best = null;
  for (const sp of HEALS) {
    if (!usable(c, sp)) continue;
    const amount = sp.effect === 'fullheal' ? 999 : diceAvg(sp.dice);
    if (!best) { best = sp; continue; }
    const bestAmt = best.effect === 'fullheal' ? 999 : diceAvg(best.dice);
    // 必要量を満たす最小の呪文、満たせなければ最大の呪文
    if (bestAmt < need ? amount > bestAmt : (amount >= need && amount < bestAmt)) best = sp;
  }
  return best;
}

function damageSpells(c, kinds) {
  return SPELLS.filter(s => s.effect === 'damage' && !s.only && kinds.includes(s.target) && usable(c, s));
}

// 戦闘中の行動選択
function chooseActionsInner(game, B) {
  const party = game.party;
  const P = policy(game);
  const useMult = B.noRun ? SPELL_USE.full.mult : (SPELL_USE[game.settings.spellUse] || SPELL_USE.normal).mult;
  const dg = danger(game, B);
  const acts = new Map();
  const groups = B.groups.filter(g => liveUnits(g).length);
  if (!groups.length) return acts;
  const avgHp = party.filter(isAlive).reduce((s, c) => s + c.hp / c.maxhp, 0) / Math.max(1, party.filter(isAlive).length);

  // 逃走判断
  const tired = game.mode === 'return' ? 0.7 : 1;
  if (!B.noRun && ((dg > P.runDanger * tired && avgHp < 0.5) || (dg > 0.8 && avgHp < 0.3))) {
    const runner = party.find(canAct);
    if (runner) { acts.set(runner, { type: 'run' }); return acts; }
  }

  const healTargets = new Set();
  const spellBar = P.spellThreshold * useMult;
  const strongest = [...groups].sort((a, b) => groupThreat(b) - groupThreat(a))[0];
  let buffed = B.partyAC > 0;
  let groupSpellsCast = new Set();

  party.forEach((c, idx) => {
    if (!canAct(c)) return;
    const inFront = idx < 3;
    // 呪文を封じられているあいだは、呪文を選ばない（打撃・防御・道具だけ）
    if (!c._silenced) {
    // 1. 回復：3人以上が深手なら、味方全体の回復
    const badlyHurt = party.filter(t => isAlive(t) && t.hp < t.maxhp * 0.55);
    if (badlyHurt.length >= 3 && usable(c, SPELL_BY_ID.mimegumi) && !healTargets.has('party')) {
      acts.set(c, { type: 'spell', spell: 'mimegumi' }); healTargets.add('party'); for (const t of badlyHurt) healTargets.add(t); return;
    }
    const hurt = party.filter(t => isAlive(t) && !healTargets.has(t) && t.hp < t.maxhp * (useMult > 1 ? 0.35 : 0.5)).sort((a, b) => a.hp / a.maxhp - b.hp / b.maxhp)[0];
    if (hurt) {
      const sp = bestHeal(c, hurt.maxhp - hurt.hp);
      if (sp && (dg > 0.25 || hurt.hp < hurt.maxhp * 0.25)) { acts.set(c, { type: 'spell', spell: sp.id, target: hurt }); healTargets.add(hurt); return; }
    }
    // 麻痺の治療
    const para = party.find(t => t.status === 'paralyzed' && !healTargets.has(t));
    if (para && usable(c, SPELL_BY_ID.hogushi) && dg > 0.3) { acts.set(c, { type: 'spell', spell: 'hogushi', target: para }); healTargets.add(para); return; }

    // 2. 攻撃呪文
    if (dg >= spellBar || B.boss || groups.reduce((s, g) => s + liveUnits(g).length, 0) >= 5 && dg >= spellBar * 0.5) {
      // 障壁：ブレスや全体呪文を使う魔物がいれば、序盤に張る（50%に届くまで重ねる）
      const harsh = groups.some(g => g.mon.flags.breath || (g.mon.flags.mage || 0) >= 3);
      if ((harsh || B.boss) && B.round <= 3 && (B.ward || 0) < 0.5 && !groupSpellsCast.has('ward') && usable(c, SPELL_BY_ID.kekkai)) {
        acts.set(c, { type: 'spell', spell: 'kekkai' }); groupSpellsCast.add('ward'); return;
      }
      // 抵抗を下げる：呪文の効きにくい敵がいて、攻撃呪文の使い手がいるとき
      const resistant = groups.some(g => (g.mon.flags.resist || 0) - (B.resistDown || 0) >= 0.3);
      const nukers = party.filter(t => canAct(t) && maxSlots(t).mage[2] > 0).length;
      if (resistant && nukers > 0 && B.round <= 3 && !groupSpellsCast.has('unresist') && usable(c, SPELL_BY_ID.yaburi)) {
        acts.set(c, { type: 'spell', spell: 'yaburi' }); groupSpellsCast.add('unresist'); return;
      }
      // 不死を祓う
      const und = groups.find(g => g.mon.flags.undead && !groupSpellsCast.has(g) && liveUnits(g).length >= 2);
      if (und && usable(c, SPELL_BY_ID.harai)) { acts.set(c, { type: 'spell', spell: 'harai', target: und }); groupSpellsCast.add(und); return; }
      // 敵全体
      const allSp = damageSpells(c, ['all']).sort((a, b) => diceAvg(b.dice) - diceAvg(a.dice))[0];
      // 全体攻撃でも大して削れない打たれ強い相手には、怯ませる・即死を優先する
      const unitHpAvg = groups.reduce((t, g) => t + liveUnits(g).reduce((x, u) => x + u.hp, 0), 0) / Math.max(1, groups.reduce((t, g) => t + liveUnits(g).length, 0));
      const allTooWeak = allSp && diceAvg(allSp.dice) < unitHpAvg * 0.4 && !B.boss;
      const unitCount = groups.reduce((t, g) => t + liveUnits(g).length, 0);
      if (!B.boss && unitCount >= 5 && (allTooWeak || unitCount >= 7) && usable(c, SPELL_BY_ID.shinokaze)) {
        acts.set(c, { type: 'spell', spell: 'shinokaze' }); return;
      }
      if (allTooWeak && groups.length >= 2 && B.round <= 2 && usable(c, SPELL_BY_ID.osore) && groups.some(g => !(g.acMod > 0))) {
        acts.set(c, { type: 'spell', spell: 'osore' }); for (const g of groups) groupSpellsCast.add(g); return;
      }
      if (allSp && (groups.length >= 2 || B.boss) && !allTooWeak) { acts.set(c, { type: 'spell', spell: allSp.id }); return; }
      // 呪文封じ（強い術者がいる場合）
      const casterGs = groups.filter(g => (g.mon.flags.mage || 0) + (g.mon.flags.priest || 0) >= 3 && !groupSpellsCast.has(g) && liveUnits(g).some(u => !u.silenced) && !g.mon.flags.boss);
      if (casterGs.length >= 2 && dg > spellBar && usable(c, SPELL_BY_ID.shizumari)) {
        acts.set(c, { type: 'spell', spell: 'shizumari' }); for (const g of casterGs) groupSpellsCast.add(g); return;
      }
      const casterG = casterGs[0];
      if (casterG) {
        const sil = canCast(c, SPELL_BY_ID.shizuka) ? 'shizuka' : canCast(c, SPELL_BY_ID.shizume) ? 'shizume' : null;
        if (sil && dg > spellBar * 1.2) { acts.set(c, { type: 'spell', spell: sil, target: casterG }); groupSpellsCast.add(casterG); return; }
      }
      // 即死（グループ）
      const deathG = groups.filter(g => g.mon.lv <= 8 && liveUnits(g).length >= 3 && !groupSpellsCast.has(g)).sort((a, b) => groupThreat(b) - groupThreat(a))[0];
      if (deathG && usable(c, SPELL_BY_ID.shinigami) && deathG.mon.lv >= 4) { acts.set(c, { type: 'spell', spell: 'shinigami', target: deathG }); groupSpellsCast.add(deathG); return; }
      // 強い1体（残り2体以下の強敵）には、効く相手を選んで一撃で仕留める呪文
      const tough = (g) => ['undead', 'demon', 'insect', 'golem'].includes(g.mon.type) || g.mon.flags.undead;
      const bigOne = groups.filter(g => liveUnits(g).length <= 2 && !g.mon.flags.boss && g.mon.lv >= c.level * 0.6).sort((a, b) => groupThreat(b) - groupThreat(a))[0];
      if (bigOne) {
        if (bigOne.mon.flags.undead && usable(c, SPELL_BY_ID.joubutsu)) { acts.set(c, { type: 'spell', spell: 'joubutsu', target: bigOne }); return; }
        if (bigOne.mon.type === 'demon' && usable(c, SPELL_BY_ID.akumabarai)) { acts.set(c, { type: 'spell', spell: 'akumabarai', target: bigOne }); return; }
        if (!tough(bigOne) && usable(c, SPELL_BY_ID.inochitori)) { acts.set(c, { type: 'spell', spell: 'inochitori', target: bigOne }); return; }
      }
      // HPの多い強敵からは生命力を吸い取る（自分が傷ついているときや、効きにくい相手に）
      if (bigOne && usable(c, SPELL_BY_ID.suitori)) {
        const hpAvg = liveUnits(bigOne).reduce((t, u) => t + u.hp, 0) / liveUnits(bigOne).length;
        if (hpAvg >= 50 && (c.hp < c.maxhp * 0.7 || tough(bigOne))) { acts.set(c, { type: 'spell', spell: 'suitori', target: bigOne }); return; }
      }
      // 即死（グループ・成功率低め）：ほかに有効な手がない強い群れに
      const deathG2 = groups.filter(g => liveUnits(g).length >= 3 && !groupSpellsCast.has(g) && !g.mon.flags.boss).sort((a, b) => groupThreat(b) - groupThreat(a))[0];
      if (deathG2 && usable(c, SPELL_BY_ID.shinotsukai) && deathG2.mon.lv >= 6) { acts.set(c, { type: 'spell', spell: 'shinotsukai', target: deathG2 }); groupSpellsCast.add(deathG2); return; }
      // 打たれ強い群れ（呪文の一撃で倒しきれない）は、石化・麻痺で止める
      const ctrlG = groups.filter(g => liveUnits(g).length >= 2 && !g.mon.flags.boss && !groupSpellsCast.has(g) && g.mon.lv >= 4).sort((a, b) => groupThreat(b) - groupThreat(a))[0];
      if (ctrlG) {
        const best = damageSpells(c, ['group']).sort((a, b) => diceAvg(b.dice) - diceAvg(a.dice))[0];
        const avgHp = liveUnits(ctrlG).reduce((t, u) => t + u.hp, 0) / liveUnits(ctrlG).length;
        const weakDamage = !best || diceAvg(best.dice) < avgHp * 0.8;
        const ctrl = usable(c, SPELL_BY_ID.ishikure) ? 'ishikure' : usable(c, SPELL_BY_ID.shibire) && liveUnits(ctrlG).some(u => !u.paralyzed) ? 'shibire' : null;
        if (ctrl && weakDamage) { acts.set(c, { type: 'spell', spell: ctrl, target: ctrlG }); groupSpellsCast.add(ctrlG); return; }
      }
      // グループ攻撃
      const grpSp = damageSpells(c, ['group']).sort((a, b) => diceAvg(b.dice) - diceAvg(a.dice))[0];
      const multiG = groups.filter(g => liveUnits(g).length >= 2 && !groupSpellsCast.has(g)).sort((a, b) => groupThreat(b) - groupThreat(a))[0];
      if (grpSp && multiG) { acts.set(c, { type: 'spell', spell: grpSp.id, target: multiG }); groupSpellsCast.add(multiG); return; }
      // 眠り（低レベル時）
      const sleepG = groups.filter(g => !g.mon.flags.noSleep && liveUnits(g).length >= 2 && !groupSpellsCast.has(g) && liveUnits(g).some(u => !u.asleep)).sort((a, b) => groupThreat(b) - groupThreat(a))[0];
      if (sleepG && canCast(c, SPELL_BY_ID.nemuri) && !grpSp && dg > spellBar) { acts.set(c, { type: 'spell', spell: 'nemuri', target: sleepG }); groupSpellsCast.add(sleepG); return; }
      // 敵を弱らせる（序盤に、前列が殴りやすくなるように）
      if (B.round <= 2 && !inFront && dg >= spellBar * 1.2) {
        const unweakened = groups.filter(g => !(g.acMod > 0) && !groupSpellsCast.has(g));
        if (unweakened.length >= 2 && usable(c, SPELL_BY_ID.osore)) { acts.set(c, { type: 'spell', spell: 'osore' }); for (const g of unweakened) groupSpellsCast.add(g); return; }
        const tgt = unweakened.sort((a, b) => groupThreat(b) - groupThreat(a))[0];
        const deb = usable(c, SPELL_BY_ID.hirumi) ? 'hirumi' : usable(c, SPELL_BY_ID.yamikumo) ? 'yamikumo' : null;
        if (tgt && deb) { acts.set(c, { type: 'spell', spell: deb, target: tgt }); groupSpellsCast.add(tgt); return; }
      }
      // 眠りが効く強敵1体には、深い眠り
      const sleeper = groups.find(g => liveUnits(g).length === 1 && !g.mon.flags.noSleep && !g.mon.flags.boss && !liveUnits(g)[0].asleep && g.mon.lv >= c.level * 0.8 && !groupSpellsCast.has(g));
      if (sleeper && usable(c, SPELL_BY_ID.utatane)) { acts.set(c, { type: 'spell', spell: 'utatane', target: sleeper }); groupSpellsCast.add(sleeper); return; }
      // 前列に出た呪文使いは、序盤に自分の守りを固める
      if (inFront && B.round <= 2 && !(c._acBuff > 0) && usable(c, SPELL_BY_ID.kagemi)) { acts.set(c, { type: 'spell', spell: 'kagemi' }); return; }
      // 単体攻撃（強敵に）
      const single = damageSpells(c, ['enemy', 'group']).sort((a, b) => diceAvg(b.dice) - diceAvg(a.dice))[0];
      if (single && (strongest.mon.lv >= c.level * 0.5 || B.boss) && (!inFront || dg > spellBar * 1.5)) { acts.set(c, { type: 'spell', spell: single.id, target: strongest }); return; }
      // 守りの呪文
      if (!buffed && B.round <= 2) {
        const buff = usable(c, SPELL_BY_ID.kasumi) ? 'kasumi' : usable(c, SPELL_BY_ID.mamori) ? 'mamori' : null;
        if (buff && !inFront) { acts.set(c, { type: 'spell', spell: buff }); buffed = true; return; }
      }
      // 前列でいちばん守りの薄い仲間を固める
      if (B.round <= 2 && usable(c, SPELL_BY_ID.katame)) {
        const weakFront = party.slice(0, 3).filter(t => canAct(t) && !(t._acBuff > 0)).sort((a, b) => b.hp / b.maxhp - a.hp / a.maxhp)[0];
        if (weakFront && !inFront) { acts.set(c, { type: 'spell', spell: 'katame', target: weakFront }); return; }
      }
    }
    }
    // 3. 打撃 or 防御
    if (inFront) {
      // 前列は最初の2グループのうち、脅威の高い方を狙う
      const reach = groups.slice(0, 2).sort((a, b) => groupThreat(b) / liveUnits(b).length - groupThreat(a) / liveUnits(a).length);
      acts.set(c, { type: 'fight', group: reach[0] });
    } else {
      // 後列：回復役がおらず瀕死の味方がいれば傷薬
      const dying = party.find(t => isAlive(t) && t.hp < t.maxhp * 0.3);
      const pi = game.bag.findIndex(e => e.identified && ITEMS[e.id].use === 'heal');
      if (dying && pi >= 0 && !healTargets.has(dying)) { acts.set(c, { type: 'item', bagIndex: pi, target: dying }); healTargets.add(dying); return; }
      acts.set(c, { type: 'parry' });
    }
  });
  return acts;
}

// --- 迷宮での判断 ---
export function partyLevel(game) {
  const al = game.party.filter(isAlive);
  return al.length ? al.reduce((s, c) => s + c.level, 0) / al.length : 0;
}
// その階に挑むのに必要な平均レベル
export function recommendedLevel(floor) { return [0, 1, 3, 5, 7, 8, 9, 11, 12, 13, 15][floor] || 15; }
// その階に連れて行ける最低レベル（全員がこれ以上であること）
export function minimumLevel(floor) { return Math.max(1, recommendedLevel(floor) - 4); }
export function readyFor(game, floor) {
  const margin = policy(game).levelMargin;
  const al = game.party.filter(isAlive);
  const weakest = al.length ? Math.min(...al.map(c => c.level)) : 0;
  return partyLevel(game) >= recommendedLevel(floor) + margin && weakest >= minimumLevel(floor) + Math.min(0, margin);
}
export function targetFloor(game) {
  let f = 1;
  const deepest = game.deepest || 1;
  while (f < Math.min(10, deepest + 1) && readyFor(game, f + 1)) f++;
  return f;
}

export function partyCondition(game) {
  const al = game.party.filter(isAlive);
  const hp = al.reduce((s, c) => s + c.hp, 0) / Math.max(1, al.reduce((s, c) => s + c.maxhp, 0));
  const healers = game.party.filter(c => canAct(c) && maxSlots(c).priest.some(v => v > 0));
  const healMP = healers.length ? healers.reduce((s, c) => s + mpRatio(c), 0) / healers.length : 0;
  const casters = game.party.filter(c => canAct(c) && maxSlots(c).mage.some(v => v > 0));
  const mageMP = casters.length ? casters.reduce((s, c) => s + mpRatio(c), 0) / casters.length : 1;
  const bad = game.party.some(c => c.status === 'dead' || c.status === 'ash' || c.status === 'stoned' || c.status === 'paralyzed');
  const able = game.party.filter(canAct).length;
  return { hp, healMP, mageMP, bad, able, hasHealer: healers.length > 0 };
}

export function shouldReturn(game) {
  const P = policy(game);
  const c = partyCondition(game);
  if (c.able <= 3) return '仲間を多く失った';
  if (c.bad && game.floor >= 1) return '倒れた仲間を寺院へ運ぶため';
  const lowLv = partyLevel(game) < 4;
  if (c.hp < (lowLv ? Math.max(P.retreatHp, 0.65) : P.retreatHp)) return '傷が深い';
  const healAvail = game.party.some(x => canAct(x) && bestHeal(x, 1)) || game.bag.some(e => e.identified && ITEMS[e.id].use === 'heal');
  if (!healAvail && game.party.some(x => isAlive(x) && x.hp < x.maxhp * 0.35)) return '瀕死の仲間がいる';
  if (c.hasHealer && c.healMP < 0.15 && c.hp < 0.8) return '回復の呪文が尽きた';
  if (c.mageMP < 0.1 && game.floor >= 3 && c.hp < 0.9) return '呪文が尽きた';
  if (game.party.some(x => x.poison) && !game.party.some(x => canCast(x, SPELL_BY_ID.gedoku)) && !game.bag.some(e => e.identified && ITEMS[e.id].use === 'cure')) return '毒を治すため';
  // レベル上げ：宿屋で上がるはずのレベルがたまっていたら戻る
  {
    const al = game.party.filter(isAlive);
    const avg = partyLevel(game);
    const pending = (x) => { let n = 0; while (n < 30 && x.exp >= expFor(x.cls, x.level + n + 1)) n++; return n; };
    const ready = al.filter(x => pending(x) > 0);
    // 低レベルの補充メンバーの育成はいつでも。たまったレベルの消化は、目標の階に対してまだ十分強くないときだけ
    const strongEnough = avg >= recommendedLevel(targetFloor(game)) + 3;
    // 「遅れている仲間」は、平均より3以上低く、かつ平均の7割以下（職業ごとの上がり方の差では反応しない）。
    // その仲間に2レベル分たまったら戻る（1レベルごとに戻ると往復が多すぎるため）
    const lagging = (x) => x.level <= Math.min(avg - 3, avg * 0.7);
    if (ready.some(x => lagging(x) && pending(x) >= 2) || (!strongEnough && ready.some(x => pending(x) >= 3))) return 'レベルアップのため';
  }
  return null;
}
import { expNext as nextExp, expFor } from './character.js';

// 野営での回復計画：[caster, spell, target] を返す
// hurtBelow: この割合未満のHPの仲間を回復対象にする
function campPlanInner(game, hurtBelow = 0.8) {
  const party = game.party;
  // 蘇生
  for (const t of party) {
    if (t.status === 'dead' || t.status === 'ash') {
      const caster = party.find(c => canCast(c, SPELL_BY_ID.tamakaeshi)) || (t.status === 'dead' ? party.find(c => canCast(c, SPELL_BY_ID.yomigaeri)) : null);
      if (caster) return [caster, caster.mp.priest[6] > 0 && canCast(caster, SPELL_BY_ID.tamakaeshi) ? SPELL_BY_ID.tamakaeshi : SPELL_BY_ID.yomigaeri, t];
    }
  }
  for (const t of party) {
    if (t.status === 'paralyzed' || (t.poison && isAlive(t))) {
      const sp = t.status === 'paralyzed' ? SPELL_BY_ID.hogushi : SPELL_BY_ID.gedoku;
      const caster = party.find(c => canCast(c, sp));
      if (caster) return [caster, sp, t];
    }
  }
  // 回復：最も減っている味方
  const hurt = party.filter(t => isAlive(t) && t.status !== 'stoned' && t.hp < t.maxhp * hurtBelow).sort((a, b) => a.hp / a.maxhp - b.hp / b.maxhp)[0];
  if (hurt) {
    let best = null, bestScore = 0;
    for (const c of party) {
      const sp = bestHeal(c, hurt.maxhp - hurt.hp);
      if (!sp) continue;
      // 戦闘用に高位の呪文は残しておく：低レベルの呪文から使う
      const score = 10 - sp.lv + c.mp.priest[sp.lv - 1] * 0.1;
      if (score > bestScore) { best = [c, sp, hurt]; bestScore = score; }
    }
    if (best) return best;
  }
  return null;
}

// 戦闘の行動選択（帰還の呪文の温存つき）。全滅しそうなとき・ボス戦では温存しない
export function chooseActions(game, B) {
  const party = game.party;
  const alive = party.filter(isAlive);
  const avgHp = alive.reduce((t, c) => t + c.hp / c.maxhp, 0) / Math.max(1, alive.length);
  const emergency = B.boss || party.filter(canAct).length <= 2 || avgHp < 0.3 || danger(game, B) > policy(game).runDanger;
  reserveCtx = { game, emergency };
  try {
    const acts = chooseActionsInner(game, B);
    if (!emergency && game.location === 'dungeon') {
      // 同じターンに何人もレベル6の呪文を選んで、温存分まで使ってしまわないように
      const total = returnSlots(game);
      let allowance = total > 0 ? total - 1 : Infinity;
      for (const [c, a] of acts) {
        if (a.type !== 'spell') continue;
        const sp = SPELL_BY_ID[a.spell];
        if (sp.lv !== 6 || sp.effect === 'return') continue;
        const ms = maxSlots(c);
        const sharesReturn = (sp.school === 'priest' && ms.priest[5] > 0) || (sp.school === 'mage' && ms.mage[5] > 0);
        if (!sharesReturn) continue;
        if (allowance > 0) { allowance--; continue; }
        acts.set(c, party.indexOf(c) < 3 ? { type: 'fight', group: B.groups.find(g => liveUnits(g).length) } : { type: 'parry' });
      }
    }
    return acts;
  } finally { reserveCtx = null; }
}

// 野営・宿屋での回復計画（帰還の呪文の温存つき）。パーティが瀕死のときは温存しない
export function campPlan(game, hurtBelow = 0.8) {
  const alive = game.party.filter(isAlive);
  const avgHp = alive.reduce((t, c) => t + c.hp / c.maxhp, 0) / Math.max(1, alive.length);
  reserveCtx = { game, emergency: avgHp < 0.3 };
  try { return campPlanInner(game, hurtBelow); } finally { reserveCtx = null; }
}
