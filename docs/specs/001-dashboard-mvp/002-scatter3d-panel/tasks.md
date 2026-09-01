# scatter3d-panel — 実装タスク

> 仕様の詳細は同じディレクトリの仕様文書 spec.md を参照する。
> このファイルには仕様を転記しない。

## Global Constraints

spec.md がこの作業単位の全体に掛ける制約を逐語で写す。全タスクの要件に暗黙に含まれる。

- **3D 散布図は Canvas 2D の 2 次元 API へ自前で投影して描く。WebGL と描画ライブラリを使わない。**(spec.md §3 前提 1)
- **点群の回転はフロントエンドが `requestAnimationFrame` で毎フレーム進め、Go 側は点の座標だけを低頻度で供給する。**(spec.md §3 前提 2)
- **点群の点数は固定(256 点)とし、増減させない。**(spec.md §3 前提 3)
- **キャンバスへ渡す色は `globals.css` の `@theme` トークンを実行時に解決して得る。**(spec.md §3 前提 4)
- **画面の見え方に依存する受け入れ基準は、実装するが本セッションでは検証しない。**(spec.md §3 前提 5)
- **乱数は `math/rand`(v1)を使う。**(spec.md §3 前提 6)
- **WebGL・three.js 等の描画ライブラリの導入**をしない(spec.md §2 対象外)
- **マウス操作による視点の変更・ズーム・点の選択**をしない(spec.md §2 対象外)
- **他 5 パネルの実装と 6 パネル同時稼働の最終調整**をしない(spec.md §2 対象外)
- **描画結果の自動視覚検証(ブラウザ自動化・スクリーンショット比較)**をしない(spec.md §2 対象外)
- **`main.go` の `BackgroundColour` に残るテンプレート由来の直値の是正**をしない(spec.md §2 対象外)
- 新しいデザイントークンは追加しない。点の描画色は既存の `--color-accent-scatter`、背景は `--color-surface-1` を用いる(`globals.css` の `@theme` が正本)(spec.md §6.5)
- 会話・ドキュメント・コード内コメント・PR/Issue 本文・コミットメッセージは日本語で記述する。画面に描画する擬似ログとラベルは英語にする(`CLAUDE.md` 言語規約)
- `any` を使わない。型が定まらない箇所は `unknown` で受けて絞り込む(`CLAUDE.md`)
- 再描画のたびに新しい関数・オブジェクトを作らない(`CLAUDE.md`)
- Wails が生成するバインディング(`frontend/wailsjs/`)は手で編集しない(`CLAUDE.md`)
- `frontend/dist` と `frontend/wailsjs` は `wails build` の生成物であり、リポジトリに含めない(`CLAUDE.md`)

## File Structure Plan

| ファイルパス                                  | 区分 | 責務                                                                       |
| --------------------------------------------- | ---- | -------------------------------------------------------------------------- |
| `scatterpoint.go`                             | 新規 | `ScatterPoint`・`ScatterCloud` の型定義と、不変条件を強制する `newScatterPoint` |
| `scatterpoint_test.go`                         | 新規 | `newScatterPoint` の不変条件と error 識別のテスト                            |
| `scattersource.go`                            | 新規 | `feed.Source` を満たす擬似点群生成器 `scatterSource`                          |
| `scattersource_test.go`                       | 新規 | `scatterSource` の契約・時間変化・並行安全のテスト                            |
| `snapshot.go`                                 | 変更 | `DashboardSnapshot` へ `Scatter` フィールドを足す                            |
| `app.go`                                      | 変更 | `scatterSource` を `App` に持たせ `Runner` へ登録し、`Snapshot` へ載せる       |
| `app_test.go`                                 | 変更 | `Snapshot` の点群に関する事後条件のテスト                                    |
| `frontend/src/lib/project.ts`                 | 新規 | 3 次元投影の純関数 `projectPoint` と型 `Projected`                            |
| `frontend/src/lib/feed.ts`                    | 変更 | `subscribeScatter` を足す                                                    |
| `frontend/src/components/Scatter3DPanel.tsx`  | 新規 | Canvas 2D による点群の描画・回転・寸法追随                                    |
| `frontend/src/app/page.tsx`                   | 変更 | `Scatter 3D` 枠を `pending` から `Scatter3DPanel` へ差し替える                |

削除対象は無い。

## タスク一覧

