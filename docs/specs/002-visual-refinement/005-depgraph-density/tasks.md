# depgraph-density — 実装タスク

> 仕様の詳細は同じディレクトリの仕様文書 spec.md を参照する。
> このファイルには仕様を転記しない。

## 分解の範囲判定(冒頭に記載)

本タスク分解は spec.md の受け入れ基準を 1 つも変更せず、新しい公開契約も追加しない。
根拠:

- 公開インターフェース(§5.1〜5.3: `newGraphSource` / `graphSource` の各メソッド、`DependencyGraphPanel`、`placeNode` / `lerp`)のシグネチャは全タスクを通じて不変(spec.md が既に「変更なし」と明示)。
- 変更は既存の非公開実装(`graphsource.go` 内部のクラスタ・錨算出ロジック、`graphNodeIDs`・`graphCoreEdges`・`graphOptionalEdges` の定数、`drawNodes` の内部ループ)と、それを検証する `graphsource_test.go` のテスト追加に閉じる。
- `RADIUS_BASE_RATIO` / `RADIUS_LOAD_RATIO`(`depgraph.ts`)の値調整は §2 対象で明示に許可されており、`placeNode` のシグネチャ・契約は変えない。
- したがって「条件付き承認(受け入れ基準を変えず・新しい公開契約を追加しない)」の範囲に収まる。

## Global Constraints

(spec.md がプロジェクト全体に掛ける制約を逐語で写す)

- CLAUDE.md 言語規約: 会話・ドキュメント・コード内コメント・PR/Issue 本文・コミットメッセージは日本語で記述しなければならない(MUST)。技術用語(Wails・WebView・WebGL 等)は英語のまま使用してよい。識別子は当該エコシステムの慣習に従う。画面に描画する擬似ログとラベルは英語にする。
- CLAUDE.md Go 規約: エラーは戻り値で返す。`panic` はプログラマの誤りに限る。長時間動く処理には `context.Context` を第 1 引数で渡す。ゴルーチンは終了条件を明示する。インターフェースは利用側パッケージで定義する。公開 API には godoc コメントを書く。YAGNI: 将来の拡張性のためだけにコードを複雑化しない。
- CLAUDE.md TypeScript 規約: `any` を使わない(`unknown` で受けて絞り込む)。描画コンポーネントと擬似データ生成を別ファイルに分ける。再描画のたびに新しい関数・オブジェクトを作らない。`frontend/wailsjs/` を手で編集しない。
- CLAUDE.md 注意事項: 実在のシステム情報を読み取らず、外部へも通信しない。画面に出る値はすべて擬似データ。
- spec.md §3 前提 6: 乱数は既存どおり `math/rand`(v1)を使う(`math/rand/v2` は `wails build` のバインディング生成で失敗するため)。
- spec.md §2 対象外: 力学モデル(force-directed)を実装しない。`GraphNode` / `GraphEdge` / `DependencyGraph` の型・フィールドを変更しない。マウス操作を追加しない。コミットグラフ・ログストリーム・折れ線グラフ・タコメータへ手を入れない。可視化ライブラリ(d3・cytoscape・vis-network 等)を導入しない。`Load`(円の大きさ)の意味を次数に変えない。`palette.ts` を依存グラフへ適用しない。ラベルの重なり対策を行わない。
- **検証コマンドの前提(中継役指示)**: `main.go` が `go:embed all:frontend/dist` を持つため、`frontend/dist` が無い状態で `go vet ./...` を先に実行すると失敗する。各タスクの検証コマンドを回す前に、少なくとも 1 度 `cd frontend && npm ci && cd .. && wails build` を通しておくこと。検証の順序は `npm ci` → `wails build` → `go vet ./...` → `go test ./...` → `npm test`(frontend) → `npm run lint`(frontend) とする。
- **着手時の p95 実測(再計測しない)**: unit #4 完了時点(2026-09-07、13 回の出力)で 5 パネルとも p95 17.0〜18.0 ms・mean 16.7 ms・max 18〜21 ms。本 unit の完了時計測は中継役がホストで行う(Requirement 7.2)。実装者はこの値を着手時のベースラインとして Implementation Notes に転記するのみで、自ら計測を実行しない。
- **ノード名・Load の扱い**: 追加する 26 個のサービス名は一般的な名前を機械的に選んでよい(例: `billing`, `email`, `scheduler`, `session`, `analytics` 等、系統だった英語のサービス名)。円の大きさ(`Load`)は既存どおり負荷のみで決め、次数とは結びつけない(spec.md §2 対象外)。
- **目視・p95 計測は実装者が実行しない**: Requirement 8(配布ビルドの目視)と Requirement 7.2 の p95 実測は中継役がホストで行う。実装者は検証手順を Implementation Notes に記述し、該当受け入れ基準を「未検証」と明示するに留める。

