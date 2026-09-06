# visual-refinement — 依頼内容(要求文書)

出所: 中継役から渡された依頼(2026-09-06)。本書は roadmap と各 unit の spec が章番号で参照する要求の本体である。

## 1. 目的

作業中に見えるダッシュボードとしての説得力を上げる。6 パネルは roadmap `001-dashboard-mvp`(unit #1〜#5)で動くようになったが、配置・3D 散布図・依存グラフの 3 点が実在の監視画面より単調に見える。

## 2. 実装する 3 点

### 2.1. レイアウトの作り直し

パネルの見出し行を削除し、6 等分をやめる。「ログストリームを縦長に、グラフを大きく、タコメータを下部の横並びに置く」を出発点の案とするが、確定仕様ではない。既存の監視ダッシュボード(Grafana・監視 SaaS・ターミナル UI 等)の配置を調べ、複数の配置案を仕様のゲートで提示する。ユーザーが案を選ぶ。見出しを消すため、README の画面表から「枠の題名」列を落とす改訂も含める。

### 2.2. 3D 散布図の作り込み

軸線を描き、ポインタのドラッグでヨーとピッチを変えられるようにする。ドラッグを終えたら自動回転へ戻す(放置した画面が動き続ける性格を保つため)。点の形も見直す。参考: `https://miabellaai.net/index.html`(WebFetch で見てよい)。

### 2.3. 依存グラフの作り込み

ノードの数を増やし、円周上の等角配置をやめて疎密を作る。Obsidian のグラフビューが出す見え方を参考にする(WebSearch/WebFetch で調べてよい)。

## 3. 完了条件(roadmap 全体)

- 配布ビルド(`wails build`)の画面を人間が目視し、3 点の改善を承認する。
- パネルの見出し行が画面から消え、6 枠が均等でない配置で並ぶ。README の画面表が実装と一致する。
- 3D 散布図に軸線が出て、ドラッグで視点が変わり、ドラッグを終えると自動回転へ戻る。
- 依存グラフのノードが 10 個より増え、等角配置でなくなる。
- 配布ビルドで `window.nullops.enableFrameStats()` を呼んで計測し(中継役の依頼文では `setFrameStatsEnabled(true)` と書かれていたが、コンソールに載る口の名前は実装に合わせた)、全パネルの p95 が 20 ms を超えない。ノードの増加と軸線の追加は描画の負荷を増やすため、unit `005-framestats-runtime` で入れた計測器で確かめる。
- `go vet ./...`・`go test ./...`・`cd frontend && npm run lint` がいずれもエラーなく終了する。
- PR を作成する(マージは人間が行う)。

## 4. スコープ外

- Windows・Linux での確認。macOS でのみ確認する。
- 3D 散布図のホイールによるズーム。投影に距離の概念を導入する変更になるため、回転の操作だけを入れる。
- 3D 散布図以外のパネルへの操作の追加。
- パネルの追加、画面の切り替え、設定 UI。
- 擬似データの生成方式の変更。ノードの数と配置は変えるが、Go 側が生成してフロントエンドが写像する分担は保つ。
- `wails dev` でホットリロードが効かない件(WebView のオリジンが `wails.localhost` になり、Next の HMR が `wss` を選んで接続できない。既知で、実害は「ホットリロードが効かない」ことだけ)。

## 5. 人間が承認済みの決定(再検討しない)

1. 3 点を 1 つの roadmap にまとめ、unit へ切り分ける(3 つの独立した依頼にはしない)。
2. レイアウトの配置案は、既存ダッシュボードを調査したうえで複数案を仕様のゲートで提示し、ユーザーが選ぶ。出発点の案(ログ縦長・グラフ大・タコメータ下部)を確定仕様として扱わない。
3. パネルの見出し行(`h2` と区切り線)は削除する。キャンバス内に小さく残す案は採らない。README の画面表から「枠の題名」列を落とす改訂を含める。
4. 3D 散布図の操作はドラッグで回転、ドラッグを終えると自動回転へ戻る。「操作したら自動回転を止める」案とホイールズームは採らない。

## 6. 現在地と既存コードの事実(2026-09-06 に実物で確認済み)

- ブランチ `wip/visual-refinement`(`main` の `e95a03c` から作成)。
- `docs/specs/001-dashboard-mvp/` は完了済み(凍結)。配下の unit は `001-dashboard-shell`・`002-scatter3d-panel`・`003-graph-panels`・`004-metrics-panels`・`005-framestats-runtime`。凍結済みの `docs/specs/001-dashboard-mvp/**` は編集しない。
- `frontend/src/components/DashboardGrid.tsx`: `grid h-dvh w-full grid-cols-3 grid-rows-2 gap-2 overflow-hidden p-2` で 6 枠を均等に割る。子はちょうど 6 個の `Panel` を前提とし、個数が違うと `console.error` を出す。Server Component。
- `frontend/src/components/Panel.tsx`: `section` の中に `h2`(見出し・下に区切り線)と本文領域を置く。Server Component。
- `frontend/src/components/Scatter3DPanel.tsx`: `YAW_RATE_RAD_PER_SEC = 0.24`。ヨーだけを自動で回し、ピッチは `SCATTER_PITCH`(`frontend/src/lib/project.ts`)で固定、視点を操作する口を持たない。軸線を描く処理は無い。
- `graphsource.go`: `graphNodeCount = 10` に「ノードの数。増減させない(spec.md §3 前提 3)」のコメントが付く。`newGraphSource` がノードを `2π i / graphNodeCount` の等角で円周上へ並べ、`graphAnchorRadius = 0.72` を半径に使う。この制約は unit `003-graph-panels` の凍結済み spec に由来する。制約を変えるなら、新しい unit の spec でその前提を置き換えると明記する。
- `frontend/src/lib/framestats.ts`: `recordFrame`・`frameReport`・`setFrameStatsEnabled` をモジュールから公開する。`window.nullops` に載るのは `enableFrameStats`・`disableFrameStats`・`frameReport` であり、`setFrameStatsEnabled` はコンソールから直接呼べない。既定は無効。
- `README.md`「画面」節: 「6 枠を 3 列 2 行に並べる」と、パネル・枠の題名・内容の 3 列の表がある。
- `frontend/node_modules` は無い。lint の前に `cd frontend && npm ci` が要る。
- macOS。Wails CLI v2.15.0。
