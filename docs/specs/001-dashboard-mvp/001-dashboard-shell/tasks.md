# dashboard-shell — 実装タスク

> 仕様の詳細は同じディレクトリの仕様文書 spec.md を参照する。
> このファイルには仕様を転記しない。

## File Structure Plan

| ファイルパス | 区分 | 責務 |
| ------------ | ---- | ---- |
| `logline.go` | 新規 | `Level` / `Phase` / `LogLine` の型と、不変条件を強制する非公開の完全コンストラクタ |
| `logline_test.go` | 新規 | 完全コンストラクタの正常系と不変条件違反ごとの error 経路 |
| `scenario.go` | 新規 | 擬似的な作業フェーズの巡回（読み取り時に遅延で進める。ゴルーチンを持たない） |
| `scenario_test.go` | 新規 | 注入した `now` によるフェーズ遷移・多段遷移・保持時間の引き直し・並行安全性 |
| `logsource.go` | 新規 | ログフィードの生成器（`Source` の実装）とリングバッファ |
| `logsource_test.go` | 新規 | Seq の採番・間隔の範囲・フェーズ別の候補集合・保持上限・Snapshot のコピー |
| `snapshot.go` | 新規 | `DashboardSnapshot`（バインディングの戻り値型。後続作業単位の拡張点） |
| `emitter.go` | 新規 | `feed.Emitter` の Wails 実装（`runtime.EventsEmit` への委譲） |
| `app.go` | 変更 | `App` のライフサイクル（ctx / cancel / done）・`Snapshot`・`Greet` の削除 |
| `app_test.go` | 新規 | `startup` の送出経路、`shutdown` の停止保証、`Snapshot` の副作用なし・空配列 |
| `main.go` | 変更 | `OnShutdown` の結線とウィンドウ寸法（起動サイズ・最小サイズ） |
| `feed/feed.go` | 新規 | `Source` / `Emitter` インターフェース（利用側パッケージでの定義） |
| `feed/runner.go` | 新規 | `Runner`・`NewRunner`・`Run`（Source ごとのゴルーチン駆動と停止保証） |
| `feed/runner_test.go` | 新規 | 擬似 `Emitter` / `Source` による駆動・事前条件違反・キャンセル時の停止 |
| `frontend/src/app/globals.css` | 変更 | デザイントークンの正本（`@theme`）。ダーク 1 系統・等幅を既定にする |
| `frontend/src/app/layout.tsx` | 変更 | `metadata` の置き換えと `next/font/google`（Geist / Geist_Mono）の除去 |
| `frontend/src/app/page.tsx` | 変更 | デモ UI の除去と 6 枠の配置（`Log Stream` 以外はプレースホルダ） |
| `frontend/src/components/Panel.tsx` | 新規 | 見出しと内側スクロールを持つ共通の枠 |
| `frontend/src/components/DashboardGrid.tsx` | 新規 | 3 列 × 2 行のグリッドと子要素数の検査 |
| `frontend/src/components/LogStreamPanel.tsx` | 新規 | ログ行の購読・併合・表示上限・追従スクロール・重大度の配色 |
| `frontend/src/lib/feed.ts` | 新規 | `subscribeLog` / `loadSnapshot`（Wails ランタイムとの境界） |
| `docs/specs/001-dashboard-mvp/001-dashboard-shell/tasks.md` | 変更 | 目視検証タスクの観察結果を `## Implementation Notes` へ記録する |

補足（計画の根拠と、意図的に置かなかったもの）:

