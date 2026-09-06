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
| `frontend/src/lib/scatterPanes.ts` | 新規 | 5.1 の分割で追加。面 1 枚の描画手順 `drawPane`・影の色の表・`readColors`・`Scene` の生成。DOM に依存せず Canvas の型だけを使い、トークンの解決は `TokenReader` で受け取る |
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

- [x] 3. 目盛りと軸名のラベル(純粋なモジュール)
  - [x] 3.1 `labels.ts` と `labels.test.ts` を作る
    _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.11, 3.12, 3.13, 3.14_
    _Boundary: frontend/src/lib(ラベル)_
    _Depends: 1.1, 2.1_
    _Interfaces: Consumes `PANES`・`WALL_IDS`・`wallWeights`(1.1)・`projectPoint`・`FILL`(2.1)/ Produces `ELEVATION_RANGE`・`TICK_COUNT`・`AXIS_NAME`・`tickValues`・`formatTick`・`elevationLabels`・`labelFrame`・`LabelFrame`(spec.md §5.3)_
    - 対象ファイル: 新規 `frontend/src/lib/labels.ts`・`frontend/src/lib/labels.test.ts`
    - 仕様参照: spec.md §5.3・§6.2・Requirement 3.1〜3.6・3.11〜3.14
    - 検証コマンド: `(cd frontend && npm test)` が終了コード 0 で `labels.test.ts` が実行されている(3.3 は `elevationLabels` の出力が長さ 5、3.5 は 1° 刻み 360 点で `a ≥ 0`、3.13 は `dpr = 1` と `2` の両方) / `(cd frontend && npx tsc --noEmit)` が終了コード 0

- [x] 4. 地のノイズ・デザイントークン・既定ピッチ
  - [x] 4.1 `noise.ts` と `noise.test.ts` を作り、`globals.css` に 4 トークンを足し、`SCATTER_PITCH` を反転する (P)
    _Requirements: 5.1, 5.2, 5.3, 5.4, 7.1, 7.2, 7.3, 7.4_
    _Boundary: frontend/src/lib(ノイズ・投影の定数)・frontend/src/app(トークン)_
    _Interfaces: Produces `NOISE_SIZE`・`buildNoise(size, seed): Float32Array`(spec.md §5.5)、`SCATTER_PITCH = +0.42`(spec.md §6.8)、トークン `--color-scatter-bg-low`・`--color-scatter-bg-high`・`--color-scatter-pane`・`--color-scatter-label`(spec.md §6.6)_
    - 対象ファイル: 新規 `frontend/src/lib/noise.ts`・`frontend/src/lib/noise.test.ts`、変更 `frontend/src/app/globals.css`・`frontend/src/lib/project.ts`(`SCATTER_PITCH` の値とコメントだけ。2.1 と触る箇所が異なるため (P) だが、同一ファイルのため 2.1 の後に順に実行する)・`frontend/src/lib/project.test.ts`(7.2)
    - 仕様参照: spec.md §5.5・§6.5・§6.6・§6.8・Requirement 5.1〜5.4・7
    - 検証コマンド: `(cd frontend && npm test)` が終了コード 0 で `noise.test.ts` と 7.2 のテストが実行されている / (5.2)`grep -c "Math.random" frontend/src/lib/noise.ts` が 0 / (7.1)`grep -n "SCATTER_PITCH = 0.42" frontend/src/lib/project.ts` が 1 件 / (7.4)`grep -n "見下ろす" frontend/src/lib/project.ts` が 1 件以上 / (7.3)`git diff --quiet -- frontend/src/lib/orbit.ts` が終了コード 0 / (8.5)`grep -c "color-scatter-bg-low\|color-scatter-bg-high\|color-scatter-pane\|color-scatter-label" frontend/src/app/globals.css` が 4

