# graph-panels — 仕様

## 1. 目的と背景

roadmap `001-dashboard-mvp` の unit #3。ダッシュボードの 6 枠のうち `Commit Graph` と `Dependency Graph` の 2 枠は現在 `pending` のプレースホルダである。ここに分岐とマージを含む擬似コミット履歴と、ノードとエッジの擬似依存関係を描画する。

この unit を #4 より前に置いた理由は「コミットグラフとグラフビューがノード・エッジの配置算出という共通の難所を持つ」ことにあった(roadmap §1)。本 unit はその配置算出をどこへ置くかを §3 前提 1 で決め、両パネルで同じ流儀に揃える。

描画手段は unit #2 と同じ **Canvas 2D による自前描画**とし、d3・cytoscape・vis-network 等の可視化ライブラリを導入しない(§3 前提 5。依頼者の委任を受けて決定済み)。擬似データの生成は unit #1 が作った `feed.Source` の拡張点に乗せ、Go 側に置く(roadmap 前提・`CLAUDE.md` 注意事項)。

## 2. スコープ

### 対象(やること)

- Go 側の擬似コミット履歴の生成器 `commitSource`(`feed.Source` の実装)と、その `Runner` への登録。
- Go 側の擬似依存関係の生成器 `graphSource`(`feed.Source` の実装)と、その `Runner` への登録。
- 交換形式 `Commit` / `GraphNode` / `GraphEdge` / `DependencyGraph` と、その不変条件を強制する生成関数。
- コミットのレーン(描画の列)割り当てと、グラフのノード座標の算出。いずれも Go 側に置く(§3 前提 1)。
- `DashboardSnapshot` への 2 フィールドの追加(起動直後の初期表示)。
- フロントエンドの購読関数 2 本と、配置をキャンバス座標へ写す純関数。
- `CommitGraphPanel` と `DependencyGraphPanel`(いずれも Canvas 2D)。
- `page.tsx` の `Commit Graph` / `Dependency Graph` 枠を `pending` から各パネルへ差し替える。

### 対象外(やらないこと)

- **可視化ライブラリ(d3・cytoscape・vis-network 等)の導入** — 理由: 依頼者の委任を受けて Canvas 2D の自前描画に決定済み(§3 前提 5)。依存を増やさず、unit #2 が確立した規律をそのまま使う。
- **力学モデル(force-directed layout)によるノード配置** — 理由: 反復計算とパラメータ調整を要し、擬似データを見せるという目的に対して複雑すぎる(§3 前提 4)。`CLAUDE.md`「過度な抽象化を避ける」。
- **実在の git リポジトリの読み取り** — 理由: 画面に出る値はすべてこのアプリが生成した擬似データとする(`CLAUDE.md` 注意事項)。
- **マウス操作によるノードの選択・移動・ズーム・コミットの展開** — 理由: roadmap のスコープ外(「設定 UI」に類する対話機能)。完了条件は描画と変化の継続のみを求める。
- **`requestAnimationFrame` ループの 6 パネル共有化** — 理由: unit #2 からの申し送りにより、同時稼働の調整は unit #4 に委ねる。#3 では #2 と同じくパネルごとに独立したループを持つ(§3 前提 9)。
- **残り 2 パネル(折れ線グラフ・タコメータ)の実装と 6 パネル同時稼働の最終調整** — 理由: unit #4 の範囲。
- **描画結果の自動視覚検証(ブラウザ自動化・スクリーンショット比較)** — 理由: roadmap スコープ外。加えて本ホストは画面収録権限を持たず `screencapture` が失敗するため、目視に相当する検証を機械で代替できない(§3 前提 7)。
- **`main.go` の `BackgroundColour` に残るテンプレート由来の直値の是正** — 理由: unit #1 からの申し送りであり、扱いを別途決めると依頼者が判断済み。

## 3. 前提(未検証の賭け)

