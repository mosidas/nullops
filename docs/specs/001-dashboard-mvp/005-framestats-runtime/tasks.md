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
| 新規 | `docs/specs/001-dashboard-mvp/005-framestats-runtime/spec.md` | 本 unit の仕様 |
| 新規 | `docs/specs/001-dashboard-mvp/005-framestats-runtime/tasks.md` | 本書 |
| 新規 | `docs/specs/001-dashboard-mvp/005-framestats-runtime/state.json` | 進行状態 |

パネルの 5 ファイル(`CommitGraphPanel` / `DependencyGraphPanel` / `GaugePanel` / `Scatter3DPanel` / `TimeseriesPanel`)は変更しない。`recordFrame` のシグネチャを変えないため。

## タスク一覧

当初のタスク 1(`wails dev` のハイドレーション不具合の原因特定と修正)は、依頼者の判断で本 unit の範囲から外した(2026-09-05。spec.md §2 の対象外)。進んだところ・進まなかったところの記録は下の付録に残す。番号 2・3 を詰めないのは、最終検証の記録がタスク番号で参照しているため。

- [x] 2. 計測器の実行時トグルと `window` の操作口
  - 要件: 1.1 / 1.2 / 1.3 / 1.4 / 2.1〜2.7 / 3.1 / 3.2
  - 対象: `frontend/src/lib/framestats.ts`
  - 内容: `const enabled = process.env.NODE_ENV !== 'production'` を可変フラグ(初期値 `false`)へ置き換え、`setFrameStatsEnabled` を足す。無効化時に標本と `lastReportAt` を捨てる。`window.nullops` へ `enableFrameStats` / `disableFrameStats` / `frameReport` を載せる。`any` を使わずグローバルの型を宣言する。
  - 検証: `cd frontend && npm run lint`。`grep` で `recordFrame` の呼び出し元が 5 パネルのままであること。
  - 依存: なし
- [x] 3. 検証コマンドの通し実行と実測手順の記載
  - 要件: 5.1 / 5.2 / 5.3 / 5.4 / 5.5
  - 対象: 本書の Implementation Notes
  - 内容: `go vet ./...`・`go test ./...`・`cd frontend && npm run lint`・`wails build` を通す。人間だけで再現できる実測手順を残す。
  - 依存: 2

## Implementation Notes

### 未検証項目(人間が確認すべきこと)

本セッションのホストはターミナルへ macOS の画面収録権限を持たず、`screencapture` が sandbox の内外いずれでも `could not create image from display` で失敗する。画面と WebView のコンソールを読めないため、次は **UNVERIFIED** のまま残す。

| 要件 | 内容 | 確認の手順 |
| :-- | :-- | :-- |
| 1.1 / 1.2 | 何もしなければ計測が動かない | 下の「B. 配布ビルドでの実測」の 5 |
| 2.1〜2.3 / 2.5 | 有効化・報告・無効化 | 下の「B. 配布ビルドでの実測」の 6〜10 |

**コードを一時的に壊して確かめる手順は含めない。**

### B. 配布ビルドでの実測(所要 8 分)

配布ビルドの WebView で Web インスペクタを開くには、開発者ツールを有効にしてビルドする必要がある。`wails build` の `-devtools` は production ビルドのまま開発者ツールだけを有効にする(wails v2.15.0 の `pkg/commands/build/base.go` が `devtools` タグを足し、`debug` タグは足さない)。`-debug` は Go 側もデバッグ構成に変えてしまうため使わない。

1. 作業ツリーのルートへ移動する。
2. `wails build -devtools` を実行する。生成物は `build/bin/nullops.app`。
   - **`-devtools` を付けないビルドでは Web インスペクタを開けず、計測結果を読めない。**
   - `-devtools` は Next.js のビルドを変えない(`wails.json` の `frontend:build` は `npm run build` のままで、React Strict Mode の二重描画も最小化の有無も配布ビルドと同じ)。したがってここで得た数値は配布ビルドの数値として扱ってよい。
