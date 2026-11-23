// 迷宮生成（各階 20x20、壁は区画の境界にある型）
// まっすぐな通路（曲がり角は1回まで）で部屋（玄室）をつなぐ。上り階段の部屋と下り階段の部屋の間には、
// 下り階段側から開く近道（封印された扉）を用意する。
import { Rng } from './rng.js';

export const W = 20, H = 20;
export const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];
export const DIR_NAMES = ['北', '東', '南', '西'];
export const OPEN = 0, WALL = 1, DOOR = 2, SEAL = 3;  // SEAL: 近道の扉（開通するまで通れない）
export const MAP_VERSION = 2;
export const MAX_FLOOR = 10;

export class Floor {
  constructor(floor) {
    this.floor = floor;
    this.h = new Uint8Array(W * (H + 1)).fill(WALL); // 区画(x,y)の北側
    this.v = new Uint8Array((W + 1) * H).fill(WALL); // 区画(x,y)の西側
    this.cells = new Array(W * H).fill(null).map(() => ({ type: null, dark: false, room: -1 }));
    this.up = null; this.down = null;
    this.shortcut = null;   // { x, y, d }：下り階段の部屋側から見た封印扉
  }
  inside(x, y) { return x >= 0 && y >= 0 && x < W && y < H; }
  cell(x, y) { return this.cells[y * W + x]; }
  wall(x, y, d) {
    switch (d) {
      case 0: return this.h[y * W + x];
      case 2: return this.h[(y + 1) * W + x];
      case 3: return this.v[y * (W + 1) + x];
      case 1: return this.v[y * (W + 1) + x + 1];
    }
  }
  setWall(x, y, d, val) {
    switch (d) {
      case 0: this.h[y * W + x] = val; break;
      case 2: this.h[(y + 1) * W + x] = val; break;
      case 3: this.v[y * (W + 1) + x] = val; break;
      case 1: this.v[y * (W + 1) + x + 1] = val; break;
    }
  }
  passable(x, y, d) {
    const nx = x + DX[d], ny = y + DY[d];
    const w = this.wall(x, y, d);
    return this.inside(nx, ny) && w !== WALL && w !== SEAL;
  }
  // 近道を開通させる（封印扉を普通の扉に）
  openShortcut() {
    if (!this.shortcut) return false;
    const { x, y, d } = this.shortcut;
    if (this.wall(x, y, d) !== SEAL) return false;
    this.setWall(x, y, d, DOOR);
    return true;
  }
  // 通路か部屋になっている（壁に囲まれた岩盤でない）区画
  isOpenCell(x, y) { for (let d = 0; d < 4; d++) if (this.passable(x, y, d)) return true; return false; }
  openCells() {
    const out = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (this.isOpenCell(x, y)) out.push({ x, y });
    return out;
  }
  // 全体BFS（距離マップ）
  distances(sx, sy) {
    const dist = new Int16Array(W * H).fill(-1);
    const q = [[sx, sy]]; dist[sy * W + sx] = 0;
    while (q.length) {
      const [x, y] = q.shift();
      for (let d = 0; d < 4; d++) {
        if (!this.passable(x, y, d)) continue;
        const nx = x + DX[d], ny = y + DY[d];
        if (dist[ny * W + nx] >= 0) continue;
        dist[ny * W + nx] = dist[y * W + x] + 1;
        q.push([nx, ny]);
      }
    }
    return dist;
  }
}

const cache = new Map();
export function getFloor(worldSeed, floor) {
  const key = worldSeed + ':' + floor;
  if (!cache.has(key)) cache.set(key, generateFloor(worldSeed, floor));
  return cache.get(key);
}

function generateFloor(worldSeed, floor) {
  // 上り階段の位置は1つ上の階の下り階段と一致させる
  const up = floor === 1 ? { x: 0, y: H - 1 } : getFloor(worldSeed, floor - 1).down;
  const rng = new Rng((worldSeed * 7919 + floor * 104729) >>> 0);
  for (let attempt = 0; attempt < 30; attempt++) {
    const F = tryGenerate(rng, floor, up, attempt < 20);
    if (F) return F;
  }
  return tryGenerate(rng, floor, up, false);
}

