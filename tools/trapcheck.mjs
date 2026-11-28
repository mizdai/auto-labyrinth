// 再発防止の確認用：罠の置き方で、たどり着けない区画ができていないかを確かめる
// ・罠のマスを通り抜けずに、上り階段から全部の区画（罠のマス自体も含む）に行けること
// ・テレポートの罠には決まった飛び先があり、その飛び先は罠のない普通の区画であること
// 使い方: node tools/trapcheck.mjs <開始seed> <seed数>
import { getFloor, W, H, DX, DY, MAX_FLOOR } from '../src/dungeon.js';

const s0 = +(process.argv[2] || 1), n = +(process.argv[3] || 200);
const TRAPS = ['pit', 'teleport', 'alarm'];
let floors = 0, bad = 0, teleports = 0;
for (let seed = s0; seed < s0 + n; seed++) {
  for (let f = 1; f <= MAX_FLOOR; f++) {
    const F = getFloor(seed, f);
    floors++;
    const all = F.openCells();
    const seen = new Uint8Array(W * H);
    const q = [[F.up.x, F.up.y]]; seen[F.up.y * W + F.up.x] = 1; let cnt = 1;
    while (q.length) {
      const [x, y] = q.pop();
      if (TRAPS.includes(F.cell(x, y).type)) continue;
      for (let d = 0; d < 4; d++) {
        if (!F.passable(x, y, d)) continue;
        const nx = x + DX[d], ny = y + DY[d];
        if (seen[ny * W + nx]) continue;
        seen[ny * W + nx] = 1; cnt++; q.push([nx, ny]);
      }
    }
    const problems = [];
    if (cnt !== all.length) problems.push(`罠を通らずに行けない区画 ${all.length - cnt}`);
    for (const p of all) {
      const c = F.cell(p.x, p.y);
      if (c.type !== 'teleport') continue;
      teleports++;
      if (!c.dest) problems.push(`飛び先のないテレポート (${p.x},${p.y})`);
      else if (F.cell(c.dest.x, c.dest.y).type) problems.push(`飛び先が普通の区画でない (${p.x},${p.y})→(${c.dest.x},${c.dest.y})`);
    }
    if (problems.length) { bad++; if (bad <= 10) console.log(`seed ${seed} 地下${f}階: ${problems.join('、')}`); }
  }
}
console.log(`${floors}階を確認、問題のある階 ${bad}、テレポートの罠 ${teleports}個`);
