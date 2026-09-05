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
  _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 3.1, 3.2_
  _Boundary: framestats_
  - 対象ファイル: `frontend/src/lib/framestats.ts`(変更)
  - 内容: `const enabled = process.env.NODE_ENV !== 'production'` を可変フラグ(初期値 `false`)へ置き換え、`setFrameStatsEnabled` を足す。無効化時に標本と `lastReportAt` を捨てる。`window.nullops` へ `enableFrameStats` / `disableFrameStats` / `frameReport` を載せる。`any` を使わずグローバルの型を宣言する。
  - 検証コマンド: `cd frontend && npm run lint`。`grep -rn "recordFrame(" frontend/src --include="*.tsx"` で呼び出し元が 5 パネルのままであること。
  - 依存: なし
- [x] 3. 検証コマンドの通し実行と実測手順の記載
  _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_
  _Boundary: docs_
  - 対象ファイル: 本書の Implementation Notes(`docs/specs/001-dashboard-mvp/005-framestats-runtime/tasks.md`)
  - 内容: `go vet ./...`・`go test ./...`・`cd frontend && npm run lint`・`wails build` を通す。人間だけで再現できる実測手順を残す。
  - 検証コマンド: `cd frontend && npm ci && wails build && go vet ./... && go test ./... && (cd frontend && npm run lint)`
  - 依存: 2

## Implementation Notes

### 未検証項目(人間が確認すべきこと)

本セッションのホストはターミナルへ macOS の画面収録権限を持たず、`screencapture` が sandbox の内外いずれでも `could not create image from display` で失敗する。画面と WebView のコンソールを読めないため、次は **UNVERIFIED** のまま残す。

| 要件 | 内容 | 確認の手順 |
| :-- | :-- | :-- |
| 1.1 / 1.2 | 何もしなければ計測が動かない | 下の「B. 配布ビルドでの実測」の 5 |
| 2.1〜2.3 | 有効化・報告 | 下の「B. 配布ビルドでの実測」の 6〜10 |
| 2.5 | 無効化で記録が止まり標本が捨てられる | 下の「B. 配布ビルドでの実測」の 10(無効化後の 3 つの観測) |

**コードを一時的に壊して確かめる手順は含めない。**

### B. 配布ビルドでの実測(所要 8 分)

節の記号 B は範囲縮小前の採番の名残(A・C・D は `wails dev` の手順で、付録 1〜3 へ移した)。手順内の `B.n` はこの節の項番 n を指す。

配布ビルドの WebView で Web インスペクタを開くには、開発者ツールを有効にしてビルドする必要がある。`wails build` の `-devtools` は production ビルドのまま開発者ツールだけを有効にする(wails v2.15.0 の `pkg/commands/build/base.go` が `devtools` タグを足し、`debug` タグは足さない)。`-debug` は Go 側もデバッグ構成に変えてしまうため使わない。

1. 作業ツリーのルートへ移動する。前提は wails CLI と Xcode コマンドラインツールが入っていること(`CLAUDE.md` の「開発コマンド」と同じ)。`npm ci` は `wails build` が `wails.json` の `frontend:install` で回すため、別途は要らない。
2. `wails build -devtools` を実行する。生成物は `build/bin/nullops.app`。
   - **`-devtools` を付けないビルドでは Web インスペクタを開けず、計測結果を読めない。**
   - `-devtools` は Next.js のビルドを変えない(`wails.json` の `frontend:build` は `npm run build` のままで、React Strict Mode の二重描画も最小化の有無も配布ビルドと同じ)。したがってここで得た数値は配布ビルドの数値として扱ってよい。
3. `open build/bin/nullops.app` で起動する。6 パネルが描画され、動き続けることを見る。
4. Web インスペクタを開く。**`-devtools` ビルドでは右クリックのコンテキストメニューが出ない**(wails v2.15.0 は `debug` タグが無いとき `disableDefaultContextMenu` を立て、production のランタイムが `contextmenu` を `preventDefault` する)。開き方は次のいずれか。
   - **⌘⇧F12**(`internal/frontend/desktop/darwin/inspector_dev.go` が `devtools` タグ付きビルドで登録するキー)。
   - Safari を起動し、メニューバーの「開発」→「(このマシン名)」→ `nullops` を選んでアタッチする(Safari 側で「開発」メニューを有効にしておく)。
   - **この 2 つは本セッションでソースから読み取っただけで、実機では未確認である。** まず ⌘⇧F12 を試し、開かなければ Safari のアタッチを試す。Safari 側は wails v2.15.0 が `WKWebView.isInspectable` を設定しない(`developerExtrasEnabled` のみ)ため、macOS 13.3 以降では「開発」メニューに現れない可能性がある。どちらで開けたかを報告してほしい。
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
   - `004-metrics-panels` spec.md §9.2 にある「ウィンドウを最大化して繰り返す」は本手順に含めない。まず既定のウィンドウサイズで判定に足る値を取ることを優先する。余裕があれば最大化して同じ 6〜9 を繰り返し、両方の値を報告してほしい。