- **削除するファイルは無い**。廃止するのは `App.Greet` メソッドと `page.tsx` のデモ UI であり、いずれもファイル単位の削除ではない。`Greet` は参照元（`page.tsx`）を先に置き換えるタスク 1.5 を先行させ、使用ゼロを確認してからタスク 4.4 で削除する。`frontend/public` の画像は spec.md §2 スコープ外のため残す。
- **ドキュメント反映のタスクを置かない**。用語集への追記を行わないことは spec.md §8 が定めており、`README.md`「画面」表と実画面の一致確認は roadmap.md §1.1 が作業単位 `metrics-panels` の完了条件としている。本作業単位に反映すべき既存ドキュメントが無いため、独立タスクを立てない。
- **フロントエンドにテストタスクを置かない**。テストランナーの導入は spec.md §2 スコープ外であり、検証は `npm run lint` と `wails dev` での目視、および決定論的な静的検査（色の直値の grep 等）で行う。ロジックを Go 側に集約するという spec.md §3 前提 1 に対応する。
- **メインタスク 1・2・3 に `(P)` を付ける**。触るファイルが重ならない（フロントエンド / `main` パッケージのログ生成 / `feed` パッケージ）ためである。`logSource` は `feed.Source` を構造的に満たすだけで `feed` を import しないため、2 と 3 の間に依存が無い。
- **2・3・4 を分けた理由**（垂直スライス優先の補足）: ログの垂直パスは「型 → 駆動 → 結線 → 画面」だが、これを 1 タスクにするとテスト込みで数百行を大きく超える。分割の境界は spec.md §5 の契約の境界（`feed` の 3 インターフェース / `main` の生成器 / バインディング）に一致させ、各段が単独で `go test ./...` を緑に保てるようにした。
- **フロントエンドは Wails の生成物に依存する**。`frontend/wailsjs/` はリポジトリ非管理の生成物であり、`npm run lint`（Biome）は型検査を行わない。そのため生成物の型に依存するタスク 5.1 は、バインディングを生成する `wails build` を含むタスク 4.4 に依存させ、生成物の存在確認を検証に含める。

## タスク一覧