function tryGenerate(rng, floor, up, needShortcut) {
  const F = new Floor(floor);

  // 1. 部屋。最初の部屋は上り階段を含むように置く
  const rooms = [];
  const overlaps = (x, y, w, h) => rooms.some(r => x < r.x + r.w + 1 && x + w + 1 > r.x && y < r.y + r.h + 1 && y + h + 1 > r.y);
  {
    const w = rng.range(2, 3), h = rng.range(2, 3);
    const x = Math.max(0, Math.min(W - w, up.x - rng.int(w)));
    const y = Math.max(0, Math.min(H - h, up.y - rng.int(h)));
    rooms.push({ x, y, w, h });
  }
  const nRooms = rng.range(7, 10);
  for (let t = 0; t < 400 && rooms.length < nRooms; t++) {
    const w = rng.range(2, 5), h = rng.range(2, 4);
    const x = rng.range(0, W - w), y = rng.range(0, H - h);
    if (overlaps(x, y, w, h)) continue;
    rooms.push({ x, y, w, h });
  }
  rooms.forEach((r, i) => {
    for (let yy = r.y; yy < r.y + r.h; yy++) for (let xx = r.x; xx < r.x + r.w; xx++) {
      F.cell(xx, yy).room = i;
      if (xx < r.x + r.w - 1) F.setWall(xx, yy, 1, OPEN);
      if (yy < r.y + r.h - 1) F.setWall(xx, yy, 2, OPEN);
    }
  });

  // 2. 通路：L字（曲がり角1回）の経路で区画を掘る
  const lPath = (a, b, horizFirst) => {
    const path = [{ x: a.x, y: a.y }];
    let x = a.x, y = a.y;
    const stepX = () => { while (x !== b.x) { x += Math.sign(b.x - x); path.push({ x, y }); } };
    const stepY = () => { while (y !== b.y) { y += Math.sign(b.y - y); path.push({ x, y }); } };
    if (horizFirst) { stepX(); stepY(); } else { stepY(); stepX(); }
    return path;
  };
  const dirBetween = (a, b) => b.y < a.y ? 0 : b.x > a.x ? 1 : b.y > a.y ? 2 : 3;
  const carve = (path, sealRoom = -1) => {
    let sealed = null;
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i];
      const d = dirBetween(a, b);
      const ra = F.cell(a.x, a.y).room, rb = F.cell(b.x, b.y).room;
      if (ra >= 0 && ra === rb) continue;                      // 部屋の中
      if (sealRoom >= 0 && rb === sealRoom && ra !== sealRoom && !sealed) {
        F.setWall(a.x, a.y, d, SEAL); sealed = { x: b.x, y: b.y, d: (d + 2) % 4 }; continue;
      }
      if (F.wall(a.x, a.y, d) === SEAL) continue;
      F.setWall(a.x, a.y, d, (ra >= 0 || rb >= 0) ? DOOR : OPEN);
    }
    return sealed;
  };
  const roomCell = (r) => ({ x: r.x + rng.int(r.w), y: r.y + rng.int(r.h) });
  const center = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
  const md = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  // 最小全域木でつなぎ、いくつか輪を足す
  const inTree = new Set([0]);
  const edges = [];
  while (inTree.size < rooms.length) {
    let best = null;
    for (const i of inTree) for (let j = 0; j < rooms.length; j++) {
      if (inTree.has(j)) continue;
      const dd = md(center(rooms[i]), center(rooms[j]));
      if (!best || dd < best[2]) best = [i, j, dd];
    }
    inTree.add(best[1]); edges.push(best);
  }
  const extra = rng.range(1, 3);
  for (let k = 0; k < extra; k++) {
    const i = rng.int(rooms.length), j = rng.int(rooms.length);
    if (i !== j) edges.push([i, j, 0]);
  }
  for (const [i, j] of edges) carve(lPath(roomCell(rooms[i]), roomCell(rooms[j]), rng.chance(0.5)));

  // 3. 階段：上り階段から最も遠い部屋に下り階段（最下層はボス）
  F.up = { x: up.x, y: up.y };
  F.cell(up.x, up.y).type = 'up';
  const dist = F.distances(up.x, up.y);
  let downRoom = -1, bestD = -1;
  rooms.forEach((r, i) => {
    if (i === 0) return;
    let dmin = 1e9;
    for (let yy = r.y; yy < r.y + r.h; yy++) for (let xx = r.x; xx < r.x + r.w; xx++) { const v = dist[yy * W + xx]; if (v >= 0) dmin = Math.min(dmin, v); }
    if (dmin < 1e9 && dmin > bestD) { bestD = dmin; downRoom = i; }
  });
  if (downRoom < 0) return null;
  const dr = rooms[downRoom];
  let target = null;
  for (let yy = dr.y; yy < dr.y + dr.h; yy++) for (let xx = dr.x; xx < dr.x + dr.w; xx++) {
    if (!target || dist[yy * W + xx] > dist[target.y * W + target.x]) target = { x: xx, y: yy };
  }
  if (floor < MAX_FLOOR) { F.down = target; F.cell(target.x, target.y).type = 'down'; }
  else { F.boss = target; F.cell(target.x, target.y).type = 'boss'; }

  // 4. 近道：上り階段の部屋から下り階段の部屋へ。下り階段の部屋の入口に封印扉
  const closedD = F.distances(up.x, up.y)[target.y * W + target.x];
  if (closedD < 0) return null;
  let made = false;
  for (let t = 0; t < 8 && !made; t++) {
    const saveH = F.h.slice(), saveV = F.v.slice();
    const scPath = lPath(roomCell(rooms[0]), roomCell(dr), rng.chance(0.5));
    const sealed = carve(scPath, downRoom);
    F.shortcutPath = scPath;
    if (sealed) {
      const closed = F.distances(up.x, up.y)[target.y * W + target.x];
      F.shortcut = sealed;
      F.openShortcut();
      const open = F.distances(up.x, up.y)[target.y * W + target.x];
      F.setWall(sealed.x, sealed.y, sealed.d, SEAL);
      if (closed >= 0 && open >= 0 && open <= closed - 8) { made = true; break; }
      F.shortcut = null;
    }
    F.h.set(saveH); F.v.set(saveV);
  }
  if (!made && needShortcut) return null;

  // 5. 玄室（固定の敵と宝箱）：上り階段の部屋以外の、およそ半分の部屋。扉に面していない区画を選ぶ
  const lairRooms = new Set(rng.shuffle(rooms.map((_, i) => i).filter(i => i !== 0)).slice(0, Math.max(2, Math.round((rooms.length - 1) * 0.5))));
  const doorCount = (x, y) => [0, 1, 2, 3].filter(d => {
    const w = F.wall(x, y, d);
    return w === DOOR || w === SEAL || (w === OPEN && F.inside(x + DX[d], y + DY[d]) && F.cell(x + DX[d], y + DY[d]).room !== F.cell(x, y).room);
  }).length;
  F.lairs = [];
  rooms.forEach((r, i) => {
    if (!lairRooms.has(i)) return;
    let best = null, bestScore = 1e9;
    for (let yy = r.y; yy < r.y + r.h; yy++) for (let xx = r.x; xx < r.x + r.w; xx++) {
      if (F.cell(xx, yy).type) continue;
      const sc = doorCount(xx, yy) * 10 + rng.next();
      if (sc < bestScore) { bestScore = sc; best = { x: xx, y: yy }; }
    }
    if (!best) return;
    const c = F.cell(best.x, best.y);
    c.type = 'lair'; c.lairId = i;
    F.lairs.push({ x: best.x, y: best.y, id: i });
  });

  // 6. 罠：通路の区画のうち、そこを通らなくても迷宮全体がつながっている（迂回できる）区画に。
  //    近道の通路には置かない。罠どうしで迂回路をふさがないよう、置くたびに確かめる
  const allOpen = F.openCells();
  const onShortcut = new Set(F.shortcut ? (F.shortcutPath || []).map(p => p.y * W + p.x) : []);
  const blocked = new Set();
  const connectedWithout = (bx, by) => {
    const seen = new Uint8Array(W * H);
    const skip = (x, y) => (x === bx && y === by) || blocked.has(y * W + x);
    const q = [[up.x, up.y]]; seen[up.y * W + up.x] = 1; let n = 1;
    while (q.length) {
      const [x, y] = q.pop();
      for (let d = 0; d < 4; d++) {
        if (!F.passable(x, y, d)) continue;
        const nx = x + DX[d], ny = y + DY[d];
        if (seen[ny * W + nx] || skip(nx, ny)) continue;
        seen[ny * W + nx] = 1; n++; q.push([nx, ny]);
      }
    }
    return n === allOpen.length - 1 - blocked.size;
  };
  const corridor = allOpen.filter(p => F.cell(p.x, p.y).room < 0 && !F.cell(p.x, p.y).type
    && !onShortcut.has(p.y * W + p.x) && Math.abs(p.x - up.x) + Math.abs(p.y - up.y) >= 3);
  const nTraps = floor === 1 ? 0 : rng.range(3, 4 + Math.floor(floor / 2));
  rng.shuffle(corridor);
  for (const p of corridor) {
    if (blocked.size >= nTraps) break;
    if (!connectedWithout(p.x, p.y)) continue;
    blocked.add(p.y * W + p.x);
    F.cell(p.x, p.y).type = rng.pick(floor >= 3 ? ['pit', 'pit', 'teleport', 'alarm'] : floor === 2 ? ['pit', 'alarm'] : ['alarm']);
  }

  // 7. 暗闇
  if (floor >= 2) {
    const zones = rng.range(1, 2);
    for (let z = 0; z < zones; z++) {
      const zx = rng.int(W - 3), zy = rng.int(H - 3), zw = rng.range(2, 4), zh = rng.range(2, 4);
      for (let y = zy; y < Math.min(H, zy + zh); y++) for (let x = zx; x < Math.min(W, zx + zw); x++) {
        const c = F.cell(x, y);
        if (c.type !== 'up' && c.type !== 'down' && c.type !== 'boss') c.dark = true;
      }
    }
  }
  return F;
}

