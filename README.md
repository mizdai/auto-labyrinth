# Auto Labyrinth

スマートフォンのブラウザで遊ぶ、**全自動で進行する**ワイヤーフレーム3Dダンジョン探索RPGです。
6人パーティの編成・探索・戦闘・宝箱・街での買い物や蘇生まで、すべてAIが判断して進めます。プレイヤーは方針を決めて見守ります。

- プレイ: GitHub Pages（`https://mizdai.github.io/auto-labyrinth/`）
- 進行状況はブラウザ（localStorage）に自動保存されます

## 方針

1980年代のクラシックな3Dダンジョン探索RPG（6人パーティ、種族・職業・戒律、区画単位の迷宮、AC、呪文回数制、レベルドレイン、寺院での蘇生と灰化など）の**ゲームシステムを参考にした**作品です。
モンスター・アイテム・呪文・迷宮マップ・名称・数値データは、すべてこのプロジェクト独自のものです（迷宮は固定シードの自動生成）。特定の既存作品のデータや表現は使用していません。

## 操作

| ボタン | 内容 |
|---|---|
| ⏸ / ▶ | 一時停止・再開 |
| ×1〜×16 / 最速 | 進行速度 |
| 地図 | ミニマップ（小 → 大 → 非表示） |
| 記録 | 到達階・戦闘数・持ち物・控えの冒険者など |
| 設定 | 探索方針・呪文の使い方・宝箱・パーティ構成、やり直し |
| パーティの行をタップ | キャラクターの詳細 |

## 構成

ビルド不要の素の ES Modules です。

- `src/data.js` 種族・職業・呪文・宿屋・寺院
- `src/items.js` アイテム
- `src/monsters.js` モンスター
- `src/character.js` キャラクター生成・能力計算・経験値
- `src/dungeon.js` 迷宮生成（20×20×10階）・経路探索
- `src/combat.js` 戦闘
- `src/ai.js` AI（戦闘の行動選択、撤退・進行判断、野営での回復）
- `src/game.js` ゲーム進行（城下町・迷宮・宝箱・全滅・セーブ）
- `src/render.js` ワイヤーフレーム描画・ミニマップ・魔物のドット絵
- `src/main.js` 画面とメインループ

## モンスター画像

- 元画像: `assets/src/monsters-sheet.png`（9列×5行、マゼンタ背景。並びは `src/monsters.js` の定義順）
- 切り出し済み: `assets/monsters/<id>.png`（88×88から余白を切り詰め、32色、背景透過）
- 表示の大きさは `src/monsters.js` の `MONSTER_SIZE`（S/M/L/XL）で決まる。確認用ページ: `tools/battle-preview.html`
- 作り直し: `python3 tools/slice_monsters.py assets/src/monsters-sheet.png assets/monsters "<id を定義順に空白区切り>"`
- 制作指示書: `docs/monster-art.md`

## バランス検証

```bash
node tools/sim.mjs <seed> <最大手数>   # ヘッドレスでAIに攻略させる
node tools/diag.mjs <seed> <最大手数>  # 階ごとの全滅数・撤退理由など
```
