// ゲーム全体の状態と進行（AIによる自動進行）
import { R } from './rng.js';
import { CLASSES, SPELL_BY_ID, INN_ROOMS, TEMPLE_COST } from './data.js';
import { ITEMS, SLOTS, SHOP_BASE, itemName } from './items.js';
import {
  createCharacter, isAlive, canAct, restoreMP, tryLevelUp, itemScore, canEquip,
  canCast, roleOf, getNextId, setNextId, maxSlots,
} from './character.js';
import { getFloor, findPath, W, H, DX, DY, DIR_NAMES, MAX_FLOOR, MAP_VERSION } from './dungeon.js';
import { battle, makeEncounter, bossEncounter, damageChar } from './combat.js';
import {
  shouldReturn, targetFloor, readyFor, campPlan, partyCondition, policy, partyLevel, recommendedLevel,
} from './ai.js';

export const SAVE_KEY = 'autoLabyrinth.save.v1';

export const COMPOSITIONS = {
  good:    { name: '善の一行（標準）', slots: [['samurai', 'fighter', 'G'], ['fighter', null, 'G'], ['priest', null, 'G'], ['thief', null, 'N'], ['mage', null, 'G'], ['bishop', null, 'G']] },
  evil:    { name: '悪の一行（忍者狙い）', slots: [['ninja', 'fighter', 'E'], ['fighter', null, 'E'], ['priest', null, 'E'], ['thief', null, 'E'], ['mage', null, 'E'], ['bishop', null, 'E']] },
  warrior: { name: '戦士重視', slots: [['samurai', 'fighter', 'G'], ['fighter', null, 'G'], ['lord', 'fighter', 'G'], ['priest', null, 'G'], ['thief', null, 'N'], ['mage', null, 'G']] },
  magic:   { name: '呪文重視', slots: [['fighter', null, 'G'], ['fighter', null, 'G'], ['priest', null, 'G'], ['mage', null, 'G'], ['mage', null, 'G'], ['bishop', null, 'G']] },
};

export const DEFAULT_SETTINGS = { policy: 'normal', spellUse: 'normal', chest: 'auto', composition: 'good', speed: 2 };

export class Game {
  constructor() {
    this.seed = (Date.now() ^ (Math.random() * 1e9)) >>> 0;
    this.party = []; this.reserve = [];
    this.gold = 0; this.bag = []; this.stock = {};
    this.location = 'town'; this.floor = 0; this.x = 0; this.y = H - 1; this.dir = 0;
    this.known = {}; this.lairsCleared = []; this.lairsFled = []; this.deepest = 1;
    this.shortcuts = [];   // 近道を開通させた階
    this.mode = 'explore';
    this.cleared = false;
    this.settings = { ...DEFAULT_SETTINGS };
    this.stats = { battles: 0, deaths: 0, steps: 0, weeks: 0, chests: 0, trips: 0, wipes: 0, startedAt: Date.now() };
    this.logs = [];
    this.onLog = null;
    this.battle = null;
    this.chestView = null;
    this.townState = '';
    this.lastWander = null;
  }

  static newGame(settings = {}) {
    const g = new Game();
    g.settings = { ...DEFAULT_SETTINGS, ...settings };
    const comp = COMPOSITIONS[g.settings.composition] || COMPOSITIONS.good;
    const used = new Set();
    for (const [cls, fb, al] of comp.slots) {
      const c = createCharacter(cls, { align: al, fallback: fb, used });
      used.add(c.name);
      g.party.push(c);
      g.gold += R.range(100, 200);
    }
    g.log('訓練場で6人の冒険者が名乗りを上げた。', 'sys');
    for (const c of g.party) g.log(`${c.name}（${CLASSES[c.cls].name}・Lv1）`, 'sys');
    return g;
  }

  log(text, cls = '') {
    this.logs.push({ text, cls });
    if (this.logs.length > 300) this.logs.splice(0, this.logs.length - 300);
    if (this.onLog) this.onLog(text, cls);
  }

  get F() { return getFloor(this.seed, this.floor); }
  knownMap(floor = this.floor) {
    if (!this.known[floor]) this.known[floor] = new Uint8Array(W * H);
    return this.known[floor];
  }

  // ---- 保存 ----
  serialize() {
    const known = {};
    for (const [f, arr] of Object.entries(this.known)) known[f] = Array.from(arr).join('');
    return JSON.stringify({
      v: 1, mapVersion: MAP_VERSION, shortcuts: this.shortcuts, seed: this.seed, party: this.party, reserve: this.reserve, gold: this.gold, bag: this.bag, stock: this.stock,
      location: this.location, floor: this.floor, x: this.x, y: this.y, dir: this.dir, known, lairsCleared: this.lairsCleared, lairsFled: this.lairsFled,
      deepest: this.deepest, mode: this.mode, cleared: this.cleared, settings: this.settings, stats: this.stats,
      logs: this.logs.slice(-60), nextId: getNextId(), rng: R.s,
    });
  }
  static deserialize(json) {
    const d = JSON.parse(json);
    const g = new Game();
    Object.assign(g, {
      seed: d.seed, party: d.party, reserve: d.reserve || [], gold: d.gold, bag: d.bag, stock: d.stock || {},
      location: d.location, floor: d.floor, x: d.x, y: d.y, dir: d.dir, lairsCleared: d.lairsCleared || [], lairsFled: d.lairsFled || [],
      deepest: d.deepest || 1, mode: d.mode || 'explore', cleared: !!d.cleared,
      settings: { ...DEFAULT_SETTINGS, ...d.settings }, stats: { ...g.stats, ...d.stats }, logs: d.logs || [],
    });
    if (d.mapVersion === MAP_VERSION) {
      for (const [f, s] of Object.entries(d.known || {})) g.known[f] = Uint8Array.from(s.split('').map(Number));
      g.shortcuts = d.shortcuts || [];
      for (const f of g.shortcuts) getFloor(g.seed, f).openShortcut();
    } else {
      // 迷宮の作りが変わった古いセーブ：地図の記録を捨てて城下町から再開
      g.lairsCleared = []; g.lairsFled = [];
      if (g.location === 'dungeon') { g.location = 'town'; g.floor = 0; }
      g.log('迷宮の構造が変わったため、地図の記録を消して城下町から再開します。', 'sys');
    }
    setNextId(d.nextId || 1000);
    if (d.rng) R.s = d.rng;
    return g;
  }