- [x] 5. 描画コンポーネントの統合(地 → 面 → 影 → 点 → ラベル)と軸線の廃止
  - [x] 5.1 `scatterImages.ts` を作り、`Scatter3DPanel.tsx` を面・影・地・ラベルの描画に置き換え、`axes.ts`・`axes.test.ts` を削除する
    _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 3.7, 3.8, 3.9, 3.10, 3.15, 4.5, 4.7, 4.8, 5.5, 5.6, 5.7, 6.1, 6.3, 6.4, 8.4, 8.5, 9.3, 9.4, 9.5_
    _Boundary: frontend/src/components(描画)_
    _Depends: 1.1, 2.1, 3.1, 4.1_
    _Interfaces: Consumes `PANES`・`WALL_IDS`・`GRID_STOPS`・`wallWeights`(1.1)・`projectPointsOnto`・`buildShadowRamp`・`FILL`(2.1)・`elevationLabels`・`labelFrame`(3.1)・`buildNoise`・`NOISE_SIZE`・トークン 4 個(4.1)/ Produces `Scatter3DPanel`(props は変えない。spec.md §5.1)_
    - 対象ファイル: 新規 `frontend/src/lib/scatterImages.ts`、変更 `frontend/src/components/Scatter3DPanel.tsx`、削除 `frontend/src/lib/axes.ts`・`frontend/src/lib/axes.test.ts`(`grep -rn "axes'" frontend/src` が 0 件になったことを確認してから削除する)
    - 仕様参照: spec.md §5.1・§6.2・§6.3・§6.4・§6.5・§6.7・§8・Requirement 2・3.7〜3.10・3.15・4.5・4.7・4.8・5.5〜5.7・6・8.4・8.5・9.3〜9.5
    - 検証コマンド: `wails build` / `(cd frontend && npx tsc --noEmit)` / `(cd frontend && npm run lint)` / `(cd frontend && npm test)` が終了コード 0 / (6.1)`grep -rn "AXIS_SEGMENTS\|kind: 'axis'" frontend/src` が 0 件、`test ! -e frontend/src/lib/axes.ts` / (2.8)`grep -c "wallWeights(" frontend/src/components/Scatter3DPanel.tsx` が 1 / (3.8)`grep -c "fillText(" frontend/src/components/Scatter3DPanel.tsx` が 0、`grep -c "drawImage(" frontend/src/components/Scatter3DPanel.tsx` が 2(地 1 + ラベル 1) / (3.9)Global Constraints の基底の変換の静的検査 / (3.10)`grep -n "elevationLabels(" frontend/src/components/Scatter3DPanel.tsx frontend/src/lib/scatterImages.ts` の出現がマウント時の経路(画像の作成)にだけある / (3.15)Global Constraints のラベルの不透明度の静的検査 / (3.7)`grep -n "0\.35\|< 8" frontend/src/components/Scatter3DPanel.tsx` がラベルの `drawImage` の前の比較にある / (4.8・9.4)`grep -c "\.sort(" frontend/src/components/Scatter3DPanel.tsx` が 0、`grep -c "ctx.arc(" frontend/src/components/Scatter3DPanel.tsx` が 0(5.1 の分割後は `frontend/src/lib/scatterPanes.ts` も同じ検査の対象に含める) / (9.5)`grep -c "globalAlpha = " frontend/src/components/Scatter3DPanel.tsx` が 4 以下(面の入口・出口、ラベルの入口・出口) / (8.5)Global Constraints の色の直値の静的検査 / (5.5)背景の `fillRect` が退避経路にだけある

- [x] 6. 回帰と全体検証
  - [x] 6.1 検証コマンドの全体を Global Constraints の順で回し、変更禁止ファイルの不変を確かめる
    _Requirements: 8.1, 8.2, 8.3, 9.2_
    _Boundary: リポジトリ全体_
    _Depends: 5.1_
    - 対象ファイル: 変更なし(検証のみ。失敗があれば該当タスクへ戻す)
    - 仕様参照: spec.md Requirement 8・9.2
    - 検証コマンド: `(cd frontend && npm ci) && wails build && go vet ./... && go test ./... && (cd frontend && npm test) && (cd frontend && npm run lint)` がこの順で終了コード 0 / (8.1・8.2)`git diff --quiet main -- scatterpoint.go scattersource.go frontend/src/lib/feed.ts frontend/src/lib/framestats.ts frontend/src/lib/orbit.ts` が終了コード 0(`main` との差分が無い)