- [ ] 1. (P) フロントエンドの土台（デザイントークンと 6 枠レイアウト）
  - [x] 1.1 `@theme` に spec.md §6.6 のトークンを定義し、配色をダーク 1 系統・既定の書体を等幅にする。`prefers-color-scheme` の分岐、`body { font-family: Arial, ... }`、および `--font-geist-*` を参照する既存の `@theme inline` を除去・置換する（タスク 1.2 で Geist の定義が消えるため、残すと `--font-mono` が解決できなくなる）
    _Requirements: 9.1, 9.5, 9.6, 9.7, 10.4_
    _Boundary: DesignTokens_
    - 対象ファイル: `frontend/src/app/globals.css`(変更)
    - 仕様参照: spec.md §6.6
    - 検証コマンド: `cd frontend && npm ci && npm run lint` / コントラスト比は `python3 -c` で WCAG 2.1 の相対輝度式から `--color-text` と `--color-surface-1` の比を算出し、4.5:1 以上であることと算出値をコミット本文に記す / `grep -nEi "prefers-color-scheme|geist|Arial" frontend/src/app/globals.css` が 0 件
  - [ ] 1.2 `metadata.title` を `nullops`、`metadata.description` を nullops を説明する文字列へ置き換え、`next/font/google` の `Geist` と `Geist_Mono` の import・`className` への適用をいずれも除去する
    _Requirements: 1.5, 1.6, 9.5_
    _Boundary: AppShell_
    _Depends: 1.1_
    - 対象ファイル: `frontend/src/app/layout.tsx`(変更)
    - 仕様参照: spec.md §5.7 文書タイトル, §8「`next/font/google` を使わない」
    - 検証コマンド: `cd frontend && npm run lint` / `grep -n "next/font" frontend/src/app/layout.tsx` が 0 件
  - [ ] 1.3 `Panel` を実装する。見出しと本文領域を持ち、本文が枠の高さを超えたときは枠の内側だけが縦スクロールする。色はトークン経由でのみ参照する。この段では枠を超える中身が無いため検証は静的検査に留め、スクロールの目視はタスク 5.4 で行う
    _Requirements: 8.5, 9.2_
    _Boundary: Panel_
    _Depends: 1.1_
    - 対象ファイル: `frontend/src/components/Panel.tsx`(新規)
    - 仕様参照: spec.md §5.7 `Panel`
    - 検証コマンド: `cd frontend && npm run lint` / `grep -rnE "#[0-9a-fA-F]{3,8}|rgba?\(" frontend/src/components` が 0 件
  - [ ] 1.4 `DashboardGrid` を実装する。3 列 × 2 行で 6 枠を配置し、コンテナの幅・高さに追随させ、ページ全体に縦横のスクロールバーを出さない。この段では画面に出ないため検証は静的検査に留め、目視はタスク 1.5 で行う
    _Requirements: 1.1_
    _Boundary: DashboardGrid_
    _Depends: 1.1_
    - 対象ファイル: `frontend/src/components/DashboardGrid.tsx`(新規)
    - 仕様参照: spec.md §5.7 `DashboardGrid`
    - 検証コマンド: `cd frontend && npm run lint` / `grep -rnE "#[0-9a-fA-F]{3,8}|rgba?\(" frontend/src/components` が 0 件
  - [ ] 1.5 `page.tsx` のデモ UI（ロゴ・名前入力・Greet ボタンと `Greet` の呼び出し）を除去し、`DashboardGrid` に spec.md §5.7 の表が定める 6 つの見出しをその位置で並べる。`Log Stream` を含む 6 枠すべてを、この段では中身の位置に `pending` を表示するプレースホルダとする（`Log Stream` の中身はタスク 5.2 が差し替える）
    _Requirements: 1.1, 1.2, 1.3, 1.7, 8.3, 8.4_
    _Boundary: AppShell_
    _Depends: 1.3, 1.4_
    - 対象ファイル: `frontend/src/app/page.tsx`(変更)
    - 仕様参照: spec.md §5.7 の 6 枠の表, §7 Requirement 1
    - 検証コマンド: `cd frontend && npm run lint` / `grep -rn "Greet" frontend/src` が 0 件（タスク 4.4 が `App.Greet` を削除する前提となる使用ゼロの確認）/ `wails dev` で 6 枠が 3 列 × 2 行に並び、spec.md §5.7 の表の 6 つの見出し文字列が表が定める位置（1 行目 左中右 = `Log Stream` / `Commit Graph` / `Timeseries`、2 行目 左中右 = `Dependency Graph` / `Utilization` / `Scatter 3D`）に出ていることを目視で照合する / ウィンドウを最大化・縮小しても 6 枠が表示領域に追随しページ全体にスクロールバーが出ないことを目視する（最小サイズの制限はタスク 4.5 で確認する）
  - [ ] 1.6 `DashboardGrid` の子要素数が 6 でない分岐を実装する。`console.error` を 1 回出力し、受け取った子要素をすべて描画する（画面を空にしない）
    _Requirements: 1.4_
    _Boundary: DashboardGrid_
    _Depends: 1.5_
    - 対象ファイル: `frontend/src/components/DashboardGrid.tsx`(変更)
    - 仕様参照: spec.md §5.7 `DashboardGrid` のエラー
    - 検証コマンド: `cd frontend && npm run lint` / `wails dev` で `page.tsx` の枠を一時的に 5 個へ減らし、DevTools のコンソールに `console.error` が 1 回だけ出て 5 枠が描画されることを確認したうえで 6 個へ戻す（6 個のときはコンソールに出力が無いことも確認する）

