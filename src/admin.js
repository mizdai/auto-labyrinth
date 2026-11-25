// 名前メンテ画面（admin.html）
import { ITEMS, SLOT_NAMES } from './items.js';
import { SPELLS, SCHOOL_NAMES } from './data.js';
import { DEFAULT_NAMES, NAMES_LOCAL_KEY, fetchRepoNames, localNames, mergeNames } from './names.js';

const TOKEN_KEY = 'autoLabyrinth.admin.githubToken';
const $ = (s) => document.querySelector(s);
const esc = (t) => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// 公開URL（<owner>.github.io/<repo>/）からリポジトリを判断。ローカルで開いたときは既定値
function repoInfo() {
  const host = location.hostname;
  if (host.endsWith('.github.io')) {
    const owner = host.split('.')[0];
    const repo = location.pathname.split('/').filter(Boolean)[0] || `${owner}.github.io`;
    return { owner, repo };
  }
  return { owner: 'mizdai', repo: 'auto-labyrinth' };
}
const REPO = repoInfo();
const PATH = 'data/names.json';

function status(msg, cls = '') { const el = $('#status'); el.textContent = msg; el.className = cls; }

// ---- 画面の組み立て ----
const ITEM_TYPE = (it) => SLOT_NAMES[it.type] || '道具';
function buildTables(current) {
  const items = Object.values(ITEMS).map(it => {
    const d = DEFAULT_NAMES.items[it.id], o = current.items[it.id] || {};
    return `<tr data-filter="${esc(d.name + ' ' + d.unknown + ' ' + (o.name || '') + ' ' + (o.unknown || ''))}">
      <td class="kind">${esc(ITEM_TYPE(it))}</td>
      <td><input type="text" data-kind="item" data-id="${it.id}" data-field="name" placeholder="${esc(d.name)}" value="${esc(o.name && o.name !== d.name ? o.name : '')}" maxlength="16"></td>
      <td style="width:32%"><input type="text" data-kind="item" data-id="${it.id}" data-field="unknown" placeholder="${esc(d.unknown)}" value="${esc(o.unknown && o.unknown !== d.unknown ? o.unknown : '')}" maxlength="8"></td>
    </tr>`;
  }).join('');
  $('#items').innerHTML = items;
  const spells = SPELLS.map(sp => {
    const d = DEFAULT_NAMES.spells[sp.id], o = current.spells[sp.id];
    return `<tr data-filter="${esc(d + ' ' + (o || '') + ' ' + sp.desc)}">
      <td class="kind">${esc(SCHOOL_NAMES[sp.school])}Lv${sp.lv}</td>
      <td><input type="text" data-kind="spell" data-id="${sp.id}" placeholder="${esc(d)}" value="${esc(o && o !== d ? o : '')}" maxlength="10"></td>
      <td class="def">${esc(sp.desc)}</td>
    </tr>`;
  }).join('');
  $('#spells').innerHTML = spells;
  for (const el of document.querySelectorAll('input[data-kind]')) {
    const mark = () => el.classList.toggle('changed', el.value.trim() !== '');
    el.addEventListener('input', mark); mark();
  }
}

// 入力欄から上書きデータを作る（初期値と同じもの・空欄は含めない）
function collect() {
  const out = { items: {}, spells: {} };
  for (const el of document.querySelectorAll('input[data-kind]')) {
    const v = el.value.trim();
    if (!v) continue;
    if (el.dataset.kind === 'item') {
      const d = DEFAULT_NAMES.items[el.dataset.id][el.dataset.field];
      if (v === d) continue;
      (out.items[el.dataset.id] ||= {})[el.dataset.field] = v;
    } else {
      if (v === DEFAULT_NAMES.spells[el.dataset.id]) continue;
      out.spells[el.dataset.id] = v;
    }
  }
  return out;
}
// 同じ名前が重なっていないかを確かめる（区別がつかなくなるため）
function duplicates(over) {
  const names = new Map(), dup = new Set();
  const add = (n) => { if (names.has(n)) dup.add(n); names.set(n, true); };
  for (const [id, d] of Object.entries(DEFAULT_NAMES.items)) add(over.items[id]?.name || d.name);
  for (const [id, d] of Object.entries(DEFAULT_NAMES.spells)) add(over.spells[id] || d);
  return [...dup];
}