// 既知情報に基づく経路探索。visited された区画の壁だけを知っているものとする。
// goal(x,y) を満たす最寄り区画への経路（方向の配列）を返す
export function findPath(F, known, sx, sy, goal, avoid = null) {
  const prev = new Int16Array(W * H).fill(-1);
  const pdir = new Int8Array(W * H).fill(-1);
  const seen = new Uint8Array(W * H);
  const q = [sy * W + sx]; seen[sy * W + sx] = 1;
  let head = 0;
  const deferred = [];
  while (head < q.length || deferred.length) {
    if (head >= q.length) { q.push(deferred.shift()); }
    const idx = q[head++];
    const x = idx % W, y = (idx / W) | 0;
    if (idx !== sy * W + sx && goal(x, y)) {
      const path = [];
      let cur = idx;
      while (cur !== sy * W + sx) { path.unshift(pdir[cur]); cur = prev[cur]; }
      return path;
    }
    if (!known[idx] && idx !== sy * W + sx) continue; // 未踏区画の先は分からない
    for (let d = 0; d < 4; d++) {
      if (!F.passable(x, y, d)) continue;
      const n = (y + DY[d]) * W + (x + DX[d]);
      if (seen[n]) continue;
      seen[n] = 1; prev[n] = idx; pdir[n] = d;
      if (avoid && avoid(n % W, (n / W) | 0) && !goal(n % W, (n / W) | 0)) deferred.push(n);
      else q.push(n);
    }
  }
  return null;
}
