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

## 名前メンテ画面

`admin.html`（公開URLでは `https://mizdai.github.io/auto-labyrinth/admin.html`）で、アイテム名・未鑑定時の種類名・呪文名を変えられます。

- 「このブラウザで試す」：その端末のブラウザにだけ保存（`localStorage`）
- 「GitHubに保存」：`data/names.json` をリポジトリに書き込み、全員のゲームに反映（GitHub の Fine-grained トークンで、このリポジトリの Contents: Read and write 権限が必要）
- ゲームは起動時に `data/names.json` とブラウザ内の上書きを読み込む（`src/names.js`）

## 構成

ビルド不要の素の ES Modules です。

- `src/data.js` 種族・職業・呪文・宿屋・寺院
- `src/items.js` アイテム
- `src/monsters.js` モンスター
- `src/character.js` キャラクター生成・能力計算・経験値
  - レベルアップ時のHP：全レベル分を今の職業のサイコロと生命力で振り直し、今の最大HPより高ければその値、届かなければ+1
  - 転職：レベル1・経験値0に戻り、能力値は種族の基本値に戻る。最大HPと覚えた呪文は残り、前の職業で覚えた呪文は、各レベルで覚えている数だけ回数が残る。AIは城下町の訓練場で、1回の帰還につき1人まで転職させる。今の職業で育ち切った仲間（呪文職はその系統の呪文を全部、ほかはLv10以上）を、まだ覚えていない系統の呪文を覚えられる職業・呪文を持ったまま就ける前衛職・忍者（盗賊から）・司教（鑑定役がいないとき）へ。前衛から後衛へは移らない
- `src/dungeon.js` 迷宮生成（20×20×10階。床を区画割りして壁を立てる方式、階ごとのテーマ、下り階段の部屋から開く近道）・経路探索
  - 地下1〜9階には、上り階段と下り階段の中間あたりの通路に転移装置（壁と扉で囲まれた1×1の部屋）がある。部屋に入ると作動し、作動済みの階どうしを転移できる。地上からは使えず、上へは地下1階まで
  - テーマ：①直線の通路と部屋（1階は必ず）②入り組んだ通路 ③広い通路 ④部屋の連なり ⑤一本の通路 ⑥順路の迷宮（地下10階）。同じテーマは連続しない
- `src/combat.js` 戦闘
- `src/ai.js` AI（戦闘の行動選択、撤退・進行判断、野営での回復）
- `src/game.js` ゲーム進行（城下町・迷宮・宝箱・全滅・セーブ）
- `src/render.js` ワイヤーフレーム描画・ミニマップ・魔物のドット絵
- `src/main.js` 画面とメインループ

## モンスター画像

- 元画像: `assets/src/monsters-sheet.png`（9列×5行、マゼンタ背景。並びは `src/monsters.js` の定義順）
- 切り出し済み: `assets/monsters/<id>.png`（96×96の等倍ドット、余白込み、背景透過）
- 戦闘では先頭グループの絵だけを、敵の数に関係なく一定の整数倍率で表示する（他のグループは名前と数の一覧）。確認用ページ: `tools/battle-preview.html`
- 作り直し: `python3 tools/slice_monsters.py assets/src/monsters-sheet.png assets/monsters "<id を定義順に空白区切り>" --native --fly=bat,vampbat,wisp`（飛んでいる魔物はマスの上の方へ移動）
- 制作指示書: `docs/monster-art.md`

## バランス検証

```bash
node tools/sim.mjs <seed> <最大手数>   # ヘッドレスでAIに攻略させる
node tools/diag.mjs <seed> <最大手数> [パーティ構成]  # 階ごとの全滅数・撤退理由など
node tools/lairloop.mjs <seed> <最大手数>  # 玄室からの逃走の繰り返しと帰還中の全滅
node tools/loopcheck.mjs <開始seed> <seed数> <最大手数>  # 狭い範囲を往復し続ける状態の検出
node tools/lairtrap.mjs  # 玄室の部屋の中から始めたときに往復しないことの確認
node tools/teleportcheck.mjs  # 帰還中に知らない場所へ飛ばされても帰れることの確認
node tools/clearlevel.mjs <開始seed> <seed数> <最大手数>  # クリア時のパーティの平均レベル
node tools/turnrate.mjs <開始seed> <seed数> <最大手数>  # テーマごとの100歩あたりの方向転換回数
node tools/underlevel.mjs <開始seed> <seed数> <最大手数>  # 最低レベルに届かない仲間を連れて歩いた割合
node tools/spelluse.mjs <開始seed> <seed数> <最大手数>  # 仲間が唱えた呪文ごとの回数
node tools/aoedeaths.mjs <開始seed> <seed数> <最大手数>  # ブレス・魔物の呪文で倒れた仲間の数（戦闘100回あたり）
node tools/classchange.mjs <開始seed> <seed数> <最大手数> [パーティ構成]  # 転職の時期と、最後のパーティの職業
```