- [x] 1. Go 側の点群の契約と生成器
  - [x] 1.1 `ScatterPoint`・`ScatterCloud` の型と不変条件の強制を作る
    _Requirements: 2.1, 2.2, 2.3, 2.4_
    _Boundary: ScatterPoint_
    _Interfaces: Produces `newScatterPoint(x, y, z, w float64) (ScatterPoint, error)` / `ScatterPoint{X, Y, Z, W float64}` / `ScatterCloud{Seq uint64; Points []ScatterPoint}` / `errScatterPointOutOfRange` / `errScatterPointNotFinite`_
    - 対象ファイル: `scatterpoint.go`(新規), `scatterpoint_test.go`(新規)
    - 仕様参照: spec.md §6.1 `ScatterPoint`, §6.2 `ScatterCloud`
    - 検証コマンド: `go vet ./...`, `go test ./...`
  - [x] 1.2 `scatterSource` を作り `feed.Source` を構造的に満たす
    _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 2.5, 3.1, 3.2, 10.2, 10.3_
    _Boundary: scatterSource_
    _Depends: 1.1_
    _Interfaces: Consumes `newScatterPoint(x, y, z, w float64) (ScatterPoint, error)` / `ScatterCloud{Seq uint64; Points []ScatterPoint}` / Produces `newScatterSource(pointCount int, rnd *rand.Rand) *scatterSource` / `(*scatterSource) EventName() string` / `(*scatterSource) Interval() time.Duration` / `(*scatterSource) Next() any` / `(*scatterSource) Snapshot() ScatterCloud` / `scatterEventName = "nullops:scatter"` / `scatterInterval = 1000ms` / `scatterClusterCount = 3`_
    - 対象ファイル: `scattersource.go`(新規), `scattersource_test.go`(新規)
    - 仕様参照: spec.md §5.1 `scatterSource`, §6.4 内部状態, §7 Requirement 1・2.5・3・10.2・10.3
    - 検証コマンド: `go vet ./...`, `go test ./...`, `go test -race ./...`
  - [x] 1.3 `App` へ点群を配線し `Snapshot` に載せる
    _Requirements: 4.1, 4.2, 4.3, 4.4_
    _Boundary: App_
    _Depends: 1.2_
    _Interfaces: Consumes `newScatterSource(pointCount int, rnd *rand.Rand) *scatterSource` / `(*scatterSource) Snapshot() ScatterCloud` / Produces `DashboardSnapshot{Log []LogLine; Scatter ScatterCloud}` / イベント `nullops:scatter`(payload は `ScatterCloud` 1 個)_
    - 対象ファイル: `app.go`(変更), `snapshot.go`(変更), `app_test.go`(変更)
    - 仕様参照: spec.md §5.2 `App.Snapshot`, §5.3 送信イベント, §6.3 `DashboardSnapshot`
    - 検証コマンド: `go vet ./...`, `go test ./...`, `wails build`

- [x] 2. フロントエンドの投影と購読(Go 側の契約に依存する薄い層)
  - [x] 2.1 投影の純関数 `projectPoint` を作る
    _Requirements: 6.1, 6.2, 6.3_
    _Boundary: project_
    _Depends: 1.3_
    _Interfaces: Consumes `main.ScatterPoint`(`frontend/wailsjs/go/models.ts`。`wails build` が生成) / Produces `type Projected = { sx: number; sy: number; scale: number; depth: number }` / `projectPoint(p: main.ScatterPoint, yaw: number, pitch: number, view: { width: number; height: number }): Projected` / `SCATTER_PITCH: number`_
    - 対象ファイル: `frontend/src/lib/project.ts`(新規)
    - 仕様参照: spec.md §5.6 投影関数, §8 実現方針(透視投影 `scale = f / (f - z')`)
    - 検証コマンド: `cd frontend && npm run lint`
  - [x] 2.2 `subscribeScatter` を `feed.ts` へ足す
    _Requirements: 5.4_
    _Boundary: feed_
    _Depends: 1.3_
    _Interfaces: Consumes イベント `nullops:scatter`(payload は `main.ScatterCloud` 1 個) / Produces `subscribeScatter(onCloud: (cloud: main.ScatterCloud) => void): () => void`_
    - 対象ファイル: `frontend/src/lib/feed.ts`(変更)
    - 仕様参照: spec.md §5.4 フロントエンドの購読
    - 検証コマンド: `cd frontend && npm run lint`