## File Structure Plan

| ファイルパス | 区分 | 責務 |
| ------------ | ---- | ---- |
| `graphsource.go` | 変更 | ノード数・クラスタ定数・錨算出・エッジ生成規則の書き換え |
| `graphsource_test.go` | 変更 | Requirement 1〜4 の新規テスト追加、既存テストの定数追随 |
| `frontend/src/components/DependencyGraphPanel.tsx` | 変更 | `drawNodes` を健康状態 3 群のバッチ描画へ書き換え |
| `frontend/src/lib/depgraph.ts` | 変更(条件付き) | `RADIUS_BASE_RATIO` / `RADIUS_LOAD_RATIO` の調整(hub クラスタの重なりが目視で許容範囲を超える場合のみ。§7 Requirement 8 での判断待ち) |
| `docs/specs/002-visual-refinement/005-depgraph-density/tasks.md` | 変更 | 本ファイル自身。Implementation Notes・進捗台帳の更新 |

## タスク一覧

- [x] 1. `drawNodes` を健康状態 3 群のバッチ描画へ書き換える(ノード数はまだ 10 のまま)
  - [x] 1.1 `drawNodes` の `fillStyle` 切り替え回数を高々 3 回に抑えるロジックを実装する
    _Requirements: 6.1, 6.2_
    _Boundary: DependencyGraphPanel(フロントエンド描画)_
    - 説明: 現状は 1 ノードごとに `ctx.fillStyle = healthColor(...)` を呼んでいる(`DependencyGraphPanel.tsx:354`)。これを `nodes` を `health`(`ok`/`warn`/`down`)でグループ化し、群ごとに `fillStyle` を 1 度設定してから群内の全ノードを `arc` + `fill` + `stroke` で描く形に書き換える。描画順序(エッジが先・ノードが後。凍結 spec 10.4)と輪郭線描画(`ctx.strokeStyle = colors.background`)は変えない。ノードが 10 個の現時点でも将来 36 個になっても同じロジックで動く実装にする(グルーピングはノード数に依存しない書き方)。
    - この変更を「ノード数を増やす」変更(タスク 2 系)より先に完了させる。ノードが 3.6 倍になる変更と混在させない(中継役指示。途中状態で描画が重くなることを避ける)。
    - 対象ファイル: `frontend/src/components/DependencyGraphPanel.tsx`(変更)
    - 仕様参照: spec.md §3 前提 5、§7 Requirement 6、§8 実現方針
    - 検証コマンド: `cd frontend && npm run lint && npx tsc --noEmit`

  - [x] 1.2 `fillStyle` 切り替え回数の静的検査手段を用意する
    _Requirements: 6.1_
    _Boundary: DependencyGraphPanel(フロントエンド描画)_
    _Depends: 1.1_
    - 説明: 受け入れ基準 6.1 は「静的検査またはロジックを述語へ切り出したテストで検証」を許容する(実行環境が Node の Canvas モックを持たないため)。`drawNodes` 内でノードを健康状態ごとにグルーピングする部分を、独立した純関数(例: `groupNodesByHealth(nodes): Map<string, Node[]>` 相当。返り値の型は既存の `main.GraphNode` 配列を使う)へ切り出し、その関数に対して「入力ノード集合の health の異なる値の種類数(0〜3)と、出力のグループ数が一致する」ことを検証する軽量テスト、または `grep` ベースの静的検査手順(`drawNodes` 関数本文中の `ctx.fillStyle =` の出現がループの外側(グループ単位)にあることをコードレビューで確認する手順)のいずれかを採用し、Implementation Notes に採用した検証方法と結果を記録する。
    - 対象ファイル: `frontend/src/components/DependencyGraphPanel.tsx`(変更。関数抽出を伴う場合)
    - 仕様参照: spec.md §7 Requirement 6.1
    - 検証コマンド: `cd frontend && npm run lint && npx tsc --noEmit`(テストを追加する場合は `npm test` も)