- [ ] 2. (P) ログ行の型・フェーズ巡回・ログ生成器（Go / main パッケージ）
  - [ ] 2.1 `Level` / `Phase` / `LogLine` と、不変条件を満たす値だけを作る非公開の完全コンストラクタを実装する（正常系）。このタスクでリポジトリ最初の Go テストを成立させる
    _Requirements: 4.2, 4.3, 10.2, 10.3_
    _Boundary: LogLine_
    - 対象ファイル: `logline.go`(新規), `logline_test.go`(新規)
    - 仕様参照: spec.md §6.1
    - 検証コマンド: `go vet ./... && go test ./...`
  - [ ] 2.2 完全コンストラクタの異常系を実装する。空の `Text` / 改行(U+000A・U+000D)を含む `Text` / 空の `Tool` / 未定義の `Level` / 未定義の `Phase` の各違反に個別のテストケースを割り当て、いずれも値を返さず error を返す
    _Requirements: 4.2, 4.3, 4.4_
    _Boundary: LogLine_
    _Depends: 2.1_
    - 対象ファイル: `logline.go`(変更), `logline_test.go`(変更)
    - 仕様参照: spec.md §6.1 不変条件・完全コンストラクタ
    - 検証コマンド: `go vet ./... && go test ./...`
  - [ ] 2.3 `scenario` を実装する。生成時のフェーズを `build` とし、最初の保持時間を `[minHold, maxHold]` の一様乱数で決める。`Current()` の呼び出し時に経過分だけ `build` → `test` → `deploy` → `scan` → `build` の順で進め、切り替えのたびに次の保持時間を同じ範囲の一様乱数で引き直す。専用のゴルーチンを起動せず、mutex で並行安全にする
    _Requirements: 5.1, 5.2, 5.3, 5.7_
    _Boundary: Scenario_
    - 対象ファイル: `scenario.go`(新規), `scenario_test.go`(新規)
    - 仕様参照: spec.md §6.4, §8「フェーズは読み取り時に遅延で進める」
    - 検証コマンド: `go vet ./... && go test -race ./...` / 注入した `now` で遷移を検査し、保持時間の引き直しは決定的な `*rand.Rand`（固定 seed）で 2 回目以降の保持時間が範囲内かつ最初と異なりうることを検査する / ゴルーチンを持たないことは `runtime.NumGoroutine()` が `newScenario` と `Current()` の前後で増えないテストで検査する
  - [ ] 2.4 `Current()` の呼び出し時点で 2 つ以上のフェーズの保持時間が経過している場合に、経過した数だけ進める分岐を実装する
    _Requirements: 5.6_
    _Boundary: Scenario_
    _Depends: 2.3_
    - 対象ファイル: `scenario.go`(変更), `scenario_test.go`(変更)
    - 仕様参照: spec.md §6.4 `Current` の事後条件
    - 検証コマンド: `go vet ./... && go test ./...`
  - [ ] 2.5 `logSource` を実装する。`EventName()` は固定値、`Interval()` は 80〜400 ms の一様乱数、`Next()` は長さ 1 の `[]LogLine` を返す。`Seq` を 1 から 1 ずつ自身で採番し、`Phase` にその時点の `scenario.Current()` を設定し、フェーズごとに異なる英語の `Tool` / `Text` 候補集合から行を組み立てる。`*rand.Rand` は `scenario` と共有せず、mutex で並行安全にする
    _Requirements: 2.2, 4.1, 4.5, 5.4, 5.5_
    _Boundary: LogSource_
    _Depends: 2.1, 2.3_
    - 対象ファイル: `logsource.go`(新規), `logsource_test.go`(新規)
    - 仕様参照: spec.md §6.3, §5.1
    - 検証コマンド: `go vet ./... && go test -race ./...` / 候補集合の全要素が spec.md §6.1 の不変条件（1 文字以上・改行なし・ASCII の英語）を満たすことをテストで走査し、フェーズごとに候補集合が異なることを検査する
  - [ ] 2.6 `logSource` のリングバッファを実装する。保持上限は `newLogSource` の `capacity` 引数で受け（500 を渡すのはタスク 4.1）、上限に達した状態で次の行を生成したときは最古の 1 行を捨てる。`Snapshot()` は保持している全行を古い順に、内部と別の配列で返す
    _Requirements: 2.3, 2.4_
    _Boundary: LogSource_
    _Depends: 2.5_
    - 対象ファイル: `logsource.go`(変更), `logsource_test.go`(変更)
    - 仕様参照: spec.md §6.3 不変条件・`Snapshot` の事後条件
    - 検証コマンド: `go vet ./... && go test -race ./...` / `capacity + 1` 行目の生成後に保持件数が `capacity`・`Seq` が昇順連続・返り値への変更が内部へ波及しないことを検査する