3. `open build/bin/nullops.app` で起動する。6 パネルが描画され、動き続けることを見る。
4. Web インスペクタを開く。**`-devtools` ビルドでは右クリックのコンテキストメニューが出ない**(wails v2.15.0 は `debug` タグが無いとき `disableDefaultContextMenu` を立て、production のランタイムが `contextmenu` を `preventDefault` する)。開き方は次のいずれか。
   - **⌘⇧F12**(`internal/frontend/desktop/darwin/inspector_dev.go` が `devtools` タグ付きビルドで登録するキー)。
   - Safari を起動し、メニューバーの「開発」→「(このマシン名)」→ `nullops` を選んでアタッチする(Safari 側で「開発」メニューを有効にしておく)。
   - **この 2 つは本セッションでソースから読み取っただけで、実機では未確認である。** どちらで開けたかを報告してほしい。
5. Console タブを選び、`nullops.frameReport()` を実行する。**`[framestats] disabled` が返ること**を確認する(要件 1.1・1.2。既定で無効であることの確認。「行が出ていない」という不在の観察より確実)。
6. `nullops.enableFrameStats()` を実行する。**直後に `[framestats] enabled` の 1 行が出ること**を確認する(有効化できた合図)。
7. **アプリのウィンドウを前面に出し、他のウィンドウで覆わないまま 40 秒以上待つ。** WKWebView は背面化・遮蔽時に `requestAnimationFrame` の発火を絞るため、インスペクタだけを見ていると実力より悪い値が出る。インスペクタは横へ並べるか、別のディスプレイへ置く。
8. 5 秒ごとに次の形の行が出る。

   ```
   [framestats] commit n=… mean=… p95=… max=… | depgraph n=… … | gauge n=… … | scatter n=… … | timeseries n=… …
   ```

   - パネル名は各コンポーネントの `PANEL_NAME` 定数(`commit` / `depgraph` / `gauge` / `scatter` / `timeseries`)であり、画面の見出しとは別物である。
   - 標本は 1 パネルあたり最大 600 個(60 Hz で 10 秒ぶん)なので、`n` が 600 に張り付いてから読む。
   - `LogStreamPanel` はこの行に出ない(rAF のループを持たないため。spec.md §2 の対象外)。
9. **判定**: `[framestats]` の行のうち**最後の 6 行(30 秒ぶん)**を記録する。その 6 行すべてで、**同じパネルの `p95` が 20 ms を超えている**なら、rAF のループを 1 本へ共有する検討へ進む。1 行でも 20 ms 未満に戻るパネルは「継続して超えている」とは見なさない。
   - 20 ms は 60 Hz の 1 フレーム (16.7 ms) に対して 1 枚落ちが常態化していないかの境目である(`004-metrics-panels` spec.md §9.3)。判定の回数の数え方は同 §9.2 に揃えた。
   - **境目付近(18〜22 ms)に出た場合は、そのまま結論にしない。** Web インスペクタを接続した状態が計測値へ与える影響を評価していないため(spec.md §8.1 の案 E)。その旨を添えて報告してほしい。
10. 途中で読みたくなったら `nullops.frameReport()` を実行する。5 秒の周期を待たずにその時点の 1 行が返る(有効化した直後でまだ標本が無いときは `[framestats] no samples` が返る)。測り直したいときは `nullops.disableFrameStats()` → `nullops.enableFrameStats()` で標本を捨ててから測る。
11. 読んだ数値は本書ではなく issue のログへ残す(依頼者の指示)。

### 本セッションで実行した検証コマンドと結果

| コマンド | 結果 |
| :-- | :-- |
| `cd frontend && npm ci` | 成功(`found 0 vulnerabilities`) |
| `go vet ./...` | 終了コード 0(要件 5.1) |
| `go test ./...` | `ok nullops` / `ok nullops/feed`(要件 5.2) |
| `cd frontend && npm run lint` | `Checked 22 files. No fixes applied.`(要件 5.3) |
| `cd frontend && npx tsc --noEmit` | 終了コード 0 |
| `wails build` | 終了コード 0(要件 5.4) |

コマンド以外に実測した内容:

- **要件 2.7**: `wails build` が出力した production の chunk に、最小化後のコードとして `{let e=window.nullops??{};e.enableFrameStats=…,e.disableFrameStats=…,e.frameReport=l,window.nullops=e}` が残っていることを確認した(`frontend/dist/_next/static/chunks/` を `grep`)。
- **要件 3.1 / 3.2**: `recordFrame` の呼び出しは 5 パネルのみで、`LogStreamPanel` は呼ばない。パネル名は `commit` / `depgraph` / `gauge` / `scatter` / `timeseries`。
- **撤回した `assetPrefix` 案の実測**(spec.md 付録 A.2 の案 B): `wails dev` の HTML の `/_next/` 配下の参照は絶対 URL になり、cross-origin の遮断にも当たらないことを確認した。ただし HMR の接続先が変わらないため撤回した。
- **修正前の切り分け**: `wails dev` の HTML が参照する 17 本の script/link をすべて `http://localhost:34115` 経由で取得し、全て `200` を返した。取得の失敗ではない。
- **cross-origin の遮断が起きないこと**: `Referer: wails://wails.localhost:34115/` + `Sec-Fetch-Site: cross-site` / `Sec-Fetch-Mode: no-cors` を付けた JS・CSS の取得がいずれも `200`、`Origin: wails://wails.localhost:34115` を付けた `ws://localhost:3000/_next/hmr` の handshake が `101 Switching Protocols` だった。

### 最終検証パネルの結果(1 回目: 3 観点、いずれも NO-GO)

範囲を縮小する前(`wails dev` の不具合を含む)の判定。指摘への対応はこの表のとおり済ませ、縮小後に 2 回目を再実行した(次節)。

| 観点 | 主な指摘 | 対応 |
| :-- | :-- | :-- |
| 仕様適合 | 仕様と手順が挙げるパネル名(`commit-graph` 等)が実装の `PANEL_NAME`(`commit` 等)と一致しない | 修正した(spec.md 3.1・本書 B.8) |
| 仕様適合 | spec §5.2 の型が `NullopsConsoleApi`、実装は `Partial<NullopsConsoleApi>` | spec 側を実装に合わせ、理由を添えた |
| 仕様適合 | `window.nullops` を上書きしない理由のコメントが「将来の拡張のため」になっており YAGNI と逆向き | コメントを書き直した |
| 原因分析 | **`assetPrefix` 案は HMR の接続先を変えない**(クライアントは `getAssetPrefix()` の pathname のみを使う) | 変更を撤回し、原因分析(現在は spec 付録 A.1・A.2)を書き直した。タスク 1 は `_Blocked:` とし、のちに範囲から外した |
| 原因分析 | 「ハイドレーション前に走る dev 専用の経路は HMR だけ」は誤り | 残る候補を spec 付録 A.1 に列挙した |
| 原因分析 | 観測系(Web インスペクタ)が計測値へ与える影響が未評価 | spec §8.1 に案 E として残し、本書 B.9 に注意を足した |
| 手順の再現性 | `-devtools` ビルドでは右クリックのコンテキストメニューが出ない | B.4 を ⌘⇧F12 / Safari のアタッチへ差し替えた(実機未確認である旨も明記) |
| 手順の再現性 | 判定の「続く」が回数で定義されていない | B.9 で「最後の 6 行(30 秒ぶん)」に揃えた |
| 手順の再現性 | 既定で無効であることの確認が「行が出ていない」という不在の観察のみ | B.5 を `nullops.frameReport()` が `[framestats] disabled` を返すことの確認に変えた |

## 付録: `wails dev` の表示不具合(別の依頼への申し送り)

本 unit の範囲外(spec.md §2)。別の依頼を担当するセッションと、情報を集める人間のために残す。原因分析の本文は spec.md 付録 A にある。

元のタスク定義(範囲から外した時点の状態):