9. **判定**: `[framestats]` の行のうち**最後の 6 行(30 秒ぶん)**を記録する。その 6 行すべてで、**同じパネルの `p95` が 20 ms を超えている**なら、rAF のループを 1 本へ共有する検討へ進む。1 行でも 20 ms 未満に戻るパネルは「継続して超えている」とは見なさない。
   - 20 ms は 60 Hz の 1 フレーム (16.7 ms) に対して 1 枚落ちが常態化していないかの境目である(`004-metrics-panels` spec.md §9.3)。判定の回数の数え方は同 §9.2 に揃えた。
   - **境目付近(18〜22 ms)に出た場合は、そのまま結論にしない。** Web インスペクタを接続した状態が計測値へ与える影響を評価していないため(spec.md §8.1 の案 E)。その旨を添えて報告してほしい。
10. 途中で読みたくなったら `nullops.frameReport()` を実行する。5 秒の周期を待たずにその時点の 1 行が返る(有効化した直後で `recordFrame` が 1 度も走っていなければ `[framestats] no samples`、1 フレームでも走っていれば各パネル `n=0` の行が返る)。無効化を確かめるには `nullops.disableFrameStats()` を実行し、次の 3 つを観測する(要件 2.5): (a) 直後に `[framestats] disabled` の 1 行が出る、(b) 以降 5 秒ごとの報告行が止まる、(c) `nullops.frameReport()` が `[framestats] disabled` を返す。測り直すときはそのまま `nullops.enableFrameStats()` を実行し、`n` が小さい値から積み直すことを見る(標本が捨てられた証拠)。
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

範囲を縮小する前(`wails dev` の不具合を含む)の判定。指摘への対応はこの表のとおり済ませ、縮小後に 2 回目を再実行した(下の「最終検証パネルの結果(2 回目)」)。

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

### 最終検証パネルの結果(2 回目: 範囲縮小後)

観点は 1 回目の「原因分析」を範囲縮小に伴って外し、代わりに「規約と構造」を入れた。3 体を同じ作業ツリーで逐次に走らせた(並列にしない)。検証コマンドはオーケストレーターが 1 度だけ実行し、出力ファイルを各観点へ渡した。

| 観点 | 判定 | 主な指摘 | 対応 |
| :-- | :-- | :-- | :-- |
| 仕様適合(requirements-conformance) | NO-GO → 再投入で GO(下記) | `state.json` に範囲縮小前の手書き `blocked` が残り、存在しない節「D. 原因の切り分け」を参照していた(Critical) | エンジンのスキーマに無いキーを取り除いた。経緯は本書の付録に一本化 |
| 仕様適合 | 同上 | 「次節」の参照先が無い・節記号 B が単独(Nit) | 参照先を明示し、B の由来を 1 行足した |
| 規約と構造(structure + CLAUDE.md) | GO | `frameReport` の export 理由のコメントが本 unit の変更で陳腐化(Nit) | コメントを書き直した |
| 規約と構造 | GO | `window.nullops ?? {}` は先客がオブジェクト以外のとき TypeError になる(Nit) | **見送り。** spec.md §5.2 が「既存の値があれば上書きせず載せる」を明文で要求しており、書く主体は本モジュールだけ(grep で他に無い)。実現しうる状態は `undefined` かオブジェクトのみで現行で正しく動く。条件を足すと仕様の変更になる |
| 規約と構造 | GO | `setFrameStatsEnabled` は export されているが import 元が無い(FYI) | 見送り。spec.md §5.1 が公開 API として宣言している |
| 規約と構造 | GO | `samples.shift()` が毎フレーム O(n)(観点外の FYI) | 見送り。004 からの据え置きで本 unit の変更行ではない。実測で計測器自身の負荷が疑われたら別 unit で扱う(下の「残った懸念」) |
| 手順の再現性 | GO | B.10 の `no samples` の条件が厳密でない / 2.5 の期待観測が薄い / Safari アタッチは `isInspectable` 未設定で現れない可能性 / 004 §9.2 の「最大化して繰り返す」を引き継いでいない / 前提ツールの明記が無い / 付録 2 に汚染のクリーンアップが無い(いずれも Nit・FYI) | すべて手順へ反映した |

### 最終検証の照合(要件 ID → 照合した対象 → 立証の手段)