- [ ] 3. (P) 生成器の駆動機構（Go / feed パッケージ）
  - [ ] 3.1 `feed` パッケージを作り、`Source` と `Emitter` を利用側パッケージとして定義する。テスト用の擬似 `Emitter`（送信を記録する）と擬似 `Source` を用意し、Wails ランタイムを起動せずに `feed` のテストが実行できることを示す
    _Requirements: 10.1_
    _Boundary: Feed_
    - 対象ファイル: `feed/feed.go`(新規), `feed/runner_test.go`(新規)
    - 仕様参照: spec.md §5.1, §5.2, §8「`Emitter` を境界に置く理由」
    - 検証コマンド: `go vet ./... && go test ./...` / `grep -rn "wailsapp/wails" feed/` が 0 件
  - [ ] 3.2 `NewRunner` の事前条件検査を実装する。nil の `Emitter` / 0 個の `Source` / 空文字の `EventName()` を返す `Source` / `EventName()` が重複する `Source` の 4 分岐それぞれに個別のテストケースを割り当て、いずれも nil の `Runner` と error を返す（`panic` しない）。事前条件を満たすときは非 nil と nil error を返す
    _Requirements: 6.3_
    _Boundary: Runner_
    _Depends: 3.1_
    - 対象ファイル: `feed/runner.go`(新規), `feed/runner_test.go`(変更)
    - 仕様参照: spec.md §5.3 `NewRunner`
    - 検証コマンド: `go vet ./... && go test ./...`
  - [ ] 3.3 `Run` を実装する。`Source` ごとに独立したゴルーチンを割り当て、各自の `Interval()` だけ待ってから `Next()` を呼び、戻り値を `EventName()` のイベント名で `Emitter.Emit` へ渡す。ある `Source` の間隔が他の送信周期に影響しないことを検査する
    _Requirements: 6.1, 6.2_
    _Boundary: Runner_
    _Depends: 3.2_
    - 対象ファイル: `feed/runner.go`(変更), `feed/runner_test.go`(変更)
    - 仕様参照: spec.md §5.3 `Run`, §7 Requirement 6
    - 検証コマンド: `go vet ./... && go test -race ./...` / 短い間隔（数ミリ秒）を返す擬似 `Source` を 2 個登録し、擬似 `Emitter` の記録がイベント名ごとに独立して増えることを検査する
  - [ ] 3.4 `Source.Interval()` が事後条件に反して 1 ミリ秒未満を返した場合に、待ち時間を 1 ミリ秒として扱う分岐を実装する（ビジーループに陥らない）
    _Requirements: 6.4_
    _Boundary: Runner_
    _Depends: 3.3_
    - 対象ファイル: `feed/runner.go`(変更), `feed/runner_test.go`(変更)
    - 仕様参照: spec.md §7 Requirement 6.4
    - 検証コマンド: `go vet ./... && go test ./...` / 0 と負値を返す擬似 `Source` で、一定時間の送信回数が 1 ミリ秒間隔の上限を超えないことを検査する
  - [ ] 3.5 キャンセル時の停止保証を実装する。`ctx.Done()` が閉じた後に `Emitter.Emit` を新たに開始せず、起動した全ゴルーチンの終了を待ってから `Run` が戻る（戻った時点でこの `Runner` のゴルーチンは 0 個）
    _Requirements: 7.4, 7.5_
    _Boundary: Runner_
    _Depends: 3.3_
    - 対象ファイル: `feed/runner.go`(変更), `feed/runner_test.go`(変更)
    - 仕様参照: spec.md §5.3 不変条件・キャンセル後の送信
    - 検証コマンド: `go vet ./... && go test -race ./...` / `Run` の復帰後に擬似 `Emitter` の記録件数が増えないこと、`runtime.NumGoroutine()` が `Run` の呼び出し前の水準へ戻ることを検査する