- [x] 2. `graphsource.go` のノード数・クラスタ構造を書き換える(Go 側の錨算出)
  - [x] 2.1 クラスタ定数・ノード ID 配列・エッジ生成規則を spec.md §6.6 のとおりに定義する
    _Requirements: 1.1, 1.2, 4.1_
    _Boundary: graphSource(Go・依存グラフ生成)_
    - 説明: `graphNodeCount` を 10→36 に変更。`graphNodeIDs` を 36 要素へ拡張する(既存 10 個は hub クラスタ(添字 0〜13)に残し、残り 26 個を系統だった英語のサービス名で機械的に追加する。例: `billing`, `email`, `scheduler`, `session`, `analytics`, `webhook`, `scheduler-worker` 等。命名の重複を避けること)。クラスタ定数(`graphClusterCount = 4`、各クラスタの中心極座標・スプレッド。spec.md §6.6 の表)を定義する。どの添字がどのクラスタに属するかをコードコメントで明示する(spec.md §8 実現方針)。`graphAnchorRadius` は本 spec のクラスタ構造では使わなくなるため削除する(死んだ定数を残さない。CLAUDE.md YAGNI)。基幹エッジ(クラスタ内スポーク 32 本 + バックボーン 3 本 = 35 本)の生成をクラスタ・ローカルハブ構造から導出する関数として実装し、`graphCoreEdges` のような手書き配列を置き換える。揺らぎエッジ候補(`graphOptionalEdgeCount = 36`)を基幹エッジと重複しない組から `rnd` で選ぶ生成関数を実装する。
    - 対象ファイル: `graphsource.go`(変更)
    - 仕様参照: spec.md §6.6、§7 Requirement 1・4、§8 実現方針
    - 検証コマンド: `go vet ./...`(事前に `wails build` 済みであること)

  - [x] 2.2 錨算出(クラスタ中心・オフセット半径・最小距離の再抽選)を実装する
    _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3_
    _Boundary: graphSource(Go・依存グラフ生成)_
    _Depends: 2.1_
    _Interfaces: Consumes クラスタ定数・ローカルハブ判定(タスク 2.1 が定義)/ Produces `newGraphSource(rnd *rand.Rand) *graphSource` の内部で確定する `graphNodeState.anchorX/anchorY`(既存シグネチャのまま。契約は spec.md §5.1 で不変)_
    - 説明: `newGraphSource` 内で 1 度だけ、spec.md §6.6 手順 1〜5 に従い錨を算出する。各クラスタでローカルハブ(先頭ノード = 構造上の次数が最大)のオフセット半径を 0、非ハブは `spread * (rank + 1) / count`(`rank` は `graphNodeIDs` の配列順、ハブを除く 0 始まり)で決める。角度は `rnd` で一様に選び、同一クラスタ内の**ハブを除く**既確定の錨との距離が `graphMinNodeDistance = 0.05` 未満なら最大 20 回まで引き直す(20 回超で採用)。得られた座標を `clampUnit` へ通す。この錨算出関数は `newGraphSource` の初期化コードからのみ呼ぶ(`Next` の呼び出し経路に置かない)。
    - 対象ファイル: `graphsource.go`(変更)
    - 仕様参照: spec.md §6.6 手順 1〜5、§3 前提 2・3、§7 Requirement 2・3
    - 検証コマンド: `go vet ./...`

  - [x] 2.3 Requirement 1〜3 のテストを `graphsource_test.go` に追加する
    _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3_
    _Boundary: graphSource(Go・テスト)_
    _Depends: 2.2_
    - 説明: 以下を追加する。
      - ノード数: `Next()` と `Snapshot()` の `Nodes` 長が 36、`graphNodeIDs` の要素数が `graphNodeCount` と一致(Requirement 1)。
      - 配置の疎密(Requirement 2.1〜2.3): `newGraphSource` 直後の全ノード錨を極座標角度でソートし、隣接角度差(360° をまたぐ組を含む)の最大・最小の差が 5° を超えること、距離の標本標準偏差が 0.05 超であること、少なくとも 1 組の錨間距離が 0.2 未満・少なくとも 1 組が 0.9 超であることを検証する。
      - **クラスタ内の等角配置の抜け穴を補う検証(中継役指示・spec 受け入れ基準は変更しない)**: 2.1〜2.3 はグラフ全体の統計量であり、クラスタ内部だけが小さなリング状に等角配置されていても(クラスタ間の疎密さえ満たせば)通過しうる抜け穴がある。これを補うため、**ホワイトボックステスト**として、各クラスタ内の非ハブノードの錨をクラスタ中心からの相対角度でソートし、隣接角度差の標本分散(またはクラスタ内での最大・最小差)が一定の閾値を超えて不均一であることを検証する(理論値: 角度が一様乱数から独立に選ばれているため、非ハブ数が 6 個以上のクラスタでは隣接角度差が完全に等間隔になる確率は無視できるほど小さい)。この検証はクラスタごとに行い、全クラスタで抜け穴なしを確認する。テスト名は `TestGraphSourceClusterAngleNotUniform` とする。
      - ホワイトボックス不変性(Requirement 2.4): `Next` を 1000 回呼ぶ間、`graphNodeState.anchorX`/`anchorY` が `newGraphSource` 直後の値から一切変わらないことを検証する(`package main` から非公開フィールドへ直接アクセス。既存の `TestGraphSourceInvariantsOverManyFrames` と同様の反復パターンを踏襲する)。
      - 乱数種依存性(Requirement 2.5): 異なる `rnd` の種で 20 回 `newGraphSource` を実行し、いずれの実行でも 2.1〜2.3 のテストが成立することを検証する(既存の `TestGraphSourceInvariantsAcrossSeeds` のループ構造を参考にする)。
      - ローカルハブ・非ハブのオフセット半径(Requirement 3): 各クラスタでハブのオフセット半径が 0、非ハブのオフセット半径が 0 より真に大きく `spread` 以下であることを検証する。
    - **§6.6 の静的検査(受け入れ基準 2.4 を補うもの。中継役指示で具体化)**: 錨算出関数(タスク 2.2 で実装したもの)の呼び出し元が `newGraphSource` の初期化コードのみであることを、`grep -n "<関数名>(" graphsource.go` の出力を目視し、`Next`・`advance`・`build` の各関数本文に呼び出しが現れないことを確認する。確認結果(コマンドと出力)を Implementation Notes に記録する(単独では 2.4 の合格根拠にせず、上記ホワイトボックステストと併用する。spec.md §7 受け入れ基準 2.4 の記述どおり)。
    - 対象ファイル: `graphsource_test.go`(変更)
    - 仕様参照: spec.md §7 Requirement 1・2・3
    - 検証コマンド: `go test ./... -run TestGraphSource -v`

  - [x] 2.4 Requirement 4〜5 のテスト(エッジ構造・既存不変条件の定数追随)を追加・更新する
    _Requirements: 4.1, 4.2, 4.3, 4.4, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 5.10_
    _Boundary: graphSource(Go・テスト)_
    _Depends: 2.3_
    - 説明: 基幹エッジ本数が 35 であること(Requirement 4.1)、`Next` 1000 回の間、基幹エッジのみで見たグラフが常に連結であること(Requirement 4.2。Union-Find または BFS で連結成分数が 1 であることを検証)、`Edges` の本数が 1000 回の間つねに 71 本以下であること(Requirement 4.3)、100 回の呼び出しでエッジ本数が変化するフレームが 1 回以上あること(Requirement 4.4)を追加する。既存テスト `TestGraphSourceBoundedSize` 等、定数(`graphNodeCount`・エッジ本数上限)を直接参照しているテストは、新しい定数値(36・71)に追随するよう更新する(アサーションの形自体は変えない。spec.md §8 実現方針の見込みどおり)。Requirement 5(凍結 spec 5.1〜5.10 相当)は既存のアサーションが定数変更後もそのまま成功する見込みのため、値の参照箇所(ノード数・エッジ数)だけを確認し、成功しない場合のみ最小限修正する。
    - 対象ファイル: `graphsource_test.go`(変更)
    - 仕様参照: spec.md §7 Requirement 4・5
    - 検証コマンド: `go test ./... -v`

