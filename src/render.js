// 描画：ワイヤーフレームの疑似3D視点、ミニマップ、魔物の簡易スプライト
import { W, H, DX, DY, WALL, DOOR } from './dungeon.js';

const LINE = '#d8e0e8';
const DOORC = '#e8c060';
const DIM = '#5a6470';

// 奥行きごとの面の位置（画面サイズに対する割合）
const DEPTH = [0, 0.14, 0.3, 0.39, 0.445, 0.475];

export function drawView(ctx, game, size) {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, size, size);
  ctx.lineWidth = Math.max(1, size / 220);
  ctx.lineCap = 'round';
  ctx.strokeStyle = LINE;
  if (game.location === 'town') { drawTown(ctx, size); return; }
  const F = game.F;
  const here = F.cell(game.x, game.y);
  if (here.dark) {
    ctx.fillStyle = DIM; ctx.font = `${size / 14}px sans-serif`; ctx.textAlign = 'center';
    ctx.fillText('暗闇', size / 2, size / 2);
    return;
  }
  const dir = game.dir;
  const right = (dir + 1) % 4, left = (dir + 3) % 4;
  const box = (i) => { const m = DEPTH[i] * size; return { l: m, t: m * 0.9, r: size - m, b: size - m * 0.9 }; };
  let x = game.x, y = game.y;
  for (let d = 0; d < DEPTH.length - 1; d++) {
    if (!F.inside(x, y)) break;
    const cell = F.cell(x, y);
    if (d > 0 && cell.dark) { fillFrame(ctx, box(d)); break; }
    const n = box(d), f = box(d + 1);
    // 左右の壁
    for (const [side, sx] of [[left, 'l'], [right, 'r']]) {
      const w = F.wall(x, y, side);
      const nx = n[sx], fx = f[sx];
      if (w === WALL || w === DOOR) {
        line(ctx, nx, n.t, fx, f.t); line(ctx, nx, n.b, fx, f.b);
        line(ctx, fx, f.t, fx, f.b);
        if (d > 0) line(ctx, nx, n.t, nx, n.b);
        if (w === DOOR) {
          // 側面の扉
          ctx.strokeStyle = DOORC;
          const a = 0.25, b = 0.75;
          const px1 = nx + (fx - nx) * a, px2 = nx + (fx - nx) * b;
          const ty1 = n.t + (f.t - n.t) * a, ty2 = n.t + (f.t - n.t) * b;
          const by1 = n.b + (f.b - n.b) * a, by2 = n.b + (f.b - n.b) * b;
          const hy1 = ty1 + (by1 - ty1) * 0.2, hy2 = ty2 + (by2 - ty2) * 0.2;
          ctx.beginPath(); ctx.moveTo(px1, by1); ctx.lineTo(px1, hy1); ctx.lineTo(px2, hy2); ctx.lineTo(px2, by2); ctx.stroke();
          ctx.strokeStyle = LINE;
        }
      } else {
        // 横道：隣の区画の奥の壁を描く
        const sxn = x + DX[side], syn = y + DY[side];
        const fw = F.inside(sxn, syn) ? F.wall(sxn, syn, dir) : WALL;
        if (fw !== 0) { line(ctx, nx, f.t, fx, f.t); line(ctx, nx, f.b, fx, f.b); }
        line(ctx, fx, f.t, fx, f.b);
        if (d > 0) line(ctx, nx, n.t, nx, n.b);
      }
    }
    // 床の印（階段など）
    if (d > 0 || true) drawFloorMark(ctx, cell, n, f, size, d);
    // 正面の壁
    const fw = F.wall(x, y, dir);
    if (fw === WALL || fw === DOOR) {
      rect(ctx, f.l, f.t, f.r, f.b);
      if (fw === DOOR) {
        ctx.strokeStyle = DOORC;
        const w = f.r - f.l, h = f.b - f.t;
        ctx.beginPath();
        ctx.moveTo(f.l + w * 0.28, f.b); ctx.lineTo(f.l + w * 0.28, f.t + h * 0.18);
        ctx.lineTo(f.r - w * 0.28, f.t + h * 0.18); ctx.lineTo(f.r - w * 0.28, f.b);
        ctx.stroke();
        ctx.strokeStyle = LINE;
      }
      break;
    }
    x += DX[dir]; y += DY[dir];
  }
}

function drawFloorMark(ctx, cell, n, f, size, d) {
  if (!cell.type || !['up', 'down', 'boss'].includes(cell.type)) return;
  const cx = (n.l + n.r + f.l + f.r) / 4;
  const fy = (n.b + f.b) / 2;
  ctx.fillStyle = cell.type === 'boss' ? '#e05050' : '#80c0ff';
  ctx.font = `${Math.max(10, size / (12 + d * 6))}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(cell.type === 'up' ? '▲上り階段' : cell.type === 'down' ? '▼下り階段' : '◆', cx, fy);
}

function fillFrame(ctx, b) { ctx.fillStyle = '#0a0a0a'; ctx.fillRect(b.l, b.t, b.r - b.l, b.b - b.t); }
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
