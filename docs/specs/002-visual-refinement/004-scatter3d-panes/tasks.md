# scatter3d-panes — 実装タスク

> 仕様の詳細は同じディレクトリの仕様文書 spec.md を参照する。
> このファイルには仕様を転記しない。

## Global Constraints

spec.md が全タスクに掛ける制約(逐語)。

- 「1.6. システムは、`wallWeights` と `PANES` の参照において新しいオブジェクト・配列を作ってはならず、`wallWeights` の中で `Math.sin`・`Math.cos` を合わせて 2 回だけ評価しなければならない。(常時)」
- 「3.14. `labelFrame` は、同じ引数につねに同じ値を書き、新しいオブジェクトを作ってはならない。(常時)」
- 「4.4. システムは、`projectPointsOnto` の中で `Math.cos`・`Math.sin` を合わせて 4 回だけ評価しなければならない。(常時)」
- 「5.2. システムは、同じ `seed` に対してつねに同じ配列を返さなければならない(`Math.random` を使わない)。(常時)」
- 「6.2. システムは、`Vec3` を §5.2 のモジュールから export し、`project.ts`・`orbit.ts` の振る舞いを変えてはならない(`orbit.test.ts`・`project.test.ts` の既存のテストが通る)。(常時)」
- 「8.1. システムは、#3 spec Requirement 1〜7(点群の生成・`ScatterPoint`・構造の幾何・購読・投影の器渡し・カラーマップ・点の描画)の振る舞いを変えてはならず、Go 側のファイルと `scatterpoint.go`・`scattersource.go`・`feed.ts`・`framestats.ts` を変更してはならない。(常時)」
- 「8.2. システムは、#2 spec Requirement 1〜3・6〜8(ドラッグ・操作量・復帰・ポインタの離脱・カーソル・既存の維持)の振る舞いを変えてはならず、`orbit.ts` を変更してはならない(`SCATTER_PITCH` は `project.ts` で変わる)。(常時)」
- 「8.3. システムは、凍結 spec Requirement 7(回転の継続)・8(描画領域への追随)・9(デザイントークンへの準拠)の振る舞いを変えてはならない。(常時)」
- 「8.5. システムは、§6.6 の 4 個のトークンを `globals.css` の `@theme` に持ち、地・パネル・格子・縁・文字の色をそれらから解決しなければならず、`.ts`・`.tsx` に色の直値を書いてはならない(退避色 `'white'`・`'transparent'`・`'gray'` を除く。`rgba(` の文字列テンプレートはパレットのモジュールの中に限る)。(常時)」
- 「9.2. システムは、`go vet ./...`・`go test ./...`・`cd frontend && npm run lint`・`cd frontend && npm test`・`wails build` がいずれもエラーなく終了する状態を保たなければならない。(常時)」
- 「9.3. システムは、毎フレームの描画の中で新しいオブジェクト・配列・関数・文字列を作ってはならない(点群の長さが変わったときの器の作り直し、寸法・`devicePixelRatio` の変化時の画像の作り直しを除く)。(常時)」
- 「9.4. システムは、地・パネル・格子・縁・影・ラベルの描画に `arc` と比較ソートを使ってはならない。(常時)」
- 「9.5. システムは、縦 4 面 + 床の 5 面を数えた上限として、1 フレームの `fillStyle` の設定回数を 576(点)+ 120(影 24 × 5 面)+ 5(塗り 5 面)= 701 回以下、`strokeStyle` の設定回数を 10 回以下(格子・縁 × 5 面)、`fillRect` の呼び出し回数を 点数 + 5 × ceil(点数 / 2) 回以下、`stroke` を 10 回以下、`fill` を 5 回以下、`drawImage` を 1(地)+ 20(ラベル 5 個 × 縦 4 面)= 21 回以下、`globalAlpha` の代入を 10 回以下(縦面ごとに入口と出口。ラベルの面ループを含めれば 16 回以下)に保たなければならない(#3 spec Requirement 9.6 の置き換え。重みが正の縦面は高々 2 面なので、実際の回数は縦 2 面 + 床ぶんに収まる)。(常時)」
- 「9.6. システムは、完了時の計測の p95・mean・max(5 パネルぶん)を unit の `tasks.md` Implementation Notes に記録していなければならない(着手時の基準は §3 前提 11 のとおり unit #3 の完了時の値を流用し、再計測しない)。(常時)」
- 「凍結済み・完了済みの文書は編集しない。」(§3 前提 1)。承認後の本 unit の spec.md も編集しない
- 検証の前提: `cd frontend && npm ci` と `wails build` を 1 度通してから検証コマンドを回す(`main.go` が `go:embed all:frontend/dist` を持つため、`frontend/dist` が無い作業ツリーでは `go vet ./...`・`go test ./...` が失敗し、`frontend/wailsjs` が無ければ `npm run lint`・`npx tsc --noEmit` も前提不足で失敗する)。検証の順はつねに `npm ci` → `wails build` → `go vet` → `go test` → `npm test` → `npm run lint` とする
- 色の直値の静的検査(unit #3 と同じ形。8.5): `grep -rnE "#[0-9a-fA-F]{3,8}\b" frontend/src --include='*.ts' --include='*.tsx'` が 0 件(退避色の色名 `'white'`・`'transparent'`・`'gray'` は許す)/ `grep -rn "rgba(" frontend/src --include='*.ts' --include='*.tsx' | grep -v "\.test\.ts"` の出現が `frontend/src/lib/palette.ts` の文字列テンプレート 1 箇所に限る(`buildShadowRamp` は `buildRamp` と同じテンプレートを使い、新しい `rgba(` を作らない)
- 基底の変換の静的検査(3.9): `grep -c "setTransform(" frontend/src/components/Scatter3DPanel.tsx` が 1(基底の `dpr` 拡大の 1 箇所)/ `grep -n "transform(" frontend/src/components/Scatter3DPanel.tsx | grep -v setTransform` の各出現の直前に `save(`、直後に `restore(` があること
- ラベルの不透明度の静的検査(3.15): `grep -n "globalAlpha = " frontend/src/components/Scatter3DPanel.tsx` の出現のうち、ラベルのループの右辺が `w * w * w`(重みの 3 乗)、面のループの右辺が重みそのもの、それ以外は `1`
- 人間の回答(spec.md 承認時。受け入れ基準を変えない運用上の判断): Requirement 9.1・9.6(p95)と Requirement 10(目視)は中継役がホストで実行する。実装者はこれらを実行せず、Implementation Notes に手順を書き、該当する受け入れ基準を「未検証(中継役が実行)」と明示する

CLAUDE.md が全タスクに掛ける制約(逐語)。

- 「会話・ドキュメント・コード内コメント・PR/Issue 本文・コミットメッセージは日本語で記述しなければならない(MUST)。」
- 「画面に描画する擬似ログとラベルは英語にする。模倣対象のツール(コンパイラ・パッケージマネージャ・CI 等)が英語で出力するため。」
- 「`any` を使わない。型が定まらない箇所は `unknown` で受けて絞り込む」
- 「描画コンポーネントと擬似データの生成を別ファイルに分ける」
- 「再描画のたびに新しい関数・オブジェクトを作らない(アニメーションの発火頻度が高いため)」
- 「Wails が生成するバインディング(`frontend/wailsjs/`)は手で編集しない」
- 「why / why not を書く。コードを読めば分かることは書かない」
- 「実在のシステム情報を読み取らず、外部へも通信しない。画面に出る値はすべてこのアプリが生成した擬似データとする」
- 「`frontend/dist` と `frontend/wailsjs` は `wails build` の生成物であり、リポジトリに含めない」

## File Structure Plan

| ファイルパス | 区分 | 責務 |
| ------------ | ---- | ---- |
| `frontend/src/lib/panes.ts` | 新規 | パネルの幾何(`PANES`・`WALL_IDS`・`GRID_DIVISIONS`・`GRID_STOPS`)と `wallWeights`。`Vec3`・`WallId`・`Pane` を export(spec.md §5.2・§6.1)。DOM に依存しない |
| `frontend/src/lib/panes.test.ts` | 新規 | 幾何の不変条件・重み・連続性・NaN・三角関数 2 回・定数(Requirement 1)。`axes.test.ts` の置き換え(6.3) |
| `frontend/src/lib/labels.ts` | 新規 | 目盛りの値と書式・`elevationLabels`・`labelFrame`(spec.md §5.3・§6.2)。DOM に依存しない |
| `frontend/src/lib/labels.test.ts` | 新規 | 目盛り・書式・ラベル数・微分・左→右・yaw 依存・`e`/`f`・`shrink`・高さの写像・純関数性(Requirement 3.1〜3.6・3.11〜3.14) |
| `frontend/src/lib/noise.ts` | 新規 | `NOISE_SIZE`・`buildNoise`(spec.md §5.5・§6.5)。DOM に依存しない |
| `frontend/src/lib/noise.test.ts` | 新規 | 長さ・値域・決定性・低周波と むら・例外(Requirement 5.1〜5.4) |
| `frontend/src/lib/project.ts` | 変更 | `Vec3` を `panes.ts` から import、`projectPointsOnto` の追加、`FILL` の export、`SCATTER_PITCH` の反転とコメント(spec.md §5.4・§6.8) |
| `frontend/src/lib/project.test.ts` | 変更 | `projectPointsOnto` の点数・座標・`stride`・容量不足・三角関数 4 回、`SCATTER_PITCH` の向き(Requirement 4.1〜4.4・7.1〜7.2)を追加 |
| `frontend/src/lib/palette.ts` | 変更 | `buildShadowRamp(stops, steps, alpha)` の追加(spec.md §6.4)。`rgba(` のテンプレートは既存の 1 箇所を共有 |
| `frontend/src/lib/palette.test.ts` | 変更 | `buildShadowRamp` の段数・端点・不透明度(Requirement 4.6)を追加 |
| `frontend/src/lib/scatterImages.ts` | 新規 | 地の画像とラベルの画像をオフスクリーン canvas に作る(spec.md §6.2「画像」・§6.5)。DOM に依存するため `node --test` の対象外。`Scatter3DPanel.tsx` の行数を抑えるための分離 |
| `frontend/src/app/globals.css` | 変更 | `@theme` へ 4 個のトークンを足す(spec.md §6.6) |
| `frontend/src/components/Scatter3DPanel.tsx` | 変更 | 地 → 面(塗り・格子・縁・影)→ 点 → ラベル の描画順、重みの器、`globalAlpha`、退避(spec.md §5.1・§6.3・§6.4・§6.7) |
| `frontend/src/lib/axes.ts` | 削除 | `AXIS_SEGMENTS`・`Segment` の廃止(Requirement 6.1)。使用ゼロを確認してから削除する |
| `frontend/src/lib/axes.test.ts` | 削除 | `panes.test.ts` で置き換える(Requirement 6.3)。使用ゼロを確認してから削除する |

`orbit.ts`・`feed.ts`・`framestats.ts`・Go 側のファイルは変更しない(8.1・8.2)。

## タスク一覧

- [x] 1. パネルの幾何と縦面の重み(純粋なモジュール)
  - [x] 1.1 `panes.ts` と `panes.test.ts` を作り、`Vec3` の import 元を `panes.ts` に移す
    _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 6.2_
    _Boundary: frontend/src/lib(幾何)_
    _Interfaces: Produces `Vec3`・`WallId`・`Pane`・`PANES`・`WALL_IDS`・`GRID_DIVISIONS`・`GRID_STOPS`・`wallWeights(yaw: number, out: Float64Array): Float64Array`(spec.md §5.2)_
    - 対象ファイル: 新規 `frontend/src/lib/panes.ts`・`frontend/src/lib/panes.test.ts`、変更 `frontend/src/lib/project.ts`(`Vec3` の定義を `panes.ts` からの import と re-export に置き換える。`axes.ts` は本タスクでは触らず、`project.ts` からの `Vec3` の再 export で既存の import を壊さない)
    - 仕様参照: spec.md §5.2・§6.1・Requirement 1・6.2
    - 検証コマンド: `(cd frontend && npm test)` が終了コード 0 で `panes.test.ts` が実行されている / `orbit.test.ts`・`project.test.ts` が通る(6.2) / (1.6)`grep -c "Math\.\(sin\|cos\)(" frontend/src/lib/panes.ts` が 2 / `(cd frontend && npx tsc --noEmit)` が終了コード 0

- [x] 2. 影の投影と影の色の表(純粋なモジュール)
  - [x] 2.1 `projectPointsOnto` を `project.ts` に、`buildShadowRamp` を `palette.ts` に足す
    _Requirements: 4.1, 4.2, 4.3, 4.4, 4.6_
    _Boundary: frontend/src/lib(投影・パレット)_
    _Depends: 1.1_
    _Interfaces: Consumes `Vec3`(1.1)/ Produces `projectPointsOnto(points, axis, value, stride, view, yaw, pitch, out): ProjectedCloud`・`FILL`(export)・`buildShadowRamp(stops, steps, alpha): string[]`(spec.md §5.4・§6.4)_
    - 対象ファイル: 変更 `frontend/src/lib/project.ts`・`frontend/src/lib/project.test.ts`・`frontend/src/lib/palette.ts`・`frontend/src/lib/palette.test.ts`
    - 仕様参照: spec.md §5.4・§6.4・Requirement 4.1〜4.4・4.6
    - 検証コマンド: `(cd frontend && npm test)` が終了コード 0 で `project.test.ts`・`palette.test.ts` に追加のテストが実行されている / (4.4)`projectPointsOnto` の本文で `Math.sin`・`Math.cos` が合計 4 回(テストで `Math.sin` を差し替えて数える) / (8.5)`grep -rn "rgba(" frontend/src --include='*.ts' --include='*.tsx' | grep -v "\.test\.ts"` が `palette.ts` の 1 箇所

- [ ] 3. 目盛りと軸名のラベル(純粋なモジュール)
  - [ ] 3.1 `labels.ts` と `labels.test.ts` を作る
    _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.11, 3.12, 3.13, 3.14_
    _Boundary: frontend/src/lib(ラベル)_
    _Depends: 1.1, 2.1_
    _Interfaces: Consumes `PANES`・`WALL_IDS`・`wallWeights`(1.1)・`projectPoint`・`FILL`(2.1)/ Produces `ELEVATION_RANGE`・`TICK_COUNT`・`AXIS_NAME`・`tickValues`・`formatTick`・`elevationLabels`・`labelFrame`・`LabelFrame`(spec.md §5.3)_
    - 対象ファイル: 新規 `frontend/src/lib/labels.ts`・`frontend/src/lib/labels.test.ts`
    - 仕様参照: spec.md §5.3・§6.2・Requirement 3.1〜3.6・3.11〜3.14
    - 検証コマンド: `(cd frontend && npm test)` が終了コード 0 で `labels.test.ts` が実行されている(3.3 は `elevationLabels` の出力が長さ 5、3.5 は 1° 刻み 360 点で `a ≥ 0`、3.13 は `dpr = 1` と `2` の両方) / `(cd frontend && npx tsc --noEmit)` が終了コード 0

- [ ] 4. 地のノイズ・デザイントークン・既定ピッチ
  - [ ] 4.1 `noise.ts` と `noise.test.ts` を作り、`globals.css` に 4 トークンを足し、`SCATTER_PITCH` を反転する (P)
    _Requirements: 5.1, 5.2, 5.3, 5.4, 7.1, 7.2, 7.3, 7.4_
    _Boundary: frontend/src/lib(ノイズ・投影の定数)・frontend/src/app(トークン)_
    _Interfaces: Produces `NOISE_SIZE`・`buildNoise(size, seed): Float32Array`(spec.md §5.5)、`SCATTER_PITCH = +0.42`(spec.md §6.8)、トークン `--color-scatter-bg-low`・`--color-scatter-bg-high`・`--color-scatter-pane`・`--color-scatter-label`(spec.md §6.6)_
    - 対象ファイル: 新規 `frontend/src/lib/noise.ts`・`frontend/src/lib/noise.test.ts`、変更 `frontend/src/app/globals.css`・`frontend/src/lib/project.ts`(`SCATTER_PITCH` の値とコメントだけ。2.1 と触る箇所が異なるため (P) だが、同一ファイルのため 2.1 の後に順に実行する)・`frontend/src/lib/project.test.ts`(7.2)
    - 仕様参照: spec.md §5.5・§6.5・§6.6・§6.8・Requirement 5.1〜5.4・7
    - 検証コマンド: `(cd frontend && npm test)` が終了コード 0 で `noise.test.ts` と 7.2 のテストが実行されている / (5.2)`grep -c "Math.random" frontend/src/lib/noise.ts` が 0 / (7.1)`grep -n "SCATTER_PITCH = 0.42" frontend/src/lib/project.ts` が 1 件 / (7.4)`grep -n "見下ろす" frontend/src/lib/project.ts` が 1 件以上 / (7.3)`git diff --quiet -- frontend/src/lib/orbit.ts` が終了コード 0 / (8.5)`grep -c "color-scatter-bg-low\|color-scatter-bg-high\|color-scatter-pane\|color-scatter-label" frontend/src/app/globals.css` が 4

- [ ] 5. 描画コンポーネントの統合(地 → 面 → 影 → 点 → ラベル)と軸線の廃止
  - [ ] 5.1 `scatterImages.ts` を作り、`Scatter3DPanel.tsx` を面・影・地・ラベルの描画に置き換え、`axes.ts`・`axes.test.ts` を削除する
    _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 3.7, 3.8, 3.9, 3.10, 3.15, 4.5, 4.7, 4.8, 5.5, 5.6, 5.7, 6.1, 6.3, 6.4, 8.4, 8.5, 9.3, 9.4, 9.5_
    _Boundary: frontend/src/components(描画)_
    _Depends: 1.1, 2.1, 3.1, 4.1_
    _Interfaces: Consumes `PANES`・`WALL_IDS`・`GRID_STOPS`・`wallWeights`(1.1)・`projectPointsOnto`・`buildShadowRamp`・`FILL`(2.1)・`elevationLabels`・`labelFrame`(3.1)・`buildNoise`・`NOISE_SIZE`・トークン 4 個(4.1)/ Produces `Scatter3DPanel`(props は変えない。spec.md §5.1)_
    - 対象ファイル: 新規 `frontend/src/lib/scatterImages.ts`、変更 `frontend/src/components/Scatter3DPanel.tsx`、削除 `frontend/src/lib/axes.ts`・`frontend/src/lib/axes.test.ts`(`grep -rn "axes'" frontend/src` が 0 件になったことを確認してから削除する)
    - 仕様参照: spec.md §5.1・§6.2・§6.3・§6.4・§6.5・§6.7・§8・Requirement 2・3.7〜3.10・3.15・4.5・4.7・4.8・5.5〜5.7・6・8.4・8.5・9.3〜9.5
    - 検証コマンド: `wails build` / `(cd frontend && npx tsc --noEmit)` / `(cd frontend && npm run lint)` / `(cd frontend && npm test)` が終了コード 0 / (6.1)`grep -rn "AXIS_SEGMENTS\|kind: 'axis'" frontend/src` が 0 件、`test ! -e frontend/src/lib/axes.ts` / (2.8)`grep -c "wallWeights(" frontend/src/components/Scatter3DPanel.tsx` が 1 / (3.8)`grep -c "fillText(" frontend/src/components/Scatter3DPanel.tsx` が 0、`grep -c "drawImage(" frontend/src/components/Scatter3DPanel.tsx` が 2(地 1 + ラベル 1) / (3.9)Global Constraints の基底の変換の静的検査 / (3.10)`grep -n "elevationLabels(" frontend/src/components/Scatter3DPanel.tsx frontend/src/lib/scatterImages.ts` の出現がマウント時の経路(画像の作成)にだけある / (3.15)Global Constraints のラベルの不透明度の静的検査 / (3.7)`grep -n "0\.35\|< 8" frontend/src/components/Scatter3DPanel.tsx` がラベルの `drawImage` の前の比較にある / (4.8・9.4)`grep -c "\.sort(" frontend/src/components/Scatter3DPanel.tsx` が 0、`grep -c "ctx.arc(" frontend/src/components/Scatter3DPanel.tsx` が 0 / (9.5)`grep -c "globalAlpha = " frontend/src/components/Scatter3DPanel.tsx` が 4 以下(面の入口・出口、ラベルの入口・出口) / (8.5)Global Constraints の色の直値の静的検査 / (5.5)背景の `fillRect` が退避経路にだけある

- [ ] 6. 回帰と全体検証
  - [ ] 6.1 検証コマンドの全体を Global Constraints の順で回し、変更禁止ファイルの不変を確かめる
    _Requirements: 8.1, 8.2, 8.3, 9.2_
    _Boundary: リポジトリ全体_
    _Depends: 5.1_
    - 対象ファイル: 変更なし(検証のみ。失敗があれば該当タスクへ戻す)
    - 仕様参照: spec.md Requirement 8・9.2
    - 検証コマンド: `(cd frontend && npm ci) && wails build && go vet ./... && go test ./... && (cd frontend && npm test) && (cd frontend && npm run lint)` がこの順で終了コード 0 / (8.1・8.2)`git diff --quiet main -- scatterpoint.go scattersource.go frontend/src/lib/feed.ts frontend/src/lib/framestats.ts frontend/src/lib/orbit.ts` が終了コード 0(`main` との差分が無い)

- [ ] 7. 計測と目視の手順(中継役が実行)
  - [ ] 7.1 Implementation Notes に p95 の計測手順と Requirement 10 の目視手順を書き、未検証の基準を明示する
    _Requirements: 9.1, 9.6, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7_
    _Boundary: docs(本ファイル)_
    _Depends: 6.1_
    - 対象ファイル: 変更 `docs/specs/002-visual-refinement/004-scatter3d-panes/tasks.md`(Implementation Notes)
    - 仕様参照: spec.md §3 前提 11・Requirement 9.1・9.6・10
    - 検証コマンド: `wails build -devtools` が終了コード 0(ビルドまで。計測と目視は中継役) / Implementation Notes に「着手時(unit #3 完了時の値を流用)」「完了時(未取得。中継役が渡す)」の 2 欄と 10.1〜10.7 の手順があること

## Implementation Notes

- 1.1 完了(2026-09-07): `panes.ts`・`panes.test.ts` を作成。`Vec3` の定義元を `panes.ts` へ移し、`project.ts` は `panes.ts` から import、`axes.ts` は 5.1 で削除するまで `Vec3` を再 export するだけに変えた(既存の import を壊さないため)。検証: `npm test` 46 件 pass(`panes.test.ts` 10 件を含む)/ `npx tsc --noEmit` 終了コード 0 / `npm run lint` エラー 0 / `grep -c "Math\.\(sin\|cos\)(" panes.ts` = 2。`wails build`・`go vet`・`go test` は本タスクでは未実行(TypeScript のみの変更。6.1 で全体を回す)
- 2.1 完了(2026-09-07): `projectPointsOnto` と `FILL` の export を `project.ts` に、`buildShadowRamp(stops, steps, alpha)` を `palette.ts` に追加。`buildRamp` は `buildShadowRamp` で帯ごとの行を作る形に改め、色文字列のテンプレートを `palette.ts` の 1 関数に閉じた。引数の順は spec.md §5.4 の `(points, axis, value, stride, yaw, pitch, view, out)` に従った(本ファイルの Interfaces 欄は `view` と `yaw, pitch` の順が逆で、spec.md を正とする)。`project.test.ts` の `Vec3` の import 元を `axes.ts` から `panes.ts` へ移した(5.1 の削除に備える)。検証: `npm test` 57 件 pass(2.1 で 11 件追加)/ `npx tsc --noEmit` 終了コード 0 / `npm run lint` エラー 0 / (4.4)テストで三角関数 4 回を確認 / (8.5)`grep -rn "rgba(" frontend/src --include='*.ts' --include='*.tsx' | grep -v "\.test\.ts"` が `palette.ts` の 1 箇所
