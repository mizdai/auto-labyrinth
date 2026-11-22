// 迷宮生成（各階 20x20、壁は区画の境界にある Wizardry 型）
import { Rng } from './rng.js';

export const W = 20, H = 20;
export const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];
export const DIR_NAMES = ['北', '東', '南', '西'];
export const OPEN = 0, WALL = 1, DOOR = 2;
export const MAX_FLOOR = 10;

export class Floor {
  constructor(floor) {
    this.floor = floor;
    this.h = new Uint8Array(W * (H + 1)).fill(WALL); // 区画(x,y)の北側
    this.v = new Uint8Array((W + 1) * H).fill(WALL); // 区画(x,y)の西側
    this.cells = new Array(W * H).fill(null).map(() => ({ type: null, dark: false, room: -1 }));
    this.up = null; this.down = null;
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
    return this.inside(nx, ny) && this.wall(x, y, d) !== WALL;
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
  const F = new Floor(floor);

  // 1. 部屋
  const rooms = [];
  const nRooms = rng.range(4, 7);
  for (let t = 0; t < 200 && rooms.length < nRooms; t++) {
    const w = rng.range(2, 4), h = rng.range(2, 4);
    const x = rng.range(0, W - w), y = rng.range(0, H - h);
    if (rooms.some(r => x < r.x + r.w + 1 && x + w + 1 > r.x && y < r.y + r.h + 1 && y + h + 1 > r.y)) continue;
    if (up.x >= x && up.x < x + w && up.y >= y && up.y < y + h) continue;
    rooms.push({ x, y, w, h });
  }
  rooms.forEach((r, i) => {
    for (let yy = r.y; yy < r.y + r.h; yy++) for (let xx = r.x; xx < r.x + r.w; xx++) {
      F.cell(xx, yy).room = i;
      if (xx < r.x + r.w - 1) F.setWall(xx, yy, 1, OPEN);
      if (yy < r.y + r.h - 1) F.setWall(xx, yy, 2, OPEN);
    }
  });

  // 2. 穴掘り法で迷路（部屋は1つのノードとして扱い、部屋の出入口を少なくする）
  const visited = new Uint8Array(W * H);
  const roomVisited = new Set();
  const stack = [[up.x, up.y]];
  visited[up.y * W + up.x] = 1;
  const markRoom = (x, y) => {
    const ri = F.cell(x, y).room;
    if (ri < 0 || roomVisited.has(ri)) return;
    roomVisited.add(ri);
    const r = rooms[ri];
    for (let yy = r.y; yy < r.y + r.h; yy++) for (let xx = r.x; xx < r.x + r.w; xx++) visited[yy * W + xx] = 1;
  };
  markRoom(up.x, up.y);
  while (stack.length) {
    const [x, y] = stack[stack.length - 1];
    const dirs = rng.shuffle([0, 1, 2, 3]).filter(d => {
      const nx = x + DX[d], ny = y + DY[d];
      return F.inside(nx, ny) && !visited[ny * W + nx];
    });
    if (!dirs.length) {
      stack.pop();
      // 部屋の場合、部屋の他のマスからも掘り進める
      continue;
    }
    const d = dirs[0];
    const nx = x + DX[d], ny = y + DY[d];
    const fromRoom = F.cell(x, y).room, toRoom = F.cell(nx, ny).room;
    F.setWall(x, y, d, (fromRoom >= 0) !== (toRoom >= 0) || (fromRoom >= 0 && toRoom >= 0 && fromRoom !== toRoom) ? DOOR : OPEN);
    visited[ny * W + nx] = 1;
    stack.push([nx, ny]);
    if (toRoom >= 0) {
      markRoom(nx, ny);
      const r = rooms[toRoom];
      for (let yy = r.y; yy < r.y + r.h; yy++) for (let xx = r.x; xx < r.x + r.w; xx++) stack.push([xx, yy]);
    }
  }

  // 3. ループを作るため内壁を一部除去
  const loops = rng.range(18, 30);
  for (let i = 0; i < loops; i++) {
    const x = rng.int(W), y = rng.int(H), d = rng.int(4);
    const nx = x + DX[d], ny = y + DY[d];
    if (!F.inside(nx, ny) || F.wall(x, y, d) !== WALL) continue;
    const a = F.cell(x, y).room, b = F.cell(nx, ny).room;
    F.setWall(x, y, d, (a >= 0 || b >= 0) ? DOOR : (rng.chance(0.15) ? DOOR : OPEN));
  }

  // 4. 階段
  F.up = { x: up.x, y: up.y };
  F.cell(up.x, up.y).type = 'up';
  const dist = F.distances(up.x, up.y);
  let maxD = 0; for (const v of dist) maxD = Math.max(maxD, v);
  const far = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dd = dist[y * W + x];
    if (dd >= maxD * 0.65 && F.cell(x, y).room < 0) far.push({ x, y });
  }
  const target = far.length ? rng.pick(far) : { x: W - 1, y: 0 };
  if (floor < MAX_FLOOR) { F.down = target; F.cell(target.x, target.y).type = 'down'; }
  else { F.boss = target; F.cell(target.x, target.y).type = 'boss'; }

  // 5. 玄室（固定の敵と宝箱）
  F.lairs = [];
  // 扉に面していない区画を選ぶ（部屋の中で迂回できるように）。乱数の消費回数は変えない
  const doorCount = (x, y) => [0, 1, 2, 3].filter(d => F.wall(x, y, d) === DOOR || (F.wall(x, y, d) === OPEN && F.inside(x + DX[d], y + DY[d]) && F.cell(x + DX[d], y + DY[d]).room !== F.cell(x, y).room)).length;
  rooms.forEach((r, i) => {
    let cx = r.x + rng.int(r.w), cy = r.y + rng.int(r.h);
    let best = [cx, cy], bestScore = doorCount(cx, cy) * 10 + (F.cell(cx, cy).type ? 100 : 0);
    for (let yy = r.y; yy < r.y + r.h; yy++) for (let xx = r.x; xx < r.x + r.w; xx++) {
      const sc = doorCount(xx, yy) * 10 + (F.cell(xx, yy).type ? 100 : 0) + (Math.abs(xx - cx) + Math.abs(yy - cy)) * 0.1;
      if (sc < bestScore) { bestScore = sc; best = [xx, yy]; }
    }
    [cx, cy] = best;
    const c = F.cell(cx, cy);
    if (c.type) return;
    c.type = 'lair'; c.lairId = i;
    F.lairs.push({ x: cx, y: cy, id: i });
  });

  // 6. 罠
  const nTraps = floor === 1 ? 0 : rng.range(3, 4 + Math.floor(floor / 2));
  for (let i = 0, t = 0; i < nTraps && t < 300; t++) {
    const x = rng.int(W), y = rng.int(H);
    const c = F.cell(x, y);
    if (c.type || c.room >= 0 || Math.abs(x - up.x) + Math.abs(y - up.y) < 3) continue;
    c.type = rng.pick(floor >= 3 ? ['pit', 'pit', 'teleport', 'alarm'] : floor === 2 ? ['pit', 'alarm'] : ['alarm']);
    i++;
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