1. **配置の算出(コミットのレーン割り当てとグラフのノード座標)は Go 側に置く。フロントエンドはモデル座標をキャンバス座標へ写す純関数だけを持つ。** — 依頼者が「どちらに置くかは仕様化で決めてよい」と委任した項目であり、本仕様で Go 側と決めた。理由は 3 つある。(a) コミットのレーンは履歴の生成と不可分である。生成器は分岐とマージを起こす瞬間を知っており、そこでレーンを確定させれば以後そのコミットのレーンは動かない。フロントエンドで再計算すると、新しいコミットが届くたびに既存コミットのレーンが変わりうる(画面が跳ねる)。(b) 配置は擬似データそのものであり、「画面に出る値はすべてこのアプリが生成した擬似データとする」(`CLAUDE.md` 注意事項)の対象である。unit #2 が点群のモデル座標を Go 側に置いた前例にも揃う。(c) 本リポジトリにはフロントエンドのテストの仕組みが無く(unit #1・#2 とも TypeScript のテストは 0 件)、検証は lint と目視に限られる。レーンが重ならない・座標が単位正方形に収まるといった不変条件を `go test` で押さえられる側へ置く。検証方法: Requirement 2・5 のテスト / 状態: テストで検証する。
2. **コミットグラフは条件付きで再描画し、依存グラフは毎フレーム描画する。** — コミットグラフは静止した図であり、内容が変わらないフレームで描き直しても画は同じで、6 パネル同時稼働時の負荷だけが増える。依存グラフはノードが漂う図であり、毎秒 1 回の更新をそのまま描くとカクついて見えるため、前フレームと現フレームの座標を線形に補間して毎フレーム描く。検証方法: 動きの滑らかさを人間が目視する / 状態: 未検証。
3. **依存グラフのノード集合は固定(10 ノード)とし、エッジだけを増減させる。** — ノードを増減させると配置の錨(§6.6)が毎回変わり、図が落ち着かない。roadmap の完了条件「ノード・エッジの増減または個々のノードの表示状態の変化が 1 回以上」は、エッジの増減とノードの健康状態の変化で満たす。検証方法: Requirement 6 のテスト / 状態: テストで検証する。
4. **ノードの配置は円環上の錨からのドリフトで作り、力学モデルを実装しない。** — 円環に置けばエッジが中央を横切って読める図になり、反復計算もパラメータ調整も要らない。unit #2 の点群がクラスタ中心への引き戻しで塊を保ったのと同じ手口である。検証方法: 図が読めることを人間が目視する / 状態: 未検証。
5. **2 パネルとも Canvas 2D の 2 次元 API へ自前で描く。可視化ライブラリを使わない。** — 依頼者の委任を受けて決定済み。unit #2 が確立した規律(`requestAnimationFrame` のループ・`getComputedStyle` によるトークンの実行時解決・配置の計算を純関数へ分離)をそのまま再利用でき、依存を増やさないことで静的エクスポートへの取り込みと WebView 上での動作の不確実性を増やさない。検証方法: `wails dev` の画面を人間が目視する / 状態: 未検証。
6. **キャンバスへ渡す色は `globals.css` の `@theme` トークンを実行時に解決して得る。新しいトークンは追加しない。** — Canvas 2D は CSS クラスを解釈せず色文字列を要求するため、`.tsx` に色の直値を書かずにトークンへ従う手段が `getComputedStyle` による解決に限られる(unit #2 の前提 4 と同じ)。レーンごと・健康状態ごとの色は既存トークンの使い分けと不透明度で表す。検証方法: Requirement 11 / 状態: 未検証(実行時解決の成否は目視と手動確認による)。
7. **画面の見え方に依存する受け入れ基準は、実装するが本セッションでは検証しない。** — 本ホストはターミナルへ macOS の画面収録権限が無く、`screencapture` が sandbox の内外いずれでも失敗する。該当項目は未検証として実装ノートへ再現手順つきで積み、人間が目視で確認する(依頼者が承認済み)。検証方法: 人間による目視 / 状態: 未検証。
8. **乱数は `math/rand`(v1)を使う。** — `math/rand/v2` は `wails build` のバインディング生成が `internal error: package "math/rand/v2" without types was imported from "nullops"` で落ちる(unit #1 の実測)。検証方法: `wails build` の成功 / 状態: unit #1・#2 で検証済み。
9. **パネルごとに独立した `requestAnimationFrame` のループを持つ。** — unit #2 からの申し送りであり、ループを共有すべきかの判断は unit #4 の同時稼働の調整に委ねる。#3 で先回りして共有機構を作らない。検証方法: なし(構造の方針) / 状態: 判断済み。

## 4. 用語定義

| 用語 | 定義 |
| ---- | ---- |
| レーン(lane) | コミットグラフの縦の列。0 が主線(`main`)で、分岐は 1 以上のレーンへ載る |
| 先端(tip) | あるレーンで最後に積まれたコミット |
| 分岐(branch) | 空きレーンを取り、主線の先端を親として新しいコミットを置くこと |
| マージ(merge) | 主線と非主線の 2 つの先端を親とするコミットを主線へ置き、非主線のレーンを空けること |
| モデル座標 | Go が供給する配置の座標。依存グラフでは各軸 -1.0〜1.0 の正方形に収まる |
| 錨(anchor) | 依存グラフの各ノードが漂う中心。円環上に等間隔で置く |
| 補間(interpolation) | 直前のフレームと現フレームのノード座標を、経過時間の比で混ぜること |

## 5. 公開インターフェース(API)

### 5.1. `commitSource`(Go・`main` パッケージ・非公開型)

unit #1 の `logSource`・unit #2 の `scatterSource` と同じく `feed.Source` を構造的に満たす。`feed` を import しない(依存が逆向きになるため)。

- **定義**:
  ```go
  func newCommitSource(capacity int, rnd *rand.Rand) *commitSource
  func (s *commitSource) EventName() string
  func (s *commitSource) Interval() time.Duration
  func (s *commitSource) Next() any        // []Commit(長さ 1)を返す
  func (s *commitSource) Snapshot() []Commit
  ```
- **入力 / 出力**: `newCommitSource` は保持件数の上限と専用の `*rand.Rand` を受ける。`Next` は長さ 1 の `[]Commit` を返す(`logSource` と同じ差分イベントの形)。`Snapshot` は保持している全コミットを古い順に返す。
- **事前条件**: `capacity` が 1 以上、`rnd` が nil でない。`rnd` は `commitSource` 専用のインスタンスであること(`*rand.Rand` は並行安全でなく、他の生成器と共有すると互いの mutex で保護されない)。
- **事後条件**: `EventName` はプロセスの生存期間中つねに `"nullops:commit"` を返す。`Interval` はつねに `commitInterval`(1500 ms)を返す。`Next` の戻り値の要素は §6.1 の不変条件を満たす。`Next` と `Snapshot` は並行に呼ばれても壊れない(内部の mutex で守る)。`Snapshot` は内部状態を変化させず、内部と別の配列を返す。
- **エラー**: 返さない。`feed.Source` は error 経路を持たないため、事前条件違反は `panic`(プログラマの誤り)、不変条件違反は生成関数が返した error を握らず `panic` する(unit #1 の `logSource.Next` と同じ規律)。

### 5.2. `graphSource`(Go・`main` パッケージ・非公開型)

- **定義**:
  ```go
  func newGraphSource(rnd *rand.Rand) *graphSource
  func (s *graphSource) EventName() string
  func (s *graphSource) Interval() time.Duration
  func (s *graphSource) Next() any        // DependencyGraph を返す
  func (s *graphSource) Snapshot() DependencyGraph
  ```
- **入力 / 出力**: `newGraphSource` は専用の `*rand.Rand` を受ける。ノード集合は固定(§3 前提 3)であり、個数を引数で受けない。`Next` は `DependencyGraph`(値)を返す。`Snapshot` は最後に生成したグラフの複製を返す。
- **事前条件**: `rnd` が nil でない。`commitSource`・`scatterSource`・`logSource`・`scenario` のいずれとも `*rand.Rand` を共有しないこと。
- **事後条件**: `EventName` はつねに `"nullops:graph"` を返す。`Interval` はつねに `graphInterval`(1000 ms)を返す。`Next` の戻り値は §6.5 の不変条件を満たす。`Next` と `Snapshot` は並行に呼ばれても壊れない。`Snapshot` は内部状態を変化させない。
- **エラー**: 返さない(`commitSource` と同じ規律)。

### 5.3. `App.Snapshot`(Wails のバインディングメソッド・既存の拡張)

- **定義**: `func (a *App) Snapshot() DashboardSnapshot`(シグネチャは変えない)
- **事後条件の追加**: 戻り値の `Commits` と `Graph` が §6.7 の不変条件を満たす。`startup` を経ずに呼ばれた場合は `Commits` が長さ 0 の非 nil スライス、`Graph` が `Seq` 0・`Nodes` と `Edges` が長さ 0 の非 nil スライスである値になる(バインディングは事前条件を持たない)。呼び出しで内部状態は変化しない。
- **エラー**: 返さない(既存の契約を維持する)。

### 5.4. 送信イベント(Go → フロントエンド)

- **定義**: イベント名 `nullops:commit`。payload は `[]Commit`(長さ 1)。イベント名 `nullops:graph`。payload は `DependencyGraph` 1 個。
- **事後条件**: 前者は 1500 ms ごと、後者は 1000 ms ごとに 1 回送出される。購読者が居なければ捨てられる(到達保証は無い。`feed.Emitter` の契約)。アプリ終了時、`Runner` のキャンセル後に新たな送出を開始しない。

### 5.5. フロントエンドの購読(TypeScript・`frontend/src/lib/feed.ts` の拡張)

- **定義**:
  ```ts
  export function subscribeCommits(onBatch: (commits: main.Commit[]) => void): () => void;
  export function subscribeGraph(onGraph: (graph: main.DependencyGraph) => void): () => void;
  ```
- **事後条件**: 戻り値を呼ぶとその購読だけが解除される(イベント名に紐づく全リスナーを外す API を使わない。他パネルの購読を切らないため)。
- **エラー**: 例外を投げない。payload が期待の形でない場合はコールバックを呼ばず `console.error` に留める(擬似ダッシュボードに本物のエラーを表示しない。unit #1 spec §8 と同じ規律)。

### 5.6. `CommitGraphPanel`(TypeScript・React コンポーネント)

- **定義**: `export function CommitGraphPanel(): React.JSX.Element`。ファイル先頭に `'use client'` を置く(`DashboardGrid` と `page.tsx` へ広げない)。
- **入力 / 出力**: props を取らない。`Panel` の本文領域を満たす `<canvas>` を 1 枚描画する。
- **事前条件**: `Panel` の本文領域(大きさの決まる要素)の内側でマウントされること。
- **事後条件**: マウント中だけ購読と `requestAnimationFrame` のループを持ち、アンマウントで両方を解除する。描画は、表示対象の最新 `Seq` または描画領域の寸法が前フレームから変わったときにだけ行う(§3 前提 2)。
- **エラー**: 2D コンテキストを取得できない場合、例外を投げず `console.error` に留めて描画を行わない(枠は空のまま残る)。

### 5.7. `DependencyGraphPanel`(TypeScript・React コンポーネント)

- **定義**: `export function DependencyGraphPanel(): React.JSX.Element`。ファイル先頭に `'use client'` を置く。
- **入力 / 出力**: props を取らない。`Panel` の本文領域を満たす `<canvas>` を 1 枚描画する。
- **事前条件**: `CommitGraphPanel` と同じ。
- **事後条件**: マウント中だけ購読と `requestAnimationFrame` のループを持ち、アンマウントで両方を解除する。毎フレーム、直前のグラフと最新のグラフのノード座標を補間して描く。
- **エラー**: `CommitGraphPanel` と同じ。

### 5.8. コミットグラフの配置関数(TypeScript・描画コンポーネントから分離)

配置の計算だけを純関数として切り出す(unit #2 の `projectPoint` と同じ規律)。

- **定義**:
  ```ts
  export type CommitRowLayout = { rowHeight: number; laneStep: number; laneOriginX: number; textOriginX: number };
  export function commitRowLayout(view: { width: number; height: number }, laneCount: number): CommitRowLayout;
  export function commitRowY(index: number, layout: CommitRowLayout): number;
  export function commitLaneX(lane: number, layout: CommitRowLayout): number;
  export function visibleCommitCount(view: { width: number; height: number }, layout: CommitRowLayout): number;
  ```
- **入力 / 出力**: 描画領域の寸法と使用中のレーン数から行と列の刻みを決め、行の添字(0 が最新・上端)とレーン番号をキャンバス座標へ写す。
- **事前条件**: `view.width`・`view.height` が 0 より大きい。`laneCount` が 1 以上。`index`・`lane` が 0 以上。
- **事後条件**: 同じ引数に対してつねに同じ値を返す(純関数)。`rowHeight`・`laneStep` はつねに 0 より大きい有限値。`visibleCommitCount` は 1 以上の整数。
- **エラー**: 返さない。

### 5.9. 依存グラフの配置関数(TypeScript・描画コンポーネントから分離)

- **定義**:
  ```ts
  export type NodePlacement = { cx: number; cy: number; radius: number };
  export function placeNode(
    x: number, y: number, load: number, view: { width: number; height: number },
  ): NodePlacement;
  export function lerp(a: number, b: number, t: number): number;
  ```
- **入力 / 出力**: モデル座標(各軸 -1〜1)と負荷を受け、キャンバス上の中心座標と半径を返す。`lerp` は補間の比 `t`(0〜1)で 2 値を混ぜる。
- **事前条件**: `view.width`・`view.height` が 0 より大きい。
- **事後条件**: 同じ引数に対してつねに同じ値を返す(純関数)。`radius` はつねに 0 より大きい有限値。モデル座標が単位正方形に収まる限り `cx`・`cy` は描画領域の内側の有限値になる。`lerp(a, b, 0) === a` かつ `lerp(a, b, 1) === b`。
- **エラー**: 返さない。

## 6. データ構造

### 6.1. `Commit`(Go)

```go
// Commit は擬似コミット履歴の 1 件。Lane は描画の列で、0 が主線。
type Commit struct {
    Seq     uint64   `json:"seq"`
    ID      string   `json:"id"`      // 7 桁の小文字 16 進(擬似ハッシュ)
    Lane    int      `json:"lane"`
    Parents []uint64 `json:"parents"` // 親コミットの Seq。0〜2 個
    Branch  string   `json:"branch"`
    Summary string   `json:"summary"` // 画面へ出す英語の 1 行要約
}
```

- **不変条件**: `Seq` は 1 以上。`ID` はちょうど 7 文字で、いずれも `0-9a-f`。`Lane` は 0 以上 `commitMaxLanes` 未満。`Parents` は nil でなく、長さ 0〜2 で、各要素は 1 以上 `Seq` 未満(未来のコミットを指さない)、かつ互いに重複しない。長さ 0 は `Seq` が 1(根)のときに限る。`Branch` は 1 文字以上で改行を含まない。`Summary` は 1 文字以上で改行を含まない。
- **強制**: 生成関数 `newCommit(seq uint64, id string, lane int, parents []uint64, branch, summary string) (Commit, error)` を通してのみ作る。違反は `errCommitSeqZero` / `errCommitIDFormat` / `errCommitLaneRange` / `errCommitParents` / `errCommitTextEmpty` / `errCommitTextNewline` を `errors.Is` で識別できる形で返す(unit #1 の `newLogLine` と同じ流儀)。
- **ロジックの所在**: レーンの割り当てと親の選択は `commitSource` の責務であり、`newCommit` は検査のみを行う。
- **注意**: `Parents` は呼び出し側のスライスを内部へ取り込まず複製する(生成後に外から書き換えられて不変条件が崩れるのを防ぐため)。

### 6.2. `commitSource` の内部状態(非公開)

- レーンごとの状態 `commitLane{active bool; branch string; tipSeq uint64; startSeq uint64}` の配列(長さ `commitMaxLanes` = 4)。レーン 0 は `main` として常時 `active`。
- 保持コミットのリングバッファ(`logSource` と同じ形。上限に達したら最古を上書きする)、`seq`、`capacity`、`rnd`。
- `Next` の 1 回で起きることは 3 通りのいずれか。
  - **分岐**: 空きレーンがあり、確率 `commitBranchChance` を引いたとき。空きレーンへブランチ名を割り当て、レーン 0 の先端 1 つを親とするコミットをそのレーンへ置く。
  - **マージ**: `active` な非 0 レーンがあり、そのレーンが `commitMinLaneLife` 件以上を経ており、確率 `commitMergeChance` を引いたとき。レーン 0 の先端とそのレーンの先端の 2 つを親とするコミットをレーン 0 へ置き、そのレーンを `active` でなくする。
  - **通常**: `active` なレーンから 1 つ選び、その先端 1 つを親とするコミットをそのレーンへ置く。
- 根(`seq` が 1)のときは無条件にレーン 0 へ親なしのコミットを置く。
- レーンの空きが無いときは分岐しない。これによりレーン番号は `commitMaxLanes` 未満に保たれる。

### 6.3. `GraphNode`(Go)

```go
// GraphNode は依存グラフの 1 ノード。座標はモデル座標(単位正方形)。
type GraphNode struct {
    ID     string  `json:"id"`     // 画面へ出す英語のサービス名。グラフ内で一意
    X      float64 `json:"x"`
    Y      float64 `json:"y"`
    Load   float64 `json:"load"`   // 0.0〜1.0。円の大きさに使う
    Health string  `json:"health"` // ok / warn / down
}
```

- **不変条件**: `ID` は 1 文字以上で改行を含まない。`X`・`Y` は -1.0 以上 1.0 以下。`Load` は 0.0 以上 1.0 以下。すべて有限値(NaN・Inf を含まない)。`Health` は `HealthOK` / `HealthWarn` / `HealthDown` のいずれか。
- **強制**: 生成関数 `newGraphNode(id string, x, y, load float64, health string) (GraphNode, error)` を通してのみ作る。違反は `errGraphNodeIDEmpty` / `errGraphValueOutOfRange` / `errGraphValueNotFinite` / `errGraphHealthUnknown` を `errors.Is` で識別できる形で返す。
- **`Health` を独自の型でなく `string` にする理由**: `Level` / `Phase` と同じく定義済みの値を定数で持つ形も採れるが、フロントエンドは色の対応表の鍵として文字列を読むだけであり、Go 側で型を足しても得るものが無い。定数(`HealthOK` など)と `graphHealthValid` による検査で不変条件は同じく保てる。

### 6.4. `GraphEdge`(Go)

```go
// GraphEdge はノード間の依存。From から To への向きを持つ。
type GraphEdge struct {
    From string  `json:"from"`
    To   string  `json:"to"`
    Flow float64 `json:"flow"` // 0.0〜1.0。線の太さと明度に使う
}
```

- **不変条件**: `From`・`To` は 1 文字以上で互いに異なる(自己ループを作らない)。`Flow` は 0.0 以上 1.0 以下の有限値。
- **強制**: 生成関数 `newGraphEdge(from, to string, flow float64) (GraphEdge, error)`。違反は `errGraphEdgeEndpoints` / `errGraphValueOutOfRange` / `errGraphValueNotFinite` を返す。
- **注意**: 端点が `Nodes` に実在するかの検査は 1 本の辺だけでは行えないため、`DependencyGraph` を組み立てる側(`graphSource`)の責務とし、Requirement 5.5 のテストで押さえる。

### 6.5. `DependencyGraph`(Go)

```go
// DependencyGraph は 1 フレーム分の擬似依存関係。
type DependencyGraph struct {
    Seq   uint64      `json:"seq"`
    Nodes []GraphNode `json:"nodes"`
    Edges []GraphEdge `json:"edges"`
}
```

- **不変条件**: `Nodes`・`Edges` はいずれも nil でない(JSON 化して `null` にしないため)。`Nodes` の `ID` は互いに重複しない。`Edges` の各端点は `Nodes` のいずれかの `ID` と一致する。同じ `(From, To)` の組は 1 本までとする。`Seq` は生成のたびに 1 から 1 ずつ増える。空のグラフ(`Snapshot` を `startup` 前に呼んだ場合)の `Seq` は 0 とする。
- **ロジックの所在**: ノードの漂わせ方・健康状態の遷移・エッジの増減は `graphSource` に集約する。`DependencyGraph` は値の運搬に徹する。
- **シリアライズ形式**: Wails のバインディング生成器が `frontend/wailsjs/go/models.ts` へ TypeScript 型として出力し、フロントエンドはそれをイベントハンドラでも使う。

### 6.6. `graphSource` の内部状態(非公開)

- ノードごとの状態 `graphNodeState{id string; anchorX, anchorY float64; x, y float64; load float64; health string}` の配列(長さ `graphNodeCount` = 10)。
- 錨は半径 `graphAnchorRadius`(0.72)の円環上へ等間隔に置く。円環にするのはエッジが中央を横切って読める図になるためであり、力学モデルを実装しないための手口である(§3 前提 4)。
- 生成のたびに、各ノードを錨へ引き戻しつつ小さな乱歩を加え、単位正方形へ切り詰める(unit #2 の `drift` / `clampUnit` をそのまま使う)。`Load` も同様にドリフトさせ 0〜1 へ切り詰める。
- `Health` は確率 `graphHealthChance` で遷移する。遷移は `ok → warn`、`warn → ok` または `warn → down`、`down → warn` に限る(`ok` と `down` を直接行き来させない。段階を踏むほうが画面で読み取りやすい)。
- エッジは 2 層で持つ。**基幹エッジ**は円環の隣接と少数の弦から成る固定の集合で、つねに存在する(グラフが断片化して図が読めなくなるのを防ぐ)。**揺らぎエッジ**は候補集合から確率で付け外しし、これが roadmap の完了条件「エッジの増減」を担う。
- `Seq` と最後に生成したグラフ。`Snapshot` はこの複製を返す。

### 6.7. `DashboardSnapshot`(Go・既存の拡張)

```go
type DashboardSnapshot struct {
    Log     []LogLine       `json:"log"`
    Scatter ScatterCloud    `json:"scatter"`
    Commits []Commit        `json:"commits"`
    Graph   DependencyGraph `json:"graph"`
}
```

- **不変条件**: 既存の `Log`・`Scatter` の不変条件を維持したまま 2 フィールドを足す。`Commits` は nil でない。`Graph.Nodes`・`Graph.Edges` は nil でない。

### 6.8. デザイントークン(CSS)

新しいトークンは追加しない(§3 前提 6)。`globals.css` の `@theme` が正本。

| 用途 | トークン |
| ---- | -------- |
| コミットグラフの主線(レーン 0)と点 | `--color-accent-commit` |
| コミットグラフの非主線レーン | `--color-accent-commit`(不透明度を下げて区別する) |
| コミットグラフのブランチ名・要約の文字 | `--color-text-dim` / `--color-text` |
| 依存グラフのエッジと `ok` のノード | `--color-accent-graph` |
| 依存グラフの `warn` のノード | `--color-level-warn` |
| 依存グラフの `down` のノード | `--color-level-error` |
| 依存グラフのノード名の文字 | `--color-text-dim` |
| 両パネルの背景 | `--color-surface-1` |

## 7. 振る舞い(受け入れ基準)

### Requirement 1: コミット履歴の生成器の契約

**対象**: §5.1 `commitSource`

**受け入れ基準**:
1.1. システムは、`commitSource.EventName()` の呼び出しに対してつねに `"nullops:commit"` を返さなければならない。(常時)
1.2. システムは、`commitSource.Interval()` の呼び出しに対してつねに 1500 ミリ秒を返さなければならない。(常時)
1.3. `Next` が呼ばれたとき、システムは長さ 1 の `[]Commit` を返さなければならない。(イベント)
1.4. `Next` が呼ばれたとき、システムは直前の戻り値より 1 だけ大きい `Seq` を持つコミットを返さなければならない。(イベント)
1.5. `capacity` が 1 未満、または `rnd` が nil の場合、システムは `newCommitSource` の呼び出しで panic しなければならない。(異常系)
1.6. `Next` と `Snapshot` が複数のゴルーチンから同時に呼ばれている間、システムはデータ競合を起こしてはならない(`go test -race` で検出されない)。(常時)
1.7. `Next` を `capacity` より多く呼び出したとき、システムは `Snapshot` が返す件数を `capacity` 以下に保たなければならない。(状態)
1.8. `Snapshot` が呼ばれたとき、システムはコミットを古い順(`Seq` の昇順)に並べた、内部と別の配列を返さなければならない。(イベント)

### Requirement 2: コミットの不変条件とレーンの割り当て

**対象**: §6.1 `Commit` / §6.2 `commitSource` の内部状態

**受け入れ基準**:
2.1. システムは、`newCommit` が返す `Commit` の `ID` をちょうど 7 文字の小文字 16 進にしなければならない。(常時)
2.2. `ID` の書式、`Seq` の 0、`Lane` の範囲外、`Branch` または `Summary` の空文字・改行の混入のいずれかがある場合、システムは対応する error を `errors.Is` で識別できる形で返し、panic してはならない。(異常系)
2.3. `Parents` に自身の `Seq` 以上の値、0、重複、または 3 個以上の要素が含まれる場合、システムは `errCommitParents` を `errors.Is` で識別できる error を返さなければならない。(異常系)
2.4. `Next` を 1000 回連続で呼び出す間、システムはすべてのコミットの `Lane` を 0 以上 `commitMaxLanes` 未満に保たなければならない。(状態)
2.5. `Next` を 1000 回連続で呼び出す間、システムはすべてのコミットの `Parents` の各要素が、それより小さい `Seq` を持つ既出のコミットを指す状態を保たなければならない。(状態)
2.6. `newCommit` が呼ばれたとき、システムは渡された `Parents` スライスを複製し、呼び出し側による生成後の書き換えが `Commit` へ波及しないようにしなければならない。(イベント)

### Requirement 3: 分岐とマージの発生

**対象**: §6.2 `commitSource` の内部状態

**受け入れ基準**:
3.1. `Next` を 1000 回呼び出したとき、システムは `Lane` が 1 以上のコミットを 1 件以上生成しなければならない(分岐が起きる)。(状態)
3.2. `Next` を 1000 回呼び出したとき、システムは `Parents` の長さが 2 のコミットを 1 件以上生成しなければならない(マージが起きる)。(状態)
3.3. `Parents` の長さが 2 のコミットについて、システムはその `Lane` を 0(主線)にしなければならない。(常時)
3.4. `Seq` が 1 のコミットについて、システムは `Parents` の長さを 0、`Lane` を 0 にしなければならない。(常時)
3.5. `Seq` が 2 以上のコミットについて、システムは `Parents` の長さを 1 以上にしなければならない(根以外に孤立したコミットを作らない)。(常時)

### Requirement 4: 依存グラフの生成器の契約

**対象**: §5.2 `graphSource`

**受け入れ基準**:
4.1. システムは、`graphSource.EventName()` の呼び出しに対してつねに `"nullops:graph"` を返さなければならない。(常時)
4.2. システムは、`graphSource.Interval()` の呼び出しに対してつねに 1000 ミリ秒を返さなければならない。(常時)
4.3. `Next` が呼ばれたとき、システムは `Nodes` の長さが `graphNodeCount` に等しい `DependencyGraph` を返さなければならない。(イベント)
4.4. `Next` が呼ばれたとき、システムは直前の戻り値より 1 だけ大きい `Seq` を持つ `DependencyGraph` を返さなければならない。(イベント)
4.5. `rnd` が nil の場合、システムは `newGraphSource` の呼び出しで panic しなければならない。(異常系)
4.6. `Next` と `Snapshot` が複数のゴルーチンから同時に呼ばれている間、システムはデータ競合を起こしてはならない(`go test -race` で検出されない)。(常時)

### Requirement 5: グラフの不変条件

**対象**: §6.3 `GraphNode` / §6.4 `GraphEdge` / §6.5 `DependencyGraph`

**受け入れ基準**:
5.1. システムは、`newGraphNode` が返す `GraphNode` の `X`・`Y` がいずれも -1.0 以上 1.0 以下、`Load` が 0.0 以上 1.0 以下であることを保証しなければならない。(常時)
5.2. 引数のいずれかが範囲外の場合、システムは `errGraphValueOutOfRange` を、NaN または無限大の場合は `errGraphValueNotFinite` を、`errors.Is` で識別できる error として返さなければならない。(異常系)
5.3. `Health` が定義済みの 3 値のいずれでもない場合、システムは `errGraphHealthUnknown` を `errors.Is` で識別できる error を返さなければならない。(異常系)
5.4. `From` と `To` が等しい、またはいずれかが空文字の場合、システムは `errGraphEdgeEndpoints` を `errors.Is` で識別できる error を返さなければならない。(異常系)
5.5. `Next` を 1000 回連続で呼び出す間、システムはすべての `Edges` の端点が `Nodes` に実在し、`Nodes` の `ID` が重複せず、同じ `(From, To)` の組が 2 本以上現れない状態を保たなければならない。(状態)
5.6. `Next` を 1000 回連続で呼び出す間、システムはすべてのノードの `X`・`Y` を -1.0 以上 1.0 以下に、`Load` と `Flow` を 0.0 以上 1.0 以下に保たなければならない。(状態)

### Requirement 6: グラフの時間変化

**対象**: §5.2 `graphSource` / §6.6 内部状態

**受け入れ基準**:
6.1. `Next` が呼ばれたとき、システムは直前のフレームと少なくとも 1 つのノードの座標が異なるグラフを返さなければならない。(イベント)
6.2. `Next` を 100 回呼び出す間、システムは `Edges` の本数が変化するフレームを 1 回以上生じさせなければならない(エッジの増減)。(状態)
6.3. `Next` を 1000 回呼び出す間、システムはいずれかのノードの `Health` が変化するフレームを 1 回以上生じさせなければならない(表示状態の変化)。(状態)
6.4. `Next` を 1000 回連続で呼び出す間、システムは基幹エッジをつねに `Edges` に含めなければならない(グラフが断片化して図が読めなくなるのを防ぐ)。(状態)
6.5. システムは、ノードの集合(`ID` の並び)を `Next` の呼び出しによって変えてはならない。(常時)

### Requirement 7: 起動直後の初期表示

**対象**: §5.3 `App.Snapshot` / §6.7 `DashboardSnapshot`

**受け入れ基準**:
7.1. `Snapshot` が呼ばれたとき、システムは `Commits`・`Graph.Nodes`・`Graph.Edges` がいずれも nil でない `DashboardSnapshot` を返さなければならない。(イベント)
7.2. `startup` を経ずに `Snapshot` が呼ばれた場合、システムは error を返さず、`Commits` の長さが 0、`Graph.Seq` が 0 で `Nodes`・`Edges` の長さが 0 の値を返さなければならない。(異常系)
7.3. `Snapshot` が呼ばれたとき、システムは `commitSource` と `graphSource` の内部状態(`Seq`・保持コミット・ノード座標)を変化させてはならない。(イベント)
7.4. `startup` の後に `Snapshot` が呼ばれたとき、システムは `Graph.Nodes` の長さが `graphNodeCount` に等しいグラフを返さなければならない。(イベント)

### Requirement 8: パネルの購読と初期表示の併合

**対象**: §5.5 購読関数 / §5.6 `CommitGraphPanel` / §5.7 `DependencyGraphPanel`

**受け入れ基準**:
8.1. 各パネルがマウントされたとき、システムは購読を開始してからスナップショットを取得しなければならない(取得中に届いたフレームを落とさないため)。(イベント)
8.2. `CommitGraphPanel` は、購読で届いたコミットとスナップショットのコミットを `Seq` を鍵に併合し、同一 `Seq` を 1 件だけ残さなければならない。(イベント)
8.3. `DependencyGraphPanel` は、購読で届いたグラフとスナップショットのグラフのうち `Seq` が大きいほうを描画対象にしなければならない(表示の巻き戻しを防ぐ)。(イベント)
8.4. 各パネルがアンマウントされたとき、システムは購読を解除し、以後コールバックで状態を更新してはならない。(イベント)
8.5. スナップショットの取得が reject された場合、システムは例外を伝播させず、空の履歴・空のグラフで描画を開始しなければならない。(異常系)
8.6. 受け取った payload が期待の形(コミットは配列、グラフは `nodes`・`edges` の配列を持つ物体)でない場合、システムは描画対象を更新せず、`console.error` に記録するだけでなければならない。(異常系)

### Requirement 9: コミットグラフの描画

**対象**: §5.6 `CommitGraphPanel` / §5.8 配置関数

**受け入れ基準**:
9.1. システムは、`commitRowLayout`・`commitRowY`・`commitLaneX`・`visibleCommitCount` が同じ引数に対してつねに同じ値を返さなければならない。(常時)
9.2. システムは、`commitRowLayout` が返す `rowHeight`・`laneStep` をつねに 0 より大きい有限値にしなければならない。(常時)
9.3. 描画のとき、システムはコミットを新しい順に上から並べ、枠に収まる件数(`visibleCommitCount`)だけを描かなければならない。(イベント)
9.4. 描画のとき、システムは各コミットの点をその `Lane` に対応する列へ置き、`Parents` が指す親のうち描画範囲にあるものへ線を引かなければならない。(イベント)
9.5. 描画のとき、システムはレーン 0(主線)を他のレーンより強く(不透明度を高く)描かなければならない。(イベント)
9.6. 描画のとき、システムは各行にブランチ名と要約を英語のまま添え、枠の幅を超える文字列を切り詰めなければならない(横スクロールを出さないため)。(イベント)
9.7. 表示対象の最新 `Seq` と描画領域の寸法がいずれも前フレームから変わっていない場合、システムはキャンバスへの描画を行ってはならない。(常時)
9.8. `view.width` または `view.height` が 0 の場合、システムは描画処理を行わず、次のフレームへ進まなければならない(0 除算による NaN を画面へ出さない)。(異常系)

### Requirement 10: 依存グラフの描画と補間

**対象**: §5.7 `DependencyGraphPanel` / §5.9 配置関数

**受け入れ基準**:
10.1. システムは、`placeNode` と `lerp` が同じ引数に対してつねに同じ値を返さなければならない。(常時)
10.2. システムは、`placeNode` が返す `radius` をつねに 0 より大きい有限値にし、`Load` が大きいノードほど大きくしなければならない。(常時)
10.3. システムは、`lerp(a, b, 0)` が `a` に、`lerp(a, b, 1)` が `b` に等しくなければならない。(常時)
10.4. 描画のとき、システムはエッジを先に、ノードを後に描かなければならない(線がノードの円の上に重ならないようにする)。(イベント)
10.5. 描画のとき、システムはノードの色を `Health` から決め、`ok`・`warn`・`down` を互いに異なる色にしなければならない。(イベント)
10.6. 新しいグラフが届いてから次のグラフが届くまでの間、システムはノードの座標を直前のグラフと最新のグラフのあいだで補間し、毎フレーム描画しなければならない(毎秒 1 回の更新でカクつかせないため)。(状態)
10.7. 補間の経過が送出間隔を超えた場合、システムは補間の比を 1 で頭打ちにし、最新の座標のまま描き続けなければならない。(異常系)
10.8. 直前のグラフに存在しない `ID` のノードが現れた場合、システムは補間せず最新の座標をそのまま用いなければならない。(異常系)
10.9. `view.width` または `view.height` が 0 の場合、システムは描画処理を行わず、次のフレームへ進まなければならない。(異常系)

### Requirement 11: 描画領域への追随とデザイントークンへの準拠

**対象**: §5.6 / §5.7 両パネル / §6.8 デザイントークン

**受け入れ基準**:
11.1. システムは、両パネルのキャンバスのバッキングストアの画素数を CSS 上の寸法と `devicePixelRatio` の積に一致させなければならない。(常時)
11.2. ウィンドウの大きさが変わって枠の寸法が変わったとき、システムはキャンバスの寸法を新しい寸法へ追随させなければならない。(イベント)
11.3. 枠の寸法が変わっても、システムは描画内容を枠の内側に収め、ページ側にスクロールバーを出してはならない。(常時)
11.4. システムは、両パネルの色を `globals.css` の `@theme` トークンから解決しなければならず、`.ts`・`.tsx` に色の直値(16 進表記)を書いてはならない。(常時)
11.5. トークンの解決に失敗した場合(空文字が返る場合)、システムは既定の色文字列へ退避し、描画を止めてはならない。(異常系)
11.6. 各パネルは、マウント時に 1 度だけトークンを解決し、フレームごとに `getComputedStyle` を呼んではならない。(常時)
11.7. 各パネルがアンマウントされたとき、システムは `requestAnimationFrame` のループと `ResizeObserver` を停止しなければならない。(イベント)

### Requirement 12: 検証手段の成立(非機能)

**対象**: 本 unit の全体

**受け入れ基準**:
12.1. システムは、`go vet ./...`・`go test ./...`・`cd frontend && npm run lint`・`wails build` がいずれもエラーなく終了する状態を保たなければならない。(常時)
12.2. システムは、コミットグラフの送出を毎秒 1 回以下、依存グラフの送出を毎秒 1 回以下に保たなければならない(描画の滑らかさを IPC の頻度に依存させない)。(常時)
12.3. システムは、1 フレームの描画対象を、コミットグラフでは枠に収まる行数、依存グラフでは `graphNodeCount`(10)個のノードと基幹・揺らぎを合わせたエッジに保たなければならない(6 パネル同時稼働時の負荷の上限を、対象数の固定で押さえる)。(常時)
12.4. システムは、可視化ライブラリを `frontend/package.json` の依存へ追加してはならない。(常時)

## 8. 実現方針

- **描画手段**: 2 パネルとも Canvas 2D。コミットグラフは行と列の格子へ点と線を置くだけで、依存グラフは円と直線だけで済む。いずれも 2 次元 API で直接書ける形であり、ライブラリを入れる理由が無い(§3 前提 5)。
- **配置算出の所在**: Go 側(§3 前提 1)。フロントエンドが持つのはモデル座標をキャンバス座標へ写す純関数だけで、`frontend/src/lib/commitgraph.ts` と `frontend/src/lib/depgraph.ts` に分けて置く(unit #2 の `project.ts` と同じ扱い)。
- **再描画の駆動**: 両パネルとも `requestAnimationFrame` のループを持つ(§3 前提 9)。コミットグラフはループの中で「最新 `Seq` と寸法が前フレームと同じなら描かない」と判定する。依存グラフは毎フレーム補間して描く。描画対象を state に置かず ref に持つのは、毎フレームの再描画を React に起こさせないためである(`CLAUDE.md` TypeScript 規約)。
- **既存構造との関係**: `feed` パッケージには手を入れない。`commitSource`・`graphSource` は `logSource`・`scatterSource` と同じく `main` パッケージに置き、`App.startup` で `feed.NewRunner` へ第 3・第 4 の `Source` として渡す。依存方向は `main → feed` のままで変わらない。unit #2 が作った `drift` / `clampUnit` / `symmetricUniform` を再利用し、同じ計算を書き直さない。
- **色の解決**: `getComputedStyle(document.documentElement).getPropertyValue(...)` で実行時に解決し、マウント時に 1 度だけ読んで ref に持つ(unit #2 と同じ)。退避先には 16 進の直値を置かず CSS のキーワードを使う(受け入れ基準 11.4 と 11.5 を両立させるため。unit #2 が採った折衷を踏襲する)。
- **保持件数とノード数の固定**: コミットは `appCommitCapacity`(120 件)、ノードは `graphNodeCount`(10 個)。実画面を見て過不足があれば unit #4 の同時稼働の調整で見直す。
- 用語集(`docs/glossary.md`)はリポジトリに無い。名前は既存コード(`logSource` / `scatterSource` / `LogLine` / `ScatterCloud` / `DashboardSnapshot`)の語彙に合わせた。

## 9. 参考資料

- `docs/specs/001-dashboard-mvp/roadmap.md` §1・§1.1・§2(unit #3 の範囲・完了条件・未確定項目)
- `docs/specs/001-dashboard-mvp/001-dashboard-shell/spec.md`(凍結済み。`feed.Source`・`feed.Emitter`・`feed.Runner`・`App.Snapshot`・デザイントークンの契約)
- `docs/specs/001-dashboard-mvp/002-scatter3d-panel/spec.md`(凍結済み。Canvas 2D の描画規律・トークンの実行時解決・`DashboardSnapshot` の拡張の前例)
- `CLAUDE.md`(言語規約・Go / TypeScript コーディング規約・注意事項)
