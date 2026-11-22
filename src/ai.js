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
export function bestHeal(c, need) {
  let best = null;
  for (const sp of HEALS) {
    if (!canCast(c, sp)) continue;
    const amount = sp.effect === 'fullheal' ? 999 : diceAvg(sp.dice);
    if (!best) { best = sp; continue; }
    const bestAmt = best.effect === 'fullheal' ? 999 : diceAvg(best.dice);
    // 必要量を満たす最小の呪文、満たせなければ最大の呪文
    if (bestAmt < need ? amount > bestAmt : (amount >= need && amount < bestAmt)) best = sp;
  }
  return best;
}

function damageSpells(c, kinds) {
  return SPELLS.filter(s => s.effect === 'damage' && kinds.includes(s.target) && canCast(c, s));
}

// 戦闘中の行動選択
export function chooseActions(game, B) {
  const party = game.party;
  const P = policy(game);
  const useMult = (SPELL_USE[game.settings.spellUse] || SPELL_USE.normal).mult;
  const dg = danger(game, B);
  const acts = new Map();
  const groups = B.groups.filter(g => liveUnits(g).length);
  if (!groups.length) return acts;
  const avgHp = party.filter(isAlive).reduce((s, c) => s + c.hp / c.maxhp, 0) / Math.max(1, party.filter(isAlive).length);

  // 逃走判断
  const tired = game.mode === 'return' ? 0.7 : 1;
  if (!B.boss && ((dg > P.runDanger * tired && avgHp < 0.5) || (dg > 0.8 && avgHp < 0.3))) {
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
    // 1. 回復
    const hurt = party.filter(t => isAlive(t) && !healTargets.has(t) && t.hp < t.maxhp * (useMult > 1 ? 0.35 : 0.5)).sort((a, b) => a.hp / a.maxhp - b.hp / b.maxhp)[0];
    if (hurt) {
      const sp = bestHeal(c, hurt.maxhp - hurt.hp);
      if (sp && (dg > 0.25 || hurt.hp < hurt.maxhp * 0.25)) { acts.set(c, { type: 'spell', spell: sp.id, target: hurt }); healTargets.add(hurt); return; }
    }
    // 麻痺の治療
    const para = party.find(t => t.status === 'paralyzed' && !healTargets.has(t));
    if (para && canCast(c, SPELL_BY_ID.gedoku) && dg > 0.3) { acts.set(c, { type: 'spell', spell: 'gedoku', target: para }); healTargets.add(para); return; }

    // 2. 攻撃呪文
    if (dg >= spellBar || B.boss || groups.reduce((s, g) => s + liveUnits(g).length, 0) >= 5 && dg >= spellBar * 0.5) {
      // 不死を祓う
      const und = groups.find(g => g.mon.flags.undead && !groupSpellsCast.has(g) && liveUnits(g).length >= 2);
      if (und && canCast(c, SPELL_BY_ID.harai)) { acts.set(c, { type: 'spell', spell: 'harai', target: und }); groupSpellsCast.add(und); return; }
      // 敵全体
      const allSp = damageSpells(c, ['all']).sort((a, b) => diceAvg(b.dice) - diceAvg(a.dice))[0];
      if (allSp && (groups.length >= 2 || B.boss)) { acts.set(c, { type: 'spell', spell: allSp.id }); return; }
      // 呪文封じ（強い術者がいる場合）
      const casterG = groups.find(g => (g.mon.flags.mage || 0) + (g.mon.flags.priest || 0) >= 3 && !groupSpellsCast.has(g) && liveUnits(g).some(u => !u.silenced) && !g.mon.flags.boss);
      if (casterG) {
        const sil = canCast(c, SPELL_BY_ID.shizuka) ? 'shizuka' : canCast(c, SPELL_BY_ID.shizume) ? 'shizume' : null;
        if (sil && dg > spellBar * 1.2) { acts.set(c, { type: 'spell', spell: sil, target: casterG }); groupSpellsCast.add(casterG); return; }
      }
      // 即死
      const deathG = groups.filter(g => g.mon.lv <= 8 && liveUnits(g).length >= 3 && !groupSpellsCast.has(g)).sort((a, b) => groupThreat(b) - groupThreat(a))[0];
      if (deathG && canCast(c, SPELL_BY_ID.shinigami) && deathG.mon.lv >= 4) { acts.set(c, { type: 'spell', spell: 'shinigami', target: deathG }); groupSpellsCast.add(deathG); return; }
      // グループ攻撃
      const grpSp = damageSpells(c, ['group']).sort((a, b) => diceAvg(b.dice) - diceAvg(a.dice))[0];
      const multiG = groups.filter(g => liveUnits(g).length >= 2 && !groupSpellsCast.has(g)).sort((a, b) => groupThreat(b) - groupThreat(a))[0];
      if (grpSp && multiG) { acts.set(c, { type: 'spell', spell: grpSp.id, target: multiG }); groupSpellsCast.add(multiG); return; }
      // 眠り（低レベル時）
      const sleepG = groups.filter(g => !g.mon.flags.noSleep && liveUnits(g).length >= 2 && !groupSpellsCast.has(g) && liveUnits(g).some(u => !u.asleep)).sort((a, b) => groupThreat(b) - groupThreat(a))[0];
      if (sleepG && canCast(c, SPELL_BY_ID.nemuri) && !grpSp && dg > spellBar) { acts.set(c, { type: 'spell', spell: 'nemuri', target: sleepG }); groupSpellsCast.add(sleepG); return; }
      // 単体攻撃（強敵に）
      const single = damageSpells(c, ['enemy', 'group']).sort((a, b) => diceAvg(b.dice) - diceAvg(a.dice))[0];
      if (single && (strongest.mon.lv >= c.level * 0.5 || B.boss) && (!inFront || dg > spellBar * 1.5)) { acts.set(c, { type: 'spell', spell: single.id, target: strongest }); return; }
      // 守りの呪文
      if (!buffed && B.round <= 2) {
        const buff = canCast(c, SPELL_BY_ID.kasumi) ? 'kasumi' : canCast(c, SPELL_BY_ID.mamori) ? 'mamori' : null;
        if (buff && !inFront) { acts.set(c, { type: 'spell', spell: buff }); buffed = true; return; }
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
export function readyFor(game, floor) {
  return partyLevel(game) >= recommendedLevel(floor) + policy(game).levelMargin;
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
  if (game.party.some(x => x.poison) && !game.party.some(x => canCast(x, SPELL_BY_ID.gedoku)) && !game.bag.some(e => ITEMS[e.id].use === 'cure')) return '毒を治すため';
  if (game.party.some(isAlive) && game.party.filter(isAlive).some(x => x.exp >= nextExp(x)) && c.hp < 0.85 && game.floor <= 2 && partyLevel(game) < 6) return 'レベルアップのため';
  return null;
}
import { expNext as nextExp } from './character.js';

// 野営での回復計画：[caster, spell, target] を返す
export function campPlan(game) {
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
      const caster = party.find(c => canCast(c, SPELL_BY_ID.gedoku));
      if (caster) return [caster, SPELL_BY_ID.gedoku, t];
    }
  }
  // 回復：最も減っている味方
  const hurt = party.filter(t => isAlive(t) && t.status !== 'stoned' && t.hp < t.maxhp * 0.8).sort((a, b) => a.hp / a.maxhp - b.hp / b.maxhp)[0];
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
