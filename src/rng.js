// 乱数ユーティリティ（シード指定可能な mulberry32）
export class Rng {
  constructor(seed = Date.now()) { this.s = (seed >>> 0) || 1; }
  next() {
    this.s = (this.s + 0x6D2B79F5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(n) { return Math.floor(this.next() * n); }          // 0..n-1
  range(a, b) { return a + this.int(b - a + 1); }         // a..b
  d(s) { return 1 + this.int(s); }                        // 1..s
  dice(n, s, b = 0) { let t = b; for (let i = 0; i < n; i++) t += 1 + this.int(s); return t; }
  roll(dc) { return dc ? this.dice(dc[0], dc[1], dc[2] || 0) : 0; }
  chance(p) { return this.next() < p; }
  pick(a) { return a[this.int(a.length)]; }
  weighted(items, wf) {
    let total = 0; for (const it of items) total += wf(it);
    let r = this.next() * total;
    for (const it of items) { r -= wf(it); if (r < 0) return it; }
    return items[items.length - 1];
  }
  shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = this.int(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }
}

// ゲーム進行用のグローバル乱数
export const R = new Rng();

// "2d6+3" 形式の文字列を [2,6,3] に変換
export function parseDice(str) {
  const m = /^(\d+)d(\d+)([+-]\d+)?$/.exec(str.trim());
  if (!m) return [0, 0, parseInt(str, 10) || 0];
  return [parseInt(m[1], 10), parseInt(m[2], 10), m[3] ? parseInt(m[3], 10) : 0];
}
export const diceAvg = (dc) => dc[0] * (dc[1] + 1) / 2 + (dc[2] || 0);
export const diceStr = (dc) => `${dc[0]}d${dc[1]}${dc[2] ? (dc[2] > 0 ? '+' + dc[2] : dc[2]) : ''}`;
