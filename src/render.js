// 描画：ワイヤーフレームの疑似3D視点、ミニマップ、魔物の簡易スプライト
import { W, H, DX, DY, WALL, DOOR } from './dungeon.js';

const LINE = '#d8e0e8';
const DOORC = '#e8c060';
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

export function drawView(ctx, game, size, cam = poseOf(game)) {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, size, size);
  ctx.lineWidth = Math.max(1, size / 220);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = LINE;
  if (game.location === 'town') { drawTown(ctx, size); return; }
  const F = game.F;
  const fx = Math.sin(cam.a), fy = -Math.cos(cam.a);   // 前方
  const rx = Math.cos(cam.a), ry = Math.sin(cam.a);    // 右
  const ex = cam.x - fx * CAM_BACK, ey = cam.y - fy * CAM_BACK;
  const ccx = Math.floor(cam.x), ccy = Math.floor(cam.y);
  if (F.inside(ccx, ccy) && F.cell(ccx, ccy).dark) {
    ctx.fillStyle = DIM; ctx.font = `${size / 14}px sans-serif`; ctx.textAlign = 'center';
    ctx.fillText('暗闇', size / 2, size / 2);
    return;
  }
  const f = FOCAL * size, half = size / 2;
  // ワールド座標(wx,wy,h) → カメラ座標(xc,zc,yc)
  const toCam = (wx, wy, h) => {
    const dx = wx - ex, dy = wy - ey;
    return [dx * rx + dy * ry, dx * fx + dy * fy, h - 0.5];
  };
  const proj = (p) => [half + p[0] / p[1] * f, half - p[2] / p[1] * f];

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
        if (w !== 0) kind = (dark && otherDark) ? null : (w === DOOR ? 'door' : 'wall');
        else if (dark !== isDark(nx, ny) && F.inside(nx, ny)) kind = 'fog';   // 暗闇との境目
        if (!kind) continue;
        items.push({ kind, x1, y1, x2, y2, dist: dist2((x1 + x2) / 2, (y1 + y2) / 2, ex, ey) });
      }
      const c = F.cell(x, y);
      if (!dark && (c.type === 'up' || c.type === 'down' || c.type === 'boss')) {
        items.push({ kind: 'mark', x, y, type: c.type, dist: dist2(x + 0.5, y + 0.5, ex, ey) });
      }
    }
  }
  // 遠いものから描く（手前の壁が奥を塗りつぶす）
  items.sort((a, b) => b.dist - a.dist);
  for (const it of items) {
    if (it.kind === 'mark') { drawMark(ctx, it, toCam, proj, size); continue; }
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
    if (it.kind === 'door') {
      // 扉の枠（壁面上の u=0.25〜0.75、高さ0〜0.8）
      const P = (u, h) => toCam(it.x1 + (it.x2 - it.x1) * u, it.y1 + (it.y2 - it.y1) * u, h);
      ctx.strokeStyle = DOORC;
      strokeSeg(ctx, P(0.25, 0), P(0.25, 0.8), proj);
      strokeSeg(ctx, P(0.25, 0.8), P(0.75, 0.8), proj);
      strokeSeg(ctx, P(0.75, 0.8), P(0.75, 0), proj);
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

function drawMark(ctx, it, toCam, proj, size) {
  const col = it.type === 'boss' ? '#e05050' : '#80c0ff';
  const quad = [[0.2, 0.2], [0.8, 0.2], [0.8, 0.8], [0.2, 0.8]].map(([u, v]) => toCam(it.x + u, it.y + v, 0));
  const poly = clipNear(quad);
  if (poly.length < 3) return;
  const pts = poly.map(proj);
  ctx.strokeStyle = col;
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
  ctx.closePath(); ctx.stroke();
  ctx.strokeStyle = LINE;
  const c = toCam(it.x + 0.5, it.y + 0.5, 0);
  if (c[1] < 0.3 || c[1] > 3.5) return;
  const [sx, sy] = proj(c);
  ctx.fillStyle = col;
  ctx.font = `${Math.max(10, Math.min(size / 12, size / (8 * c[1])))}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(it.type === 'up' ? '▲上り階段' : it.type === 'down' ? '▼下り階段' : '◆', sx, Math.min(size - 6, sy));
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
  ctx.lineWidth = 1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!known[y * W + x]) continue;
    const c = F.cell(x, y);
    ctx.fillStyle = c.dark ? '#1c2230' : '#26303c';
    ctx.fillRect(x * cs, y * cs, cs, cs);
    if (c.type) {
      const col = { up: '#80c0ff', down: '#80c0ff', lair: '#c08040', pit: '#c04040', teleport: '#a060e0', alarm: '#e0a020', boss: '#ff4040' }[c.type];
      if (col) { ctx.fillStyle = col; ctx.fillRect(x * cs + cs * 0.3, y * cs + cs * 0.3, cs * 0.4, cs * 0.4); }
    }
    for (let d = 0; d < 4; d++) {
      const w = F.wall(x, y, d);
      if (w === 0) continue;
      ctx.strokeStyle = w === DOOR ? DOORC : '#c8d0d8';
      ctx.beginPath();
      const x0 = x * cs, y0 = y * cs;
      if (d === 0) { ctx.moveTo(x0, y0); ctx.lineTo(x0 + cs, y0); }
      if (d === 1) { ctx.moveTo(x0 + cs, y0); ctx.lineTo(x0 + cs, y0 + cs); }
      if (d === 2) { ctx.moveTo(x0, y0 + cs); ctx.lineTo(x0 + cs, y0 + cs); }
      if (d === 3) { ctx.moveTo(x0, y0); ctx.lineTo(x0, y0 + cs); }
      ctx.stroke();
    }
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

export function drawBattle(ctx, game, size) {
  const B = game.battle;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, 0, size, size);
  const groups = B.groups.filter(g => g.units.some(u => u.hp > 0));
  const n = groups.length;
  groups.forEach((g, i) => {
    const alive = g.units.filter(u => u.hp > 0).length;
    const cx = size * (i + 0.5) / n;
    const sc = Math.min(size * 0.5, size * 0.9 / n);
    drawMonster(ctx, g.mon, cx, size * 0.42, sc * (g.mon.flags.boss ? 1.25 : 1));
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
    ctx.font = `${Math.max(11, size / 26)}px sans-serif`;
    ctx.fillText(g.mon.name, cx, size * 0.78);
    ctx.fillText(`×${alive}`, cx, size * 0.85);
  });
}
