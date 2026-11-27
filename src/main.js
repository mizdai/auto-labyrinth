// 画面・入力・メインループ
import { Game, SAVE_KEY, COMPOSITIONS } from './game.js';
import { POLICIES, SPELL_USE, partyLevel, targetFloor } from './ai.js';
import { drawView, drawMap, drawBattle, drawChest, poseOf, preloadSprites, preloadChest } from './render.js';
import { MONSTERS } from './monsters.js';
import { loadNameOverrides } from './names.js';
import { CLASSES, RACES, ALIGN_NAMES, STAT_NAMES, STATS, STATUS_NAMES, SCHOOL_NAMES } from './data.js';
import { ITEMS, SLOTS, SLOT_NAMES, itemName } from './items.js';
import { charAC, expNext, maxSlots, knownSpells, isAlive, weaponDice } from './character.js';
import { diceStr } from './rng.js';
import { DIR_NAMES } from './dungeon.js';

const $ = (s) => document.querySelector(s);
const view = $('#view'), mapC = $('#map'), logEl = $('#log');
const vctx = view.getContext('2d'), mctx = mapC.getContext('2d');

const SPEEDS = [
  { label: '×1', ms: 420 }, { label: '×2', ms: 210 }, { label: '×4', ms: 105 },
  { label: '×8', ms: 50 }, { label: '×16', ms: 24 }, { label: '最速', ms: 0 },
];

let game = null, runner = null, paused = false;
let pendingLogs = [];
let mapMode = 0; // 0:非表示 1:小 2:大

function boot() {
  const saved = localStorage.getItem(SAVE_KEY);
  if (saved) {
    try { game = Game.deserialize(saved); }
    catch (e) { console.error(e); game = null; }
  }
  if (!game) game = Game.newGame({});
  attach();
  for (const l of game.logs.slice(-60)) appendLog(l.text, l.cls);
  if (saved) appendLog('（前回の続きから再開）', 'sys');
}

function attach() {
  runner = game.run();
  game.onLog = (text, cls) => pendingLogs.push([text, cls]);
  game.onSave = () => save();
  updateSpeedLabel();
}

function save() {
  if (game.battle) return;
  try { localStorage.setItem(SAVE_KEY, game.serialize()); } catch (e) { console.warn('save failed', e); }
}

// ---- メインループ ----
let acc = 0, last = performance.now(), wait = 0, lastSave = Date.now();
function frame(now) {
  const dt = Math.min(1000, now - last); last = now;
  if (!paused) {
    const sp = SPEEDS[game.settings.speed] || SPEEDS[1];
    if (sp.ms === 0) {
      // 最速：1フレームあたり最大40手（約2400手/秒）
      const t0 = performance.now();
      for (let i = 0; i < 40 && performance.now() - t0 < 12; i++) step();
    } else {
      acc += dt;
      let guard = 0;
      while (acc >= sp.ms * Math.max(1, wait) && guard++ < 50) { acc -= sp.ms * Math.max(1, wait); wait = 0; wait = step(); }
    }
  }
  if (Date.now() - lastSave > 20000) { lastSave = Date.now(); save(); }
  render();
  requestAnimationFrame(frame);
}
function step() {
  const r = runner.next();
  return typeof r.value === 'number' ? r.value : 1;
}