- [ ] 4. アプリへの結線（ライフサイクル・スナップショット・イベント送信）
  - [ ] 4.1 `feed.Emitter` の Wails 実装（`runtime.EventsEmit` へ委譲）を追加し、`App` を spec.md §6.5 の形（ctx / cancel / done）へ改める。`startup` は `context.Background()` から派生させたキャンセル可能な context を生成し、`scenario`(minHold 15 秒・maxHold 45 秒)と `logSource`(capacity 500・専用の `*rand.Rand`)を組み立て、`logSource` を登録した `Runner` をその context で開始して `nullops:log` イベントに `LogLine` の配列を送出する
    _Requirements: 2.1, 5.3, 7.1, 7.2_
    _Boundary: App_
    _Depends: 2.6, 3.3_
    - 対象ファイル: `emitter.go`(新規), `app.go`(変更), `app_test.go`(新規)
    - 仕様参照: spec.md §6.5, §5.2, §5.5, §6.4 minHold / maxHold
    - 検証コマンド: `go vet ./... && go test -race ./...` / Wails ランタイムを起動せずに検査できるよう `Emitter` を差し替えられる接合点を設け、擬似 `Emitter` に `nullops:log` のイベント名で `[]LogLine`（長さ 1）が届くことをテストで検査する
  - [ ] 4.2 `shutdown` を実装する。自前の context をキャンセルし、`Run` の復帰を最大 1 秒待って戻る。1 秒以内に復帰する分岐と、復帰しないため待機を打ち切る分岐の両方に個別のテストケースを割り当てる
    _Requirements: 7.3, 7.6_
    _Boundary: App_
    _Depends: 4.1_
    - 対象ファイル: `app.go`(変更), `app_test.go`(変更)
    - 仕様参照: spec.md §6.5 `shutdown` の事後条件
    - 検証コマンド: `go vet ./... && go test -race ./...` / 復帰しない擬似 `Runner` で `shutdown` が 1 秒強で戻ること（無期限に待たないこと）を検査する
  - [ ] 4.3 `DashboardSnapshot` と `App.Snapshot` を実装する。呼び出し時点で `logSource` が保持する全行を古い順に含め、0 件でも `null` にならない空配列を返し、呼び出しによって `logSource` と `scenario` の状態を変化させない
    _Requirements: 3.2, 3.3, 3.4_
    _Boundary: App_
    _Depends: 4.1_
    - 対象ファイル: `snapshot.go`(新規), `app.go`(変更), `app_test.go`(変更)
    - 仕様参照: spec.md §5.4, §6.2
    - 検証コマンド: `go vet ./... && go test ./...` / 0 件の状態で `encoding/json` へ通した結果が `{"log":[]}` になること、連続呼び出しで `Seq` の最大値と `scenario.Current()` が変化しないことを検査する
  - [ ] 4.4 `App.Greet` を削除する。削除の前にフロントエンドからの参照がゼロであることを確認し（タスク 1.5 で除去済み）、バインディングを再生成して生成物から `Greet` が消えることを確かめる
    _Requirements: 1.7_
    _Boundary: App_
    _Depends: 4.1, 4.3, 1.5_
    - 対象ファイル: `app.go`(変更)
    - 仕様参照: spec.md §5.4「削除する既存 API」
    - 検証コマンド: `grep -rn "Greet" frontend/src` が 0 件であることを確認してから削除し、`go vet ./... && go test ./...` / `wails build` 後に `grep -rn "Greet" frontend/wailsjs` が 0 件
  - [ ] 4.5 `main.go` に `OnShutdown: app.shutdown` を結線し、ウィンドウの起動サイズを 1440 × 900、`MinWidth` を 1100、`MinHeight` を 720 に設定する
    _Requirements: 8.1, 8.2_
    _Boundary: App_
    _Depends: 4.2_
    - 対象ファイル: `main.go`(変更)
    - 仕様参照: spec.md §6.5「`main.go` の変更」, §9 `pkg/options/options.go:41-42`
    - 検証コマンド: `go vet ./... && go test ./...` / `wails dev` を起動し、DevTools のコンソールで `console.log(window.outerWidth, window.outerHeight)` が 1440 × 900 を示すことを確認する / ウィンドウを縮めても同じ値が 1100 × 720 を下回らないことを確認する

