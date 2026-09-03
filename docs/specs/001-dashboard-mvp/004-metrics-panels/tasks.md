# metrics-panels — 実装タスク

> 仕様の詳細は同じディレクトリの仕様文書 spec.md を参照する。
> このファイルには仕様を転記しない。

## Global Constraints

spec.md がこの作業単位の全体に掛ける制約を逐語で写す。全タスクの要件に暗黙に含まれる。

- **折れ線グラフとタコメータの擬似データを 1 つの生成器 `metricSource` にまとめ、1 つのイベントで送る。**(spec.md §3 前提 1)
- **`requestAnimationFrame` のループは、実測して問題が出たときにだけ 1 本へ共有する。**(spec.md §3 前提 2)
- **折れ線グラフは 3 系列を 1 枚に重ね、値は Go 側で 0.0〜1.0 に正規化して送る。**(spec.md §3 前提 3)
- **タコメータは折れ線の 1 系列を指すのではなく、独立した「総合使用率」を指す。**(spec.md §3 前提 4)
- **2 パネルとも Canvas 2D の 2 次元 API へ自前で描く。可視化ライブラリを使わない。**(spec.md §3 前提 5)
- **キャンバスへ渡す色は `globals.css` の `@theme` トークンを実行時に解決して得る。新しいトークンは追加しない。**(spec.md §3 前提 6)
- **画面の見え方に依存する受け入れ基準は、実装するが本セッションでは検証しない。**(spec.md §3 前提 7)
- **乱数は `math/rand`(v1)を使う。**(spec.md §3 前提 8)
- **`'use client'` は葉のパネルに置き、`DashboardGrid` と `page.tsx` へ広げない。**(spec.md §3 前提 9)
- **フロントエンドの純関数はテストコードを持たず、不変条件を実装内の早期 return と型で守る。**(spec.md §3 前提 12)
- **可視化ライブラリ(chart.js・recharts・d3 等)の導入**をしない(spec.md §2 対象外)
- **実在のシステムメトリクス(CPU・メモリ・ネットワーク)の読み取り**をしない(spec.md §2 対象外)
- **マウス操作によるツールチップ・系列の表示切り替え・時間範囲の変更・ズーム**を作らない(spec.md §2 対象外)
- **Windows・Linux での動作確認**をしない(spec.md §2 対象外)
- **配布物の署名・公証、GitHub リリースの作成**をしない(spec.md §2 対象外)
- **描画結果の自動視覚検証(ブラウザ自動化・スクリーンショット比較)**をしない(spec.md §2 対象外)
- **フロントエンドのテスト実行基盤(vitest 等)の導入**をしない(spec.md §2 対象外)
- **凍結済み spec.md(unit #1・#2・#3)の変更**をしない(spec.md §2 対象外)
- unit #2 の `drift` / `clampUnit` / `symmetricUniform`、unit #3 の `clampZeroOne` を再利用し、同じ計算を書き直さない(spec.md §8)
- 会話・ドキュメント・コード内コメント・PR/Issue 本文・コミットメッセージは日本語で記述する。画面に描画するラベルは英語にする(`CLAUDE.md` 言語規約)
- `any` を使わない。型が定まらない箇所は `unknown` で受けて絞り込む(`CLAUDE.md`)
- 再描画のたびに新しい関数・オブジェクトを作らない(`CLAUDE.md`)
- インターフェースは実装側ではなく利用側のパッケージで定義する(`CLAUDE.md`)
- Wails が生成するバインディング(`frontend/wailsjs/`)は手で編集しない(`CLAUDE.md`)
- `frontend/dist`・`frontend/wailsjs`・`build/bin` は生成物であり、リポジトリに含めない(`CLAUDE.md`)
- 検証コマンドは `cd frontend && npm ci` と `wails build` を 1 度通した後でなければ成立しない(`frontend/wailsjs` と `frontend/dist` が生成物であるため)

## File Structure Plan

| ファイルパス                                     | 区分 | 責務                                                                          |
| ------------------------------------------------ | ---- | ----------------------------------------------------------------------------- |
| `metric.go`                                      | 新規 | `MetricPoint`・`GaugeReading`・`MetricSeriesMeta`・`MetricFrame`・`MetricHistory` の型と生成関数 |
| `metric_test.go`                                 | 新規 | 各生成関数の不変条件と error 識別のテスト                                      |
| `metricsource.go`                                | 新規 | `feed.Source` を満たす擬似メトリクス生成器 `metricSource`                       |
| `metricsource_test.go`                           | 新規 | `metricSource` の契約・値の時間変化・ゾーン遷移・並行安全のテスト               |
| `snapshot.go`                                    | 変更 | `DashboardSnapshot` へ `Metrics` フィールドを足す                              |
| `app.go`                                         | 変更 | `metricSource` を `App` に持たせ `Runner` へ登録し、`Snapshot` へ載せる         |
| `app_test.go`                                    | 変更 | `Snapshot` のメトリクスに関する事後条件と結線値のテスト                         |
| `main.go`                                        | 変更 | `BackgroundColour` を `--color-surface-0` と同値へ是正する                      |
| `frontend/src/lib/feed.ts`                       | 変更 | `subscribeMetrics` を足す                                                       |
| `frontend/src/lib/metrics.ts`                    | 新規 | 折れ線とタコメータの配置を写す純関数(`plotArea` / `dialGeometry` 等)          |
| `frontend/src/lib/framestats.ts`                 | 新規 | パネルごとのフレーム間隔の計測と報告                                            |
| `frontend/src/components/TimeseriesPanel.tsx`    | 新規 | Canvas 2D による折れ線グラフの描画・条件付き再描画・寸法追随                    |
| `frontend/src/components/GaugePanel.tsx`         | 新規 | Canvas 2D によるタコメータの描画・針の漸近・寸法追随                            |
| `frontend/src/components/LogStreamPanel.tsx`     | 変更 | `recordFrame` の呼び出しを足す(計測対象に含めるため)                          |
| `frontend/src/components/CommitGraphPanel.tsx`   | 変更 | 同上                                                                            |
| `frontend/src/components/DependencyGraphPanel.tsx` | 変更 | 同上                                                                          |
| `frontend/src/components/Scatter3DPanel.tsx`     | 変更 | 同上                                                                            |
| `frontend/src/app/page.tsx`                      | 変更 | `Timeseries` / `Utilization` 枠を `pending` から各パネルへ差し替える            |
| `frontend/biome.jsonc`                           | 変更 | `$schema` を導入済みの Biome の版(2.5.11)へ合わせる                           |
| `README.md`                                      | 変更 | 「画面」表と実画面のパネルの対応を明示する(必要な場合)                        |

削除対象は無い。`globals.css` は変更しない(新しいトークンを追加しないため)。

## タスク一覧

- [x] 1. Go 側の擬似メトリクスの契約と生成器
  - [x] 1.1 メトリクスの型と不変条件の強制を作る
    _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 4.1, 4.2, 4.3, 4.4_
    _Boundary: MetricPoint_
    _Interfaces: Produces `MetricPoint{Seq uint64; Values []float64}` / `GaugeReading{Seq uint64; Value, Display float64; Zone, Label string}` / `MetricSeriesMeta{ID, Unit string; Display float64}` / `MetricFrame{Series []MetricSeriesMeta; Point MetricPoint; Gauge GaugeReading}` / `MetricHistory{Series []MetricSeriesMeta; Points []MetricPoint; Gauge GaugeReading}` / `newMetricPoint(seq uint64, values []float64) (MetricPoint, error)` / `newGaugeReading(seq uint64, value float64, label string) (GaugeReading, error)` / `newMetricSeriesMeta(id, unit string, display float64) (MetricSeriesMeta, error)` / `gaugeZoneFor(value float64) string` / `ZoneNominal` / `ZoneElevated` / `ZoneCritical` / `errMetricSeqZero` / `errMetricValueCount` / `errMetricValueRange` / `errMetricValueNotFinite` / `errMetricLabelEmpty` / `errMetricLabelNewline` / `metricSeriesCount = 3`_
    - 対象ファイル: `metric.go`(新規), `metric_test.go`(新規)
    - 仕様参照: spec.md §6.1〜§6.5, §7 Requirement 2・4.1〜4.4
    - 検証コマンド: `go vet ./...`, `go test ./...`
  - [x] 1.2 `metricSource` を作り `feed.Source` を構造的に満たす
    _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 3.1, 3.2, 3.3, 3.4, 3.5, 4.5, 4.6, 4.7_
    _Boundary: metricSource_
    _Depends: 1.1_
    _Interfaces: Consumes `newMetricPoint(...)` / `newGaugeReading(...)` / `newMetricSeriesMeta(...)` / `drift(rnd *rand.Rand, current, target, pull, jitter float64) float64`(unit #2 が `scattersource.go` に置いた既存関数) / `clampZeroOne(v float64) float64`(unit #3 が `graphsource.go` に置いた既存関数) / Produces `newMetricSource(capacity int, rnd *rand.Rand) *metricSource` / `(*metricSource) EventName() string` / `(*metricSource) Interval() time.Duration` / `(*metricSource) Next() any` / `(*metricSource) Snapshot() MetricHistory` / `metricEventName = "nullops:metric"` / `metricInterval = 500ms`_
    - 対象ファイル: `metricsource.go`(新規), `metricsource_test.go`(新規)
    - 仕様参照: spec.md §5.1 `metricSource`, §6.6 内部状態, §7 Requirement 1・3・4.5〜4.7
    - 検証コマンド: `go vet ./...`, `go test ./...`, `go test -race ./...`

- [x] 2. Go 側の結線と初期表示
  - [x] 2.1 `DashboardSnapshot` へ `Metrics` を足し `Runner` へ登録する
    _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 6.1, 6.2, 6.3, 6.4_
    _Boundary: App_
    _Depends: 1.2_
    _Interfaces: Consumes `newMetricSource(capacity int, rnd *rand.Rand) *metricSource` / `newSeededRand() *rand.Rand` / `feed.NewRunner(...)` / Produces `DashboardSnapshot.Metrics MetricHistory` / `appMetricCapacity = 240`_
    - 対象ファイル: `snapshot.go`(変更), `app.go`(変更), `app_test.go`(変更)
    - 仕様参照: spec.md §5.2 `App.Snapshot`, §6.7 `DashboardSnapshot`, §7 Requirement 5・6
    - 検証コマンド: `go vet ./...`, `go test -race -count=1 ./...`

- [x] 3. フロントエンドの購読・純関数・計測器
  - [x] 3.1 `subscribeMetrics` とフレーム間隔の計測器を作る
    _Requirements: 7.6, 12.4, 12.5_
    _Boundary: feed_
    _Depends: 2.1_
    _Concurrent: 3.2 と並行してよい(触るファイルが重ならない)_
    _Interfaces: Consumes `main.MetricFrame`(`wailsjs/go/models` が生成) / `EventsOn` / Produces `subscribeMetrics(onFrame: (frame: main.MetricFrame) => void): () => void` / `recordFrame(panel: string, now: number): void` / `frameReport(): string` / `frameReportInterval = 5000` / `frameSampleCap = 600`_
    - 対象ファイル: `frontend/src/lib/feed.ts`(変更), `frontend/src/lib/framestats.ts`(新規)
    - 仕様参照: spec.md §5.4 購読, §5.9 計測器, §9.1, §7 Requirement 7.6・12.4・12.5
    - 検証コマンド: `cd frontend && npm run lint`
  - [x] 3.2 折れ線とタコメータの配置の純関数を作る
    _Requirements: 8.1, 8.2, 9.1, 9.2, 9.3_
    _Boundary: metrics_
    _Concurrent: 3.1 と並行してよい_
    _Interfaces: Produces `PlotArea` / `plotArea(view)` / `plotX(index, count, area)` / `plotY(value, area)` / `visiblePointCount(area)` / `DialGeometry` / `dialGeometry(view)` / `dialAngle(value, dial)` / `approach(current, target, rate)`_
    - 対象ファイル: `frontend/src/lib/metrics.ts`(新規)
    - 仕様参照: spec.md §5.7, §5.8, §7 Requirement 8.1・8.2・9.1〜9.3
    - 検証コマンド: `cd frontend && npm run lint`

- [x] 4. 2 パネルの描画
  - [x] 4.1 `TimeseriesPanel` を作る
    _Requirements: 7.1, 7.2, 7.4, 7.5, 7.6, 7.7, 7.8, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7_
    _Boundary: TimeseriesPanel_
    _Depends: 3.1, 3.2_
    _Concurrent: 4.2 と並行してよい(触るファイルが重ならない)_
    _Interfaces: Consumes `subscribeMetrics(...)` / `loadSnapshot()` / `recordFrame(...)` / `plotArea` / `plotX` / `plotY` / `visiblePointCount` / Produces `TimeseriesPanel(): React.JSX.Element`_
    - 対象ファイル: `frontend/src/components/TimeseriesPanel.tsx`(新規)
    - 仕様参照: spec.md §5.5, §5.7, §6.8 トークン, §7 Requirement 7・8・10
    - 検証コマンド: `cd frontend && npm run lint`
  - [x] 4.2 `GaugePanel` を作る
    _Requirements: 7.1, 7.3, 7.4, 7.5, 7.6, 7.7, 9.4, 9.5, 9.6, 9.7, 9.8, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7_
    _Boundary: GaugePanel_
    _Depends: 3.1, 3.2_
    _Concurrent: 4.1 と並行してよい_
    _Interfaces: Consumes `subscribeMetrics(...)` / `loadSnapshot()` / `recordFrame(...)` / `dialGeometry` / `dialAngle` / `approach` / Produces `GaugePanel(): React.JSX.Element`_
    - 対象ファイル: `frontend/src/components/GaugePanel.tsx`(新規)
    - 仕様参照: spec.md §5.6, §5.8, §6.8 トークン, §7 Requirement 7・9・10
    - 検証コマンド: `cd frontend && npm run lint`

- [x] 5. 6 パネルの統合と通し確認
  - [x] 5.1 6 枠を結線し、地色・`$schema`・README を揃える
    _Requirements: 10.8, 11.1, 11.2, 11.4, 12.2, 12.7_
    _Boundary: dashboard_
    _Depends: 4.1, 4.2_
    _Interfaces: Consumes `TimeseriesPanel` / `GaugePanel` / Produces `page.tsx` の 6 枠すべてに実装済みパネルを結線した状態_
    - 対象ファイル: `frontend/src/app/page.tsx`(変更), `main.go`(変更), `frontend/biome.jsonc`(変更), `README.md`(変更)
    - 仕様参照: spec.md §6.8 トークン, §8 `main.go` の地色, §7 Requirement 10.8・11.1・11.2・11.4・12.2・12.7
    - 検証コマンド: `cd frontend && npm run lint`, `go vet ./...`, `grep -rn "#[0-9a-fA-F]\{6\}" frontend/src --include="*.tsx" --include="*.ts"`(色の直値が無いこと)
  - [x] 5.2 既存 4 パネルへ計測器を結線し、フレーム間隔の実測手順を整える
    _Requirements: 12.4, 12.6_
    _Boundary: framestats_
    _Depends: 5.1_
    _Interfaces: Consumes `recordFrame(panel: string, now: number)` / 変更対象は各パネルの `requestAnimationFrame` のコールバック先頭のみ_
    - 対象ファイル: `frontend/src/components/LogStreamPanel.tsx`(変更), `frontend/src/components/CommitGraphPanel.tsx`(変更), `frontend/src/components/DependencyGraphPanel.tsx`(変更), `frontend/src/components/Scatter3DPanel.tsx`(変更)
    - 仕様参照: spec.md §9 実測の設計, §7 Requirement 12.4・12.6
    - 検証コマンド: `cd frontend && npm run lint`
  - [x] 5.3 検証コマンドの通し確認と配布ビルド
    _Requirements: 11.3, 11.5, 11.6, 12.1, 12.3_
    _Boundary: verification_
    _Depends: 5.2_
    _Interfaces: なし(検証のみ)_
    - 対象ファイル: なし(生成物はコミットしない)
    - 仕様参照: spec.md §7 Requirement 11.3・11.5・11.6・12.1・12.3
    - 検証コマンド: `go vet ./...`, `for i in 1 2 3 4 5; do go test -race -count=1 ./... || break; done`, `cd frontend && npm run lint`, `wails build`

## Implementation Notes

### 未検証項目(人間が確認すべきこと)

> 本ホストは macOS の画面収録権限を持たず、`screencapture` が sandbox の内外いずれでも
> `could not create image from display` で失敗する(spec.md §3 前提 7)。
> 画面の見え方に依存する受け入れ基準は実装するが、本セッションでは検証しない。
> 以下は人間だけで再現できる手順つきの一覧である。実装の進行に応じて追記する。

| # | 受け入れ基準 | 確認すること | 手順 |
| :- | :- | :- | :- |
| U1 | 11.3・11.4 | 6 枠が README「画面」表の 6 行と 1 対 1 に対応し、30 秒観察してもどれも更新を止めない | `wails build` の後 `open build/bin/nullops.app`(または `wails dev`)。左上から Log Stream / Commit Graph / Timeseries、2 行目に Dependency Graph / Utilization / Scatter 3D の順で並ぶことを見る。そのまま 30 秒眺め、止まる枠が無いことを見る |
| U2 | 11.1 | 起動直後の地色が本文の地色とずれない | アプリを起動し、ウィンドウが出てから最初の描画までのあいだに地色が切り替わって見えないことを見る。ずれる場合は `main.go` の `BackgroundColour` と `globals.css` の `--color-surface-0` を比べる |
| U3 | 7.2・8.3〜8.8 | 折れ線が 3 系列を重ねて描き、右端へ新しい値が積まれて左へ流れる | Timeseries の枠を 30 秒見る。線が 3 本あること・右端が最新であること・線が枠の内側に収まることを見る |
| U4 | 7.3・9.4〜9.8 | 針が円弧の上を滑らかに動き、ゾーンで色が変わる | Utilization の枠を 60 秒見る。針が飛ばずに動くこと・値が高いときに色が変わることを見る |
| U5 | 10.2・10.3 | ウィンドウの大きさを変えたとき 6 枠すべてが追随し、ページにスクロールバーが出ない | ウィンドウの角をつかんで最小付近から最大化まで大きさを変える。各枠の描画が枠の内側に収まること・ページ全体のスクロールバーが出ないことを見る |
| U6 | 10.5 | トークンの解決に失敗しても描画が止まらない | 通常の起動では起きない。確認する場合は DevTools で `document.documentElement.style.setProperty('--color-accent','')` を実行し、描画が続くことを見る(**コードは壊さない**) |
| U7 | 1.4(unit #1) | コンソールの `console.error` が 1 回だけ | DevTools のコンソールを開いて起動し、`console.error` の行が重複しないことを見る |
| U8 | 11.5 | 配布ビルドで生成したアプリの起動で 6 パネルが描画される | `wails build` の後 `open build/bin/nullops.app`。U1 と同じ観察を行う |
| U9 | 12.6 | **rAF ループを 1 本へ共有する必要があるかの判定** | spec.md §9.2 の手順で `[framestats]` の行を読む。いずれかのパネルの `p95` が 20 ms を継続して超えるなら共有機構が要る(spec.md §9.3)。超えないなら現状(パネルごとに独立)のまま |

### rAF ループの実測の設計と結論

- **設計:** `frontend/src/lib/framestats.ts` の `recordFrame(パネル名, 時刻)` を、rAF ループを持つ 5 パネルのコールバック先頭(早期 return より前)で呼ぶ。パネルごとに直前の呼び出しからの差分を最大 600 個(60 Hz で 10 秒ぶん)保ち、5000 ms ごとに `n / mean / p95 / max` を 1 行にまとめて `console.info` へ出す。`frameReport()` を export しているので、DevTools から任意の時点で同じ行を取り出せる。`process.env.NODE_ENV === 'production'` では即座に戻り、配布ビルドへ計測の負荷を持ち込まない(受け入れ基準 12.5)。
- **`LogStreamPanel` を計測へ含めない理由:** rAF ループを持たず DOM と React の再描画で進むため、記録できるのはフレーム間隔ではなくログイベントの到着間隔(80〜400 ms)になる。同じ報告へ混ぜると p95 20 ms の判定基準が常に不合格を指し、判断の材料を壊す。このパネルが主スレッドを占める影響は、同じスレッドで回る他 5 パネルのフレーム間隔の悪化として現れるため取りこぼさない。
- **観測値:** 本セッションでは取得できなかった。読み取りに `wails dev` の GUI と DevTools のコンソールが要り、本ホストは画面収録権限を持たない(spec.md §3 前提 7)。`console.info` は WebView のコンソールへ出るため `wails dev` の標準出力にも現れない。
- **結論:** **据え置き(パネルごとに独立した rAF ループのまま)。** 依頼者の判断は「問題が出たときだけ共有機構を入れる」であり、問題が出たという観測が無い以上、受け入れ基準 12.6 の前段は成立しない。推測で共有機構を入れない。詳細は spec.md §10.1。実測は上表 U9 として人間へ残す。

### 本セッションで実行した検証コマンド

| コマンド | 結果 |
| :- | :- |
| `go vet ./...` | 成功(出力なし) |
| `go test -race -count=1 ./...` を 5 回連続 | 5 回とも成功(受け入れ基準 12.3) |
| `cd frontend && npm run lint` | `Checked 22 files. No fixes applied.`(`$schema` の info なし。受け入れ基準 12.2) |
| `wails build` | 成功(`build/bin/nullops.app`。受け入れ基準 11.5 のうちビルドまで) |
| `grep -rn "#[0-9a-fA-F]\{6\}" frontend/src --include="*.tsx" --include="*.ts"` | 一致なし(受け入れ基準 10.4) |
| `grep` による `package.json` の依存の確認 | 可視化ライブラリの追加なし(受け入れ基準 12.7) |

受け入れ基準 11.6(1 秒あたりの送出回数の合計 10 回以下)は、`TestEmissionRateWithinBudget` が各生成器の間隔の定数から期待値を計算して押さえる。実測で 1 秒数えるテストは `logSource` の間隔の乱数で間欠的に落ちるため取らない。合計は約 8.8 回/秒(log の平均 240 ms で 4.17・metric 500 ms で 2・graph と scatter 1000 ms で各 1・commit 1500 ms で 0.67)。log の間隔が下限 80 ms を続けて引く瞬間だけ合計が上限を超えるが、これは unit #1 が凍結した `logSource` の契約であり本 unit では変えない。