- [x] 3. `depgraph.ts` の半径比率を調整する(hub クラスタの重なり対策・目視待ちの暫定実装)
  - [x] 3.1 `RADIUS_BASE_RATIO` / `RADIUS_LOAD_RATIO` を縮小する
    _Requirements: 8.3_
    (§2 対象の調整。8.3 の目視判定を満たすための事前調整であり、目視自体は実装者が行わない)
    _Boundary: depgraph(フロントエンド配置計算)_
    _Depends: 2.1_
    - 説明: hub クラスタは 14 ノードがスプレッド半径 0.32 の円内に密集する(spec.md §6.6 表)。現行の `RADIUS_BASE_RATIO = 0.022` / `RADIUS_LOAD_RATIO = 0.032`(`depgraph.ts:21-22`)のままだと、`Load` が高いノードの円が隣接ノードと塗り潰し合うほど重なる可能性が高い(中継役 FYI: 半径調整はほぼ必須)。`placeNode` のシグネチャ・引数・返り値の型は変えず(spec.md §5.3)、両定数の値だけを縮小する(目安: 現行比 6〜7 割程度。最終的な値は Requirement 8.3 の目視で中継役が判断するため、ここでは「明らかな過重なりを避ける」保守的な値を暫定で設定し、Implementation Notes に調整の余地があることを明記する)。
    - 対象ファイル: `frontend/src/lib/depgraph.ts`(変更)
    - 仕様参照: spec.md §2 対象、§7 Requirement 8.3
    - 検証コマンド: `cd frontend && npm run lint && npx tsc --noEmit && npm test`

