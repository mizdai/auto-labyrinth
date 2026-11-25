// アイテム名・呪文名の上書き（メンテ画面 admin.html で編集する）
//  - data/names.json：リポジトリに保存された名前（全員に反映）
//  - localStorage：このブラウザでだけ試している名前（data/names.json より優先）
// 形式：{ "items": { "<id>": { "name": "...", "unknown": "..." } }, "spells": { "<id>": "..." } }
//   items.unknown は未鑑定のときの種類名（表示は先頭に「?」が付く）
import { ITEMS } from './items.js';
import { SPELLS, SPELL_BY_ID } from './data.js';

export const NAMES_LOCAL_KEY = 'autoLabyrinth.names.local.v1';

// 上書き前の名前（メンテ画面の「初期値」表示用）
export const DEFAULT_NAMES = {
  items: Object.fromEntries(Object.values(ITEMS).map(it => [it.id, { name: it.name, unknown: it.unknown.replace(/^\?/, '') }])),
  spells: Object.fromEntries(SPELLS.map(sp => [sp.id, sp.name])),
};

const clean = (v, max = 16) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export function applyNames(over) {
  // いったん初期値に戻してから上書きする（何度呼んでも同じ結果になるように）
  for (const [id, d] of Object.entries(DEFAULT_NAMES.items)) { ITEMS[id].name = d.name; ITEMS[id].unknown = '?' + d.unknown; }
  for (const [id, n] of Object.entries(DEFAULT_NAMES.spells)) SPELL_BY_ID[id].name = n;
  if (!over) return;
  for (const [id, v] of Object.entries(over.items || {})) {
    if (!ITEMS[id] || !v) continue;
    const name = clean(v.name), unknown = clean(v.unknown, 8);
    if (name) ITEMS[id].name = name;
    if (unknown) ITEMS[id].unknown = '?' + unknown;
  }
  for (const [id, v] of Object.entries(over.spells || {})) {
    const name = clean(v, 10);
    if (SPELL_BY_ID[id] && name) SPELL_BY_ID[id].name = name;
  }
}

// 2つの上書きを重ねる（b が優先）
export function mergeNames(a, b) {
  const out = { items: { ...(a?.items || {}) }, spells: { ...(a?.spells || {}) } };
  for (const [id, v] of Object.entries(b?.items || {})) out.items[id] = { ...(out.items[id] || {}), ...v };
  Object.assign(out.spells, b?.spells || {});
  return out;
}

export async function fetchRepoNames() {
  try {
    const res = await fetch(new URL('../data/names.json', import.meta.url).href + '?t=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) { return null; }
}
export function localNames() {
  try { return JSON.parse(localStorage.getItem(NAMES_LOCAL_KEY) || 'null'); } catch (e) { return null; }
}

// ゲーム起動時に呼ぶ
export async function loadNameOverrides() {
  const repo = await fetchRepoNames();
  applyNames(mergeNames(repo, localNames()));
}