- [ ] 5. ログストリームパネル（購読・併合・描画）
  - [ ] 5.1 `subscribeLog` と `loadSnapshot` を実装する。`subscribeLog` は `EventsOn` が返す解除関数をそのまま返し、`EventsOff` を使わない（そのハンドラだけが解除される）。型は `wailsjs/go/models` の `main.LogLine` / `main.DashboardSnapshot` を使う（この生成物はタスク 4.4 の `wails build` で作られる）
    _Requirements: 2.8_
    _Boundary: FeedClient_
    _Depends: 4.3, 4.4_
    - 対象ファイル: `frontend/src/lib/feed.ts`(新規)
    - 仕様参照: spec.md §5.6, §5.5「購読の解除には `EventsOn` の戻り値を使う」
    - 検証コマンド: `cd frontend && npm run lint` / `grep -rn "EventsOff" frontend/src` が 0 件 / `grep -n "LogLine\|DashboardSnapshot" frontend/wailsjs/go/models.ts` が両方とも 1 件以上（バインディング生成物に型が出ていることの確認）
  - [ ] 5.2 `LogStreamPanel` を実装し、`page.tsx` の `Log Stream` 枠のプレースホルダを差し替える。マウント時に `nullops:log` の購読を開始した後に `Snapshot()` を 1 回呼び、スナップショットの行と購読開始後に受信済みの行を `Seq` の昇順で併合して同一 `Seq` を 1 行だけ残す。アンマウント時は 5.1 が返した解除関数を呼ぶ
    _Requirements: 2.8, 3.1, 3.5_
    _Boundary: LogStreamPanel_
    _Depends: 5.1, 1.5_
    - 対象ファイル: `frontend/src/components/LogStreamPanel.tsx`(新規), `frontend/src/app/page.tsx`(変更)
    - 仕様参照: spec.md §7 Requirement 3, §5.6
    - 検証コマンド: `cd frontend && npm run lint` / `wails dev` で起動直後に行が表示され、`Seq` の重複・欠落が無いことを DevTools で確認する
  - [ ] 5.3 受信した行を表示の末尾へ追加し、表示行数を最新 300 行に制限する。再描画のたびに新しい関数・オブジェクトを作らない（`CLAUDE.md` TypeScript 規約）
    _Requirements: 2.5, 2.6_
    _Boundary: LogStreamPanel_
    _Depends: 5.2_
    - 対象ファイル: `frontend/src/components/LogStreamPanel.tsx`(変更)
    - 仕様参照: spec.md §7 Requirement 2.5, 2.6
    - 検証コマンド: `cd frontend && npm run lint` / `wails dev` で 2 分以上流し、DOM の行要素数が 300 を超えないことを DevTools で確認する
  - [ ] 5.4 追従スクロールを実装する。スクロール位置が表示領域の下端から 16 ピクセル以内にある間は行の追加に合わせて下端に保ち、それより上へスクロールしている間は追従しない（両分岐を目視で確認する）。枠の高さを超えた内容はその枠の内側だけを縦にスクロールさせる
    _Requirements: 2.7, 8.5_
    _Boundary: LogStreamPanel_
    _Depends: 5.3_
    - 対象ファイル: `frontend/src/components/LogStreamPanel.tsx`(変更)
    - 仕様参照: spec.md §7 Requirement 2.7, 8.5
    - 検証コマンド: `cd frontend && npm run lint` / `wails dev` で下端付近では追従し、上方向へスクロールすると位置が保たれること、ページ全体にスクロールバーが出ないことを目視する
  - [ ] 5.5 重大度と書体の表示を実装する。`LogLine.Level` の 4 値に `--color-level-info` / `-warn` / `-error` / `-debug` の異なる色を割り当て、本文に `--font-mono` を適用する。色の直値を書かない
    _Requirements: 9.2, 9.3, 9.4_
    _Boundary: LogStreamPanel_
    _Depends: 5.3_
    - 対象ファイル: `frontend/src/components/LogStreamPanel.tsx`(変更)
    - 仕様参照: spec.md §6.6, §7 Requirement 9
    - 検証コマンド: `cd frontend && npm run lint` / `grep -rnE "#[0-9a-fA-F]{3,8}|rgba?\(" frontend/src/components frontend/src/lib` が 0 件 / `wails dev` で 4 値が別々の色で出ること、タイムスタンプ列と本文列の左端が揃うこと（spec.md §3 前提 4）を目視する
  - [ ] 5.6 `Snapshot()` の呼び出しが失敗した場合の分岐を実装する。例外を握って `console.error` を出力し、0 行の状態で開始する（画面にエラーを表示しない）
    _Requirements: 3.6_
    _Boundary: LogStreamPanel_
    _Depends: 5.2_
    - 対象ファイル: `frontend/src/components/LogStreamPanel.tsx`(変更)
    - 仕様参照: spec.md §5.6 エラー, §8「画面にエラーを出さない」
    - 検証コマンド: `cd frontend && npm run lint` / `wails dev` で `loadSnapshot` を一時的に reject させ、画面が 0 行で開始し以後の差分で埋まること・コンソールにのみ出力されることを確認したうえで元に戻す

