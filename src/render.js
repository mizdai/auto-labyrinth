// 描画：ワイヤーフレームの疑似3D視点、ミニマップ、魔物の簡易スプライト
import { W, H, DX, DY, WALL, DOOR, SEAL } from './dungeon.js';

const LINE = '#d8e0e8';
const DOORC = '#e8c060';
const SEALC = '#c05050';   // 封印された近道の扉
const DIM = '#5a6470';

// ---- 透視投影による3D表示 ----
// 区画(x,y)はワールド座標 [x,x+1]×[y,y+1] を占める。壁の高さは1、目の高さは0.5。
// cam: { x, y, a } … x,y は区画中心基準の連続座標、a は向き（0=北、π/2=東）
const NEAR = 0.04;
const VIEW_RANGE = 7;
const CAM_BACK = 0.25;  // 区画の中心から少し後ろに立つ
const FOCAL = 0.55;     // 画面幅に対する焦点距離

export function poseOf(game) {
  return { x: game.x + 0.5, y: game.y + 0.5, a: game.dir * Math.PI / 2, floor: game.floor, loc: game.location };
}

// size：描画領域の幅、height：高さ（縦長でも横長でも、ゆがめずに透視図を描く）
export function drawView(ctx, game, size, cam = poseOf(game), height = size) {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, size, height);
  ctx.lineWidth = Math.max(1, size / 220);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = LINE;
  if (game.location === 'town') {
    const s = Math.min(size, height);
    ctx.save(); ctx.translate((size - s) / 2, (height - s) / 2); drawTown(ctx, s); ctx.restore();
    return;
  }
  const F = game.F;
  const fx = Math.sin(cam.a), fy = -Math.cos(cam.a);   // 前方
  const rx = Math.cos(cam.a), ry = Math.sin(cam.a);    // 右
  const ex = cam.x - fx * CAM_BACK, ey = cam.y - fy * CAM_BACK;
  const ccx = Math.floor(cam.x), ccy = Math.floor(cam.y);
  if (F.inside(ccx, ccy) && F.cell(ccx, ccy).dark) {
    ctx.fillStyle = DIM; ctx.font = `${size / 14}px sans-serif`; ctx.textAlign = 'center';
    ctx.fillText('暗闇', size / 2, height / 2);
    return;
  }
  const f = FOCAL * size, half = size / 2, halfY = height / 2;
  // ワールド座標(wx,wy,h) → カメラ座標(xc,zc,yc)
  const toCam = (wx, wy, h) => {
    const dx = wx - ex, dy = wy - ey;
    return [dx * rx + dy * ry, dx * fx + dy * fy, h - 0.5];
  };
  const proj = (p) => [half + p[0] / p[1] * f, halfY - p[2] / p[1] * f];

  // 描画対象を集める
  const items = [];
  const isDark = (x, y) => F.inside(x, y) && F.cell(x, y).dark;
  const seen = new Set();
  for (let y = ccy - VIEW_RANGE; y <= ccy + VIEW_RANGE; y++) {
    for (let x = ccx - VIEW_RANGE; x <= ccx + VIEW_RANGE; x++) {
      if (!F.inside(x, y)) continue;
      const dark = isDark(x, y);
      for (let d = 0; d < 4; d++) {
        const key = d === 0 ? `h${x},${y}` : d === 2 ? `h${x},${y + 1}` : d === 3 ? `v${x},${y}` : `v${x + 1},${y}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const w = F.wall(x, y, d);
        const nx = x + DX[d], ny = y + DY[d];
        const otherDark = !F.inside(nx, ny) || isDark(nx, ny);
        // 壁の両端点
        const [x1, y1, x2, y2] = d === 0 ? [x, y, x + 1, y] : d === 2 ? [x, y + 1, x + 1, y + 1] : d === 3 ? [x, y, x, y + 1] : [x + 1, y, x + 1, y + 1];
        let kind = null;
        if (w !== 0) kind = (dark && otherDark) ? null : (w === DOOR ? 'door' : w === SEAL ? 'seal' : 'wall');
        else if (dark !== isDark(nx, ny) && F.inside(nx, ny)) kind = 'fog';   // 暗闇との境目
        if (!kind) continue;
        items.push({ kind, x1, y1, x2, y2, dist: dist2((x1 + x2) / 2, (y1 + y2) / 2, ex, ey) });
      }
      const c = F.cell(x, y);
      if (!dark && (c.type === 'up' || c.type === 'down' || c.type === 'boss' || c.type === 'elevator')) {
        items.push({ kind: 'mark', x, y, type: c.type, dist: dist2(x + 0.5, y + 0.5, ex, ey) });
      }
    }
  }
  // 遠いものから描く（手前の壁が奥を塗りつぶす）
  items.sort((a, b) => b.dist - a.dist);
  for (const it of items) {
    if (it.kind === 'mark') { drawMark(ctx, it, toCam, proj); continue; }
    const quad = [toCam(it.x1, it.y1, 0), toCam(it.x2, it.y2, 0), toCam(it.x2, it.y2, 1), toCam(it.x1, it.y1, 1)];
    const poly = clipNear(quad);
    if (poly.length < 3) continue;
    const pts = poly.map(proj);
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
    ctx.closePath();
    ctx.fillStyle = it.kind === 'fog' ? '#0b0d12' : '#000';
    ctx.fill();
    ctx.strokeStyle = it.kind === 'fog' ? '#1c2230' : LINE;
    ctx.stroke();
    if (it.kind === 'door' || it.kind === 'seal') {
      // 扉の枠（壁面上の u=0.25〜0.75、高さ0〜0.8）。封印扉は赤く、×印の閂つき
      const P = (u, h) => toCam(it.x1 + (it.x2 - it.x1) * u, it.y1 + (it.y2 - it.y1) * u, h);
      ctx.strokeStyle = it.kind === 'seal' ? SEALC : DOORC;
      strokeSeg(ctx, P(0.25, 0), P(0.25, 0.8), proj);
      strokeSeg(ctx, P(0.25, 0.8), P(0.75, 0.8), proj);
      strokeSeg(ctx, P(0.75, 0.8), P(0.75, 0), proj);
      if (it.kind === 'seal') { strokeSeg(ctx, P(0.25, 0), P(0.75, 0.8), proj); strokeSeg(ctx, P(0.25, 0.8), P(0.75, 0), proj); }
      ctx.strokeStyle = LINE;
    }
  }
}

const dist2 = (ax, ay, bx, by) => (ax - bx) * (ax - bx) + (ay - by) * (ay - by);

// 近クリップ面 zc >= NEAR で多角形を切り取る（Sutherland–Hodgman）
function clipNear(poly) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const ain = a[1] >= NEAR, bin = b[1] >= NEAR;
    if (ain) out.push(a);
    if (ain !== bin) out.push(lerpZ(a, b));
  }
  return out;
}
function lerpZ(a, b) {
  const t = (NEAR - a[1]) / (b[1] - a[1]);
  return [a[0] + (b[0] - a[0]) * t, NEAR, a[2] + (b[2] - a[2]) * t];
}
function strokeSeg(ctx, a, b, proj) {
  if (a[1] < NEAR && b[1] < NEAR) return;
  if (a[1] < NEAR) a = lerpZ(a, b);
  if (b[1] < NEAR) b = lerpZ(a, b);
  const p = proj(a), q = proj(b);
  ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
}

// 床・天井の印：上り階段は天井に□、下り階段は床に□、ボスは床に赤い□
function drawMark(ctx, it, toCam, proj) {
  const h0 = it.type === 'up' ? 1 : 0;
  const col = it.type === 'boss' ? '#e05050' : it.type === 'elevator' ? '#40d0a0' : '#80c0ff';
  const poly = clipNear([[0.2, 0.2], [0.8, 0.2], [0.8, 0.8], [0.2, 0.8]].map(([u, v]) => toCam(it.x + u, it.y + v, h0)));
  if (poly.length < 3) return;
  const pts = poly.map(proj);
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
  ctx.closePath();
  ctx.strokeStyle = col;
  ctx.stroke();
  ctx.strokeStyle = LINE;
}

function line(ctx, x1, y1, x2, y2) { ctx.strokeStyle = ctx.strokeStyle || LINE; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
function rect(ctx, l, t, r, b) { ctx.beginPath(); ctx.rect(l, t, r - l, b - t); ctx.stroke(); }

function drawTown(ctx, size) {
  ctx.strokeStyle = LINE;
  const s = size;
  // 城壁と塔の線画
  const base = s * 0.78;
  line(ctx, 0, base, s, base);
  const towers = [[0.12, 0.38], [0.36, 0.25], [0.64, 0.25], [0.88, 0.38]];
  for (const [x, h] of towers) {
    const cx = x * s, w = s * 0.09;
    rect(ctx, cx - w / 2, h * s, cx + w / 2, base);
    ctx.beginPath(); ctx.moveTo(cx - w / 2 - 4, h * s); ctx.lineTo(cx, h * s - s * 0.1); ctx.lineTo(cx + w / 2 + 4, h * s); ctx.stroke();
  }
  rect(ctx, s * 0.12, s * 0.5, s * 0.88, base);
  ctx.beginPath(); ctx.arc(s / 2, base, s * 0.09, Math.PI, 0); ctx.stroke();
  for (let i = 0; i < 9; i++) { const x = s * 0.12 + i * s * 0.095; rect(ctx, x, s * 0.47, x + s * 0.045, s * 0.5); }
  ctx.fillStyle = '#d8e0e8'; ctx.font = `${s / 16}px sans-serif`; ctx.textAlign = 'center';
  ctx.fillText('城 下 町', s / 2, s * 0.92);
}

// ミニマップ：既知の区画だけ描く
export function drawMap(ctx, game, size) {
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = 'rgba(0,0,0,0.78)';
  ctx.fillRect(0, 0, size, size);
  if (game.location !== 'dungeon') return;
  const F = game.F, known = game.knownMap();
  const cs = size / W;
  const lw = Math.max(1, Math.round(cs / 9));
  ctx.lineWidth = lw;
  ctx.lineCap = 'butt';
  const doors = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!known[y * W + x]) continue;
    const c = F.cell(x, y);
    ctx.fillStyle = c.dark ? '#1c2230' : '#26303c';
    ctx.fillRect(x * cs, y * cs, cs, cs);
    if (c.type) {
      const col = { up: '#80c0ff', down: '#80c0ff', lair: '#c08040', pit: '#c04040', teleport: '#a060e0', alarm: '#e0a020', boss: '#ff4040', elevator: '#40d0a0' }[c.type];
      if (col) { ctx.fillStyle = col; ctx.fillRect(x * cs + cs * 0.3, y * cs + cs * 0.3, cs * 0.4, cs * 0.4); }
    }
  }
  // 壁（扉も壁の線として描き、あとで扉の印を重ねる）
  ctx.strokeStyle = '#c8d0d8';
  ctx.beginPath();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!known[y * W + x]) continue;
    const x0 = x * cs, y0 = y * cs;
    for (let d = 0; d < 4; d++) {
      const w = F.wall(x, y, d);
      if (w === 0) continue;
      if (d === 0) { ctx.moveTo(x0, y0); ctx.lineTo(x0 + cs, y0); }
      if (d === 1) { ctx.moveTo(x0 + cs, y0); ctx.lineTo(x0 + cs, y0 + cs); }
      if (d === 2) { ctx.moveTo(x0, y0 + cs); ctx.lineTo(x0 + cs, y0 + cs); }
      if (d === 3) { ctx.moveTo(x0, y0); ctx.lineTo(x0, y0 + cs); }
      if (w === DOOR || w === SEAL) doors.push([x, y, d, w]);
    }
  }
  ctx.stroke();
  // 扉：壁を横切る2本の短い線（縦の壁なら「＝」、横の壁なら「‖」）
  const half = cs * 0.3, gap = Math.max(lw * 1.5, cs * 0.12);
  for (const [x, y, d, w] of doors) {
    ctx.strokeStyle = w === SEAL ? SEALC : DOORC;
    ctx.beginPath();
    const x0 = x * cs, y0 = y * cs;
    if (d === 0 || d === 2) {          // 横の壁
      const wy = d === 0 ? y0 : y0 + cs, mx = x0 + cs / 2;
      for (const o of [-gap, gap]) { ctx.moveTo(mx + o, wy - half); ctx.lineTo(mx + o, wy + half); }
    } else {                            // 縦の壁
      const wx = d === 3 ? x0 : x0 + cs, my = y0 + cs / 2;
      for (const o of [-gap, gap]) { ctx.moveTo(wx - half, my + o); ctx.lineTo(wx + half, my + o); }
    }
    ctx.stroke();
  }
  // 現在地
  const px = (game.x + 0.5) * cs, py = (game.y + 0.5) * cs;
  ctx.fillStyle = '#40ff80';
  ctx.beginPath();
  const a = [-Math.PI / 2, 0, Math.PI / 2, Math.PI][game.dir];
  ctx.moveTo(px + Math.cos(a) * cs * 0.45, py + Math.sin(a) * cs * 0.45);
  ctx.lineTo(px + Math.cos(a + 2.4) * cs * 0.4, py + Math.sin(a + 2.4) * cs * 0.4);
  ctx.lineTo(px + Math.cos(a - 2.4) * cs * 0.4, py + Math.sin(a - 2.4) * cs * 0.4);
  ctx.fill();
}

// 魔物の簡易スプライト（IDから決まる左右対称のドット絵）
const TYPE_COLORS = {
  beast: ['#b08050', '#e0c090'], slime: ['#4080e0', '#a0d0ff'], humanoid: ['#70a050', '#c0e090'], human: ['#c09070', '#f0d0b0'],
  caster: ['#8060c0', '#d0b0ff'], undead: ['#a0a090', '#e0e0d0'], insect: ['#608040', '#b0d070'], spirit: ['#60c0c0', '#d0ffff'],
  giant: ['#a07050', '#e0b080'], golem: ['#808080', '#c0c0c0'], dragon: ['#c04030', '#ffa060'], demon: ['#a03060', '#ff80b0'],
};
function hash(str) { let h = 2166136261; for (const ch of str) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
export function drawMonster(ctx, mon, cx, cy, scale, alpha = 1) {
  const N = 12;
  let h = hash(mon.id);
  const rnd = () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return (h >>> 0) / 4294967296; };
  const [c1, c2] = TYPE_COLORS[mon.type] || ['#999', '#ddd'];
  const px = scale / N;
  ctx.globalAlpha = alpha;
  const grid = [];
  for (let y = 0; y < N; y++) {
    grid.push([]);
    for (let x = 0; x < N / 2; x++) {
      const dist = Math.abs(x - N / 2 + 0.5) / (N / 2) + Math.abs(y - N / 2) / N;
      grid[y].push(rnd() > 0.25 + dist * 0.55 ? (rnd() > 0.7 ? 2 : 1) : 0);
    }
  }
  for (let y = 0; y < N; y++) for (let x = 0; x < N / 2; x++) {
    const v = grid[y][x];
    if (!v) continue;
    ctx.fillStyle = v === 2 ? c2 : c1;
    ctx.fillRect(cx - scale / 2 + x * px, cy - scale / 2 + y * px, px + 0.5, px + 0.5);
    ctx.fillRect(cx - scale / 2 + (N - 1 - x) * px, cy - scale / 2 + y * px, px + 0.5, px + 0.5);
  }
  // 目
  ctx.fillStyle = '#ff3030';
  const ey = cy - scale / 2 + Math.floor(N * 0.35) * px;
  ctx.fillRect(cx - px * 2, ey, px, px); ctx.fillRect(cx + px, ey, px, px);
  ctx.globalAlpha = 1;
}

// 魔物の画像（assets/monsters/<id>.png、全員同じ 96×96 のキャンバス、等倍ドット）。読み込めなければ簡易ドット絵で代用
const SPRITE_PX = 96;
const spriteCache = new Map();
function sprite(id) {
  if (!spriteCache.has(id)) {
    const img = new Image();
    img.onerror = () => { img._failed = true; };
    img.onload = () => { img._bbox = contentBox(img); };
    img.src = new URL(`../assets/monsters/${id}.png`, import.meta.url).href;
    spriteCache.set(id, img);
  }
  return spriteCache.get(id);
}
// 不透明部分の左右の範囲（並べるときの幅にだけ使う。描画は余白ごと行う）
function contentBox(img) {
  try {
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const x = c.getContext('2d');
    x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data;
    let l = c.width, r = -1;
    for (let yy = 0; yy < c.height; yy++) for (let xx = 0; xx < c.width; xx++) {
      if (d[(yy * c.width + xx) * 4 + 3] > 0) { if (xx < l) l = xx; if (xx > r) r = xx; }
    }
    return r >= 0 ? { l, r: r + 1 } : { l: 0, r: c.width };
  } catch (e) { return { l: 0, r: img.naturalWidth }; }
}
export function preloadSprites(ids) { for (const id of ids) sprite(id); }

// 戦闘画面（引き伸ばしのない実ピクセル座標 w×h で描く）
// 上に全グループの「数・名前・（動ける数）」、下に先頭から2グループまでの絵を、一定の整数倍率で並べる。
// 96pxのキャンバス全体が表示枠の高さの約2/3になる整数倍率
export const BATTLE_CANVAS_RATIO = 0.68;
export function battleScale(h) { return Math.max(1, Math.floor(h * BATTLE_CANVAS_RATIO / SPRITE_PX)); }
// 戦闘画面のレイアウト（実ピクセル）。dpr：画面の拡大率（文字はほかの欄と同じ13px）
function battleLayout(w, h, dpr) {
  const fp = Math.round(13 * dpr);
  const pad = Math.round(fp * 0.7);
  // 絵の大きさは、96pxの絵を画面上で2倍（192px）にするのを上限とする（敵の数によらず一定）。
  // 名前4行分の下に収まればそこに、収まらない狭い画面では名前3行分の下までを使い、4行目の名前は絵に重ねて書く
  const top4 = pad + fp * (1 + 3 * 1.45) + fp * 0.4;
  const top3 = pad + fp * (1 + 2 * 1.45) + fp * 0.4;
  const fit = (top) => Math.floor((h - top - pad * 0.5) / SPRITE_PX);
  const want = Math.min(Math.round(2 * dpr), Math.floor(w / 2 / (SPRITE_PX * 0.82)));
  const scale = Math.max(1, Math.min(want, fit(top4) >= want ? want : fit(top3)));
  const size = SPRITE_PX * scale;
  const bottom = Math.round(h - pad * 0.5);
  return { fp, pad, scale, size, bottom };
}
export function drawBattle(ctx, game, w, h, dpr = 1) {
  const B = game.battle;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);
  const groups = B.groups.filter(g => g.units.some(u => u.hp > 0));
  if (!groups.length) return;
  const L = battleLayout(w, h, dpr);
  const { fp, pad, scale, size, bottom } = L;
  // 下：先頭から2グループまでの絵を横に並べる
  const shown = groups.slice(0, 2);
  shown.forEach((g, i) => {
    const cx = shown.length === 1 ? w / 2 : w * (i === 0 ? 0.26 : 0.74);
    const img = sprite(g.mon.id);
    const ok = img.complete && img.naturalWidth && !img._failed;
    if (ok) {
      // 描かれている部分の中心を、それぞれの位置の中央に（余白はそのまま）
      const box = img._bbox || { l: 0, r: SPRITE_PX };
      const left = Math.round(cx - ((box.l + box.r) / 2) * scale);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, left, bottom - size, size, size);
    } else {
      drawMonster(ctx, g.mon, cx, bottom - size / 2, size * 0.8);
    }
  });
  // 上：グループごとの名前と数（先頭グループを強調）。絵に重なっても読めるよう縁取りする
  ctx.font = `${fp}px sans-serif`;
  ctx.lineWidth = Math.max(2, fp * 0.22); ctx.strokeStyle = '#000'; ctx.lineJoin = 'round';
  const text = (t, x, y) => { ctx.strokeText(t, x, y); ctx.fillText(t, x, y); };
  // 「名前　総数 （動ける数）」を、表のように列をそろえて、全体を中央寄せで並べる
  const rows = groups.slice(0, 4).map(g => {
    const live = g.units.filter(u => u.hp > 0);
    const able = live.filter(u => !(u.asleep > 0) && !u.paralyzed).length;
    return { name: g.mon.name, n: String(live.length), able: `(${able})` };
  });
  const gap = fp * 1.2;
  // 列の幅は、いちばん長い魔物の名前（10文字）と2桁の数の分で固定（戦闘ごとに表の位置が動かないように）
  const nameW = Math.max(fp * 10, ...rows.map(r => ctx.measureText(r.name).width));
  const numW = ctx.measureText('99').width;
  const ableW = ctx.measureText('(99)').width;
  const x0 = Math.round((w - (nameW + gap + numW + fp * 0.4 + ableW)) / 2);
  rows.forEach((r, i) => {
    const y = pad + fp * (1 + i * 1.45);
    ctx.fillStyle = i === 0 ? '#ffd070' : '#d8e0e8';
    ctx.textAlign = 'left'; text(r.name, x0, y);
    ctx.textAlign = 'right'; text(r.n, x0 + nameW + gap + numW, y);
    ctx.textAlign = 'left'; text(r.able, x0 + nameW + gap + numW + fp * 0.4, y);
  });
}

// 宝箱（魔物と同じ 96×96・同じ倍率で、足元の高さも揃える）
const chestImgs = {};
function chestImg(open) {
  const k = open ? 'chest_open' : 'chest_closed';
  if (!chestImgs[k]) { const img = new Image(); img.src = new URL(`../assets/objects/${k}.png`, import.meta.url).href; chestImgs[k] = img; }
  return chestImgs[k];
}
export function preloadChest() { chestImg(false); chestImg(true); }
// 宝箱：戦闘画面のまま（黒い背景、魔物の絵と同じ倍率・同じ足元の高さで中央に）
export function drawChest(ctx, game, w, h, dpr = 1) {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);
  const img = chestImg(game.chestView.open);
  if (!img.complete || !img.naturalWidth) return;
  const { size, bottom } = battleLayout(w, h, dpr);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, Math.round(w / 2 - size / 2), bottom - size, size, size);
}
