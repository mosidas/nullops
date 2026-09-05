# framestats-runtime — 実装タスク

上流: `spec.md`(同ディレクトリ)。要件 ID は同書 §7 の Requirement 番号を指す。

## Global Constraints

`CLAUDE.md` から逐語で写す(本 unit で効くものだけ)。

- 会話・ドキュメント・コード内コメント・PR/Issue 本文・コミットメッセージは日本語で記述しなければならない(MUST)。
- 画面に描画する擬似ログとラベルは英語にする。
- `any` を使わない。型が定まらない箇所は `unknown` で受けて絞り込む。
- 再描画のたびに新しい関数・オブジェクトを作らない(アニメーションの発火頻度が高いため)。
- Wails が生成するバインディング(`frontend/wailsjs/`)は手で編集しない。
- why / why not を書く。コードを読めば分かることは書かない。
- YAGNI: 将来の拡張性のためだけにコードを複雑化しない。過度な抽象化を避ける。
- 実在のシステム情報を読み取らず、外部へも通信しない。
- `frontend/dist` と `frontend/wailsjs` は `wails build` の生成物であり、リポジトリに含めない。

過去の unit の実測から引き継ぐ制約:

- チェックアウト直後は `go vet` / `go test` / `npm run lint` が通らない。先に `cd frontend && npm ci` と `wails build` を 1 度通してから検証コマンドを回す。
- `wails dev` はリポジトリを汚す(`frontend/tsconfig.json` の書き換え、`frontend/AGENTS.md` と `frontend/CLAUDE.md` の生成)。実行後は `git status` を確認し、コミットに混ぜない。

## File Structure Plan

| 種別 | パス | 内容 |
| :-- | :-- | :-- |
| 変更 | `frontend/src/lib/framestats.ts` | `NODE_ENV` の分岐を外し、実行時のフラグと `window.nullops` の口を足す(spec.md §5.1・§5.2) |
| 変更 | `frontend/next.config.ts` | 開発時のみ `assetPrefix` を絶対 URL にする(spec.md §5.3) |
| 新規 | `docs/specs/001-dashboard-mvp/005-framestats-runtime/spec.md` | 本 unit の仕様 |
| 新規 | `docs/specs/001-dashboard-mvp/005-framestats-runtime/tasks.md` | 本書 |
| 新規 | `docs/specs/001-dashboard-mvp/005-framestats-runtime/state.json` | 進行状態 |

パネルの 5 ファイル(`CommitGraphPanel` / `DependencyGraphPanel` / `GaugePanel` / `Scatter3DPanel` / `TimeseriesPanel`)は変更しない。`recordFrame` のシグネチャを変えないため。

## タスク一覧

- [x] 1. `wails dev` のハイドレーション不具合の原因特定と修正
  - 要件: 4.1 / 4.2 / 4.3 / 4.4
  - 対象: `frontend/next.config.ts`
  - 内容: `wails dev` を起動して資産の配信が正常であることを実測で確かめ、原因を実行側へ絞り込む。開発時のみ `assetPrefix` を `http://localhost:3000` にする。判断の根拠をコード内コメントへ残す。
  - 検証: `wails dev` を起動して `curl http://localhost:34115/` の `<script src>` が `http://localhost:3000/_next/...` になること。`wails build` 後の `frontend/dist/index.html` の資産参照が相対パスのままであること。
  - 依存: なし
- [x] 2. 計測器の実行時トグルと `window` の操作口
  - 要件: 1.1 / 1.2 / 1.3 / 1.4 / 2.1〜2.7 / 3.1 / 3.2
  - 対象: `frontend/src/lib/framestats.ts`
  - 内容: `const enabled = process.env.NODE_ENV !== 'production'` を可変フラグ(初期値 `false`)へ置き換え、`setFrameStatsEnabled` / `isFrameStatsEnabled` を足す。無効化時に標本と `lastReportAt` を捨てる。`window.nullops` へ `enableFrameStats` / `disableFrameStats` / `frameReport` を載せる。`any` を使わずグローバルの型を宣言する。
  - 検証: `cd frontend && npm run lint`。`grep` で `recordFrame` の呼び出し元が 5 パネルのままであること。
  - 依存: なし(タスク 1 と並行可)
- [x] 3. 検証コマンドの通し実行と実測手順の記載
  - 要件: 5.1 / 5.2 / 5.3 / 5.4 / 5.5
  - 対象: 本書の Implementation Notes
  - 内容: `go vet ./...`・`go test ./...`・`cd frontend && npm run lint`・`wails build` を通す。人間だけで再現できる実測手順を残す。
  - 依存: 1, 2

## Implementation Notes

### 未検証項目(人間が確認すべきこと)

本セッションのホストはターミナルへ macOS の画面収録権限を持たず、`screencapture` が sandbox の内外いずれでも `could not create image from display` で失敗する。画面と WebView のコンソールを読めないため、次は **UNVERIFIED** のまま残す。

