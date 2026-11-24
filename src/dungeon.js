// 迷宮生成（各階 20x20、壁は区画の境界にある型）
// まっすぐな通路（曲がり角は1回まで）で部屋（玄室）をつなぐ。上り階段の部屋と下り階段の部屋の間には、
// 下り階段側から開く近道（封印された扉）を用意する。
import { Rng } from './rng.js';

export const W = 20, H = 20;
export const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];
export const DIR_NAMES = ['北', '東', '南', '西'];
export const OPEN = 0, WALL = 1, DOOR = 2, SEAL = 3;  // SEAL: 近道の扉（開通するまで通れない）
export const MAP_VERSION = 7;
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

// フロアのテーマ
//  A: 直線の通路の横に部屋が並ぶ   B: 少し入り組んだ通路と部屋   C: 幅の広い通路
//  D: 通路少なめ、部屋どうしが直接つながる   E: 1本の通路に各部屋が1か所でつながる
//  F: 通路→部屋→通路→部屋…と順番に進む（最終フロア限定）
export const THEMES = {
  A: '直線の通路と部屋', B: '入り組んだ通路', C: '広い通路', D: '部屋の連なり', E: '一本の通路', F: '順路の迷宮',
};
export function floorTheme(worldSeed, floor) {
  if (floor <= 1) return 'A';
  if (floor >= MAX_FLOOR) return 'F';
  const prev = floorTheme(worldSeed, floor - 1);
  const r = new Rng((worldSeed * 31 + floor * 977 + 13) >>> 0);
  return r.pick(['A', 'B', 'C', 'D', 'E'].filter(t => t !== prev));
}

// エレベーターの縦穴の座標：冒険ごとに1つ決まり、地下1〜9階で共通（迷宮の中央寄り）
export function elevatorPos(worldSeed) {
  const r = new Rng((worldSeed * 13 + 777) >>> 0);
  return { x: r.range(6, 13), y: r.range(6, 13) };
}

function generateFloor(worldSeed, floor) {
  // 上り階段の位置は1つ上の階の下り階段と一致させる
  const up = floor === 1 ? { x: 0, y: H - 1 } : getFloor(worldSeed, floor - 1).down;
  const theme = floorTheme(worldSeed, floor);
  const rng = new Rng((worldSeed * 7919 + floor * 104729) >>> 0);
  for (let attempt = 0; attempt < 80; attempt++) {
    const F = theme === 'F' ? tryGenerate(rng, floor, up, theme, attempt < 40) : tryGenerateOpen(rng, floor, up, theme, attempt < 60, elevatorPos(worldSeed));
    if (F) return F;
  }
  // どうしても作れない場合は、入り組んだ通路のテーマで作る
  for (let attempt = 0; attempt < 60; attempt++) {
    const F = tryGenerate(rng, floor, up, 'B', false);
    if (F) return F;
  }
  throw new Error('floor generation failed');
}