  // ---- メインループ ----
  *run() {
    while (true) {
      if (this.location === 'town') yield* this.town();
      else yield* this.dungeon();
    }
  }

  // ================= 城下町 =================
  *town() {
    this.townState = '城下町';
    this.battle = null;
    this.log('―― 城下町 ――', 'sys');
    for (const c of this.party) c.poison = false;
    yield 2;
    yield* this.temple();
    yield* this.fillParty();
    yield* this.inn();
    yield* this.identify();
    yield* this.shop();
    this.sortParty();
    if (this.onSave) this.onSave();
    // 出発
    const tf = targetFloor(this);
    this.townState = '';
    this.log(`迷宮へ向かう。（目標：地下${tf}階・平均Lv${partyLevel(this).toFixed(1)}）`, 'sys');
    this.stats.trips++;
    this.location = 'dungeon'; this.floor = 1;
    this.x = getFloor(this.seed, 1).up.x; this.y = getFloor(this.seed, 1).up.y; this.dir = 0;
    this.mode = 'explore'; this.lairsCleared = []; this.lairsFled = [];
    this.knownMap()[this.y * W + this.x] = 1;
    yield 2;
  }

  templeCost(c) { return (TEMPLE_COST[c.status] || 0) * c.level; }

  *temple() {
    this.townState = '寺院';
    const order = ['paralyzed', 'stoned', 'dead', 'ash'];
    const patients = [...this.party, ...this.reserve].filter(c => order.includes(c.status));
    patients.sort((a, b) => (this.party.includes(b) - this.party.includes(a)) || b.level - a.level);
    for (const c of patients) {
      const cost = this.templeCost(c);
      if (this.gold < cost) { if (this.party.includes(c)) { this.log(`${c.name}の治療費${cost}Gが足りない。`); yield 1; } continue; }
      this.gold -= cost;
      if (c.status === 'paralyzed' || c.status === 'stoned') {
        c.status = 'ok'; this.log(`寺院で${c.name}を治療した。（${cost}G）`, 'good');
      } else if (c.status === 'dead') {
        if (R.chance(Math.min(0.95, 0.5 + c.stats.vit * 0.025))) { c.status = 'ok'; c.hp = 1; this.log(`${c.name}は蘇った！（${cost}G）`, 'good'); }
        else { c.status = 'ash'; this.log(`${c.name}の蘇生に失敗し、灰になってしまった…`, 'bad'); }
      } else if (c.status === 'ash') {
        if (R.chance(Math.min(0.9, 0.4 + c.stats.vit * 0.025))) { c.status = 'ok'; c.hp = c.maxhp; this.log(`${c.name}は灰から蘇った！（${cost}G）`, 'good'); }
        else { c.status = 'lost'; this.log(`${c.name}は失われた…`, 'bad'); this.stats.deaths++; }
      }
      yield 2;
    }
    this.party = this.party.filter(c => c.status !== 'lost');
    this.reserve = this.reserve.filter(c => c.status !== 'lost');
    // 復帰した控えを戦力として戻す
    for (const r of this.reserve.filter(c => c.status === 'ok')) {
      const weaker = this.party.filter(p => p.level < r.level - 1 && (p.cls === r.cls || roleOf(p) === roleOf(r))).sort((a, b) => (a.cls === r.cls ? -1 : 0) - (b.cls === r.cls ? -1 : 0) || a.level - b.level)[0];
      if (weaker) {
        this.party[this.party.indexOf(weaker)] = r;
        this.reserve.splice(this.reserve.indexOf(r), 1);
        this.reserve.push(weaker);
        this.log(`${r.name}が一行に復帰し、${weaker.name}は酒場で待機することになった。`);
        yield 1;
      }
    }
    // 控えが多すぎる場合は低レベルの者から引退・埋葬
    if (this.reserve.length > 6) {
      this.reserve.sort((a, b) => b.level - a.level);
      const gone = this.reserve.splice(6);
      for (const c of gone) this.log(c.status === 'ok' ? `${c.name}は冒険者を引退した。` : `${c.name}は墓地に葬られた。`);
      yield 1;
    }
  }