- [x] 3. `Scatter3DPanel` の描画
  - [x] 3.1 パネルの骨格と、購読・スナップショットの併合を作る
    _Requirements: 5.1, 5.2, 5.3_
    _Boundary: Scatter3DPanel_
    _Depends: 2.2_
    _Interfaces: Consumes `subscribeScatter(onCloud: (cloud: main.ScatterCloud) => void): () => void` / `loadSnapshot(): Promise<main.DashboardSnapshot>` / Produces `Scatter3DPanel(): React.JSX.Element`_
    - 対象ファイル: `frontend/src/components/Scatter3DPanel.tsx`(新規)
    - 仕様参照: spec.md §5.5 `Scatter3DPanel`, §7 Requirement 5
    - 検証コマンド: `cd frontend && npm run lint`
  - [x] 3.2 キャンバスの寸法を枠と `devicePixelRatio` へ追随させる
    _Requirements: 8.1, 8.2, 8.3, 6.6_
    _Boundary: Scatter3DPanel_
    _Depends: 3.1_
    _Interfaces: Consumes `Scatter3DPanel(): React.JSX.Element`(3.1 が作った骨格)_
    - 対象ファイル: `frontend/src/components/Scatter3DPanel.tsx`(変更)
    - 仕様参照: spec.md §7 Requirement 8, 6.6
    - 検証コマンド: `cd frontend && npm run lint`
  - [x] 3.3 `requestAnimationFrame` による回転のループを作る
    _Requirements: 7.1, 7.2, 7.3, 7.4_
    _Boundary: Scatter3DPanel_
    _Depends: 3.2_
    _Interfaces: Consumes `Scatter3DPanel(): React.JSX.Element`(3.2 までの骨格と寸法追随)_
    - 対象ファイル: `frontend/src/components/Scatter3DPanel.tsx`(変更)
    - 仕様参照: spec.md §7 Requirement 7, §8 実現方針(回転の駆動)
    - 検証コマンド: `cd frontend && npm run lint`
  - [x] 3.4 点群の描画(奥行き順・大きさと不透明度・トークンの解決)を作る
    _Requirements: 6.4, 6.5, 9.1, 9.2_
    _Boundary: Scatter3DPanel_
    _Depends: 3.3, 2.1_
    _Interfaces: Consumes `projectPoint(p: main.ScatterPoint, yaw: number, pitch: number, view: { width: number; height: number }): Projected` / `type Projected = { sx: number; sy: number; scale: number; depth: number }`_
    - 対象ファイル: `frontend/src/components/Scatter3DPanel.tsx`(変更)
    - 仕様参照: spec.md §7 Requirement 6.4・6.5・9, §6.5 デザイントークン, §8 実現方針(色の解決)
    - 検証コマンド: `cd frontend && npm run lint`, `grep -rn '#[0-9a-fA-F]\{3,8\}' --include="*.ts" --include="*.tsx" frontend/src`(色の直値が無いこと)

- [ ] 4. 画面への接続と検証手段の成立
  - [ ] 4.1 `page.tsx` の `Scatter 3D` 枠を `Scatter3DPanel` へ差し替える
    _Requirements: 10.1_
    _Boundary: page_
    _Depends: 3.4_
    _Interfaces: Consumes `Scatter3DPanel(): React.JSX.Element`_
    - 対象ファイル: `frontend/src/app/page.tsx`(変更)
    - 仕様参照: spec.md §2 スコープ(対象), §7 Requirement 10.1
    - 検証コマンド: `go vet ./...`, `go test ./...`, `cd frontend && npm run lint`, `wails build`
  - [ ] 4.2 目視でしか確かめられない受け入れ基準を、人間の再現手順つきで実装ノートへ積む
    _Requirements: 10.1_
    _Boundary: docs_
    _Depends: 4.1_
    _Interfaces: Consumes 4.1 までの実装(`wails dev` で起動できる状態)_
    - 対象ファイル: `docs/specs/001-dashboard-mvp/002-scatter3d-panel/tasks.md`(変更。`## Implementation Notes`)
    - 仕様参照: spec.md §3 前提 1・2・5, §7 Requirement 6.4・6.5・7.1・7.2・8.2・8.3・9.1
    - 検証コマンド: なし(文書のみ)

## Implementation Notes

### 進捗台帳

サブタスクとコミットの対応。次のセッションが現在地を再導出する手掛かりとして残す。

| サブタスク | コミット |
| :- | :- |
| 1.1 点群の型と不変条件の強制 | `1067605` |
| 1.2 `scatterSource` | `561ebfd` |
| 1.3 `App` への配線と `Snapshot` への搭載 | `8faa3f5` |
| 2.1 `projectPoint` | `4ba1f29` |
| 2.2 `subscribeScatter` | `35f58a4` |
| 3.1 `Scatter3DPanel` の骨格と購読 | `d189649` |
| 3.2 キャンバスの寸法の追随 | `076fd49` |
| 3.3 `requestAnimationFrame` の回転ループ | `ea66ea2` |
| 3.4 点群の描画(奥行き順・大きさと不透明度・トークンの解決) | (このコミット) |