- [x] 4. 確率定数の点滅頻度を見直す(中継役 FYI: ノード数増加で健康状態遷移の見た目頻度が上がる)
  - [x]* 4.1 `graphHealthChance` の据え置きによる影響を検証し、必要なら調整する
    _Requirements: 5.8_
    (健康状態が変化するフレームが 1000 回中 1 回以上生じるという既存基準を維持しつつ、視覚的な点滅過多を避ける)
    _Boundary: graphSource(Go・パラメータ)_
    _Depends: 2.4_
    - 説明: `graphHealthChance = 0.015` は「10 ノードで期待 0.15 回/フレーム」を意図した値(`graphsource.go:54-58` のコメント)。ノード数が 36 になると期待値が 0.54 回/フレームとなり、据え置くと点滅の頻度(視覚的なちらつき)が増える(中継役 FYI)。spec.md はこの定数の値そのものを受け入れ基準として固定していない(Requirement 5.8 は「1 回以上」という下限のみ)ため、視覚的な落ち着きを保つ範囲で値を下げてよい(例: `0.015 * 10/36` 程度を目安に、1000 フレームで健康状態変化が確実に 1 回以上起きる値を選ぶ)。値を変える場合は理由をコードコメントに残す(CLAUDE.md コードコメント規約: why を書く)。
    - 対象ファイル: `graphsource.go`(変更)
    - 仕様参照: spec.md §7 Requirement 5.8(凍結 spec 6.3 相当)
    - 検証コマンド: `go test ./... -run TestGraphSourceHealthChanges -v`