  *fillParty() {
    const comp = COMPOSITIONS[this.settings.composition] || COMPOSITIONS.good;
    // 治せなかった仲間は控えへ
    for (const c of [...this.party]) {
      if (c.status !== 'ok') {
        this.party.splice(this.party.indexOf(c), 1);
        this.reserve.push(c);
        this.log(`${c.name}は寺院に安置され、一行を離れた。`);
        yield 1;
      }
    }
    const used = new Set([...this.party, ...this.reserve].map(c => c.name));
    while (this.party.length < 6) {
      // 足りない役割を補充
      const have = this.party.map(c => c.cls);
      let slot = comp.slots.find(([cls, fb]) => !have.includes(cls) && !(fb && have.includes(fb) && have.filter(h => h === fb).length < comp.slots.filter(s => s[0] === fb || s[1] === fb).length && false));
      const counts = {};
      for (const h of have) counts[h] = (counts[h] || 0) + 1;
      slot = comp.slots.find(([cls, fb]) => {
        const need = comp.slots.filter(s => s[0] === cls).length;
        const got = (counts[cls] || 0) + (fb ? 0 : 0);
        return got < need;
      }) || comp.slots[this.party.length];
      const [cls, fb, al] = slot;
      const ok = this.party.find(p => p.align === 'G') ? 'G' : this.party.find(p => p.align === 'E') ? 'E' : al;
      const c = createCharacter(cls, { align: CLASSES[cls].align.includes(ok) ? ok : al, fallback: fb, used, tries: 60 });
      used.add(c.name);
      counts[c.cls] = (counts[c.cls] || 0) + 1;
      // 新人は支度金を持ってくる
      this.gold += R.range(100, 200);
      this.party.push(c);
      this.log(`訓練場で新たな仲間${c.name}（${CLASSES[c.cls].name}）を加えた。`, 'sys');
      yield 1;
    }
    this.sortParty();
  }

