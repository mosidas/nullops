# scatter3d-controls — 調査ログ

## 1. 参考サイト(request.md §2.2)

`https://miabellaai.net/index.html` を 2026-09-06 に WebFetch で読んだ。ページ本文からの要約であり、描画コードそのものは読んでいない。

- 実装: JavaScript + WebGL の自前実装。three.js・plotly は使っていない。
- 操作: クリック&ドラッグで回転。クリックで自動回転の ON/OFF。スクロールでズーム。SPACE+スクロールで点の大きさ、SHIFT+スクロールで反射率を変える。
- 点: 大きさ・色・透明度・明滅・ジッター・縞・展開/収縮のパラメータを持つ。形(球・円・グロー)は本文に明記が無い。
- 奥行き: 透明度(0.0〜1.0)で表す。
- 軸線・格子: 本文に明記が無い。「Hide back pane」のオプションがあり、背面の面を表示・非表示できる。

本 unit への取り込み: 承認済みの決定(request.md §5 決定 4)に従い、ドラッグ回転と透明度による奥行き表現だけを取り入れる。クリックでの自動回転切り替え・ズーム・点の大きさの変更は取り入れない(spec.md §2 対象外)。

## 2. 既存コードの事実(2026-09-06 に実物で確認)

- `frontend/src/components/Scatter3DPanel.tsx`: ヨーはローカル変数で `YAW_RATE_RAD_PER_SEC = 0.24`、経過時間の上限 `MAX_FRAME_MS = 100`。ピッチは `SCATTER_PITCH = -0.42`(`lib/project.ts`)で固定。点は `ctx.arc` の一様な円で、半径は `scale × weight`、不透明度は奥行きと `W` から決める。色は `--color-accent-scatter`・`--color-surface-1` をマウント時に 1 度解決する。ポインタのリスナーは無い。
- `frontend/src/lib/project.ts`: `projectPoint` は純関数。ヨー(Y 軸)→ ピッチ(X 軸)の順に回し、`FOCAL = 3.2` の透視投影で落とす。前面(z=1)の点はヨーが増えると右へ、ピッチが増えると下へ動く(spec.md Requirement 2.1・2.2 の向きの根拠)。
- `frontend/src/app/globals.css`: `--color-text-dim: #8b97b0`・`--color-border: #2a3242` があり、軸線に流用できる。
- `frontend/package.json`: `scripts` は `dev`・`build`・`start`・`lint`・`format` のみ。テストランナーは無く、`frontend/src` に `*.test.*` は無い。`@types/node` は `^26`。
- unit #1 の計測: 5 パネルすべて p95 = 18.0 ms・mean 16.7 ms(13 回の出力で同値)。3D 散布図の描画面積は 469×438 から 589×661 へ約 1.9 倍に広がった。