| 要件 | 内容 | 確認の手順 |
| :-- | :-- | :-- |
| 4.1 | `wails dev` の画面に 6 パネルの中身が出る | 下の「A. `wails dev` の確認」 |
| 4.2 | `wss://…/_next/hmr` の接続失敗が出ない | 下の「A. `wails dev` の確認」の 4 |
| 1.1 / 1.2 | 何もしなければ計測が動かない | 下の「B. 配布ビルドでの実測」の 4 |
| 2.1〜2.3 / 2.5 | 有効化・報告・無効化 | 下の「B. 配布ビルドでの実測」の 5〜8 |

**コードを一時的に壊して確かめる手順は含めない。**

### A. `wails dev` の確認(所要 3 分)

1. `cd ~/repos/worktrees/nullops-framestats && wails dev` を実行する。
2. 起動したウィンドウで 6 枠すべてに中身が出ることを見る。期待は、左上から順に「英語のログ行が流れる」「コミットグラフの点と線」「折れ線」「グラフビューのノードとエッジ」「タコメータの針」「3D 散布図の点群が回る」。枠線と見出しだけなら **失敗** である。
3. ウィンドウを右クリック → `Inspect Element` で Web インスペクタを開く。
4. Console タブに `wss://wails.localhost:34115/_next/hmr` を含む行が **無い** こと、代わりに `[HMR] connected` が出ていることを見る。
5. 終了後に `git status` を確認し、`frontend/tsconfig.json` の変更と `frontend/AGENTS.md` / `frontend/CLAUDE.md` をコミットに混ぜない(`git checkout -- frontend/tsconfig.json && rm -f frontend/AGENTS.md frontend/CLAUDE.md`)。

### B. 配布ビルドでの実測(所要 5 分)

配布ビルドの WebView で Web インスペクタを開くには、開発者ツールを含めてビルドする必要がある。`-tags dev` ではなく `-debug` を使う(コードは同一で、インスペクタの有効化だけが変わる)。

1. `cd ~/repos/worktrees/nullops-framestats`
2. `wails build -debug` を実行する。生成物は `build/bin/nullops.app`。
   - **`-debug` を付けないビルドでは Web インスペクタを開けず、計測結果を読めない。**
   - `-debug` は Next.js の production ビルドを変えない(`frontend:build` は `npm run build` のままであり、React Strict Mode の二重描画も最小化の有無も配布ビルドと同じ)。したがってここで得た数値は配布ビルドの数値として扱ってよい。
3. `open build/bin/nullops.app` で起動する。6 パネルが描画され、動き続けることを見る。
4. ウィンドウを右クリック → `Inspect Element` で Web インスペクタを開き、Console タブを選ぶ。**この時点でコンソールに `[framestats]` の行が出ていないこと**を確認する(要件 1.1・1.2。既定で無効であることの確認)。
5. コンソールへ `nullops.enableFrameStats()` と打って実行する。
6. **30 秒以上待つ**。5 秒ごとに次の形の行が出る。

   ```
   [framestats] commit-graph n=… mean=… p95=… max=… | dependency-graph n=… … | gauge n=… … | scatter3d n=… … | timeseries n=… …
   ```

   - 標本は 1 パネルあたり最大 600 個(60 Hz で 10 秒ぶん)なので、`n` が 600 に張り付いてから読む。
   - `LogStreamPanel` はこの行に出ない(rAF のループを持たないため。spec.md §2 の対象外)。
7. **判定**: 5 つのパネルの `p95` を読む。**いずれかの `p95` が 20 ms を超える状態が続く**なら、rAF のループを 1 本へ共有する検討へ進む。すべて 20 ms 未満なら、いまのまま(パネルごとに rAF)でよい。
   - 20 ms は 60 Hz の 1 フレーム (16.7 ms) に対して 1 枚落ちが常態化していないかの境目である(`004-metrics-panels` spec.md §9.3)。
8. 途中で読みたくなったら `nullops.frameReport()` を実行する。5 秒の周期を待たずにその時点の 1 行が返る。測り直したいときは `nullops.disableFrameStats()` → `nullops.enableFrameStats()` で標本を捨ててから測る。
9. 読んだ数値は本書ではなく issue のログへ残す(依頼者の指示)。

### 本セッションで実行した検証コマンドと結果

タスク 3 の完了時に追記する。

### 原因特定で実測した内容(タスク 1)

`spec.md` §8.1・§8.2 に記載。要点は次のとおり。

- `wails dev` の資産配信は正常だった。HTML が参照する 17 本の script/link をすべて `http://localhost:34115` 経由で取得し、全て `200` を返した。**取得の失敗ではない。**
- ページのオリジンは `wails://wails.localhost:34115` であり scheme が `http:` でない。Next の `getSocketUrl` はこの場合 `wss:` を選ぶため、TLS サーバの無い `wss://wails.localhost:34115/_next/hmr` へ繋ぎに行く。
- この WebSocket の生成は `hydrateRoot` より前に走る(`next/dist/client/app-index.js` の `hydrate()`)。開発ビルドにしか無い経路のうち、ハイドレーションより前に走るのはここだけである。
- 依頼で渡された中継役の見立て(HMR の TLS 失敗)は、**接続先の URL が `wss://wails.localhost:34115/_next/hmr` になる仕組みまでは裏が取れた**。それがハイドレーションを止めている最終段は WebView のコンソールを読めないため未確定(spec.md §8.1 の UNVERIFIED)。