- [x] 7. 計測と目視の手順(中継役が実行)
  - [x] 7.1 Implementation Notes に p95 の計測手順と Requirement 10 の目視手順を書き、未検証の基準を明示する
    _Requirements: 9.1, 9.6, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7_
    _Boundary: docs(本ファイル)_
    _Depends: 6.1_
    - 対象ファイル: 変更 `docs/specs/002-visual-refinement/004-scatter3d-panes/tasks.md`(Implementation Notes)
    - 仕様参照: spec.md §3 前提 11・Requirement 9.1・9.6・10
    - 検証コマンド: `wails build -devtools` が終了コード 0(ビルドまで。計測と目視は中継役) / Implementation Notes に「着手時(unit #3 完了時の値を流用)」「完了時(未取得。中継役が渡す)」の 2 欄と 10.1〜10.7 の手順があること

## Implementation Notes

- 1.1 完了(2026-09-07): `panes.ts`・`panes.test.ts` を作成。`Vec3` の定義元を `panes.ts` へ移し、`project.ts` は `panes.ts` から import、`axes.ts` は 5.1 で削除するまで `Vec3` を再 export するだけに変えた(既存の import を壊さないため)。検証: `npm test` 46 件 pass(`panes.test.ts` 10 件を含む)/ `npx tsc --noEmit` 終了コード 0 / `npm run lint` エラー 0 / `grep -c "Math\.\(sin\|cos\)(" panes.ts` = 2。`wails build`・`go vet`・`go test` は本タスクでは未実行(TypeScript のみの変更。6.1 で全体を回す)
- 2.1 完了(2026-09-07): `projectPointsOnto` と `FILL` の export を `project.ts` に、`buildShadowRamp(stops, steps, alpha)` を `palette.ts` に追加。`buildRamp` は `buildShadowRamp` で帯ごとの行を作る形に改め、色文字列のテンプレートを `palette.ts` の 1 関数に閉じた。引数の順は spec.md §5.4 の `(points, axis, value, stride, yaw, pitch, view, out)` に従った(本ファイルの Interfaces 欄は `view` と `yaw, pitch` の順が逆で、spec.md を正とする)。`project.test.ts` の `Vec3` の import 元を `axes.ts` から `panes.ts` へ移した(5.1 の削除に備える)。検証: `npm test` 57 件 pass(2.1 で 11 件追加)/ `npx tsc --noEmit` 終了コード 0 / `npm run lint` エラー 0 / (4.4)テストで三角関数 4 回を確認 / (8.5)`grep -rn "rgba(" frontend/src --include='*.ts' --include='*.tsx' | grep -v "\.test\.ts"` が `palette.ts` の 1 箇所
- 3.1 完了(2026-09-07): `labels.ts`・`labels.test.ts` を作成。`elevationLabels` は `out` を空にしてから 5 個を書き(マウント時にだけ呼ぶため Label オブジェクトの生成を許す)、`labelFrame` は微分用のずらした点をモジュール定数の `Vec3` 1 個で使い回して新しいオブジェクトを作らない。3.4 のテストは `projectPoint` を呼ばず spec §5.3 の式を自前で計算して比較した。3.5 は既定ピッチの反転(4.1)前後の両方(±0.42)で 1° 刻み 361 点を走査し、重みが正の面の `a ≥ 0` を確認。検証: `npm test` 70 件 pass(3.1 で 13 件追加)/ `npx tsc --noEmit` 終了コード 0 / `npm run lint` エラー 0。`wails build`・`go vet`・`go test` は本タスクでは未実行(TypeScript のみの変更。6.1 で全体を回す)
- 4.1 完了(2026-09-07): `noise.ts`・`noise.test.ts` を作成(格子 8 px の値ノイズを smoothstep で補間。整数ハッシュで決定的に生成し、格子を循環させて端の継ぎ目を消す)。`globals.css` の `@theme` に 4 トークンを追加。`SCATTER_PITCH` を `0.42` に反転し、符号と向きの対応をコメントに明記。`project.test.ts` に 7.1・7.2 のテストを追加。`orbit.test.ts` は `SCATTER_PITCH` を import して比較するため変更なしで通る(6.2)。検証: `npm test` 75 件 pass(4.1 で 5 件追加)/ `npx tsc --noEmit` 終了コード 0 / `npm run lint` エラー 0 / (5.2)`grep -c "Math.random" noise.ts` = 0 / (7.1)`SCATTER_PITCH = 0.42` 1 件 / (7.4)「見下ろす」1 件 / (7.3)`orbit.ts` に差分なし / (8.5)トークン 4 件。`wails build`・`go vet`・`go test` は本タスクでは未実行(6.1 で全体を回す)
- 5.1 分割(2026-09-07): `Scatter3DPanel.tsx` 824 行から「面 1 枚の描画手順」の責務を `scatterPanes.ts`(297 行)へ移し、`Scatter3DPanel.tsx` を 550 行にした。移したのは `drawPane`・影の定数と色の表(`buildShadowPalettes`)・`readColors`・`readStops`・`createScene`・型 `PanelColors`/`ShadowPalettes`/`Scene`・退避色とトークン名。`getComputedStyle` を持つ `readToken` はコンポーネントに残し、`TokenReader` として引数で渡す(移動先を DOM 非依存に保つ)。`drawPane` の作業領域の引数は読む 3 項目だけの `ShadowBuffers` に狭めた(`CloudBuffers` は構造的に代入できる)。振る舞いの変更なし。検証: `npx tsc --noEmit` 終了コード 0 / `npm run lint` エラー 0 / `npm test` 70 件 pass。静的検査を 2 ファイルで数え直した結果(コンポーネント / scatterPanes.ts): `wallWeights(` 1 / 0、`fillText(` 0 / 0、`drawImage(` 2 / 0、`setTransform(` 1 / 0、`globalAlpha = ` 4 / 0(右辺は面 `w`・`1`、ラベル `w * w * w`・`1`)、`.sort(`・`ctx.arc(` 0 / 0、`stroke()` 0 / 2(`drawPane` の格子と縁)、`elevationLabels(` 0 / 1(`createScene`)、`transform(` はコンポーネントの 1 箇所で `save`・`restore` に挟まれる、`0.35`・`< 8` はラベルの `drawImage` 直前、枠全体の `fillRect` は退避経路のみ、16 進の直値 0 件、`rgba(` は `palette.ts` の 1 箇所、`AXIS_SEGMENTS` 0 件
- 5.1 完了(2026-09-07): `scatterImages.ts` を新規作成(地の 48×48 `ImageData` → 枠の寸法へ平滑拡大した canvas、ラベル 20 個を `fontPx × dpr` の高さで焼いた canvas。2D コンテキストを取れなければ `console.error` して null)。`Scatter3DPanel.tsx` は地 → 床 → 重みが正の縦面(塗り → 格子 → 縁 → 影)→ 点 → ラベルの順に置き換え、面の頂点 4 個・ラベルの微分 3 個・`LabelFrame`・重みの `Float64Array(4)` を `Scene` として effect の寿命で 1 度だけ作る。影のバケット順(24 バケットの counting sort)は `render` の先頭で 1 度だけ作り `drawPane` が全面で使い回す。地とラベルの画像は `canvas.width/height`(デバイス px)と `devicePixelRatio` の比較で囲った分岐でだけ作り直す。`palette.ts` の `toColorString` を export し、パネルの塗り・格子・縁の色文字列(不透明度 0.06 / 0.16 / 0.45)をマウント時に作る(`rgba(` のテンプレートは `palette.ts` の 1 箇所のまま)。`axes.ts`・`axes.test.ts` を削除。検証: `npx tsc --noEmit` 終了コード 0 / `npm run lint` エラー 0 / `npm test` 70 件 pass(`axes.test.ts` の 5 件が減る) / (6.1)`AXIS_SEGMENTS`・`kind: 'axis'` 0 件 / (2.8)`wallWeights(` 1 / (3.8)`fillText(` 0・`drawImage(` 2 / (3.9)`setTransform(` 1、`transform(` は `save`・`restore` に挟まれる / (3.15・9.5)`globalAlpha = ` 4 箇所(面: `w`・`1`、ラベル: `w * w * w`・`1`) / (3.7)`0.35`・`< 8` はラベルの `drawImage` 直前の比較 / (4.8・9.4)`.sort(`・`arc(` 0 件 / (8.5)16 進の直値 0 件・`rgba(` は `palette.ts` の 1 箇所 / (3.10)`elevationLabels(` は `createScene`(マウント時)だけ / (5.5)枠全体の `fillRect` は `scene.ground === null` の退避経路だけ / (2.3)`stroke()` は `drawPane` の 2 箇所。`Scatter3DPanel.tsx` は 824 行(分離後も check.py の行数の目安を超える見込み。分割案は報告で示す)。`wails build`・`go vet ./...`・`go test ./...` も終了コード 0(5.1 のコミット後に実行)
- 6.1 完了(2026-09-07、HEAD `7f7faf0` の分割後): Global Constraints の順で `npm ci` → `wails build` → `go vet ./...` → `go test ./...`(`nullops`・`nullops/feed` ok)→ `npm test`(70 件 pass・fail 0)→ `npm run lint`(35 files・エラー 0)がいずれも終了コード 0。(8.1・8.2)`git diff --quiet main -- scatterpoint.go scattersource.go frontend/src/lib/feed.ts frontend/src/lib/framestats.ts frontend/src/lib/orbit.ts` 終了コード 0。凍結済み文書(`001-dashboard-mvp/**`・`002-visual-refinement/001-*`〜`003-*`・本 unit の `spec.md`)も `main` と差分なし。変更禁止ファイルへの変更はなく、該当タスクへ戻す失敗はなかった
- 7.1 完了(2026-09-07): `wails build -devtools` 終了コード 0(HEAD `dd71714`)。計測と目視の手順は下の節に書く。Requirement 9.1・9.6・10.1〜10.7 は本実装者が実行せず「未検証(中継役が実行)」とする(Global Constraints の人間の回答)
- 7.1 中継役の実行結果(2026-09-07、HEAD `9206669` の `wails build -devtools`): **Requirement 9.1・9.6・10.1〜10.7 は中継役がホストで確かめ、いずれも満たした。** p95 は 13 回の出力を採り、5 パネルすべてで 20 ms 未満(下の「完了時」の表へ転記済み)。目視はユーザーが画面を見て「見た目は OK」と承認した。観察: 面 5 枚ぶんの格子と縁、影(点数 + 5 × ceil(点数 / 2) 回の `fillRect`)、ラベル 20 個を足したにもかかわらず、max は着手時の 19〜25 ms から 18〜21 ms へ下がった(p95・mean は同等)。unit #3 で得た「`arc`・比較ソート・`fillStyle` の切り替え回数を増やさない設計なら描画を足しても悪化しない」という見立てが、影とパネルの追加でも成り立った。影を counting sort の 24 バケットで色ごとにまとめて塗り、面ごとの `fillStyle` の切り替えを 24 回に抑えたことが効いたと見る

### 中継役がホストで確かめる項目(手順。Requirement 9.1・9.6・10)

**p95 の計測(Requirement 9.1・9.6)**: `wails build -devtools` のビルドを 1440×900 で起動し、devtools のコンソールで `window.nullops.enableFrameStats()` を呼ぶ(手順は凍結済み `docs/specs/001-dashboard-mvp/005-framestats-runtime/tasks.md` B 節)。5 パネル(`commit`・`depgraph`・`gauge`・`scatter`・`timeseries`)の p95・mean・max が 60 フレームごとに出力されるのを 10 回以上読み、最後の 6 行(30 秒ぶん)を集計する。合格条件: 5 パネルすべてで、最後の 6 行のいずれも p95 が 20 ms 未満(9.1)。max は記録のみ(50 ms 超は削る順の発動条件。#3 tasks.md Implementation Notes と同じ)。取得した値は下の「完了時」の表へ転記する(9.6)。

**着手時(unit #3 完了時の値を流用。spec.md §3 前提 11。再計測しない)**:

| パネル | p95 | mean | max |
| :-- | :-- | :-- | :-- |
| commit | 17.0〜18.0 ms | 16.7 ms | 19〜24 ms |
| depgraph | 17.0〜18.0 ms | 16.7 ms | 19〜24 ms |
| gauge | 17.0〜18.0 ms | 16.7 ms | 19〜25 ms |
| scatter | 17.0〜18.0 ms | 16.7 ms | 19〜25 ms |
| timeseries | 17.0〜18.0 ms | 16.7 ms | 19〜25 ms |

**完了時(2026-09-07。中継役がホストで取得。HEAD `9206669` の `wails build -devtools`、13 回の出力を集計)**:

| パネル | p95 | mean | max |
| :-- | :-- | :-- | :-- |
| commit | 17.0〜18.0 ms | 16.7 ms | 18〜21 ms |
| depgraph | 17.0〜18.0 ms | 16.7 ms | 18〜21 ms |
| gauge | 17.0〜18.0 ms | 16.7 ms | 19〜21 ms |
| scatter | 17.0〜18.0 ms | 16.7 ms | 19〜21 ms |
| timeseries | 17.0〜18.0 ms | 16.7 ms | 19〜21 ms |

判定: 5 パネルすべてで p95 が 20 ms 未満(9.1 合格)。max は 50 ms 超なし(削る順の発動なし)。着手時と比べ p95・mean は同等、max は下がった。

**目視(Requirement 10.1〜10.7)**: 同じビルドを起動し、3D 散布図のパネルで次を確かめる。判定は各項目の合格条件による。結果(2026-09-07): 中継役が HEAD `9206669` のビルドで実施し、ユーザーが画面を目視して「見た目は OK」と承認した(10.1〜10.7 合格)。

1. 10.1(放置): 起動後に触らず 30 秒観る。床を上から見下ろす向きで、奥を向く縦面(奥向きの度合いで濃さが変わる)と床に薄い面・3 × 3 の格子・縁が描かれ、点群と同じ回転で動く(画面に固定されない)こと。
2. 10.2(1 周のドラッグ): ドラッグで視点を水平に 1 周回す。面とラベルが突然消える・現れることがなく、奥向きの度合いに応じて連続に濃く・薄くなること(重みが 0 の面は描かないが、重みは連続に 0 へ落ちるため飛びにならない)。
3. 10.3(格子と点): 格子線(1 px)が 1〜2 px の点を隠して構造(地形・球・トーラス)が読めなくなっていないこと。
4. 10.4(目盛りと軸名): 縦面の右の辺の 4 値と `Elevation` が面に沿って歪み、視点を回すと一緒に回ること。どの視点でも鏡像にならず(鏡像は描かない)、読めないほど潰れた文字が残っていないこと(真横に近い面・8 px 未満の文字は描かない)。
5. 10.5(地): 背景が一様な黒ではなく、むらのある深い青の地であること。粒(ノイズの格子)が見えないこと。
6. 10.6(影): 点群の投影が奥を向く縦面と床に、点の色を保ったまま暗く写り、視点を回すと面と一緒に回ること。
7. 10.7(既存の維持): unit #3 の点群・色・構造(#3 spec Requirement 10.1〜10.6)と unit #2 の操作(ドラッグ・復帰・カーソル。#2 spec Requirement 10)が引き続き満たされること。

**未検証の受け入れ基準**: なし。9.1(p95 < 20 ms)・9.6(完了時の p95・mean・max の記録)・10.1〜10.7(目視)は本実装者が実行せず、中継役が上の手順でホストで確かめて結果を本節へ転記した(2026-09-07)。

### 最終検証の照合(2026-09-07、HEAD `1a73109`)

観点: requirements-conformance・security・test(隔離した複製で変異注入)・performance の 4 体(dev-reviewer、生成と別文脈)。runtime-smoke・visual-conformance の実行時の観察は、Global Constraints の人間の回答に従い中継役がホストで実行した(上の 7.1 の記録)。判定: 4 観点すべて APPROVED、`[Critical]` 0 件、`UNVERIFIED` なし → **GO**。検証コマンドの出力は本ターンで 1 度だけ実行して各観点へ渡した(`go vet`・`go test`・`npm test` 70 件・`npm run lint` がいずれも成功。`wails build -devtools` は中継役が HEAD `9206669` で実行し、以降コードは未変更)。

| 要件 ID | 照合した対象 | 立証の手段 |
| :-- | :-- | :-- |
| 1.1〜1.7 | `panes.ts`・`panes.test.ts` | テスト(1.2・1.4・1.7 は変異注入で検出) |
| 2.1〜2.8 | `Scatter3DPanel.tsx` の面ループ・`scatterPanes.ts` の `drawPane` | 静的検査(`stroke()` 2・`wallWeights(` 1・`globalAlpha` の右辺)+ 目視 10.1(中継役) |
| 3.1〜3.6・3.11〜3.14 | `labels.ts`・`labels.test.ts` | テスト(3.2・3.5・3.12・3.13 は変異注入で検出) |
| 3.7〜3.10・3.15 | `Scatter3DPanel.tsx` のラベルの描画分岐 | 静的検査(`fillText` 0・`drawImage` 2・`setTransform` 1・`globalAlpha = ` 4)+ 目視 10.4(中継役) |
| 4.1〜4.4 | `project.ts`・`project.test.ts` | テスト(4.1 は変異注入で検出) |
| 4.5・4.7・4.8 | `scatterPanes.ts` の影・`render` 先頭の counting sort | 静的検査(`.sort(` 0・`fillStyle` の代入位置・描画順) |
| 4.6 | `palette.ts`・`palette.test.ts` | テスト(変異注入で検出) |
| 5.1〜5.4 | `noise.ts`・`noise.test.ts` | テスト(5.2・5.3 は変異注入で検出) |
| 5.5〜5.7 | `scatterImages.ts`・`Scatter3DPanel.tsx` の画像の作り直しと退避 | 静的検査 + 目視 10.5(中継役) |
| 6.1〜6.4 | `axes.ts` の不在・`panes.test.ts`・`orbit.ts` の不変 | grep 0 件・削除テストの内容確認・スイートのグリーン |
| 7.1〜7.4 | `project.ts`・`project.test.ts`・`orbit.ts` の差分なし | テスト(7.1・7.2 は変異注入で検出)+ 静的検査 |
| 8.1〜8.5 | 変更禁止ファイル・凍結文書の `main` との差分なし、`globals.css` のトークン 4 件 | `git diff --quiet`・grep(16 進 0 件・`rgba(` 1 箇所) |
| 9.1・9.6 | Implementation Notes の「完了時」の表 | 中継役の計測(5 パネルとも p95 < 20 ms) |
| 9.2 | 検証コマンドの出力 | 証跡の読解 |
| 9.3〜9.5 | `render`・`drawPane`・`labelFrame`・`projectPointsOnto` | 静的検査(ホットパスの生成構文 0 件、回数の数え上げ: `fillStyle` ≤ 651・`drawImage` ≤ 11・`globalAlpha` ≤ 8) |
| 10.1〜10.7 | 中継役の目視 | ユーザーの承認(2026-09-07) |
| security(ID なし) | 外部通信・`Math.random`・依存追加・`wailsjs`・Go 側の変更 | いずれも 0 件 |

変異注入(test 観点、10 件): `wallWeights` の符号反転・`projectPointsOnto` の stride 無視・`shrink` の scale 除去・ノイズの seed 除去・`buildShadowRamp` の端点ずらし・`SCATTER_PITCH` の符号反転・`CELL_PX` 8→2・`formatTick` の負の 0・`labelFrame` の dpr 除去・`GRID_STOPS` の変更。すべて対応するテストで検出(生存 0)。

対応を見送った `[Nit]`(次 unit 以降の候補): (a) `scatterPanes.ts` は DOM 非依存なので、呼び出しを記録するスタブの `ctx` で `stroke` 2 回・影の `fillStyle` ≤ 24 回・描画順を振る舞いとして検証できる(現在は grep で代替)。(b) Requirement 3.7 の下限の述語(`shrink < 0.35`・`fontPx × scale < 8`)を `labels.ts` へ切り出せばテストできる。(c) ラベル画像の高さ `Math.ceil(fontPx × dpr)` は非整数 dpr で 3.13 から最大 3 % ずれる(見た目の微差)。(d) 地の退避経路の `fillRect` 1 回は 9.5 の字義上の上限を 1 回超えるが、トークンが実在するため通常経路では到達しない。(e) `labelFrame` はラベルごとに `projectPoint` を 3 回呼び三角関数が最大 60 回/フレーム走る(要件の対象外。計測上の必要なし)。

### 凍結文書との乖離(最終検証パネルの `DRIFT`。中間生成物は書き換えない)

1. tasks.md 2.1 の `_Interfaces:_` の引数順(`view, yaw, pitch`)と spec.md §5.4・実装(`yaw, pitch, view`)の食い違い。**spec.md が正**(公開契約)。Implementation Notes 2.1 に申告済みで、追加対応なし。
2. spec.md §7 Requirement 3 の注は 3.7 の下限を「テスト」で確かめると書くが、判断は DOM 依存の `Scatter3DPanel.tsx` にあり `node --test` では到達できず、tasks.md 5.1 は静的検査を割り当てた。**tasks.md の手段が正**。置き場: 次 unit の spec で「描画側の下限は静的検査(または述語の切り出し後のテスト)で確かめる」と手段を実態に合わせる。
3. spec.md Requirement 6.2「`project.test.ts` が変更なしで成功する」は、Requirement 6.1(`axes.ts` の廃止)と両立せず、`project.test.ts` は import 元の付け替えとテストの追加で変更された。**実装が正**(既存アサーションの削除・弱体化は 0 件で、意図「既存の振る舞いの維持」は満たす)。置き場: 次 unit の spec の同種の基準を「既存のアサーションを変えずに成功する」と書く。