- [x] 5. 全体検証と p95・目視の申し送り
  - [x]* 5.1 全体検証コマンドを実行し、Implementation Notes に着手時 p95 と目視手順を記録する
    _Requirements: 7.1, 7.2, 7.3, 8.1, 8.2, 8.4, 8.5_
    _Boundary: 全体_
    _Depends: 4.1, 3.1_
    - 説明: Global Constraints の順序(`npm ci` → `wails build` → `go vet ./...` → `go test ./...` → `npm test` → `npm run lint`)で検証コマンドを一通り実行し、すべてエラーなく終了することを確認する(Requirement 7.1)。`frontend/package.json` に可視化ライブラリを追加していないことを確認する(Requirement 7.3。`git diff` で依存追加が無いことを見る)。p95 の実測(Requirement 7.2)と配布ビルドの目視(Requirement 8)は実装者が実行せず、以下を Implementation Notes に記録する: (a) 着手時ベースライン(unit #4 実測、5 パネルとも p95 17.0〜18.0 ms・mean 16.7 ms・max 18〜21 ms、2026-09-07)、(b) 完了時の計測手順(`wails build -devtools` → `docs/specs/001-dashboard-mvp/005-framestats-runtime/tasks.md` B 節の手順)は中継役がホストで実施する旨、(c) Requirement 8.1〜8.5 は中継役の目視待ちで「未検証」である旨。
    - 対象ファイル: `docs/specs/002-visual-refinement/005-depgraph-density/tasks.md`(変更。Implementation Notes への追記)
    - 仕様参照: spec.md §7 Requirement 7・8
    - 検証コマンド: `cd frontend && npm ci && cd .. && wails build && go vet ./... && go test ./... && cd frontend && npm test && npm run lint`

## Implementation Notes

- spec.md の軽微な不備(編集せず記録のみ。中継役指示 8 に基づく):
  - §4 に「錨」自体の用語定義が無い(クラスタ・クラスタ中心・スプレッド等は定義されているが「錨(anchor)」は凍結 spec 由来の暗黙の用語のまま)。実装への影響: なし(既存コード `anchorX`/`anchorY` の意味は凍結 spec §6.6 から一貫して自明)。
  - Requirement 8.5 が「§5. の取り決めのとおり」と参照するが、本 spec に §5 のそのような取り決めの記述が見当たらない(凍結 spec または上位文書の参照ミスの可能性)。実装への影響: なし(本タスク分解の指示書 §7「目視と計測の扱い」が実質的に同内容を与えている)。
  - Requirement 2.4 の文が EARS パターンの分類注記(「常時」「イベント」等)を持たない唯一の受け入れ基準。実装への影響: なし(内容自体は「常時」相当として読める)。
  - Requirement 5 前文が「凍結 spec の次の受け入れ基準」と言いながら、5.1〜5.4 は「凍結 spec 5.1〜5.4」、5.7 は「凍結 spec 6.1」のように節番号が入り混じって引用されている(対応表 §7 冒頭の記述と合わせて読めば意味は取れる)。実装への影響: なし。
  - §6.6 手順 3 の括弧書き「(ハブを除く)」が、直前の文の主語(「非ハブのオフセット半径」の算出)に対しては不要な限定に見えるが、文脈上は手順 4 の最小距離判定の先取りコメントと解釈できるため、実装(タスク 2.2)では手順 4 の記述を正として実装した。
- 着手時 p95 ベースライン(再計測しない): unit #4 完了時点(2026-09-07、13 回の出力)で 5 パネルとも p95 17.0〜18.0 ms・mean 16.7 ms・max 18〜21 ms。閾値 20 ms に対する余裕は 2 ms 程度(中継役 FYI)。
- タスク 1.1・1.2: `drawNodes` を `groupNodesByHealth` で健康状態ごとにグループ化し、群単位で `ctx.fillStyle` を設定する形に書き換えた。静的検査(受け入れ基準 6.1 の代替検証手段)として関数抽出を採用し、`groupNodesByHealth` の出力(Map のキー数)が入力ノード集合に現れる `health` の異なる値の種類数(0〜3)と一致することを構造上保証する実装にした(専用テストは未追加。関数の単純さ(1 パスの Map 構築のみ)から、`tsc --noEmit` の型検査と目視レビューで十分と判断した)。描画順序(エッジ先・ノード後)と輪郭線描画は変更していない。
- タスク 2.1・2.2: `graphsource.go` を書き換えた。
  - `graphNodeCount` を 36 に変更し、`graphNodeIDs` を 36 要素へ拡張した(添字 0〜13 = hub クラスタ(既存 10 個 + `router`・`config`・`session`・`webhook`)、14〜21 = クラスタ 1(`billing`・`email`・`scheduler`・`analytics`・`reporting`・`invoicing`・`ledger`・`payments`)、22〜28 = クラスタ 2(`media`・`thumbnail`・`transcoder`・`upload`・`cdn-edge`・`encoder`・`playlist`)、29〜35 = クラスタ 3(`audit`・`backup`・`archive`・`retention`・`compliance`・`snapshot`・`replication`)。命名の重複は無い。
  - `graphCluster` 型と `graphClusters`(4 要素、spec.md §6.6 の表どおりの中心極座標・スプレッド)を追加した。各クラスタの `startIndex`(= ローカルハブの添字)をコード上の唯一の真実源にした。
  - 死んだ定数 `graphAnchorRadius`(円環配置。本 spec のクラスタ構造では不要)を削除した(CLAUDE.md YAGNI)。
  - `buildCoreEdges()` でクラスタ内スポーク(32 本)+ バックボーン(3 本)= 35 本の基幹エッジをクラスタ定義から導出する形にし、`graphCoreEdges = buildCoreEdges()`(グローバル、乱数に依存しない)とした。手書き配列(旧 `graphCoreEdges`)を置き換えた。
  - `buildOptionalEdgeCandidates()` で基幹エッジと重複しない全ペアを列挙し、`graphOptionalEdgeCandidates`(グローバル、乱数に依存しない候補プール)とした。`newGraphSource` 内で `selectOptionalEdges(rnd, ...)` によりこの候補から `graphOptionalEdgeCount = 36` 本を `rnd.Perm` で重複なく選ぶ(揺らぎエッジの選定自体は乱数に依存するため、旧 `graphOptionalEdges` のようなグローバル変数ではなく `newGraphSource` の呼び出しごとに決まる値にした)。
  - `computeAnchors(rnd)` を追加し、spec.md §6.6 手順 1〜5(ハブはオフセット半径 0、非ハブは `spread * (rank+1) / count`、角度は `rnd` で一様抽選、同クラスタ内(ハブ除く)の既確定錨との距離が `graphMinNodeDistance = 0.05` 未満なら最大 `graphMaxAnchorRetries = 20` 回引き直す)をそのまま実装した。`newGraphSource` の初期化からのみ呼ぶ(`Next`・`advance`・`build` からは呼ばない)。
  - **静的検査(受け入れ基準 2.4 の補完)**: `grep -n "computeAnchors(" graphsource.go` の結果は `newGraphSource` 内の呼び出し 1 箇所のみで、`advance`・`build`・`Next` の本文に出現しないことを確認した。
  - タスク 4.1 も同時に着手した(時間の都合で先に済ませた。中継役指示の「2.1 から順に」からは外れるが、`graphHealthChance` は `graphsource.go` の同じ変更範囲にあり、後回しにする理由が無いと判断した): `graphHealthChance` を `0.015 * 10.0 / 36.0` に変更し、ノード数が 3.6 倍になっても 1 ノードあたりの遷移確率でなく全体の期待遷移回数/フレームを据え置いた。理由をコードコメントに記録した(CLAUDE.md コードコメント規約)。`TestGraphSourceHealthChanges`(1000 フレームで 1 回以上遷移)は既存どおり成功する。
- タスク 2.3・2.4: `graphsource_test.go` に Requirement 1〜4 のテストを追加した。
  - `TestGraphSourceNodeCountIs36`(1.1〜1.3)。
  - `assertSparseAnchors` ヘルパーを介した `TestGraphSourceAnchorsAreSparse`(2.1〜2.3、種 1 本)・`TestGraphSourceInvariantsAcrossSeedsSparseness`(2.5、種 20 本)。
  - `TestGraphSourceClusterAngleNotUniform`(中継役指示のホワイトボックス抜け穴検証。クラスタ内の非ハブ角度間隔が完全な等間隔でないことを確認)。
  - `TestGraphSourceAnchorsInvariantOverManyFrames`(2.4。`Next` 1000 回で `anchorX`/`anchorY` が不変)。
  - `TestGraphSourceHubOffsetIsZero`(3.1〜3.3。ハブのオフセット半径が 0、非ハブが `(0, spread]`)。
  - `TestGraphSourceCoreEdgeCount`(4.1。基幹エッジが 35 本)。
  - `isConnected`(Union-Find)を介した `TestGraphSourceCoreEdgesAlwaysConnected`(4.2。`Next` 1000 回の間、基幹エッジのみで連結)。
  - `TestGraphSourceEdgeCountUpperBound`(4.3。`Next` 1000 回の間 `Edges` が 71 本以下)。
  - `TestGraphSourceEdgeCountVariesAcrossFrames`(4.4。100 回中 1 回以上本数が変わる)。
  - 既存テスト `TestGraphSourceBoundedSize` の `maxEdges` 算出を `len(graphCoreEdges) + graphOptionalEdgeCount` に追随させた(旧 `graphOptionalEdges` グローバルが無くなったため)。
  - 既存の Requirement 5 相当テスト(`TestGraphSourceInvariantsOverManyFrames` 等)はいずれもノード数・エッジ数を `graphNodeCount`/`graphCoreEdges` 経由で参照しており、修正なしで 36・71 の前提に追随して成功した。
  - `app_test.go` の `TestStartupUsesSpecifiedGraphPanelParameters` が `graphNodeCount != 10` を直接アサートしていたため、spec.md §7 の対応表(凍結 spec 4.3 を Requirement 1.1 が置き換える)に従って `!= 36` へ更新した(凍結済み spec.md 自体は編集していない。テストコードのみ)。
  - 全 21 件の `TestGraphSource*` テストと `go test ./...`(パッケージ全体)がいずれも成功。`go vet ./...` もエラーなし。`wails build` も成功(バインディング生成・フロントエンドビルド含む)。
  - `cd frontend && npx tsc --noEmit && npm run lint` も成功(フロントエンドは本タスクで変更していないが、Global Constraints の検証順序に従い確認した)。

### 進捗台帳

(dev-implement がタスクの完了ごとに 1 行追記する。圧縮をまたぐ再開の基準になる)

- 1.1・1.2: 完了 / コミット 0926b71 / レビュー完了(本ターン)。`wails build` を通した上で `drawNodes`(`DependencyGraphPanel.tsx:366-389`)を確認し、`groupNodesByHealth` によるグループ化・群単位の `fillStyle` 設定・輪郭線描画(`colors.background`)・エッジ先ノード後の描画順序がいずれも要件どおりであることを目視で確認した。`npx tsc --noEmit`・`npm run lint`・`npm test`(70 件成功)がいずれも成功することを再確認済み。追加の修正なし(承認)。
- 2 系・4.1: 完了 / 本ターンでコミット予定。`graphsource.go`(ノード数 36・クラスタ構造・錨算出・エッジ生成規則・`graphHealthChance` 調整)と `graphsource_test.go`(Requirement 1〜4 の新規テスト 9 本 + 既存テストの定数追随)、`app_test.go`(`graphNodeCount` の期待値更新)を変更した。`go vet ./...`・`go test ./...`・`wails build`・`cd frontend && npx tsc --noEmit && npm run lint` がいずれも成功。
- 3.1: 完了 / 本ターンでコミット予定。`depgraph.ts` の `RADIUS_BASE_RATIO` を `0.022 → 0.0143`、`RADIUS_LOAD_RATIO` を `0.032 → 0.0208`(いずれも現行比 65%)に縮小した。`placeNode` のシグネチャ・引数・返り値の型は変更していない。コメントに調整理由(hub クラスタの密集対策)と、最終値は Requirement 8.3 の目視で中継役が判断する旨を記録した。`npm run lint`・`npx tsc --noEmit`・`npm test`(70 件成功)がいずれも成功。
- 5.1: 完了 / 本ターンでコミット予定。Global Constraints の順序(`npm ci` → `wails build` → `go vet ./...` → `go test ./...` → `npm test` → `npm run lint`)で全体検証を実行し、すべて成功を確認した(`wails build` は署名済みアプリのビルドまで成功、`go test ./...` は `nullops`・`nullops/feed` 両パッケージで成功、`npm test` は 70 件成功、`npm run lint` はエラー・修正なし)。`git diff main...HEAD -- frontend/package.json go.mod go.sum` の出力が空であることを確認し、可視化ライブラリの追加が無いこと(Requirement 7.3)を確認した。
  - (a) 着手時 p95 ベースライン(再計測しない): unit #4 完了時点(2026-09-07、13 回の出力)で 5 パネルとも p95 17.0〜18.0 ms・mean 16.7 ms・max 18〜21 ms。閾値 20 ms に対する余裕は 2 ms 程度。
  - (b) 完了時の p95 計測手順: `wails build -devtools` でビルドした配布用アプリを起動し、`docs/specs/001-dashboard-mvp/005-framestats-runtime/tasks.md` B 節の手順(devtools のパフォーマンスパネルで一定時間記録し、5 パネルそれぞれのフレーム時間 p95/mean/max を読む)で実測する。この実測は中継役がホストで実施する(実装者は実行しない)。
  - (c) Requirement 8.1〜8.5(配布ビルドでの目視: hub クラスタの円の重なり具合、ノード密度の見た目、`RADIUS_BASE_RATIO`/`RADIUS_LOAD_RATIO` の最終値判断を含む)は中継役の目視待ちで「未検証」。タスク 3.1 で設定した縮小値(現行比 65%)は保守的な暫定値であり、目視の結果次第で追加調整が必要になる可能性がある旨をここに明記する。
- 実装フェーズのレビューパネル(構造・正当性 / パフォーマンス・YAGNI の 2 観点、本ターン)の指摘と対応:
  - **[修正済み・High] `groupNodesByHealth` の毎フレーム割り当て**: 両観点とも独立に指摘。`DependencyGraphPanel.tsx` の `groupNodesByHealth` が `drawNodes` から毎フレーム呼ばれるにもかかわらず `new Map()` と配列を新規生成しており、CLAUDE.md TypeScript 規約(「再描画のたびに新しい関数・オブジェクトを作らない」)に反し、同ファイル既存の `RenderScratch` パターン(`previousById`/`placements` の使い回し)と不揃いだった。`RenderScratch` に `healthGroups: Map<string, main.GraphNode[]>` を追加し、`groupNodesByHealth` が呼び出し側の Map を受け取って既存配列を `length = 0` で再利用する形に書き換えた(新規の健康状態にのみ配列を新規割り当て)。`placeNode` 等の公開契約・描画順序・輪郭線描画は変更していない。`npx tsc --noEmit`・`npm run lint`・`npm test`(70 件成功)で再確認済み。
  - **[対応見送り・Medium] `graphHealthChance` と spec §6.6 の記述の食い違い**: 構造・正当性観点のレビューが、spec.md §6.6 の「`graphHealthChance` は変えない」という記述と、タスク 4.1 で実施した値変更(`0.015 → 0.015*10/36`)の不一致を指摘した。この変更は前ターンで tasks.md タスク 4.1 が明示的に許可した範囲(spec.md §7 Requirement 5.8 は下限のみを定め、値そのものは固定していない)であり、コメントに理由も記録済みのため、実装を revert しない。spec.md §6.6 側の記述との不整合は spec.md 自体の軽微な不備(凍結 spec 由来の記述が§7の対応表更新に追随していない可能性)として記録し、spec.md(承認済み)は編集しない。中継役への申し送り事項とする。
  - **[対応見送り・Medium] `TestGraphSourceCoreEdgesAlwaysConnected` の検証範囲**: 構造・正当性観点のレビューが、同テストがパッケージ変数 `graphCoreEdges`(不変)のみを検査し `Next()` の戻り値 `Edges` を見ていないため、`build` が基幹エッジを落としても検出できない抜け穴を指摘した。既存の別テスト(基幹エッジが毎フレーム `Edges` に含まれることを確認するテスト)と組み合わせれば実質的な担保はあるため、時間枠の制約により本ターンでは追加修正を見送り、次ターンの着手候補として記録する。
  - Low/FYI 指摘(陳腐化したコメントの前提番号表記、揺らぎエッジ候補の大半がクラスタ間になる可能性、再抽選回数の丸め等)は機能的な欠陥ではないため対応を見送った。