  sortParty() {
    const rank = (c) => {
      if (!canAct(c)) return 10;
      return { front: 0, mid: 1, back: c.cls === 'thief' ? 2 : 3 }[roleOf(c)];
    };
    this.party = this.party.map((c, i) => [c, i]).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).map(x => x[0]);
  }

  *inn() {
    this.townState = '宿屋';
    // まずは大部屋で休み呪文を回復、僧侶の呪文で傷を癒やす
    for (let cycle = 0; cycle < 12; cycle++) {
      this.restWeek(INN_ROOMS[0]);
      for (const c of this.party) for (const m of tryLevelUp(c)) { this.log(m, 'good'); yield 1; }
      let casts = 0;
      for (let k = 0; k < 30; k++) {
        const plan = campPlan(this);
        if (!plan) break;
        const [caster, sp, t] = plan;
        if (sp.effect === 'revive') break;
        this.applyCampSpell(caster, sp, t, true);
        casts++;
      }
      if (casts) { this.log('僧侶たちが仲間の傷を癒やした。'); yield 1; }
      if (!this.party.some(c => isAlive(c) && c.hp < c.maxhp)) break;
      if (!casts) break;
    }
    // 残りは有料の部屋で
    const reserveGold = this.goldReserve();
    let weeks = 0;
    while (this.party.some(c => isAlive(c) && c.hp < c.maxhp) && weeks < 100) {
      const hurtN = this.party.filter(c => c.hp < c.maxhp).length;
      let room = [...INN_ROOMS].reverse().find(r => r.cost > 0 && r.cost * hurtN * 2 <= this.gold - reserveGold) || INN_ROOMS[1];
      if (room.cost * hurtN > this.gold) room = INN_ROOMS[0];
      this.gold -= room.cost * hurtN;
      this.restWeek(room);
      weeks++;
    }
    if (weeks) { this.log(`宿屋で${weeks}週間休んだ。`); yield 1; }
    for (const c of this.party) for (const m of tryLevelUp(c)) { this.log(m, 'good'); yield 1; }
    for (const c of this.party) restoreMP(c);
  }
  restWeek(room) {
    this.stats.weeks++;
    for (const c of this.party) {
      if (!isAlive(c)) continue;
      c.weeks = (c.weeks || 0) + 1;
      if (c.weeks % 52 === 0) c.age++;
      restoreMP(c);
      if (room.hp) c.hp = Math.min(c.maxhp, c.hp + Math.max(1, Math.round(c.maxhp * room.hp)));
    }
    for (const c of this.reserve) { c.weeks = (c.weeks || 0) + 1; if (c.weeks % 52 === 0) c.age++; }
  }
  goldReserve() { return Math.round(TEMPLE_COST.dead * partyLevel(this) * 1.2); }

  *identify() {
    this.townState = '鑑定';
    const bishop = this.party.find(c => c.cls === 'bishop' && canAct(c));
    for (const e of this.bag) {
      if (e.identified) continue;
      const it = ITEMS[e.id];
      if (bishop) {
        for (let t = 0; t < 4 && !e.identified; t++) {
          if (R.chance(Math.min(0.95, 0.3 + bishop.level * 0.05 + (bishop.stats.iq - 10) * 0.02))) e.identified = true;
        }
        if (e.identified) { this.log(`${bishop.name}は${it.unknown}を鑑定した。…${it.name}だ。`); yield 1; continue; }
      }
      const fee = Math.ceil(it.price / 2);
      if (this.gold - fee > this.goldReserve() * 0.5) {
        this.gold -= fee; e.identified = true;
        this.log(`商店で${it.unknown}を鑑定してもらった。…${it.name}だ。（${fee}G）`); yield 1;
      }
    }
  }

  bestScoreFor(c, slot) { const e = c.equip[slot]; return e ? itemScore(c, ITEMS[e.id]) : 0; }

  *shop() {
    this.townState = '商店';
    // 袋の中から装備
    this.equipFromBag();
    // 不要品を売る
    let sold = 0, income = 0;
    for (let i = this.bag.length - 1; i >= 0; i--) {
      const e = this.bag[i];
      if (!e.identified) continue;
      const it = ITEMS[e.id];
      if (it.type === 'item') continue;
      const useful = this.party.some(c => itemScore(c, it) > this.bestScoreFor(c, it.type)) && !it.cursed;
      const spare = !it.cursed && it.floor > 0 && this.party.some(c => canEquip(c, it)) && this.bag.filter(x => x.id === e.id).length === 1 && it.price >= 5000 && false;
      if (useful || spare) continue;
      const price = it.cursed ? 1 : Math.floor(it.price / 2);
      this.gold += price; income += price; sold++;
      if (it.floor > 0 && !it.cursed) this.stock[e.id] = (this.stock[e.id] || 0) + 1;
      this.bag.splice(i, 1);
    }
    if (sold) { this.log(`不要な品を${sold}個売り、${income}Gを得た。`); yield 1; }
    // 買い物（前列から順に）
    const reserveGold = this.goldReserve();
    const buyable = () => [...SHOP_BASE, ...Object.keys(this.stock).filter(k => this.stock[k] > 0)].map(id => ITEMS[id]);
    const budget0 = Math.max(0, this.gold - reserveGold);
    const caps = [0.04, 0.1, 0.25, 1];
    for (let pass = 0; pass < caps.length; pass++) {
      for (const c of this.party) {
        for (const slot of SLOTS) {
          const cur = this.bestScoreFor(c, slot);
          const cap = Math.min(this.gold - reserveGold, Math.max(60, budget0 * caps[pass]));
          const cands = buyable().filter(it => it.type === slot && itemScore(c, it) > cur && it.price <= cap)
            .sort((a, b) => itemScore(c, b) - itemScore(c, a));
          const it = cands[0];
          if (!it) continue;
          this.gold -= it.price;
          if (this.stock[it.id]) this.stock[it.id]--;
          const old = c.equip[slot];
          c.equip[slot] = { id: it.id, identified: true };
          if (old) this.bag.push(old);
          this.log(`${c.name}は${it.name}を買った。（${it.price}G）`);
          yield 1;
        }
      }
    }
    // 消耗品
    const potions = this.bag.filter(e => e.id === 'potion').length;
    for (let i = potions; i < 4 && this.gold - reserveGold > 300; i++) { this.gold -= ITEMS.potion.price; this.bag.push({ id: 'potion', identified: true }); }
    const anti = this.bag.filter(e => e.id === 'antidote').length;
    const hasCure = this.party.some(c => maxSlots(c).priest[2] > 0);
    for (let i = anti; i < (hasCure ? 0 : 2) && this.gold - reserveGold > 200; i++) { this.gold -= ITEMS.antidote.price; this.bag.push({ id: 'antidote', identified: true }); }
    // 古い装備を売る
    for (let i = this.bag.length - 1; i >= 0; i--) {
      const e = this.bag[i]; const it = ITEMS[e.id];
      if (it.type === 'item' || !e.identified) continue;
      if (this.party.some(c => itemScore(c, it) > this.bestScoreFor(c, it.type))) continue;
      this.gold += Math.floor(it.price / 2);
      if (it.floor > 0 && !it.cursed) this.stock[e.id] = (this.stock[e.id] || 0) + 1;
      this.bag.splice(i, 1);
    }
  }

  equipFromBag() {
    for (const c of this.party) {
      for (const slot of SLOTS) {
        let bestI = -1, best = this.bestScoreFor(c, slot);
        this.bag.forEach((e, i) => {
          if (!e.identified) return;
          const it = ITEMS[e.id];
          if (it.type !== slot) return;
          const s = itemScore(c, it);
          if (s > best) { best = s; bestI = i; }
        });
        if (bestI >= 0) {
          const e = this.bag.splice(bestI, 1)[0];
          const old = c.equip[slot];
          c.equip[slot] = e;
          if (old) this.bag.push(old);
          this.log(`${c.name}は${ITEMS[e.id].name}を装備した。`);
        }
      }
    }
  }

  // ================= 迷宮 =================
  *dungeon() {
    let sinceBattle = 5;
    let sinceCamp = 0;
    let stuck = 0;
    while (this.location === 'dungeon') {
      const F = this.F;
      const known = this.knownMap();
      known[this.y * W + this.x] = 1;
      if (!this.party.some(canAct)) { yield* this.wipe(); return; }

      // 野営で回復
      sinceCamp++;
      const cond = partyCondition(this);
      // HPバーが赤い（3割未満）仲間がいれば、間隔を空けずにすぐ手当てする
      const someoneRed = this.party.some(c => isAlive(c) && c.status !== 'stoned' && c.hp < c.maxhp * 0.3);
      const usualCamp = sinceCamp > 3 && (cond.hp < 0.75 || this.party.some(c => c.poison || c.status === 'paralyzed' || c.status === 'dead'));
      if ((someoneRed && sinceCamp > 0) || usualCamp) {
        // 赤い仲間の応急手当だけなら、呪文を温存するためHP5割までにとどめる
        const did = yield* this.camp(usualCamp ? 0.8 : 0.5);
        sinceCamp = 0;
        if (did) continue;
      }

      // 撤退判断
      if (this.mode !== 'return') {
        const why = shouldReturn(this);
        if (why) {
          this.mode = 'return';
          this.log(`${why}、地上へ引き返す。`, 'sys');
          yield 1;
          const caster = this.party.find(c => canCast(c, SPELL_BY_ID.kikan)) || this.party.find(c => canCast(c, SPELL_BY_ID.teni));
          if (caster && this.floor >= 3) {
            const sp = canCast(caster, SPELL_BY_ID.kikan) ? SPELL_BY_ID.kikan : SPELL_BY_ID.teni;
            caster.mp[sp.school][sp.lv - 1]--;
            this.log(`${caster.name}は${sp.name}を唱えた。一行は光に包まれ、城下町へ戻った。`, 'spell');
            yield 2;
            this.location = 'town';
            return;
          }
        }
      }

      // 目的地決定
      const { goal, label, avoidBoss } = this.chooseGoal();
      const here = F.cell(this.x, this.y);
      // 階段に到着
      if (label === 'up' && here.type === 'up') { yield* this.climb(-1); continue; }
      if (label === 'down' && here.type === 'down') { yield* this.climb(1); continue; }

      // 避けたいマス（他に道がなければ通る）。
      // 帰還中・弱っているとき・一度逃げ出した玄室は、未制圧なら避ける
      const weak = this.mode === 'return' || cond.hp < 0.7;
      const avoid = (x, y) => {
        const c = F.cell(x, y);
        if (!known[y * W + x]) return false;
        if (c.type === 'lair' && !this.lairsCleared.includes(c.lairId) && (weak || this.lairsFled.includes(c.lairId))) return true;
        return c.type === 'pit' || c.type === 'teleport' || c.type === 'alarm' || (avoidBoss && c.type === 'boss' && !this.cleared);
      };
      let path = findPath(F, known, this.x, this.y, goal, avoid);
      if (!path || !path.length) {
        stuck++;
        if (stuck > 3) { // 行き先が見つからない：ランダムに歩く
          const dirs = [0, 1, 2, 3].filter(d => F.passable(this.x, this.y, d));
          if (!dirs.length) { this.x = F.up.x; this.y = F.up.y; continue; } // 念のため：閉じ込められたら階段へ
          path = [R.pick(dirs)];
          stuck = 0;
        } else { this.lastWander = null; continue; }
      }
      stuck = 0;
      const d = path[0];
      // 避けられない玄室に弱った状態で入る前に、できるだけ回復しておく
      {
        const nc = F.cell(this.x + DX[d], this.y + DY[d]);
        if (nc.type === 'lair' && !this.lairsCleared.includes(nc.lairId) && label !== 'lair' && partyCondition(this).hp < 0.8 && sinceCamp > 0) {
          const did = yield* this.camp();
          sinceCamp = 0;
          if (did) continue;
        }
      }
      // 向きを変える
      if (d !== this.dir) {
        this.dir = d;
        yield 1;
      }
      // 前進
      const wasDoor = F.wall(this.x, this.y, d) === 2;
      const px = this.x, py = this.y;
      this.x += DX[d]; this.y += DY[d];
      this.stats.steps++;
      known[this.y * W + this.x] = 1;
      yield wasDoor ? 2 : 1;

      // 毒
      if (this.stats.steps % 4 === 0) for (const c of this.party) if (c.poison && isAlive(c)) { c.hp -= 1; if (c.hp <= 0) { c.hp = 0; c.status = 'dead'; c.poison = false; this.log(`${c.name}は毒で力尽きた…`, 'bad'); yield 1; } }

      // 下り階段のある部屋に入ったら、近道の扉を開ける
      if (F.shortcut && !this.shortcuts.includes(this.floor) && F.cell(this.x, this.y).room >= 0
          && F.cell(this.x, this.y).room === F.cell(F.shortcut.x, F.shortcut.y).room) {
        F.openShortcut();
        this.shortcuts.push(this.floor);
        // 近道の通路は扉の向こうに見通せるので、地図に載せる
        for (const p of F.shortcutPath || []) known[p.y * W + p.x] = 1;
        this.log('部屋の奥に閂のかかった扉がある。閂を外した。', 'sys');
        yield 1;
        this.log('上り階段への近道が開通した！', 'good');
        yield 2;
      }

      // マスのイベント
      const cell = F.cell(this.x, this.y);
      let res = null;
      if (cell.type === 'pit') {
        this.log('落とし穴だ！', 'bad');
        for (const c of this.party) if (isAlive(c) && !R.chance(c.stats.agi * 0.03)) damageChar(this, c, R.dice(Math.max(1, this.floor), 4));
        yield 2;
      } else if (cell.type === 'teleport') {
        this.log('床の魔法陣が光った！ どこかへ飛ばされた。', 'bad');
        { const p = R.pick(F.openCells()); this.x = p.x; this.y = p.y; }
        known[this.y * W + this.x] = 1;
        yield 2;
        continue;
      } else if (cell.type === 'alarm') {
        this.log('警報の罠だ！ 魔物が集まってきた。', 'bad');
        yield 1;
        res = yield* battle(this, makeEncounter(this.floor));
      } else if (cell.type === 'lair' && !this.lairsCleared.includes(cell.lairId)) {
        // 一度逃げた玄室に再び入るのは避けられない場合だけ。今度は退かずに全力で戦う
        const forced = this.lairsFled.includes(cell.lairId);
        this.log(forced ? '避けられない玄室だ。覚悟を決めて踏み込んだ。' : '玄室に入った。', 'sys');
        yield 1;
        res = yield* battle(this, makeEncounter(this.floor, { lair: true }), { lair: true, noRun: forced });
        if (res.result === 'win') this.lairsCleared.push(cell.lairId);
        if (res.result === 'fled' && !this.lairsFled.includes(cell.lairId)) {
          this.lairsFled.push(cell.lairId);
          this.log('この玄室は避けて進もう。', 'sys');
        }
      } else if (cell.type === 'boss' && !this.cleared) {
        this.log('禍々しい気配が満ちている…。', 'bad');
        yield 2;
        this.log('「よくぞここまで来た。だがお前たちの旅はここで終わる」', 'bad');
        yield 2;
        res = yield* battle(this, bossEncounter(), { boss: true });
        if (res.result === 'win' && res.bossKilled) yield* this.victory();
      } else if (sinceBattle > 2 && R.chance(this.encounterRate(cell))) {
        res = yield* battle(this, makeEncounter(this.floor));
      }
      sinceBattle++;
      if (res) {
        sinceBattle = 0;
        if (res.result === 'wipe') { yield* this.wipe(); return; }
        if (res.result === 'fled') { this.x = px; this.y = py; this.dir = (d + 2) % 4; yield 1; }
        if (res.result === 'win') {
          this.sortParty();
          if (res.lair || res.boss || R.chance(0.3)) yield* this.chest(!!res.lair || !!res.boss);
        }
      }
    }
  }

  encounterRate(cell) { return (cell.dark ? 0.09 : 0.06) + this.floor * 0.002; }

  chooseGoal() {
    const F = this.F, known = this.knownMap();
    const isKnown = (x, y) => known[y * W + x];
    if (this.mode === 'return') return { goal: (x, y) => x === F.up.x && y === F.up.y, label: 'up', avoidBoss: true };
    const tf = targetFloor(this);
    if (this.floor > tf) return { goal: (x, y) => x === F.up.x && y === F.up.y, label: 'up', avoidBoss: true };
    if (this.floor < tf && F.down && isKnown(F.down.x, F.down.y)) {
      return { goal: (x, y) => x === F.down.x && y === F.down.y, label: 'down', avoidBoss: true };
    }
    // ボス
    const bossReady = this.floor === MAX_FLOOR && !this.cleared && partyLevel(this) >= recommendedLevel(MAX_FLOOR) + 2 + policy(this).levelMargin && partyCondition(this).hp > 0.9;
    if (bossReady && F.boss && isKnown(F.boss.x, F.boss.y)) return { goal: (x, y) => x === F.boss.x && y === F.boss.y, label: 'boss', avoidBoss: false };
    // 未踏の区画
    const unexplored = (x, y) => !isKnown(x, y);
    if (findPath(F, known, this.x, this.y, unexplored)) {
      this.lastWander = null;
      return { goal: unexplored, label: 'explore', avoidBoss: !bossReady };
    }
    // 探索済み：玄室を回る or うろつく
    const lair = F.lairs.filter(l => !this.lairsCleared.includes(l.id) && !this.lairsFled.includes(l.id) && isKnown(l.x, l.y));
    if (lair.length) return { goal: (x, y) => lair.some(l => l.x === x && l.y === y), label: 'lair', avoidBoss: true };
    if (!this.lastWander || (this.lastWander.x === this.x && this.lastWander.y === this.y)) {
      // 地上へ戻ってレベルアップが必要か
      const knownCells = F.openCells().filter(p => isKnown(p.x, p.y));
      this.lastWander = knownCells.length ? R.pick(knownCells) : { x: F.up.x, y: F.up.y };
      // 全玄室を掃除したら玄室を復活させる（いったん階を離れる代わり）
      this.lairsCleared = [];
    }
    const t = this.lastWander;
    return { goal: (x, y) => x === t.x && y === t.y, label: 'wander', avoidBoss: true };
  }

  *climb(dir) {
    if (dir < 0) {
      if (this.floor === 1) {
        this.log('階段を上り、地上へ出た。', 'sys');
        yield 1;
        this.location = 'town';
        return;
      }
      this.floor--;
      this.log(`階段を上った。地下${this.floor}階。`, 'sys');
    } else {
      this.floor++;
      if (this.floor > this.deepest) { this.deepest = this.floor; this.log(`地下${this.floor}階に初めて足を踏み入れた。`, 'good'); }
      else this.log(`階段を下りた。地下${this.floor}階。`, 'sys');
    }
    this.lairsCleared = [];
    this.lairsFled = [];
    this.lastWander = null;
    this.knownMap()[this.y * W + this.x] = 1;
    if (this.mode !== 'return') this.mode = 'explore';
    yield 2;
  }

  *camp(hurtBelow = 0.8) {
    let did = false;
    for (let k = 0; k < 10; k++) {
      const plan = campPlan(this, hurtBelow);
      if (!plan) break;
      if (!did) { this.log('一行は野営して傷を手当てした。'); did = true; }
      const [caster, sp, t] = plan;
      this.applyCampSpell(caster, sp, t);
      yield 1;
    }
    // 呪文がなければ傷薬
    for (const c of this.party) {
      if (!isAlive(c)) continue;
      if (c.poison) {
        const i = this.bag.findIndex(e => e.identified && ITEMS[e.id].use === 'cure');
        if (i >= 0) { this.bag.splice(i, 1); c.poison = false; this.log(`${c.name}は毒消しを飲んだ。`); did = true; yield 1; }
      }
      if (c.hp < c.maxhp * 0.35) {
        const i = this.bag.findIndex(e => e.identified && ITEMS[e.id].use === 'heal');
        if (i >= 0) { const it = ITEMS[this.bag[i].id]; this.bag.splice(i, 1); const h = R.roll(it.dice); c.hp = Math.min(c.maxhp, c.hp + h); this.log(`${c.name}は${it.name}を使った。（HP+${h}）`); did = true; yield 1; }
      }
    }
    return did;
  }

  applyCampSpell(caster, sp, t, quiet = false) {
    caster.mp[sp.school][sp.lv - 1]--;
    let msg = `${caster.name}は${sp.name}を唱えた。`;
    if (sp.effect === 'heal') { const h = R.roll(sp.dice); if (sp.target === 'party') { for (const p of this.party) if (isAlive(p)) p.hp = Math.min(p.maxhp, p.hp + R.roll(sp.dice)); msg += '一行の傷が癒えた。'; } else { t.hp = Math.min(t.maxhp, t.hp + h); msg += `${t.name}のHPが${h}回復。`; } }
    else if (sp.effect === 'fullheal') { t.hp = t.maxhp; t.poison = false; if (t.status === 'paralyzed') t.status = 'ok'; msg += `${t.name}は完全に回復した。`; }
    else if (sp.effect === 'cure') { t.poison = false; if (t.status === 'paralyzed') t.status = 'ok'; msg += `${t.name}の体が楽になった。`; }
    else if (sp.effect === 'revive') {
      const p = sp.full ? 0.9 : Math.min(0.9, 0.4 + t.stats.vit * 0.025 + caster.level * 0.01);
      if (R.chance(p)) { t.status = 'ok'; t.hp = sp.full ? t.maxhp : 1; msg += `${t.name}は蘇った！`; }
      else if (t.status === 'dead') { t.status = 'ash'; msg += `${t.name}は灰になってしまった…`; }
      else { t.status = 'lost'; msg += `${t.name}は失われた…`; }
    }
    if (!quiet) this.log(msg, 'spell');
  }

  // 宝箱。this.chestView に表示状態（閉/開）を持たせ、画面に宝箱の絵を出す
  *chest(guaranteed) {
    this.chestView = { open: false };
    try { yield* this.chestBody(guaranteed); }
    finally { this.chestView = null; }
  }

  *chestBody(guaranteed) {
    const setting = this.settings.chest;
    this.log('宝箱がある。', 'sys');
    yield 2;
    if (setting === 'never') { this.log('宝箱は開けずに立ち去った。'); yield 1; return; }
    const floor = this.floor;
    const traps = ['なし', '毒針', 'ボウガン', 'ガス', '爆弾', 'しびれ針', 'テレポーター', '術者殺し', '警報'];
    const weights = [3, 2, 2, 1.5, 1 + floor * 0.2, 1 + floor * 0.15, floor >= 3 ? 1 : 0, floor >= 4 ? 0.8 : 0, floor >= 2 ? 1 : 0];
    let ti = 0; { let tot = weights.reduce((a, b) => a + b, 0), r = R.next() * tot; for (let i = 0; i < traps.length; i++) { r -= weights[i]; if (r < 0) { ti = i; break; } } }
    const trap = traps[ti];
    const thief = this.party.find(c => canAct(c) && (c.cls === 'thief' || c.cls === 'ninja'));
    const detector = this.party.find(c => canCast(c, SPELL_BY_ID.minuki));
    const actor = thief || this.party.find(canAct);

    // 1. 罠を調べる
    let guess = null;
    if (thief) {
      this.log(`${thief.name}が罠を調べた。`);
      yield 1;
      const p = Math.min(0.95, 0.6 + thief.level * 0.03 + (thief.stats.agi - 10) * 0.02);
      guess = R.chance(p) ? trap : R.pick(traps);
      this.log(guess === 'なし' ? '罠はないようだ。' : `罠は「${guess}」のようだ。`);
      yield 1;
    } else if (detector && (floor >= 2 || setting === 'always')) {
      detector.mp.priest[1]--;
      this.log(`${detector.name}はミヌキを唱えた。`, 'spell');
      yield 1;
      guess = R.chance(0.95) ? trap : R.pick(traps);
      this.log(guess === 'なし' ? '罠はないようだ。' : `罠は「${guess}」だ。`);
      yield 1;
    } else if (setting !== 'always' && floor > 2) {
      this.log('罠を調べる手段がない。宝箱は諦めた。'); yield 1; return;
    }

    // 2. 罠を外す（罠がない見立てなら、そのまま開ける）
    let triggered = false;
    if (guess === null || guess === 'なし') {
      this.log(`${actor.name}は宝箱を開けた。`);
      yield 1;
      triggered = trap !== 'なし';
    } else {
      const skill = thief
        ? Math.min(0.95, 0.55 + thief.level * 0.04 - floor * 0.03 + (thief.stats.agi - 10) * 0.02) * (thief.cls === 'ninja' ? 0.85 : 1)
        : 0.2;
      let done = false;
      for (let attempt = 0; attempt < 3 && !done && !triggered; attempt++) {
        this.log(`${actor.name}が罠を外そうとした。`);
        yield 1;
        if (trap === 'なし') {                       // 見立て違いで、実は罠がなかった
          this.log('……罠はなかったようだ。');
          done = true;
        } else if (guess === trap && R.chance(skill)) {
          this.log(`${actor.name}は罠を外した！`, 'good');
          done = true;
        } else {
          this.log('失敗した。');
          yield 1;
          if (R.chance(guess === trap ? 0.5 : 0.7)) triggered = true;
        }
      }
      if (!done && !triggered) { this.log('罠を外せなかった。宝箱は諦めた。'); yield 1; return; }
      if (done) { this.chestView.open = true; yield 2; }
    }

    // 3. 罠が作動
    if (triggered) {
      const opener = actor;
      this.log(`罠「${trap}」が作動した！`, 'bad');
      yield 1;
      const all = this.party.filter(isAlive);
      switch (trap) {
        case '毒針': opener.poison = true; this.log(`${opener.name}は毒に冒された。`, 'bad'); break;
        case 'ボウガン': damageChar(this, opener, R.dice(floor, 8)); break;
        case 'ガス': for (const c of all) if (!R.chance(c.stats.luk * 0.03)) c.poison = true; this.log('毒ガスが広がった。', 'bad'); break;
        case '爆弾': for (const c of all) damageChar(this, c, R.chance(c.stats.luk * 0.03) ? R.dice(floor, 3) : R.dice(floor, 6)); break;
        case 'しびれ針': opener.status = 'paralyzed'; this.log(`${opener.name}は麻痺した。`, 'bad'); break;
        case 'テレポーター': { const p = R.pick(this.F.openCells()); this.x = p.x; this.y = p.y; } this.knownMap()[this.y * W + this.x] = 1; this.log('どこかへ飛ばされた！', 'bad'); yield 1; return;
        case '術者殺し': for (const c of all) if ((maxSlots(c).mage[0] || maxSlots(c).priest[0]) && !R.chance(c.stats.luk * 0.03)) { c.status = 'paralyzed'; this.log(`${c.name}は麻痺した。`, 'bad'); } break;
        case '警報': { yield 1; const res = yield* battle(this, makeEncounter(floor)); if (res.result === 'wipe') { yield* this.wipe(); return; } break; }
      }
      yield 1;
    }
    if (!this.party.some(canAct)) return;

    // 4. 中身
    this.chestView.open = true;
    const gold = R.dice(floor * 2, 30) + (guaranteed ? floor * 50 : 0);
    this.gold += gold;
    this.stats.chests++;
    this.log(`宝箱には${gold}Gが入っていた。`, 'good');
    yield 1;
    // アイテムは最大3個。1個目は玄室・ボス75%／通常45%、2個目以降はそれぞれ35%／20%
    let n = 0;
    if (R.chance(guaranteed ? 0.75 : 0.45)) {
      n = 1;
      while (n < 3 && R.chance(guaranteed ? 0.35 : 0.2)) n++;
    }
    for (let i = 0; i < n; i++) {
      const it = this.dropItem(floor);
      const name = it.unknown;   // 拾った品はすべて未鑑定
      if (this.bag.length < 24) {
        this.bag.push({ id: it.id, identified: false });
        this.log(`${name}を見つけた。`, 'good');
      } else {
        this.log(`${name}は持ちきれなかった。`);
      }
      yield 1;
    }
    yield 1;
  }

  dropItem(floor) {
    const cands = Object.values(ITEMS).filter(it => (it.floor === 0 && floor <= 3 && it.price >= 20) || (it.floor > 0 && it.floor <= floor && it.floor >= floor - 4));
    return R.weighted(cands, it => it.floor === 0 ? 1 : 1 + (it.floor >= floor - 1 ? 1 : 0) - (it.floor >= floor && it.price > 20000 ? 0.7 : 0));
  }

  *wipe() {
    this.stats.wipes++;
    this.log('一行は全滅した…', 'bad');
    yield 3;
    const lost = Math.floor(this.gold / 4);
    this.gold -= lost;
    this.log(`救助隊が亡骸を城下町へ運んだ。（謝礼として ${lost}G を支払った）`, 'sys');
    for (const c of this.party) if (c.status === 'asleep' || c.status === 'ok') c.status = 'dead';
    this.location = 'town';
    yield 2;
  }

  *victory() {
    this.cleared = true;
    this.stats.clearedAt = Date.now();
    this.log('深淵の主ザル=ガドラは崩れ落ちた！', 'good');
    yield 3;
    this.log('迷宮を覆っていた瘴気が晴れていく…。', 'good');
    yield 3;
    this.log('★ 一行は迷宮の最深部を制した！ ★', 'good');
    yield 3;
    for (const c of this.party) if (isAlive(c)) c.exp += 50000;
    this.gold += 50000;
    this.log('城下町から褒賞として50000Gが贈られた。冒険はまだ続く…。', 'sys');
    yield 2;
    this.mode = 'return';
  }
}
