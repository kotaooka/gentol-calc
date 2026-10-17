# 開発者向け情報（gentol-calc）

利用者向けの説明は [README.md](README.md) にあります。

## ファイル構成

```
index.html             画面（スタイルを含む）
js/tables.js           規格の表（JIS B 0405・B 0419・B 0403、DIN 16901、ISO 3302-1、JIS G 3141・G 4305・H 4000・H 4100）。Node でも読み込み可
js/app.js              画面処理（表の引き方、一覧と早見表、入力の保存、テーマ、Service Worker の登録）
sw.js                  オフライン用のキャッシュ処理（Service Worker）
manifest.webmanifest   アプリとして追加するための設定
icons/                 アプリアイコン（tools/make_icons.py で作る）
og.png                 SNS 共有用の画像（tools/make_og.py で作る）
docs/sources.md        表の出典と照合の状況
tests/test.js          表の検査テスト
.github/workflows/     push 時の自動テスト
```

## 更新して公開するとき

- `index.html`・`js/`・`icons/` を変更したら、**`sw.js` 先頭の `VERSION` を必ず上げてから** push してください。上げないと、すでに使っている人の端末に古いファイルが残り続けます
- 表の値を直したら、`docs/sources.md` の照合の状況と、`js/tables.js` の各表の `src`（画面の表の下に出る文）も直してください
- GitHub Pages は main ブランチのルートを公開しています

## テスト

```
node tests/test.js    # 不一致があれば終了コード 1
```

## 表の持ち方

- **範囲の判定は 2 通り**。`his`・`tH`・`wH` を持つ表は「〜を超え〜以下」（最初の範囲は下限を含む）で、`idx()` で引きます。`tL`・`wL` を持つ表は「〜以上〜未満」（最後の範囲は `tMax`・`wMax` 以下、`wMaxOpen` なら未満）で、`idxGE()` で引きます
- **値**：`null` は規格に値がない欄（画面では「—」）、`undefined` は資料で確かめられていない欄（画面では「不明」）
- **照合の印**：`q`（`"行-列"` の Set）は資料で食い違う欄、`allQ: true` は表全体の照合が足りないことを示し、一覧の値に △ を付けます。DIN 16901 は `fixed` に、スキャンの読み違いを直したセルを持ちます
- **DIN 16901**：B の値だけを持ち、A は B + 0.10 で求めます（読めた全セルでこの関係が成り立つことを確かめた）
- **JIS B 0403**：値は公差の全幅で、画面では半分を ± として上下限を出します
- **ISO 3302-1**：表の最後の範囲を超える寸法は、呼び寸法に `pct`（%）を掛けます
- **JIS H 4100** の中空部を囲む肉厚：肉厚 × % を、表の最小・最大で制限します

## 入力の保存

localStorage のキー `gentol-calc-state`（タブ、等級、材料などの条件）と `gentol-calc-state-<入力欄の id>`（寸法の欄）。読み書きはすべて try/catch で囲み、保存できない環境でも動きます。テーマは QC Workbench の全ツールで共通のキー `qc-workbench-theme`。
