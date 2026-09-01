# graph-panels — 実装タスク

> 仕様の詳細は同じディレクトリの仕様文書 spec.md を参照する。
> このファイルには仕様を転記しない。

## Global Constraints

spec.md がこの作業単位の全体に掛ける制約を逐語で写す。全タスクの要件に暗黙に含まれる。

- **配置の算出(コミットのレーン割り当てとグラフのノード座標)は Go 側に置く。フロントエンドはモデル座標をキャンバス座標へ写す純関数だけを持つ。**(spec.md §3 前提 1)
- **コミットグラフは条件付きで再描画し、依存グラフは毎フレーム描画する。**(spec.md §3 前提 2)
- **依存グラフのノード集合は固定(10 ノード)とし、エッジだけを増減させる。**(spec.md §3 前提 3)
- **ノードの配置は円環上の錨からのドリフトで作り、力学モデルを実装しない。**(spec.md §3 前提 4)
- **2 パネルとも Canvas 2D の 2 次元 API へ自前で描く。可視化ライブラリを使わない。**(spec.md §3 前提 5)
- **キャンバスへ渡す色は `globals.css` の `@theme` トークンを実行時に解決して得る。新しいトークンは追加しない。**(spec.md §3 前提 6)
- **画面の見え方に依存する受け入れ基準は、実装するが本セッションでは検証しない。**(spec.md §3 前提 7)
- **乱数は `math/rand`(v1)を使う。**(spec.md §3 前提 8)
- **パネルごとに独立した `requestAnimationFrame` のループを持つ。**(spec.md §3 前提 9)
- **可視化ライブラリ(d3・cytoscape・vis-network 等)の導入**をしない(spec.md §2 対象外)
- **力学モデル(force-directed layout)によるノード配置**をしない(spec.md §2 対象外)
- **実在の git リポジトリの読み取り**をしない(spec.md §2 対象外)
- **マウス操作によるノードの選択・移動・ズーム・コミットの展開**をしない(spec.md §2 対象外)
- **`requestAnimationFrame` ループの 6 パネル共有化**をしない(spec.md §2 対象外)
- **残り 2 パネル(折れ線グラフ・タコメータ)の実装と 6 パネル同時稼働の最終調整**をしない(spec.md §2 対象外)
- **描画結果の自動視覚検証(ブラウザ自動化・スクリーンショット比較)**をしない(spec.md §2 対象外)
- **`main.go` の `BackgroundColour` に残るテンプレート由来の直値の是正**をしない(spec.md §2 対象外)
- unit #2 が作った `drift` / `clampUnit` / `symmetricUniform` を再利用し、同じ計算を書き直さない(spec.md §8)
- 会話・ドキュメント・コード内コメント・PR/Issue 本文・コミットメッセージは日本語で記述する。画面に描画するラベルは英語にする(`CLAUDE.md` 言語規約)
- `any` を使わない。型が定まらない箇所は `unknown` で受けて絞り込む(`CLAUDE.md`)
- 再描画のたびに新しい関数・オブジェクトを作らない(`CLAUDE.md`)
- インターフェースは実装側ではなく利用側のパッケージで定義する(`CLAUDE.md`)
- Wails が生成するバインディング(`frontend/wailsjs/`)は手で編集しない(`CLAUDE.md`)
- `frontend/dist` と `frontend/wailsjs` は `wails build` の生成物であり、リポジトリに含めない(`CLAUDE.md`)

## File Structure Plan