function tryGenerate(rng, floor, up, theme, needShortcut) {
  const F = new Floor(floor);
  F.theme = theme;
  const rooms = [];
  const idx = (x, y) => y * W + x;
  const isRoom = (x, y) => F.cell(x, y).room >= 0;
  const isRock = (x, y) => F.inside(x, y) && !isRoom(x, y) && !F.isOpenCell(x, y);
  const overlaps = (x, y, w, h, margin = 1) => rooms.some(r => x < r.x + r.w + margin && x + w + margin > r.x && y < r.y + r.h + margin && y + h + margin > r.y);
  const rectRock = (x, y, w, h) => {
    if (x < 0 || y < 0 || x + w > W || y + h > H) return false;
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (!isRock(xx, yy)) return false;
    return true;
  };
  const addRoom = (r) => {
    const i = rooms.length;
    rooms.push(r);
    for (let yy = r.y; yy < r.y + r.h; yy++) for (let xx = r.x; xx < r.x + r.w; xx++) {
      F.cell(xx, yy).room = i;
      if (xx < r.x + r.w - 1) F.setWall(xx, yy, 1, OPEN);
      if (yy < r.y + r.h - 1) F.setWall(xx, yy, 2, OPEN);
    }
    return i;
  };
  const removeLastRoom = () => {
    const r = rooms.pop();
    for (let yy = r.y; yy < r.y + r.h; yy++) for (let xx = r.x; xx < r.x + r.w; xx++) {
      F.cell(xx, yy).room = -1;
      for (let d = 0; d < 4; d++) F.setWall(xx, yy, d, WALL);
    }
  };
  const dirBetween = (a, b) => b.y < a.y ? 0 : b.x > a.x ? 1 : b.y > a.y ? 2 : 3;
  // 経路に沿って壁を開ける。部屋の出入りは扉。sealRoom に入る最初の境目は封印扉
  const carve = (path, sealRoom = -1) => {
    let sealed = null;
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i];
      const d = dirBetween(a, b);
      const ra = F.cell(a.x, a.y).room, rb = F.cell(b.x, b.y).room;
      if (ra >= 0 && ra === rb) continue;
      if (sealRoom >= 0 && rb === sealRoom && ra !== sealRoom && !sealed) {
        F.setWall(a.x, a.y, d, SEAL); sealed = { x: b.x, y: b.y, d: (d + 2) % 4 }; continue;
      }
      if (F.wall(a.x, a.y, d) === SEAL) continue;
      F.setWall(a.x, a.y, d, (ra >= 0 || rb >= 0) ? DOOR : OPEN);
    }
    return sealed;
  };
  // 幅2の通路として掘る（進行方向の右隣の列も通路にする）
  const carveWide = (path) => {
    const set = new Set();
    const add = (x, y) => { if (F.inside(x, y) && !isRoom(x, y)) set.add(idx(x, y)); };
    for (let i = 0; i < path.length; i++) {
      const p = path[i], q = path[Math.min(path.length - 1, i + 1)], o = path[Math.max(0, i - 1)];
      add(p.x, p.y);
      const horiz = (q.y === p.y && q.x !== p.x) || (o.y === p.y && o.x !== p.x);
      const vert = (q.x === p.x && q.y !== p.y) || (o.x === p.x && o.y !== p.y);
      if (horiz) add(p.x, p.y + 1 < H ? p.y + 1 : p.y - 1);
      if (vert) add(p.x + 1 < W ? p.x + 1 : p.x - 1, p.y);
      if (horiz && vert) add(p.x + 1 < W ? p.x + 1 : p.x - 1, p.y + 1 < H ? p.y + 1 : p.y - 1);
    }
    for (const k of set) {
      const x = k % W, y = (k / W) | 0;
      if (set.has(idx(x + 1, y)) && x + 1 < W) F.setWall(x, y, 1, OPEN);
      if (set.has(idx(x, y + 1)) && y + 1 < H) F.setWall(x, y, 2, OPEN);
    }
    carve(path);
  };
  const lPath = (a, b, horizFirst) => {
    const path = [{ x: a.x, y: a.y }];
    let x = a.x, y = a.y;
    const stepX = () => { while (x !== b.x) { x += Math.sign(b.x - x); path.push({ x, y }); } };
    const stepY = () => { while (y !== b.y) { y += Math.sign(b.y - y); path.push({ x, y }); } };
    if (horizFirst) { stepX(); stepY(); } else { stepY(); stepX(); }
    return path;
  };
  // 岩盤だけを通る経路（曲がるほど高コスト）。from は開始区画の集合、goal は到達判定
  const route = (fromCells, goal, pass, turnCost = 3, jitter = 0.3) => {
    const INF = 1e9, cost = new Float64Array(W * H * 4).fill(INF), prev = new Int32Array(W * H * 4).fill(-1);
    const open = [];
    for (const c of fromCells) for (let d = 0; d < 4; d++) { const s = idx(c.x, c.y) * 4 + d; cost[s] = 0; open.push(s); }
    let found = -1;
    while (open.length) {
      let bi = 0; for (let i = 1; i < open.length; i++) if (cost[open[i]] < cost[open[bi]]) bi = i;
      const s = open[bi]; open[bi] = open[open.length - 1]; open.pop();
      const ci = s >> 2, d0 = s & 3, x = ci % W, y = (ci / W) | 0;
      if (goal(x, y) && prev[s] >= 0) { found = s; break; }
      for (let d = 0; d < 4; d++) {
        const nx = x + DX[d], ny = y + DY[d];
        if (!F.inside(nx, ny)) continue;
        if (!goal(nx, ny) && !pass(nx, ny)) continue;
        const ns = idx(nx, ny) * 4 + d;
        const c = cost[s] + 1 + (d === d0 ? 0 : turnCost) + rng.next() * jitter;
        if (c < cost[ns]) { cost[ns] = c; prev[ns] = s; open.push(ns); }
      }
    }
    if (found < 0) return null;
    const path = [];
    for (let s = found; s >= 0; s = prev[s]) path.unshift({ x: (s >> 2) % W, y: ((s >> 2) / W) | 0 });
    return path;
  };
  const roomCells = (r) => { const out = []; for (let yy = r.y; yy < r.y + r.h; yy++) for (let xx = r.x; xx < r.x + r.w; xx++) out.push({ x: xx, y: yy }); return out; };
  const roomCell = (r) => ({ x: r.x + rng.int(r.w), y: r.y + rng.int(r.h) });
  const center = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
  const md = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  const placeRooms = (n, wMin, wMax, hMin, hMax, tries = 400) => {
    for (let t = 0; t < tries && rooms.length < n; t++) {
      const w = rng.range(wMin, wMax), h = rng.range(hMin, hMax);
      const x = rng.range(0, W - w), y = rng.range(0, H - h);
      if (overlaps(x, y, w, h) || !rectRock(x, y, w, h)) continue;
      addRoom({ x, y, w, h });
    }
  };
  const mstEdges = () => {
    const inTree = new Set([0]), edges = [];
    while (inTree.size < rooms.length) {
      let best = null;
      for (const i of inTree) for (let j = 0; j < rooms.length; j++) {
        if (inTree.has(j)) continue;
        const dd = md(center(rooms[i]), center(rooms[j]));
        if (!best || dd < best[2]) best = [i, j, dd];
      }
      inTree.add(best[1]); edges.push(best);
    }
    return edges;
  };
  // 最初の部屋は上り階段を含むように置く
  const firstRoom = (wMin = 2, wMax = 3, hMin = 2, hMax = 3) => {
    const w = rng.range(wMin, wMax), h = rng.range(hMin, hMax);
    const x = Math.max(0, Math.min(W - w, up.x - rng.int(w)));
    const y = Math.max(0, Math.min(H - h, up.y - rng.int(h)));
    addRoom({ x, y, w, h });
  };
  let order = null;   // F テーマ：部屋を通る順番
  // 連結成分ごとにラベル付け
  const components = () => {
    const comp = new Int16Array(W * H).fill(-1);
    let n = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (comp[idx(x, y)] >= 0 || !F.isOpenCell(x, y) && !isRoom(x, y)) continue;
      const q = [[x, y]]; comp[idx(x, y)] = n;
      while (q.length) {
        const [cx, cy] = q.pop();
        for (let d = 0; d < 4; d++) {
          if (!F.passable(cx, cy, d)) continue;
          const nx = cx + DX[d], ny = cy + DY[d];
          if (comp[idx(nx, ny)] >= 0) continue;
          comp[idx(nx, ny)] = n; q.push([nx, ny]);
        }
      }
      n++;
    }
    return { comp, n };
  };
  // 上り階段を含む部分に、ほかの部分を短い通路でつないでいく
  const joinComponents = () => {
    for (let guard = 0; guard < 30; guard++) {
      const { comp, n } = components();
      if (n <= 1) return true;
      const main = comp[idx(up.x, up.y)];
      const cells = [];
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (comp[idx(x, y)] === main) cells.push({ x, y });
      const p = route(cells, (x, y) => comp[idx(x, y)] >= 0 && comp[idx(x, y)] !== main, isRock, 1.5, 1.5);
      if (!p) return false;
      carve(p);
    }
    return false;
  };
  // 空いている岩盤に部屋を詰め込み、それぞれ1本の短い通路でつなぐ。
  // loops > 0 なら、さらに遠回りになっている箇所どうしを結ぶ枝道を足す
  const densify = (loops) => {
    for (let t = 0; t < 2500; t++) {
      const w = rng.range(2, 4), h = rng.range(2, 3);
      const x = rng.range(0, W - w), y = rng.range(0, H - h);
      // 詰め込む部屋は、ほかの部屋や通路と壁一枚で隣り合ってよい
      if (overlaps(x, y, w, h, 0) || !rectRock(x, y, w, h)) continue;
      const i = addRoom({ x, y, w, h });
      const p = route(roomCells(rooms[i]), (gx, gy) => F.isOpenCell(gx, gy) && F.cell(gx, gy).room !== i, isRock, 1.5, 1.5);
      if (!p || p.length > 9) { removeLastRoom(); continue; }
      carve(p);
    }
    // 隙間に枝道：通路から岩盤へまっすぐ2〜4区画。輪を許すテーマでは、別の通路に抜けてもよい
    // 行き止まりは少しだけ、別の通路への抜け道は多めに
    let deadEnds = rng.range(2, 4);
    for (let t = 0; t < 400; t++) {
      const cells = F.openCells().filter(c => !isRoom(c.x, c.y));
      if (!cells.length) break;
      const s0 = rng.pick(cells), d = rng.int(4), len = rng.range(2, 4);
      const path = [s0];
      let x = s0.x, y = s0.y, joins = null;
      for (let k = 0; k < len; k++) {
        x += DX[d]; y += DY[d];
        if (!F.inside(x, y)) break;
        if (!isRock(x, y)) { if (!isRoom(x, y)) joins = { x, y }; break; }
        path.push({ x, y });
      }
      if (path.length < 2) continue;
      if (!joins) { if (deadEnds <= 0) continue; deadEnds--; }
      if (joins) {
        if (!loops) continue;
        const dd = F.distances(s0.x, s0.y)[idx(joins.x, joins.y)];
        if (dd >= 0 && dd < 10) continue;      // すぐ近くどうしを結んでも意味がない
        path.push(joins);
      }
      carve(path);
    }
    for (let k = 0; k < loops; k++) {
      const open = F.openCells();
      const s0 = rng.pick(open);
      const dist = F.distances(s0.x, s0.y);
      const p = route([s0], (x, y) => F.isOpenCell(x, y) && dist[idx(x, y)] >= 12 && Math.abs(x - s0.x) + Math.abs(y - s0.y) <= 7,
        (x, y) => isRock(x, y), 1.5, 1.5);
      if (p && p.length <= 9) carve(p);
    }
  };

  switch (theme) {
    case 'A': {
      // 短めの直線通路を数本（横・縦）。その両脇に部屋が並ぶ
      firstRoom();
      const spines = [];
      const nSp = rng.range(3, 4);
      for (let k = 0; k < nSp * 6 && spines.length < nSp; k++) {
        const horiz = k % 2 === 0 ? rng.chance(0.6) : !spines[spines.length - 1]?.horiz;
        const len = rng.range(6, 11), at = rng.range(2, 17), from = rng.range(1, 19 - len);
        const cells = [];
        for (let t = from; t < from + len; t++) cells.push(horiz ? { x: t, y: at } : { x: at, y: t });
        if (!cells.every(c => isRock(c.x, c.y))) continue;
        // 既存の通路と平行に隣り合うものは避ける
        if (spines.some(sp => sp.horiz === horiz && Math.abs(sp.at - at) < 4)) continue;
        carve(cells);
        spines.push({ horiz, at, from, len, cells });
      }
      if (spines.length < 2) return null;
      // 通路に面して部屋を並べ、通路との境に扉
      for (const sp of spines) for (const side of [-1, 1]) {
        let k = sp.from + rng.range(0, 1);
        while (k < sp.from + sp.len - 1) {
          const len = rng.range(2, 3), depth = rng.range(2, 3);
          let r;
          if (sp.horiz) r = { x: k, y: side < 0 ? sp.at - depth : sp.at + 1, w: len, h: depth };
          else r = { x: side < 0 ? sp.at - depth : sp.at + 1, y: k, w: depth, h: len };
          if (r.x >= 0 && r.y >= 0 && r.x + r.w <= W && r.y + r.h <= H && !overlaps(r.x, r.y, r.w, r.h) && rectRock(r.x, r.y, r.w, r.h)) {
            addRoom(r);
            const along = rng.range(0, len - 1);
            if (sp.horiz) { const x = Math.min(sp.from + sp.len - 1, r.x + along), y = side < 0 ? sp.at - 1 : sp.at + 1; F.setWall(x, y, side < 0 ? 2 : 0, DOOR); }
            else { const y = Math.min(sp.from + sp.len - 1, r.y + along), x = side < 0 ? sp.at - 1 : sp.at + 1; F.setWall(x, y, side < 0 ? 1 : 3, DOOR); }
          }
          k += len + 1;
        }
      }
      // ばらばらの部分（階段の部屋・各通路）を短い通路でつなぐ
      if (!joinComponents()) return null;
      densify(rng.range(3, 5));
      break;
    }
    case 'B': {
      // 少し入り組んだ通路：中継点を経由する曲がりの多い通路、輪、行き止まり
      firstRoom();
      placeRooms(rng.range(7, 9), 2, 4, 2, 3);
      if (rooms.length < 6) return null;
      const edges = mstEdges();
      for (let k = rng.range(3, 5); k > 0; k--) { const i = rng.int(rooms.length), j = rng.int(rooms.length); if (i !== j) edges.push([i, j, 0]); }
      for (const [i, j] of edges) {
        const a = roomCell(rooms[i]), b = roomCell(rooms[j]);
        const wp = { x: rng.range(Math.min(a.x, b.x), Math.max(a.x, b.x)), y: rng.range(Math.min(a.y, b.y), Math.max(a.y, b.y)) };
        const p1 = lPath(a, wp, rng.chance(0.5)), p2 = lPath(wp, b, rng.chance(0.5));
        carve([...p1, ...p2.slice(1)]);
      }
      // 行き止まりの枝道
      for (let k = rng.range(2, 4); k > 0; k--) {
        const cells = F.openCells().filter(c => !isRoom(c.x, c.y));
        if (!cells.length) break;
        let { x, y } = rng.pick(cells);
        const d = rng.int(4), len = rng.range(2, 5);
        const path = [{ x, y }];
        for (let s = 0; s < len; s++) { x += DX[d]; y += DY[d]; if (!isRock(x, y)) break; path.push({ x, y }); }
        if (path.length > 1) carve(path);
      }
      densify(rng.range(4, 7));
      break;
    }
    case 'C': {
      // 幅の広い通路（2列）で部屋をつなぐ
      firstRoom();
      placeRooms(rng.range(5, 7), 2, 4, 2, 3);
      if (rooms.length < 5) return null;
      const edges = mstEdges();
      if (rng.chance(0.7)) { const i = rng.int(rooms.length), j = rng.int(rooms.length); if (i !== j) edges.push([i, j, 0]); }
      for (const [i, j] of edges) carveWide(lPath(roomCell(rooms[i]), roomCell(rooms[j]), rng.chance(0.5)));
      densify(rng.range(2, 4));
      break;
    }
    case 'D': {
      // 部屋が主体：区画を分割して部屋で埋め、部屋どうしを短い通り道（1区画）や扉で直接つなぐ
      const leaves = [];
      const split = (x, y, w, h, depth) => {
        const canH = w >= 7, canV = h >= 7;
        if ((!canH && !canV) || (depth > 2 && w <= 6 && h <= 6 && rng.chance(0.5))) { leaves.push({ x, y, w, h }); return; }
        const horizCut = canV && (!canH || (h > w ? true : h < w ? false : rng.chance(0.5)));
        if (horizCut) { const c = rng.range(3, h - 4); split(x, y, w, c + 1, depth + 1); split(x, y + c + 1, w, h - c - 1, depth + 1); }
        else { const c = rng.range(3, w - 4); split(x, y, c + 1, h, depth + 1); split(x + c + 1, y, w - c - 1, h, depth + 1); }
      };
      split(0, 0, W + 1, H + 1, 0);   // 右と下の1列は仕切り（岩盤）として使う
      // 各葉の右端・下端の1列を仕切りとして残し、残りを部屋にする
      const rects = leaves.map(l => ({ x: l.x, y: l.y, w: l.w - 1, h: l.h - 1 })).filter(r => r.w >= 2 && r.h >= 2);
      const upRect = rects.find(r => up.x >= r.x && up.x < r.x + r.w && up.y >= r.y && up.y < r.y + r.h);
      if (!upRect) return null;
      addRoom(upRect);
      for (const r of rects) if (r !== upRect) addRoom(r);
      // 仕切りをはさんで隣り合う部屋を、仕切りの1区画を通り道にしてつなぐ
      const links = [];
      for (let i = 0; i < rooms.length; i++) for (let j = i + 1; j < rooms.length; j++) {
        const a = rooms[i], b = rooms[j];
        const cands = [];
        if (a.x + a.w + 1 === b.x || b.x + b.w + 1 === a.x) {       // 左右に隣り合う
          const gx = a.x + a.w + 1 === b.x ? a.x + a.w : b.x + b.w;
          for (let y = Math.max(a.y, b.y); y < Math.min(a.y + a.h, b.y + b.h); y++) cands.push([{ x: gx - 1, y }, { x: gx, y }, { x: gx + 1, y }]);
        }
        if (a.y + a.h + 1 === b.y || b.y + b.h + 1 === a.y) {       // 上下に隣り合う
          const gy = a.y + a.h + 1 === b.y ? a.y + a.h : b.y + b.h;
          for (let x = Math.max(a.x, b.x); x < Math.min(a.x + a.w, b.x + b.w); x++) cands.push([{ x, y: gy - 1 }, { x, y: gy }, { x, y: gy + 1 }]);
        }
        if (cands.length) links.push([i, j, cands]);
      }
      // 全体がつながるように選び、いくつか輪を足す
      const parent = rooms.map((_, i) => i);
      const find = (i) => parent[i] === i ? i : (parent[i] = find(parent[i]));
      rng.shuffle(links);
      let extra = rng.range(1, 3);
      for (const [i, j, cands] of links) {
        const joined = find(i) !== find(j);
        if (!joined && extra <= 0) continue;
        if (!joined) extra--;
        parent[find(i)] = find(j);
        const path = rng.pick(cands).filter(c => F.inside(c.x, c.y));
        if (path.length === 3 && isRock(path[1].x, path[1].y)) carve(path);
      }
      if (new Set(rooms.map((_, i) => find(i))).size > 1) return null;
      break;
    }
    case 'E': {
      // 1本の長い通路に、各部屋が短い枝で1か所だけつながる（輪なし）
      firstRoom();
      const r0 = rooms[0];
      let spine = [];
      let from = roomCells(r0);
      const nWp = rng.range(4, 6);
      for (let k = 0; k < nWp; k++) {
        const wp = { x: rng.range(1, 18), y: rng.range(1, 18) };
        const spineSet = new Set(spine.map(c => idx(c.x, c.y)));
        const p = route(from, (x, y) => x === wp.x && y === wp.y && isRock(x, y), (x, y) => isRock(x, y) && !spineSet.has(idx(x, y)));
        if (!p) continue;
        carve(p);
        spine = spine.concat(p.filter(c => !isRoom(c.x, c.y)));
        from = [p[p.length - 1]];
      }
      if (spine.length < 25) return null;
      // 部屋をぶら下げる
      const target = rng.range(6, 8);
      for (let t = 0; t < 600 && rooms.length < target; t++) {
        const s = rng.pick(spine), d = rng.int(4), stub = rng.range(1, 2);
        let x = s.x, y = s.y, ok = true;
        const path = [{ x, y }];
        for (let k = 0; k < stub; k++) { x += DX[d]; y += DY[d]; if (!isRock(x, y)) { ok = false; break; } path.push({ x, y }); }
        if (!ok) continue;
        const w = rng.range(2, 4), h = rng.range(2, 3);
        const ex = x + DX[d], ey = y + DY[d];   // 部屋の入口区画
        let rx, ry;
        if (d === 0) { rx = ex - rng.int(w); ry = ey - h + 1; }
        else if (d === 2) { rx = ex - rng.int(w); ry = ey; }
        else if (d === 1) { rx = ex; ry = ey - rng.int(h); }
        else { rx = ex - w + 1; ry = ey - rng.int(h); }
        if (overlaps(rx, ry, w, h) || !rectRock(rx, ry, w, h)) continue;
        // 枝道・部屋が他の通路に接していないこと（壁は残るので通れないが、見た目を整える）
        addRoom({ x: rx, y: ry, w, h });
        path.push({ x: ex, y: ey });
        carve(path);
      }
      if (rooms.length < 5) return null;
      densify(0);     // 輪を作らない（一本の通路から枝分かれするだけ）
      break;
    }
    case 'F': {
      // 部屋を順番にたどる一本道：通路→部屋→通路→部屋…
      // 上り階段の部屋 → 途中の部屋（すべて玄室、4〜6個） → ボスの部屋。詰め込みはしない
      firstRoom();
      const want = 2 + rng.range(4, 6);
      placeRooms(want, 2, 4, 2, 3);
      if (rooms.length !== want) return null;
      // 近い順に並べて順路を決める
      order = [0];
      const left = new Set(rooms.map((_, i) => i).filter(i => i !== 0));
      while (left.size) {
        const last = rooms[order[order.length - 1]];
        let best = null;
        for (const j of left) { const dd = md(center(last), center(rooms[j])); if (!best || dd < best[1]) best = [j, dd]; }
        order.push(best[0]); left.delete(best[0]);
      }
      for (let k = 1; k < order.length; k++) {
        const a = rooms[order[k - 1]], bi = order[k];
        const p = route(roomCells(a), (x, y) => F.cell(x, y).room === bi, isRock);
        if (!p) return null;
        carve(p);
      }
      break;
    }
  }

  // 3. 階段：上り階段から最も遠い部屋（F は順路の最後の部屋）に下り階段（最下層はボス）
  F.up = { x: up.x, y: up.y };
  F.cell(up.x, up.y).type = 'up';
  const dist = F.distances(up.x, up.y);
  // すべての部屋に行けること
  for (const r of rooms) if (dist[idx(r.x, r.y)] < 0) return null;
  let downRoom = -1;
  if (order) downRoom = order[order.length - 1];
  else {
    let bestD = -1;
    rooms.forEach((r, i) => {
      if (i === 0) return;
      let dmin = 1e9;
      for (const c of roomCells(r)) dmin = Math.min(dmin, dist[idx(c.x, c.y)]);
      if (dmin > bestD) { bestD = dmin; downRoom = i; }
    });
  }
  if (downRoom < 0) return null;
  const dr = rooms[downRoom];
  let target = null;
  for (const c of roomCells(dr)) if (!target || dist[idx(c.x, c.y)] > dist[idx(target.x, target.y)]) target = c;
  if (floor < MAX_FLOOR) { F.down = target; F.cell(target.x, target.y).type = 'down'; }
  else { F.boss = target; F.cell(target.x, target.y).type = 'boss'; }

  // 4. 近道：上り階段の部屋から下り階段の部屋へ、岩盤だけを通る通路。下り階段の部屋の入口に封印扉
  const closedD = dist[idx(target.x, target.y)];
  let made = false;
  for (let t = 0; t < 3 && !made; t++) {
    const p = route(roomCells(rooms[0]), (x, y) => F.cell(x, y).room === downRoom, isRock);
    if (!p) break;
    const saveH = F.h.slice(), saveV = F.v.slice();
    const sealed = carve(p, downRoom);
    if (sealed) {
      F.shortcut = sealed; F.shortcutPath = p;
      F.openShortcut();
      const open = F.distances(up.x, up.y)[idx(target.x, target.y)];
      F.setWall(sealed.x, sealed.y, sealed.d, SEAL);
      if (open >= 0 && open <= closedD - 6) { made = true; break; }
      F.shortcut = null; F.shortcutPath = null;
    }
    F.h.set(saveH); F.v.set(saveV);
  }
  if (!made && needShortcut) return null;

  F.rooms = rooms;
  decorate(F, rng, floor, up, rooms, order, 0);
  return F;
}