- [ ] 6. 通し検証（受け入れ確認）
  - [ ] 6.1 `wails dev` を 30 秒間観察し、ログストリームへ 60 行以上が流入して停止しないことを確認する。あわせて spec.md §3 の前提 2（1440 × 900 で 6 枠が読める）と、ウィンドウを閉じたときにプロセスが残留しないこと（roadmap.md §1.1 の完了条件）を確認する。起動時の地色（`main.go` の `BackgroundColour` はテンプレート由来の直値であり、spec.md §6.5 が `main.go` の変更を `OnShutdown` と寸法に限るため本作業単位では変更しない）が `--color-surface-0` とずれて見える場合は、後続作業単位への申し送りとして観察結果に記録する。観察結果を `## Implementation Notes` へ記録する
    _Requirements: 2.9_
    _Boundary: Verification_
    _Depends: 1.2, 1.6, 2.2, 2.4, 2.6, 3.4, 3.5, 4.4, 4.5, 5.4, 5.5, 5.6_
    - 対象ファイル: `docs/specs/001-dashboard-mvp/001-dashboard-shell/tasks.md`(変更)
    - 仕様参照: spec.md §7 Requirement 2.9, §3 前提 2
    - 検証コマンド: `wails dev` を起動し、DevTools のコンソールで `let n=0; const off=window.runtime.EventsOn('nullops:log', b => { n += b.length }); setTimeout(() => { console.log(n); off() }, 30000)` を実行して 30 秒後の合計が 60 以上であることを確認する / ウィンドウを閉じた後に `pgrep -fl "build/bin/nullops"` が 0 件（`nullops` だけで検索すると作業ツリーのパスを含む Node のプロセスに当たるため、実行ファイルのパスで絞る）
  - [ ] 6.2 検証手段の成立を通しで確認する。`go vet ./...`・`go test ./...`（1 件以上のテストが実行される）・`cd frontend && npm ci && npm run lint`・`wails build` がいずれも終了コード 0 で終わり、`build/bin` に起動できるアプリが生成されることを確認する。結果を `## Implementation Notes` へ記録する
    _Requirements: 10.2, 10.3, 10.4, 10.5_
    _Boundary: Verification_
    _Depends: 6.1_
    - 対象ファイル: `docs/specs/001-dashboard-mvp/001-dashboard-shell/tasks.md`(変更)
    - 仕様参照: spec.md §7 Requirement 10
    - 検証コマンド: `go vet ./... && go test ./... && (cd frontend && npm ci && npm run lint) && wails build` / 生成された `build/bin` のアプリを起動して 6 枠とログの流入を目視する

## Implementation Notes

### 知識 port の選択

- `python3 .claude/skills/dev-core/scripts/ports.py --skill dev-implement --root docs/dev/ports` は「port ルートが存在しない」で終了した。本リポジトリに `docs/dev/ports/` が無いため、**注入知識なし**で実装する。規約は `CLAUDE.md`(言語規約・Go / TypeScript コーディング規約)を正本とする。

### 実行環境の制約(この実装セッション)

- **画面を撮って確かめられない**。`screencapture` は sandbox の内外いずれでも `could not create image from display` で失敗する(macOS の画面収録権限がターミナルへ付与されていない)。したがって tasks.md の検証コマンドのうち**画面の見え方に依存するもの**は実行できず、`UNVERIFIED` として記録し、人間が実施すべき確認手順を残す。静的検査・自動テスト・`grep`・コマンド出力から判定できるものは通常どおり実行する。
- コードを一時的に壊して確認する手順(タスク 1.6 の枠を 5 個に減らす操作、タスク 5.6 の `loadSnapshot` を reject させる操作)は**実行しない**。目視で確かめられない以上、壊す操作に意味がなく、元へ戻し忘れる危険だけが残るため。該当する受け入れ基準を満たす実装は書き、検証を `UNVERIFIED` として記録する。
- メインタスク 1・2・3 は `(P)` だが**逐次実行**する。2 と 3 の検証はどちらも `go test ./...` でモジュール全体を回すため、同時進行させると片方の未完成コードでもう片方の検証が落ちる。

### 未検証項目(人間が確認すべきこと)

(タスクの進行に伴って追記する)