| ファイルパス                                          | 区分 | 責務                                                                     |
| ----------------------------------------------------- | ---- | ------------------------------------------------------------------------ |
| `commit.go`                                           | 新規 | `Commit` の型定義と、不変条件を強制する `newCommit`                        |
| `commit_test.go`                                      | 新規 | `newCommit` の不変条件と error 識別のテスト                                |
| `commitsource.go`                                     | 新規 | `feed.Source` を満たす擬似コミット履歴の生成器 `commitSource`               |
| `commitsource_test.go`                                | 新規 | `commitSource` の契約・分岐とマージの発生・並行安全のテスト                 |
| `graphnode.go`                                        | 新規 | `GraphNode`・`GraphEdge`・`DependencyGraph` の型と生成関数                  |
| `graphnode_test.go`                                   | 新規 | `newGraphNode` / `newGraphEdge` の不変条件と error 識別のテスト             |
| `graphsource.go`                                      | 新規 | `feed.Source` を満たす擬似依存関係の生成器 `graphSource`                    |
| `graphsource_test.go`                                 | 新規 | `graphSource` の契約・グラフの不変条件・時間変化・並行安全のテスト          |
| `snapshot.go`                                         | 変更 | `DashboardSnapshot` へ `Commits`・`Graph` フィールドを足す                  |
| `app.go`                                              | 変更 | 2 つの生成器を `App` に持たせ `Runner` へ登録し、`Snapshot` へ載せる         |
| `app_test.go`                                         | 変更 | `Snapshot` のコミット・グラフに関する事後条件のテスト                       |
| `frontend/src/lib/feed.ts`                            | 変更 | `subscribeCommits`・`subscribeGraph` を足す                                 |
| `frontend/src/lib/commitgraph.ts`                     | 新規 | コミットグラフの行と列の配置を写す純関数                                    |
| `frontend/src/lib/depgraph.ts`                        | 新規 | 依存グラフのノード配置を写す純関数と `lerp`                                 |
| `frontend/src/components/CommitGraphPanel.tsx`        | 新規 | Canvas 2D によるコミットグラフの描画・条件付き再描画・寸法追随              |
| `frontend/src/components/DependencyGraphPanel.tsx`    | 新規 | Canvas 2D による依存グラフの描画・補間・寸法追随                            |
| `frontend/src/app/page.tsx`                           | 変更 | `Commit Graph` / `Dependency Graph` 枠を `pending` から各パネルへ差し替える  |

削除対象は無い。`globals.css` は変更しない(新しいトークンを追加しないため)。

## タスク一覧

- [ ] 1. Go 側のコミット履歴の契約と生成器
  - [x] 1.1 `Commit` の型と不変条件の強制を作る
    _Requirements: 2.1, 2.2, 2.3, 2.6_
    _Boundary: Commit_
    _Interfaces: Produces `Commit{Seq uint64; ID string; Lane int; Parents []uint64; Branch, Summary string}` / `newCommit(seq uint64, id string, lane int, parents []uint64, branch, summary string) (Commit, error)` / `errCommitSeqZero` / `errCommitIDFormat` / `errCommitLaneRange` / `errCommitParents` / `errCommitTextEmpty` / `errCommitTextNewline` / `commitMaxLanes = 4`_
    - 対象ファイル: `commit.go`(新規), `commit_test.go`(新規)
    - 仕様参照: spec.md §6.1 `Commit`, §7 Requirement 2
    - 検証コマンド: `go vet ./...`, `go test ./...`
  - [x] 1.2 `commitSource` を作り `feed.Source` を構造的に満たす
    _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4, 3.5, 12.2_
    _Boundary: commitSource_
    _Depends: 1.1_
    _Interfaces: Consumes `newCommit(...) (Commit, error)` / `commitMaxLanes` / Produces `newCommitSource(capacity int, rnd *rand.Rand) *commitSource` / `(*commitSource) EventName() string` / `(*commitSource) Interval() time.Duration` / `(*commitSource) Next() any` / `(*commitSource) Snapshot() []Commit` / `commitEventName = "nullops:commit"` / `commitInterval = 1500ms` / `appCommitCapacity = 120`_
    - 対象ファイル: `commitsource.go`(新規), `commitsource_test.go`(新規)
    - 仕様参照: spec.md §5.1 `commitSource`, §6.2 内部状態, §7 Requirement 1・2.4・2.5・3
    - 検証コマンド: `go vet ./...`, `go test ./...`, `go test -race ./...`