// ---- 空き地に壁を立てる方式（テーマ①〜⑤） ----
// 全区画を床にしてから、長方形の区画割りで壁を立てる。区画の間に空けたすき間が通路になる。
// gap[depth]: その深さの分割で通路のすき間を空ける確率
const OPEN_THEMES = {
  A: { gap: [1, 1, 0.75, 0.55, 0.4], gapW: 1, leafMax: 5, leafArea: 12, stopP: 0.25, hallP: 0.10, clusterP: 0.20, nookP: 0.12, plazaP: 0.00, solidP: 0.04, extra: [3, 5], tree: false },
  B: { gap: [0.9, 0.85, 0.8, 0.7, 0.6], gapW: 1, leafMax: 4, leafArea: 9, stopP: 0.15, hallP: 0.05, clusterP: 0.30, nookP: 0.25, plazaP: 0.06, solidP: 0.05, extra: [6, 9], tree: false },
  C: { gap: [1, 1, 0.7, 0.5, 0.3], gapW: 2, leafMax: 5, leafArea: 12, stopP: 0.30, hallP: 0.20, clusterP: 0.15, nookP: 0.10, plazaP: 0.00, solidP: 0.03, extra: [3, 5], tree: false },
  D: { gap: [0.3, 0, 0, 0, 0], gapW: 1, leafMax: 5, leafArea: 12, stopP: 0.20, hallP: 0.15, clusterP: 0.30, nookP: 0.00, plazaP: 0.00, solidP: 0.02, extra: [4, 6], tree: false },
  E: { gap: [1, 0.9, 0.85, 0.75, 0.6], gapW: 1, leafMax: 4, leafArea: 9, stopP: 0.20, hallP: 0.08, clusterP: 0.25, nookP: 0.15, plazaP: 0.00, solidP: 0.04, extra: [0, 0], tree: true },
};