| ID | 照合した対象 | 立証の手段 | 観点 |
| :-- | :-- | :-- | :-- |
| 1.1 | `framestats.ts` の `let enabled = false` と `recordFrame` 先頭の早期 return。有効化の呼び出し元が `setFrameStatsEnabled` 以外に無い | 静的な読み合わせ + grep。実機は人間の手順 B.5 | 仕様適合 |
| 1.2 | `console.info` の到達点 3 箇所がいずれも無効時に到達しない | 静的な読み合わせ。実機は B.5 | 仕様適合 |
| 1.3 | `process.env` の出現がコメントのみ。production chunk にフラグ判定が残る | grep + 配布ビルド chunk の grep ログ | 仕様適合 |
| 1.4 | 標本追加・`last` 更新・報告のいずれよりも前に return | 読み合わせ | 仕様適合 |
| 2.1 | `enableFrameStatsFromConsole` → `setFrameStatsEnabled(true)` → 以降の `recordFrame` が積む | 読み合わせ。実機は B.6〜8 | 仕様適合 |
| 2.2 | 5000 ms 周期の `console.info(frameReport())` と出力形式 | 読み合わせ。実機は B.8 | 仕様適合 |
| 2.3 | `api.frameReport = frameReport` | 読み合わせ。実機は B.10 | 仕様適合 |
| 2.4 | `frameReport` 先頭の `[framestats] disabled` | 読み合わせ | 仕様適合 |
| 2.5 | `disableFrameStatsFromConsole` → `enabled = false`・`stats.clear()`・`lastReportAt = 0` | 読み合わせ。実機は B.10 | 仕様適合 |
| 2.6 | 再有効化後の初回 `recordFrame` は新規エントリで `last === 0` のため間隔を作らない | 読み合わせ | 仕様適合 |
| 2.7 | 最小化済み chunk に `window.nullops??{}` と `window.nullops=e` が残る | 配布ビルド生成物の grep ログ | 仕様適合 |
| 3.1 | 呼び出し元 5 件と `PANEL_NAME` が `commit` / `depgraph` / `gauge` / `scatter` / `timeseries` | grep | 仕様適合・手順の再現性 |
| 3.2 | `LogStreamPanel.tsx` に import も呼び出しも無い | grep | 仕様適合 |
| 5.1〜5.4 | `go vet` / `go test` / `npm run lint` / `wails build` の出力ファイル | 終了コード 0 のログ | 仕様適合 |
| 5.5 | 手順 B.1〜B.11 が `wails dev` を要求せず、文字列・関数名・パネル名が実装と逐語一致。wails v2.15.0 のソースで `-devtools` / ⌘⇧F12 / コンテキストメニュー無効を裏付け | 文書と実装・wails ソースの照合 | 手順の再現性 |
| 規約 | `any` 不使用・毎フレームの生成物なし・why コメント・依存方向・スメル 12 種・日本語規約・色の直値なし | 読み合わせ + grep + tsc/lint ログ | 規約と構造 |

### 凍結文書との乖離

| 乖離 | 判定 | 置き場 |
| :-- | :-- | :-- |
| spec.md §5.1 の宣言は `setFrameStatsEnabled(enabled: boolean)`、実装の仮引数は `next` | 実装が正しい(モジュール変数 `enabled` とのシャドウを避ける)。位置引数なので契約に影響しない | 局所的な命名のため恒久情報へは置かない。次に framestats.ts を触る unit がシグネチャを写すときに `next` を採る |
| spec.md 2.2 は 1 パネルぶんの断片で書かれ、実装は `|` 区切りで 5 パネルを 1 行に連結する | 記述の粒度差で齟齬ではない(004 spec §9.1 と本書 B.8 が連結形を示す) | 本書 B.8 の例で足りる |

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
7. 終了後に `git status` を確認し、`wails dev` が汚したファイルをコミットに混ぜない(付録 1 の 3 と同じ: `git checkout -- frontend/tsconfig.json && rm -f frontend/AGENTS.md frontend/CLAUDE.md`)。
8. 記録した内容を別の依頼へ添えてほしい。それで原因の確定に進める。

### 付録 3. 原因特定で実測した内容(元タスク 1)

`spec.md` 付録 A.1・A.2 に記載。要点は次のとおり。

- `wails dev` の資産配信は正常だった。HTML が参照する 17 本の script/link をすべて `http://localhost:34115` 経由で取得し、全て `200` を返した。**取得の失敗ではない。**
- ページのオリジンは `wails://wails.localhost:34115` であり scheme が `http:` でない。Next の HMR は `getAssetPrefix()` が pathname しか返さないため必ず `window.location` へ落ち、`wss://wails.localhost:34115/_next/hmr` を選ぶ。TLS サーバは無いので必ず失敗する。
- この WebSocket の生成は `hydrateRoot` より前に走る(`next/dist/client/app-index.js` の `hydrate()`)。
- **ただし `new WebSocket()` は TLS の失敗で同期例外を投げないため、これだけではハイドレーションが止まる説明にならない。** 中継役の見立て(HMR の TLS 失敗が原因)は、接続先が `wss://…` になる仕組みまでは裏が取れたが、**それが原因であることは裏が取れていない**。残る候補は spec.md 付録 A.1 の末尾に並べた。
- `assetPrefix` を触ってもこの接続先は変わらない(クライアントは `next.config.ts` の値を使わない)。効かないので入れていない。