- (外した)1. `wails dev` のハイドレーション不具合の原因特定と修正 — _Blocked だった理由: 原因の確定に WebView のコンソールの最初の例外が要る。本セッションのホストは画面を撮れず読めない。付録 2を人間が実行して情報を返すまで進められない。_
  - 要件: 4.1(現在は欠番。spec.md Requirement 4)
  - 進んだところ: 資産の配信が正常であること(17 本の script/link が全て `200`)を実測で確かめ、原因を実行側へ絞り込んだ。オリジンが `wails://wails.localhost:34115` であること、Next の HMR が必ず `wss://wails.localhost:34115/_next/hmr` を選ぶこと、その生成が `hydrateRoot` より前に走ることをソースで裏取りした(spec.md 付録 A.1)。
  - 進まなかったところ: `assetPrefix` を開発時のみ絶対 URL にする案を一度入れたが、クライアントが使うのは `next.config.ts` の値ではなく `getAssetPrefix()` の戻り値(pathname のみ)であり、HMR の接続先が 1 文字も変わらないことが分かったため撤回した(spec.md 付録 A.2 の案 B)。
  - 依存: 付録 2 の結果

### 付録 1. `wails dev` の現状確認(所要 1 分)

1. 作業ツリーのルートで `wails dev` を実行する。
2. 起動したウィンドウを見る。**現状は 6 枠の枠線と見出しだけが出る**(本 unit の範囲外。別の依頼で扱う)。中身が出ていれば状況が変わっているので、その旨を報告してほしい。
3. 終了後に `git status` を確認し、`frontend/tsconfig.json` の変更と `frontend/AGENTS.md` / `frontend/CLAUDE.md` をコミットに混ぜない(`git checkout -- frontend/tsconfig.json && rm -f frontend/AGENTS.md frontend/CLAUDE.md`)。

### 付録 2. 原因の切り分け(`wails dev` の表示不具合。所要 3 分)

別の依頼で原因を確定するために要る情報を集める手順。**直す手順ではない。**

1. 作業ツリーのルートで `wails dev` を実行する。
2. 起動したウィンドウで Web インスペクタを開く。`wails dev` は debug 構成なので、**右クリック → `Inspect Element` で開ける**(B とはここが違う)。
3. Console タブを選び、**インスペクタを開いたままウィンドウを再読み込みする**(インスペクタのフォーカスで ⌘R、または Console で `location.reload()`)。起動時の例外はインスペクタを開く前に流れてしまうため、この再読み込みが要る。
4. **コンソールに最初に出た赤いエラーの全文**(メッセージとスタックトレース)を記録する。特に次のどれに当たるかが分かれば原因が決まる。
   - `InvariantError` / `E806`(`Expected a request ID to be defined for the document via self.__next_r`)
   - `InvariantError` / `E783` / `E784`(`Expected document.currentScript to be a <script> element` など)
   - `SecurityError` を伴う `WebSocket` の生成失敗
   - 上のいずれでもない別の例外
   - **`wss://…/_next/hmr` の TLS エラーしか出ておらず、赤いエラーが 1 つも無い**
5. あわせて Console で `document.documentElement.id` を評価した結果と、`typeof self.__next_r` の結果を記録する。
6. Network タブでステータスが `200` 以外の要求が無いことを確認する。
7. 記録した内容を別の依頼へ添えてほしい。それで原因の確定に進める。

### 付録 3. 原因特定で実測した内容(元タスク 1)

`spec.md` 付録 A.1・A.2 に記載。要点は次のとおり。

- `wails dev` の資産配信は正常だった。HTML が参照する 17 本の script/link をすべて `http://localhost:34115` 経由で取得し、全て `200` を返した。**取得の失敗ではない。**
- ページのオリジンは `wails://wails.localhost:34115` であり scheme が `http:` でない。Next の HMR は `getAssetPrefix()` が pathname しか返さないため必ず `window.location` へ落ち、`wss://wails.localhost:34115/_next/hmr` を選ぶ。TLS サーバは無いので必ず失敗する。
- この WebSocket の生成は `hydrateRoot` より前に走る(`next/dist/client/app-index.js` の `hydrate()`)。
- **ただし `new WebSocket()` は TLS の失敗で同期例外を投げないため、これだけではハイドレーションが止まる説明にならない。** 中継役の見立て(HMR の TLS 失敗が原因)は、接続先が `wss://…` になる仕組みまでは裏が取れたが、**それが原因であることは裏が取れていない**。残る候補は spec.md 付録 A.1 の末尾に並べた。
- `assetPrefix` を触ってもこの接続先は変わらない(クライアントは `next.config.ts` の値を使わない)。効かないので入れていない。