// ---- 操作 ----
$('#filter').addEventListener('input', (e) => {
  const q = e.target.value.trim();
  for (const tr of document.querySelectorAll('tr[data-filter]')) {
    const text = tr.dataset.filter + ' ' + [...tr.querySelectorAll('input')].map(i => i.value).join(' ');
    tr.style.display = !q || text.includes(q) ? '' : 'none';
  }
});

$('#tryLocal').addEventListener('click', () => {
  const over = collect();
  const dup = duplicates(over);
  localStorage.setItem(NAMES_LOCAL_KEY, JSON.stringify(over));
  status(`このブラウザに保存しました。ゲームを開き直すと反映されます。${dup.length ? `（同じ名前が重なっています：${dup.join('、')}）` : ''}`, dup.length ? 'err' : 'ok');
});

$('#clearLocal').addEventListener('click', async () => {
  if (!confirm('このブラウザで試している名前を消して、GitHubに保存されている名前に戻しますか？')) return;
  localStorage.removeItem(NAMES_LOCAL_KEY);
  const repo = await fetchRepoNames();
  buildTables(mergeNames(repo, null));
  status('このブラウザで試していた名前を消しました。', 'ok');
});

$('#copyJson').addEventListener('click', async () => {
  const text = JSON.stringify(collect(), null, 2) + '\n';
  try { await navigator.clipboard.writeText(text); status('JSONをコピーしました。', 'ok'); }
  catch (e) { status('コピーできませんでした。', 'err'); }
});

// UTF-8 の文字列を base64 に
function b64(str) { const bytes = new TextEncoder().encode(str); let bin = ''; for (const b of bytes) bin += String.fromCharCode(b); return btoa(bin); }

$('#saveGitHub').addEventListener('click', async () => {
  const token = $('#token').value.trim();
  if (!token) { status('アクセストークンを入力してください。', 'err'); return; }
  if ($('#remember').checked) localStorage.setItem(TOKEN_KEY, token); else localStorage.removeItem(TOKEN_KEY);
  const over = collect();
  const dup = duplicates(over);
  if (dup.length && !confirm(`同じ名前が重なっています（${dup.join('、')}）。このまま保存しますか？`)) return;
  if (!confirm('この内容で GitHub に保存しますか？（全員のゲームに反映されます）')) return;
  const api = `https://api.github.com/repos/${REPO.owner}/${REPO.repo}/contents/${PATH}`;
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' };
  status('保存しています…');
  try {
    let sha;
    const cur = await fetch(api, { headers });
    if (cur.ok) sha = (await cur.json()).sha;
    else if (cur.status !== 404) throw new Error(`読み込みに失敗しました（${cur.status}）`);
    const body = { message: 'Update item and spell names from the maintenance page', content: b64(JSON.stringify(over, null, 2) + '\n'), ...(sha ? { sha } : {}) };
    const res = await fetch(api, { method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`保存に失敗しました（${res.status}）：${(await res.json().catch(() => ({}))).message || ''}`);
    // GitHub に保存したら、このブラウザで試していた分は消す（古い内容が優先されないように）
    localStorage.removeItem(NAMES_LOCAL_KEY);
    status('GitHub に保存しました。1〜2分ほどでゲームに反映されます。', 'ok');
  } catch (e) {
    status(String(e.message || e), 'err');
  }
});

// ---- 起動 ----
(async () => {
  $('#repoInfo').textContent = `保存先：${REPO.owner}/${REPO.repo} の ${PATH}`;
  const saved = localStorage.getItem(TOKEN_KEY);
  if (saved) { $('#token').value = saved; $('#remember').checked = true; }
  const repo = await fetchRepoNames();
  buildTables(mergeNames(repo, localNames()));
  const local = localNames();
  if (local && (Object.keys(local.items || {}).length || Object.keys(local.spells || {}).length)) status('このブラウザで試している名前が反映された状態で表示しています。');
})();