// ---- 視点アニメーション ----
// ゲーム内の位置・向きが1歩分変わったら、カメラを補間して滑らかに動かす
const anim = { from: null, to: null, t0: 0, dur: 0 };
const ease = (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
function angDiff(a, b) { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; }
function camAt(now) {
  if (!anim.to) return null;
  const t = anim.dur > 0 ? Math.min(1, (now - anim.t0) / anim.dur) : 1;
  if (t >= 1) return anim.to;
  const e = ease(t), A = anim.from, B = anim.to;
  return { ...B, x: A.x + (B.x - A.x) * e, y: A.y + (B.y - A.y) * e, a: A.a + angDiff(A.a, B.a) * e };
}
function updateCam(now) {
  const target = poseOf(game);
  const prev = anim.to;
  if (!prev || prev.x !== target.x || prev.y !== target.y || prev.a !== target.a || prev.floor !== target.floor || prev.loc !== target.loc) {
    const cur = camAt(now) || target;
    const sp = SPEEDS[game.settings.speed] || SPEEDS[1];
    const step = prev && prev.floor === target.floor && prev.loc === target.loc && target.loc === 'dungeon'
      && Math.abs(prev.x - target.x) + Math.abs(prev.y - target.y) <= 1;
    anim.from = step ? cur : target;
    anim.to = target;
    anim.t0 = now;
    anim.dur = step && sp.ms >= 40 ? Math.min(320, sp.ms * 0.8) : 0;
  }
  return camAt(now);
}

// ---- 描画 ----
let lastPartyHtml = '';
function render() {
  const rect = view.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.round(rect.width * dpr), h = Math.round(rect.height * dpr);
  if (view.width !== w || view.height !== h) { view.width = w; view.height = h; }
  vctx.save();
  // 正方形の描画領域を中央に
  const size = Math.min(w, h * 1.28);
  vctx.fillStyle = '#000'; vctx.fillRect(0, 0, w, h);
  vctx.translate((w - size) / 2, (h - size / 1.28) / 2);
  vctx.scale(1, 1 / 1.28);
  drawView(vctx, game, size, updateCam(performance.now()));
  vctx.restore();
  if (game.battle) drawBattle(vctx, game, w, h);
  else if (game.chestView) drawChest(vctx, game, w, h);

  if (mapMode) {
    const mr = mapC.getBoundingClientRect();
    const ms = Math.round(mr.width * dpr);
    if (mapC.width !== ms) { mapC.width = ms; mapC.height = ms; }
    drawMap(mctx, game, ms);
  }

  // ヘッダ
  $('#loc').textContent = game.location === 'town'
    ? `城下町${game.townState && game.townState !== '城下町' ? '・' + game.townState : ''}`
    : `地下${game.floor}階 (${game.x},${game.y}) ${DIR_NAMES[game.dir]}向き`;
  $('#gold').textContent = `${game.gold.toLocaleString()}G`;
  $('#banner').textContent = game.cleared ? '★ 迷宮制覇 ★' : (game.mode === 'return' && game.location === 'dungeon' ? '帰還中' : '');

  // ログ
  if (pendingLogs.length) {
    const tail = pendingLogs.slice(-80);
    pendingLogs = [];
    for (const [t, c] of tail) appendLog(t, c);
  }

  // パーティ
  let html = '';
  game.party.forEach((c, i) => {
    const st = c.status !== 'ok' ? STATUS_NAMES[c.status] : (c.poison ? '毒' : '');
    const cls = !isAlive(c) ? 'dead' : (st ? 'bad' : '');
    const pct = c.maxhp ? Math.max(0, c.hp / c.maxhp) : 0;
    html += `<tr class="${cls}" data-i="${i}"><td>${c.name}</td><td>${ALIGN_NAMES[c.align][0]}-${CLASSES[c.cls].ab}(${(c.history ? c.history.length : 0) + 1})</td><td>${c.level}</td><td>${charAC(c, game.battle ? game.battle.partyAC : (game.location === 'dungeon' ? game.dungeonAC || 0 : 0))}</td>`
      + `<td class="hp">${c.hp}/${c.maxhp}<span class="bar"><i style="width:${(pct * 100) | 0}%;background:${pct < 0.3 ? '#d55' : pct < 0.6 ? '#dc5' : '#6c6'}"></i></span></td><td>${st}</td></tr>`;
  });
  if (html !== lastPartyHtml) { $('#party tbody').innerHTML = html; lastPartyHtml = html; }
}

function appendLog(text, cls) {
  const div = document.createElement('div');
  div.textContent = text;
  if (cls) div.className = cls;
  logEl.appendChild(div);
  while (logEl.children.length > 150) logEl.removeChild(logEl.firstChild);
  // 新しいメッセージが来たら常に最新まで移動する（過去ログは一時停止して読む）
  logEl.scrollTop = logEl.scrollHeight;
}

// ---- 操作 ----
function updateSpeedLabel() {
  $('#btnSpeed').textContent = (SPEEDS[game.settings.speed] || SPEEDS[1]).label;
  $('#btnPause').textContent = paused ? '▶' : '⏸';
}
$('#btnPause').onclick = () => { paused = !paused; updateSpeedLabel(); };
$('#btnSpeed').onclick = () => { game.settings.speed = (game.settings.speed + 1) % SPEEDS.length; updateSpeedLabel(); };
$('#btnMap').onclick = () => {
  mapMode = (mapMode + 1) % 3;
  mapC.classList.toggle('show', mapMode > 0);
  mapC.classList.toggle('full', mapMode === 2);
  mapC.width = 0;
};
$('#btnSettings').onclick = openSettings;
$('#btnInfo').onclick = openInfo;
$('#party tbody').onclick = (e) => {
  const tr = e.target.closest('tr');
  if (tr) openChar(game.party[+tr.dataset.i]);
};
$('#modal').onclick = (e) => { if (e.target.id === 'modal') closeModal(); };

function openModal(html) { $('#modalBody').innerHTML = html; $('#modal').classList.remove('hidden'); }
function closeModal() { $('#modal').classList.add('hidden'); }

function options(obj, cur) { return Object.entries(obj).map(([k, v]) => `<option value="${k}" ${k === cur ? 'selected' : ''}>${v.name || v}</option>`).join(''); }

function openSettings() {
  const s = game.settings;
  openModal(`<h2>方針の設定</h2>
  <label>探索方針（撤退の早さ・挑む階の深さ）</label>
  <select id="sPolicy">${options(POLICIES, s.policy)}</select>
  <label>呪文の使い方</label>
  <select id="sSpell">${options(SPELL_USE, s.spellUse)}</select>
  <label>宝箱</label>
  <select id="sChest">${options({ auto: '罠を調べられるときだけ開ける', always: '常に開ける', never: '開けない' }, s.chest)}</select>
  <label>パーティ構成（新しい冒険・欠員補充に使用）</label>
  <select id="sComp">${options(COMPOSITIONS, s.composition)}</select>
  <button id="sClose">閉じる</button>
  <h3>やり直し</h3>
  <p class="note">現在の冒険を破棄し、上の構成で新しい一行を作ります。</p>
  <button id="sNew" class="danger">新しい冒険を始める</button>`);
  const bind = (id, key) => { $(id).onchange = (e) => { game.settings[key] = e.target.value; save(); }; };
  bind('#sPolicy', 'policy'); bind('#sSpell', 'spellUse'); bind('#sChest', 'chest'); bind('#sComp', 'composition');
  $('#sClose').onclick = closeModal;
  $('#sNew').onclick = () => {
    if (!confirm('本当に最初からやり直しますか？（今の冒険は消えます）')) return;
    const settings = { ...game.settings };
    game = Game.newGame(settings);
    logEl.innerHTML = '';
    for (const l of game.logs) appendLog(l.text, l.cls);
    attach(); save(); closeModal();
  };
}

function fmtTime(ms) { const m = Math.floor(ms / 60000); return m >= 60 ? `${Math.floor(m / 60)}時間${m % 60}分` : `${m}分`; }

function openInfo() {
  const st = game.stats;
  const bag = game.bag.map(e => itemName(e)).join('、') || 'なし';
  const reserve = game.reserve.map(c => `${c.name}（${CLASSES[c.cls].ab}Lv${c.level}・${STATUS_NAMES[c.status] || '待機'}）`).join('、') || 'なし';
  openModal(`<h2>冒険の記録</h2>
  <table>
  <tr><td>到達した最深部</td><td>地下${game.deepest}階</td></tr>
  <tr><td>現在の目標</td><td>地下${targetFloor(game)}階</td></tr>
  <tr><td>平均レベル</td><td>${partyLevel(game).toFixed(1)}</td></tr>
  <tr><td>迷宮への出発</td><td>${st.trips}回</td></tr>
  <tr><td>戦闘勝利</td><td>${st.battles}回</td></tr>
  <tr><td>開けた宝箱</td><td>${st.chests}個</td></tr>
  <tr><td>全滅</td><td>${st.wipes}回</td></tr>
  <tr><td>失われた仲間</td><td>${st.deaths}人</td></tr>
  <tr><td>経過週</td><td>${st.weeks}週</td></tr>
  <tr><td>プレイ開始から</td><td>${fmtTime(Date.now() - st.startedAt)}</td></tr>
  <tr><td>迷宮制覇</td><td>${game.cleared ? '達成！' : 'まだ'}</td></tr>
  </table>
  <h3>持ち物（共有の袋）</h3><div>${bag}</div>
  <h3>控えの冒険者</h3><div>${reserve}</div>
  <button id="iClose">閉じる</button>`);
  $('#iClose').onclick = closeModal;
}

function openChar(c) {
  if (!c) return;
  const cl = CLASSES[c.cls];
  const stats = STATS.map(k => `<td>${STAT_NAMES[k]}</td><td>${c.stats[k]}</td>`);
  // 装備名の横に性能：武器はダメージ（例 1d8+1）、防具・装身具はACの下がる量
  const perf = (it) => {
    const parts = [];
    if (it.type === 'weapon') {
      parts.push(diceStr(it.dmg));
      if (it.hit) parts.push(`命中${it.hit > 0 ? '+' : ''}${it.hit}`);
      if (it.slay) parts.push({ undead: '不死特攻', dragon: '竜特攻', caster: '術者特攻' }[it.slay] || '特攻');
      if (it.extraAtk) parts.push(`攻撃回数+${it.extraAtk}`);
      if (it.crit) parts.push('急所');
    } else {
      if (it.ac) parts.push(String(it.ac));
      if (it.regen) parts.push('再生');
      if (it.save) parts.push('抵抗');
    }
    if (it.cursed) parts.push('呪い');
    return parts.join('・');
  };
  const eqName = (s) => {
    const e = c.equip[s];
    if (!e) return s === 'weapon' && c.cls === 'ninja' ? `素手 (${diceStr(weaponDice(c))})` : '―';
    const it = ITEMS[e.id], p = perf(it);
    return p ? `${it.name} (${p})` : it.name;
  };
  const eq = SLOTS.map(s => `<tr><td>${SLOT_NAMES[s]}</td><td>${eqName(s)}</td></tr>`).join('');
  const ms = maxSlots(c);
  // 職業が使える系統は、まだ覚えていないレベルも 0/0 で表示
  const schools = ['mage', 'priest'].filter(sc => cl.spells[sc] || ms[sc].some(v => v > 0));
  const slots = schools.map(sc => `<tr><td>${SCHOOL_NAMES[sc]}</td><td>${c.mp[sc].map((v, i) => `<span class="slot">${ms[sc][i] ? v : 0}/${ms[sc][i]}</span>`).join('')}</td></tr>`).join('');
  const spells = knownSpells(c).map(s => s.name).join('、') || 'なし';
  openModal(`<h2>${c.name}</h2>
  <div>${RACES[c.race].name}・${ALIGN_NAMES[c.align]}・${cl.name}${c.history && c.history.length ? `（元${c.history.map(k => CLASSES[k].name).join('・')}）` : ''}　Lv${c.level}　${c.age}歳</div>
  <div>HP ${c.hp}/${c.maxhp}　AC ${charAC(c)}　${STATUS_NAMES[c.status] || '健康'}${c.poison ? '・毒' : ''}</div>
  <div>経験値 ${c.exp.toLocaleString()}（次まで ${Math.max(0, expNext(c) - c.exp).toLocaleString()}）　倒した数 ${c.kills || 0}</div>
  <table class="sec"><tr>${stats.slice(0, 3).join('')}</tr><tr>${stats.slice(3).join('')}</tr></table>
  <table class="sec">${eq}</table>
  ${slots ? `<table class="sec">${slots}</table><div class="note">${spells}</div>` : ''}
  <button id="cClose">閉じる</button>`);
  $('#cClose').onclick = closeModal;
}

document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
window.addEventListener('pagehide', save);

preloadSprites(Object.keys(MONSTERS));
preloadChest();
// 名前の上書き（メンテ画面で編集）を読み込んでから始める
loadNameOverrides().catch(() => {}).finally(() => { boot(); requestAnimationFrame(frame); });