- [ ] 2. Go 側の依存グラフの契約と生成器
  - [x] 2.1 `GraphNode`・`GraphEdge`・`DependencyGraph` の型と不変条件の強制を作る
    _Requirements: 5.1, 5.2, 5.3, 5.4_
    _Boundary: GraphNode_
    _Interfaces: Produces `GraphNode{ID string; X, Y, Load float64; Health string}` / `GraphEdge{From, To string; Flow float64}` / `DependencyGraph{Seq uint64; Nodes []GraphNode; Edges []GraphEdge}` / `newGraphNode(id string, x, y, load float64, health string) (GraphNode, error)` / `newGraphEdge(from, to string, flow float64) (GraphEdge, error)` / `HealthOK` / `HealthWarn` / `HealthDown` / `errGraphNodeIDEmpty` / `errGraphValueOutOfRange` / `errGraphValueNotFinite` / `errGraphHealthUnknown` / `errGraphEdgeEndpoints`_
    - 対象ファイル: `graphnode.go`(新規), `graphnode_test.go`(新規)
    - 仕様参照: spec.md §6.3 `GraphNode`, §6.4 `GraphEdge`, §6.5 `DependencyGraph`, §7 Requirement 5.1〜5.4
    - 検証コマンド: `go vet ./...`, `go test ./...`
  - [ ] 2.2 `graphSource` を作り `feed.Source` を構造的に満たす
    _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 5.5, 5.6, 6.1, 6.2, 6.3, 6.4, 6.5, 12.2, 12.3_
    _Boundary: graphSource_
    _Depends: 2.1_
    _Interfaces: Consumes `newGraphNode(...)` / `newGraphEdge(...)` / `DependencyGraph` / `drift(rnd *rand.Rand, current, target, pull, jitter float64) float64` / `clampUnit(v float64) float64`(いずれも unit #2 が `scattersource.go` に置いた既存関数) / Produces `newGraphSource(rnd *rand.Rand) *graphSource` / `(*graphSource) EventName() string` / `(*graphSource) Interval() time.Duration` / `(*graphSource) Next() any` / `(*graphSource) Snapshot() DependencyGraph` / `graphEventName = "nullops:graph"` / `graphInterval = 1000ms` / `graphNodeCount = 10`_
    - 対象ファイル: `graphsource.go`(新規), `graphsource_test.go`(新規)
    - 仕様参照: spec.md §5.2 `graphSource`, §6.6 内部状態, §7 Requirement 4・5.5・5.6・6
    - 検証コマンド: `go vet ./...`, `go test ./...`, `go test -race ./...`

- [ ] 3. `App` への配線
  - [ ] 3.1 2 つの生成器を `App` へ配線し `Snapshot` に載せる
    _Requirements: 7.1, 7.2, 7.3, 7.4, 12.1_
    _Boundary: App_
    _Depends: 1.2, 2.2_
    _Interfaces: Consumes `newCommitSource(capacity int, rnd *rand.Rand) *commitSource` / `newGraphSource(rnd *rand.Rand) *graphSource` / `(*commitSource) Snapshot() []Commit` / `(*graphSource) Snapshot() DependencyGraph` / Produces `DashboardSnapshot{Log []LogLine; Scatter ScatterCloud; Commits []Commit; Graph DependencyGraph}` / イベント `nullops:commit`(payload は `[]Commit` 長さ 1) / イベント `nullops:graph`(payload は `DependencyGraph` 1 個)_
    - 対象ファイル: `app.go`(変更), `snapshot.go`(変更), `app_test.go`(変更)
    - 仕様参照: spec.md §5.3 `App.Snapshot`, §5.4 送信イベント, §6.7 `DashboardSnapshot`, §7 Requirement 7
    - 検証コマンド: `go vet ./...`, `go test ./...`, `wails build`

- [ ] 4. フロントエンドの購読と配置の純関数(Go 側の契約に依存する薄い層)
  - [ ] 4.1 `subscribeCommits`・`subscribeGraph` を `feed.ts` へ足す
    _Requirements: 8.6_
    _Boundary: feed_
    _Depends: 3.1_
    _Interfaces: Consumes イベント `nullops:commit` / `nullops:graph` / `main.Commit` / `main.DependencyGraph`(`frontend/wailsjs/go/models.ts`。`wails build` が生成) / Produces `subscribeCommits(onBatch: (commits: main.Commit[]) => void): () => void` / `subscribeGraph(onGraph: (graph: main.DependencyGraph) => void): () => void`_
    - 対象ファイル: `frontend/src/lib/feed.ts`(変更)
    - 仕様参照: spec.md §5.5 フロントエンドの購読, §7 Requirement 8.6
    - 検証コマンド: `cd frontend && npm run lint`, `cd frontend && npx tsc --noEmit`
  - [ ] 4.2 コミットグラフの配置の純関数を作る
    _Requirements: 9.1, 9.2_
    _Boundary: commitgraph_
    _Depends: 3.1_
    _Interfaces: Produces `type CommitRowLayout = { rowHeight: number; laneStep: number; laneOriginX: number; textOriginX: number }` / `commitRowLayout(view: { width: number; height: number }, laneCount: number): CommitRowLayout` / `commitRowY(index: number, layout: CommitRowLayout): number` / `commitLaneX(lane: number, layout: CommitRowLayout): number` / `visibleCommitCount(view: { width: number; height: number }, layout: CommitRowLayout): number`_
    - 対象ファイル: `frontend/src/lib/commitgraph.ts`(新規)
    - 仕様参照: spec.md §5.8 コミットグラフの配置関数, §7 Requirement 9.1・9.2
    - 検証コマンド: `cd frontend && npm run lint`, `cd frontend && npx tsc --noEmit`
  - [ ] 4.3 依存グラフの配置の純関数と `lerp` を作る
    _Requirements: 10.1, 10.2, 10.3_
    _Boundary: depgraph_
    _Depends: 3.1_
    _Interfaces: Produces `type NodePlacement = { cx: number; cy: number; radius: number }` / `placeNode(x: number, y: number, load: number, view: { width: number; height: number }): NodePlacement` / `lerp(a: number, b: number, t: number): number`_
    - 対象ファイル: `frontend/src/lib/depgraph.ts`(新規)
    - 仕様参照: spec.md §5.9 依存グラフの配置関数, §7 Requirement 10.1・10.2・10.3
    - 検証コマンド: `cd frontend && npm run lint`, `cd frontend && npx tsc --noEmit`

- [ ] 5. `CommitGraphPanel` の描画
  - [ ] 5.1 パネルの骨格・購読とスナップショットの併合・寸法追随を作る
    _Requirements: 8.1, 8.2, 8.4, 8.5, 11.1, 11.2, 11.3, 11.7_
    _Boundary: CommitGraphPanel_
    _Depends: 4.1_
    _Interfaces: Consumes `subscribeCommits(onBatch: (commits: main.Commit[]) => void): () => void` / `loadSnapshot(): Promise<main.DashboardSnapshot>` / Produces `CommitGraphPanel(): React.JSX.Element`_
    - 対象ファイル: `frontend/src/components/CommitGraphPanel.tsx`(新規)
    - 仕様参照: spec.md §5.6 `CommitGraphPanel`, §7 Requirement 8.1・8.2・8.4・8.5・11.1・11.2・11.3・11.7
    - 検証コマンド: `cd frontend && npm run lint`, `cd frontend && npx tsc --noEmit`
  - [ ] 5.2 コミットグラフの描画(レーンの点と親への線・ブランチ名と要約・条件付き再描画)を作る
    _Requirements: 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 11.4, 11.5, 11.6_
    _Boundary: CommitGraphPanel_
    _Depends: 5.1, 4.2_
    _Interfaces: Consumes `commitRowLayout(...)` / `commitRowY(...)` / `commitLaneX(...)` / `visibleCommitCount(...)` / `type CommitRowLayout`_
    - 対象ファイル: `frontend/src/components/CommitGraphPanel.tsx`(変更)
    - 仕様参照: spec.md §7 Requirement 9・11.4〜11.6, §6.8 デザイントークン, §8 実現方針(色の解決・再描画の駆動)
    - 検証コマンド: `cd frontend && npm run lint`, `cd frontend && npx tsc --noEmit`, `grep -rn '#[0-9a-fA-F]\{3,8\}' --include="*.ts" --include="*.tsx" frontend/src`(色の直値が無いこと)

- [ ] 6. `DependencyGraphPanel` の描画
  - [ ] 6.1 パネルの骨格・購読とスナップショットの併合・寸法追随を作る
    _Requirements: 8.1, 8.3, 8.4, 8.5, 11.1, 11.2, 11.3, 11.7_
    _Boundary: DependencyGraphPanel_
    _Depends: 4.1_
    _Interfaces: Consumes `subscribeGraph(onGraph: (graph: main.DependencyGraph) => void): () => void` / `loadSnapshot(): Promise<main.DashboardSnapshot>` / Produces `DependencyGraphPanel(): React.JSX.Element`_
    - 対象ファイル: `frontend/src/components/DependencyGraphPanel.tsx`(新規)
    - 仕様参照: spec.md §5.7 `DependencyGraphPanel`, §7 Requirement 8.1・8.3・8.4・8.5・11.1・11.2・11.3・11.7
    - 検証コマンド: `cd frontend && npm run lint`, `cd frontend && npx tsc --noEmit`
  - [ ] 6.2 依存グラフの描画(エッジとノード・健康状態の色・座標の補間)を作る
    _Requirements: 10.4, 10.5, 10.6, 10.7, 10.8, 10.9, 11.4, 11.5, 11.6_
    _Boundary: DependencyGraphPanel_
    _Depends: 6.1, 4.3_
    _Interfaces: Consumes `placeNode(x, y, load, view): NodePlacement` / `lerp(a, b, t): number` / `type NodePlacement`_
    - 対象ファイル: `frontend/src/components/DependencyGraphPanel.tsx`(変更)
    - 仕様参照: spec.md §7 Requirement 10・11.4〜11.6, §6.8 デザイントークン, §8 実現方針(色の解決・再描画の駆動)
    - 検証コマンド: `cd frontend && npm run lint`, `cd frontend && npx tsc --noEmit`, `grep -rn '#[0-9a-fA-F]\{3,8\}' --include="*.ts" --include="*.tsx" frontend/src`(色の直値が無いこと)

- [ ] 7. 画面への接続と検証手段の成立
  - [ ] 7.1 `page.tsx` の 2 枠を各パネルへ差し替える
    _Requirements: 12.1, 12.4_
    _Boundary: page_
    _Depends: 5.2, 6.2_
    _Interfaces: Consumes `CommitGraphPanel(): React.JSX.Element` / `DependencyGraphPanel(): React.JSX.Element`_
    - 対象ファイル: `frontend/src/app/page.tsx`(変更)
    - 仕様参照: spec.md §2 スコープ(対象), §7 Requirement 12.1・12.4
    - 検証コマンド: `go vet ./...`, `go test ./...`, `cd frontend && npm run lint`, `wails build`, `git diff --stat frontend/package.json`(依存が増えていないこと)
  - [ ] 7.2 目視でしか確かめられない受け入れ基準を、人間の再現手順つきで実装ノートへ積む
    _Requirements: 12.1_
    _Boundary: docs_
    _Depends: 7.1_
    _Interfaces: Consumes 7.1 までの実装(`wails dev` で起動できる状態)_
    - 対象ファイル: `docs/specs/001-dashboard-mvp/003-graph-panels/tasks.md`(変更。`## Implementation Notes`)
    - 仕様参照: spec.md §3 前提 2・4・5・7, §7 Requirement 9.3〜9.6・10.4〜10.6・11.2〜11.5
    - 検証コマンド: なし(文書のみ)

## 受け入れ基準の前方トレース

spec.md §7 の全受け入れ基準が、いずれかのタスクから参照されていることを確認する。

| Requirement | 基準 | 参照タスク |
| :- | :- | :- |
| 1 コミット履歴の生成器の契約 | 1.1〜1.8 | 1.2 |
| 2 コミットの不変条件とレーン | 2.1, 2.2, 2.3, 2.6 | 1.1 |
| | 2.4, 2.5 | 1.2 |
| 3 分岐とマージの発生 | 3.1〜3.5 | 1.2 |
| 4 依存グラフの生成器の契約 | 4.1〜4.6 | 2.2 |
| 5 グラフの不変条件 | 5.1〜5.4 | 2.1 |
| | 5.5, 5.6 | 2.2 |
| 6 グラフの時間変化 | 6.1〜6.5 | 2.2 |
| 7 起動直後の初期表示 | 7.1〜7.4 | 3.1 |
| 8 購読と初期表示の併合 | 8.1, 8.4, 8.5 | 5.1, 6.1 |
| | 8.2 | 5.1 |
| | 8.3 | 6.1 |
| | 8.6 | 4.1 |
| 9 コミットグラフの描画 | 9.1, 9.2 | 4.2 |
| | 9.3〜9.8 | 5.2 |
| 10 依存グラフの描画と補間 | 10.1, 10.2, 10.3 | 4.3 |
| | 10.4〜10.9 | 6.2 |
| 11 描画領域への追随とトークン | 11.1, 11.2, 11.3, 11.7 | 5.1, 6.1 |
| | 11.4, 11.5, 11.6 | 5.2, 6.2 |
| 12 検証手段の成立 | 12.1 | 3.1, 7.1, 7.2 |
| | 12.2 | 1.2, 2.2 |
| | 12.3 | 2.2 |
| | 12.4 | 7.1 |

漏れは無い。

## Implementation Notes

### 進捗台帳

サブタスクとコミットの対応。次のセッションが現在地を再導出する手掛かりとして残す。

| サブタスク | コミット |
| :- | :- |
| 1.1 `Commit` の型と不変条件の強制 | `038e9c6` |
| 1.2 `commitSource` | `d8509e7` |
| 2.1 グラフの型と不変条件の強制 | `8f825e5` |