function tryGenerateOpen(rng, floor, up, theme, needShortcut, shaft) {
  const P = OPEN_THEMES[theme];
  const F = new Floor(floor);
  F.theme = theme;
  const idx = (x, y) => y * W + x;
  // 内側の壁をすべて取り払う
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (x < W - 1) F.setWall(x, y, 1, OPEN);
    if (y < H - 1) F.setWall(x, y, 2, OPEN);
  }
  const setW = (x, y, d, v) => { if (F.inside(x + DX[d], y + DY[d])) F.setWall(x, y, d, v); };

  // 1. 区画割り
  const leaves = [];
  const split = (r, depth) => {
    const canV = r.w >= 4 + P.gapW, canH = r.h >= 4 + P.gapW;   // 両側に幅2以上を残せるか
    const small = r.w <= P.leafMax && r.h <= P.leafMax;
    if ((!canV && !canH) || (small && (r.w * r.h <= P.leafArea || rng.chance(P.stopP)))) { leaves.push(r); return; }
    const vertical = canV && (!canH || (r.w > r.h ? true : r.w < r.h ? false : rng.chance(0.5)));
    const gap = rng.chance(P.gap[Math.min(depth, P.gap.length - 1)]) ? P.gapW : 0;
    const len = vertical ? r.w : r.h;
    const c = rng.range(2, len - 2 - gap);            // 前半の幅
    if (vertical) {
      split({ x: r.x, y: r.y, w: c, h: r.h }, depth + 1);
      split({ x: r.x + c + gap, y: r.y, w: r.w - c - gap, h: r.h }, depth + 1);
    } else {
      split({ x: r.x, y: r.y, w: r.w, h: c }, depth + 1);
      split({ x: r.x, y: r.y + c + gap, w: r.w, h: r.h - c - gap }, depth + 1);
    }
  };
  split({ x: 0, y: 0, w: W, h: H }, 0);

  // 2. 区画の使い道：部屋・小部屋の集まり・広間・広場（壁なし）・岩盤
  const rooms = [];
  const roomOf = (x, y) => F.cell(x, y).room;
  const addRoom = (r) => {
    const i = rooms.length;
    rooms.push(r);
    for (let yy = r.y; yy < r.y + r.h; yy++) for (let xx = r.x; xx < r.x + r.w; xx++) F.cell(xx, yy).room = i;
    return i;
  };
  const wallAround = (r) => {
    for (let xx = r.x; xx < r.x + r.w; xx++) { setW(xx, r.y, 0, WALL); setW(xx, r.y + r.h - 1, 2, WALL); }
    for (let yy = r.y; yy < r.y + r.h; yy++) { setW(r.x, yy, 3, WALL); setW(r.x + r.w - 1, yy, 1, WALL); }
  };
  const innerDoors = [];          // 小部屋の集まりの中の扉（あとで付ける）
  const sealedFront = new Set();  // 集まりの奥の部屋（外への扉を付けない）
  for (const r of leaves) {
    const area = r.w * r.h;
    const upHere = up.x >= r.x && up.x < r.x + r.w && up.y >= r.y && up.y < r.y + r.h;
    if (!upHere && area <= 6 && rng.chance(P.solidP)) {
      // 岩盤：すべての壁を閉じる
      for (let yy = r.y; yy < r.y + r.h; yy++) for (let xx = r.x; xx < r.x + r.w; xx++) for (let d = 0; d < 4; d++) setW(xx, yy, d, WALL);
      F.cell(r.x, r.y).solid = true;
      continue;
    }
    if (rng.chance(P.plazaP)) continue;   // 広場：壁を立てない（通路の一部になる）
    wallAround(r);
    if (!upHere && rng.chance(P.nookP)) {
      // くぼみ：三方だけ壁を立て、一方を通路に開く（部屋ではなく通路の一部）
      const sides = [0, 1, 2, 3].filter(d => d === 0 ? r.y > 0 : d === 2 ? r.y + r.h < H : d === 3 ? r.x > 0 : r.x + r.w < W);
      if (sides.length) {
        const d = rng.pick(sides);
        if (d === 0 || d === 2) for (let xx = r.x; xx < r.x + r.w; xx++) setW(xx, d === 0 ? r.y : r.y + r.h - 1, d, OPEN);
        else for (let yy = r.y; yy < r.y + r.h; yy++) setW(d === 3 ? r.x : r.x + r.w - 1, yy, d, OPEN);
        // 中に短い仕切りを1本立てて、L字やコの字の通路にする
        if (r.w >= 3 && r.h >= 3) {
          if (d === 0 || d === 2) { const xx = r.x + 1 + rng.int(r.w - 2); for (let yy = r.y; yy < r.y + r.h - 1; yy++) setW(xx, d === 0 ? yy : yy + 1, 3, WALL); }
          else { const yy = r.y + 1 + rng.int(r.h - 2); for (let xx = r.x; xx < r.x + r.w - 1; xx++) setW(d === 3 ? xx : xx + 1, yy, 0, WALL); }
        }
        continue;
      }
    }
    if (area >= 8 && rng.chance(P.clusterP)) {
      // 小部屋の集まり：長い方向に2〜3つに仕切り、手前から順に扉でつなぐ
      const vertical = r.w >= r.h;
      const len = vertical ? r.w : r.h;
      const n = Math.min(len >= 6 ? 3 : 2, Math.floor(len / 2));
      const cuts = [];
      let pos = 0;
      for (let k = 0; k < n; k++) {
        const rest = len - pos, left = n - k;
        const size = k === n - 1 ? rest : rng.range(2, rest - 2 * (left - 1));
        cuts.push([pos, size]); pos += size;
      }
      const ids = cuts.map(([o, sz]) => addRoom(vertical ? { x: r.x + o, y: r.y, w: sz, h: r.h } : { x: r.x, y: r.y + o, w: r.w, h: sz }));
      ids.forEach((id, k) => {
        wallAround(rooms[id]);
        if (k > 0) {
          sealedFront.add(id);
          const a = rooms[ids[k - 1]];
          if (vertical) innerDoors.push([a.x + a.w - 1, a.y + rng.int(a.h), 1]);
          else innerDoors.push([a.x + rng.int(a.w), a.y + a.h - 1, 2]);
        }
      });
      // 手前（外とつながる側）をランダムに。奥の部屋は手前の部屋を通らないと入れない
      if (rng.chance(0.5)) { sealedFront.delete(ids[ids.length - 1]); sealedFront.add(ids[0]); for (let k = 1; k < ids.length - 1; k++) sealedFront.add(ids[k]); }
      continue;
    }
    const id = addRoom(r);
    if (area >= 12 && rng.chance(P.hallP)) rooms[id].hall = true;   // 広間（中に何もない大部屋）
  }
  for (const [x, y, d] of innerDoors) setW(x, y, d, DOOR);
  // エレベーター：縦穴の区画を、四方を壁で囲んだ1×1の部屋にする。
  // 扉はこのあとの扉付けで、全体がつながるようにつく
  if (floor < MAX_FLOOR && shaft) {
    if (shaft.x === up.x && shaft.y === up.y) return null;
    const c = F.cell(shaft.x, shaft.y);
    c.room = -1; c.solid = false; c.type = 'elevator';
    for (let d = 0; d < 4; d++) setW(shaft.x, shaft.y, d, WALL);
    F.elevator = { x: shaft.x, y: shaft.y };
  }

  // 3. 通路だけを木の形にする（⑤：輪を作らない）
  const isCorr = (x, y) => F.inside(x, y) && roomOf(x, y) < 0 && !F.cell(x, y).solid;
  if (P.tree) {
    const seen = new Uint8Array(W * H);
    const starts = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (isCorr(x, y)) starts.push({ x, y });
    rng.shuffle(starts);
    for (const s0 of starts) {
      if (seen[idx(s0.x, s0.y)]) continue;
      seen[idx(s0.x, s0.y)] = 1;
      const stack = [s0];
      const treeEdges = new Set();
      while (stack.length) {
        const c = stack[stack.length - 1];
        const ds = rng.shuffle([0, 1, 2, 3]).filter(d => {
          const nx = c.x + DX[d], ny = c.y + DY[d];
          return isCorr(nx, ny) && F.wall(c.x, c.y, d) === OPEN && !seen[idx(nx, ny)];
        });
        if (!ds.length) { stack.pop(); continue; }
        const d = ds[0], nx = c.x + DX[d], ny = c.y + DY[d];
        seen[idx(nx, ny)] = 1;
        treeEdges.add(Math.min(idx(c.x, c.y), idx(nx, ny)) + ':' + Math.max(idx(c.x, c.y), idx(nx, ny)));
        stack.push({ x: nx, y: ny });
      }
      // 木に使わなかった通路どうしの境目は壁にする
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (!isCorr(x, y)) continue;
        for (const d of [1, 2]) {
          const nx = x + DX[d], ny = y + DY[d];
          if (!isCorr(nx, ny) || F.wall(x, y, d) !== OPEN) continue;
          const key = Math.min(idx(x, y), idx(nx, ny)) + ':' + Math.max(idx(x, y), idx(nx, ny));
          if (seen[idx(x, y)] && seen[idx(nx, ny)] && !treeEdges.has(key)) {
            // 別の木の辺かもしれないので、全部の木の辺を集めてから判断する
          }
        }
      }
      F._treeEdges = (F._treeEdges || new Set());
      for (const k of treeEdges) F._treeEdges.add(k);
    }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!isCorr(x, y)) continue;
      for (const d of [1, 2]) {
        const nx = x + DX[d], ny = y + DY[d];
        if (!isCorr(nx, ny) || F.wall(x, y, d) !== OPEN) continue;
        const key = Math.min(idx(x, y), idx(nx, ny)) + ':' + Math.max(idx(x, y), idx(nx, ny));
        if (!F._treeEdges.has(key)) F.setWall(x, y, d, WALL);
      }
    }
    delete F._treeEdges;
  }

  // 4. 扉：まず各部屋を通路へ、次に全体がつながるまで、最後に輪を作る扉を少し
  //    領域：部屋は部屋ごと、通路は壁で区切られたまとまりごと
  const region = new Int32Array(W * H).fill(-1);
  let nReg = rooms.length;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (roomOf(x, y) >= 0) region[idx(x, y)] = roomOf(x, y);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!isCorr(x, y) || region[idx(x, y)] >= 0) continue;
    const id = nReg++;
    const q = [[x, y]]; region[idx(x, y)] = id;
    while (q.length) {
      const [cx, cy] = q.pop();
      for (let d = 0; d < 4; d++) {
        const nx = cx + DX[d], ny = cy + DY[d];
        if (!isCorr(nx, ny) || F.wall(cx, cy, d) !== OPEN || region[idx(nx, ny)] >= 0) continue;
        region[idx(nx, ny)] = id; q.push([nx, ny]);
      }
    }
  }
  const parent = Array.from({ length: nReg }, (_, i) => i);
  const find = (i) => parent[i] === i ? i : (parent[i] = find(parent[i]));
  const union = (a, b) => { parent[find(a)] = find(b); };
  // 既存の扉（集まりの中）でつながっている部屋をまとめる
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) for (const d of [1, 2]) {
    const nx = x + DX[d], ny = y + DY[d];
    if (!F.inside(nx, ny) || F.wall(x, y, d) === WALL) continue;
    const a = region[idx(x, y)], b = region[idx(nx, ny)];
    if (a >= 0 && b >= 0 && a !== b) union(a, b);
  }
  // 扉の候補：異なる領域の間の壁
  const cands = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) for (const d of [1, 2]) {
    const nx = x + DX[d], ny = y + DY[d];
    if (!F.inside(nx, ny) || F.wall(x, y, d) !== WALL) continue;
    const a = region[idx(x, y)], b = region[idx(nx, ny)];
    if (a < 0 || b < 0 || a === b) continue;
    // 集まりの奥の部屋には外からの扉を付けない
    const ra = roomOf(x, y), rb = roomOf(nx, ny);
    if ((ra >= 0 && sealedFront.has(ra)) || (rb >= 0 && sealedFront.has(rb))) continue;
    cands.push({ x, y, d, a, b, toCorr: (ra < 0) !== (rb < 0) });
  }
  rng.shuffle(cands);
  // (1) 通路に面した部屋は、通路側に扉を1つ
  const hasDoor = new Set();
  for (const c of cands) {
    if (!c.toCorr) continue;
    const room = roomOf(c.x, c.y) >= 0 ? roomOf(c.x, c.y) : roomOf(c.x + DX[c.d], c.y + DY[c.d]);
    if (hasDoor.has(room) || find(c.a) === find(c.b)) continue;
    hasDoor.add(room);
    F.setWall(c.x, c.y, c.d, DOOR); union(c.a, c.b);
  }
  // (2) 全体がつながるまで
  for (const c of cands) {
    if (F.wall(c.x, c.y, c.d) !== WALL || find(c.a) === find(c.b)) continue;
    F.setWall(c.x, c.y, c.d, DOOR); union(c.a, c.b);
  }
  // (3) 輪を作る扉
  let extra = rng.range(P.extra[0], P.extra[1]);
  for (const c of cands) {
    if (extra <= 0) break;
    if (F.wall(c.x, c.y, c.d) !== WALL) continue;
    F.setWall(c.x, c.y, c.d, DOOR); extra--;
  }

  // 5. 階段
  F.up = { x: up.x, y: up.y };
  F.cell(up.x, up.y).type = 'up';
  const dist = F.distances(up.x, up.y);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (F.isOpenCell(x, y) && dist[idx(x, y)] < 0) return null;
  const startRoom = roomOf(up.x, up.y);
  // 下り階段は、上り階段から遠い小さめの部屋に
  let downRoom = -1, bestD = -1;
  rooms.forEach((r, i) => {
    if (i === startRoom || r.w * r.h > 12) return;
    // 上り階段から見た目にも離れていること
    if (Math.abs(r.x + r.w / 2 - up.x) + Math.abs(r.y + r.h / 2 - up.y) < 10) return;
    let dmin = 1e9;
    for (let yy = r.y; yy < r.y + r.h; yy++) for (let xx = r.x; xx < r.x + r.w; xx++) dmin = Math.min(dmin, dist[idx(xx, yy)]);
    if (dmin > bestD) { bestD = dmin; downRoom = i; }
  });
  if (downRoom < 0) return null;
  const dr = rooms[downRoom];
  let target = null;
  for (let yy = dr.y; yy < dr.y + dr.h; yy++) for (let xx = dr.x; xx < dr.x + dr.w; xx++)
    if (roomOf(xx, yy) === downRoom && (!target || dist[idx(xx, yy)] > dist[idx(target.x, target.y)])) target = { x: xx, y: yy };
  if (!target) return null;
  if (floor < MAX_FLOOR) { F.down = target; F.cell(target.x, target.y).type = 'down'; }
  else { F.boss = target; F.cell(target.x, target.y).type = 'boss'; }

  // 6. 近道：下り階段の部屋の壁のうち、開けると上り階段からの道のりが最も縮む壁を封印扉に
  const closedD = dist[idx(target.x, target.y)];
  let best = null;
  for (let yy = dr.y; yy < dr.y + dr.h; yy++) for (let xx = dr.x; xx < dr.x + dr.w; xx++) for (let d = 0; d < 4; d++) {
    const nx = xx + DX[d], ny = yy + DY[d];
    if (roomOf(xx, yy) !== downRoom || !F.inside(nx, ny) || roomOf(nx, ny) === downRoom || F.wall(xx, yy, d) !== WALL || dist[idx(nx, ny)] < 0) continue;
    if (F.cell(nx, ny).type === 'elevator') continue;
    const via = dist[idx(nx, ny)] + 1 + Math.abs(xx - target.x) + Math.abs(yy - target.y);
    const gain = closedD - via;
    if (!best || gain > best.gain) best = { x: xx, y: yy, d, gain };
  }
  if (best && best.gain >= Math.max(6, closedD * 0.3)) {
    F.setWall(best.x, best.y, best.d, SEAL);
    F.shortcut = { x: best.x, y: best.y, d: best.d };
    // 近道を開けたときの道筋（地図に載せる区画）
    F.openShortcut();
    const prev = new Int32Array(W * H).fill(-1), seen = new Uint8Array(W * H);
    const q = [[up.x, up.y]]; seen[idx(up.x, up.y)] = 1;
    while (q.length) {
      const [x, y] = q.shift();
      for (let d = 0; d < 4; d++) {
        if (!F.passable(x, y, d)) continue;
        const nx = x + DX[d], ny = y + DY[d];
        if (seen[idx(nx, ny)]) continue;
        seen[idx(nx, ny)] = 1; prev[idx(nx, ny)] = idx(x, y); q.push([nx, ny]);
      }
    }
    const path = [];
    for (let k = idx(target.x, target.y); k >= 0; k = prev[k]) path.unshift({ x: k % W, y: (k / W) | 0 });
    F.shortcutPath = path;
    F.setWall(best.x, best.y, best.d, SEAL);
  } else if (needShortcut) return null;

  F.rooms = rooms;
  decorate(F, rng, floor, up, rooms, null, startRoom);
  return F;
}

// 玄室・罠・暗闇を置く（どの生成方式でも共通）。startRoom は上り階段のある部屋（なければ -1）
function decorate(F, rng, floor, up, rooms, order, startRoom) {
  // 5. 玄室（固定の敵と宝箱）：上り階段の部屋以外の、およそ半分の部屋。扉に面していない区画を選ぶ
  // 玄室は部屋の3分の1ほど、多くても5つ
  const lairCount = Math.min(5, Math.max(3, Math.round((rooms.length - 1) / 3)));
  const lairRooms = order
    ? new Set(order.slice(1, -1))   // 順路の迷宮：途中の部屋はすべて玄室（ボスの部屋は除く）
    : new Set(rng.shuffle(rooms.map((_, i) => i).filter(i => i !== startRoom)).slice(0, lairCount));
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
        if (c.type !== 'up' && c.type !== 'down' && c.type !== 'boss' && c.type !== 'elevator') c.dark = true;
      }
    }
  }
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
