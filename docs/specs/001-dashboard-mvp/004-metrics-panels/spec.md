# metrics-panels — 仕様

## 1. 目的と背景

roadmap `001-dashboard-mvp` の unit #4(最後の unit)。ダッシュボードの 6 枠のうち `Timeseries`(折れ線グラフ)と `Utilization`(タコメータ)の 2 枠は現在 `pending` のプレースホルダである。ここに擬似メトリクスの時系列と使用率のインジケータを描画する。

本 unit は 2 パネルの実装に加えて、roadmap が #4 に与えた統合の責務を負う。すなわち **6 パネル同時稼働の調整**・**配布ビルド(`wails build`)での通し確認**・**README「画面」表と実画面の一致確認**である。

描画手段は unit #2・#3 と同じ **Canvas 2D による自前描画**とし、可視化ライブラリを導入しない(§3 前提 5)。擬似データの生成は unit #1 が作った `feed.Source` の拡張点に乗せ、Go 側に置く(roadmap 前提・`CLAUDE.md` 注意事項)。

## 2. スコープ

### 対象(やること)

- Go 側の擬似メトリクス生成器 `metricSource`(`feed.Source` の実装)と、その `Runner` への登録。
- 交換形式 `MetricPoint` / `GaugeReading` / `MetricFrame` / `MetricHistory` と、その不変条件を強制する生成関数。
- `DashboardSnapshot` への `Metrics` フィールドの追加(起動直後の初期表示)。
- フロントエンドの購読関数 1 本(`subscribeMetrics`)と、配置をキャンバス座標へ写す純関数群(`frontend/src/lib/metrics.ts`)。
- `TimeseriesPanel` と `GaugePanel`(いずれも Canvas 2D)。
- `page.tsx` の `Timeseries` / `Utilization` 枠を `pending` から各パネルへ差し替える。
- **6 パネル同時稼働時のフレーム間隔の実測の仕組み**(`frontend/src/lib/framestats.ts`)と、実測に基づく `requestAnimationFrame` ループの扱いの決定(§3 前提 2・§10)。
- **`main.go` の `BackgroundColour` の是正**(テンプレート由来の直値 → `--color-surface-0` と同値)。§3 前提 10 で範囲に含めると判断した。
- **`frontend/biome.jsonc` の `$schema` の版の追随**(2.5.8 → 2.5.11)。§3 前提 11 で範囲に含めると判断した。
- **README「画面」表と実画面のパネルの 1 対 1 対応の確認**と、必要な場合の README の更新。
- 配布ビルド(`wails build`)の成功確認。

### 対象外(やらないこと)

- **可視化ライブラリ(chart.js・recharts・d3 等)の導入** — 理由: unit #2・#3 が Canvas 2D の自前描画で通しており、折れ線と円弧は 2 次元 API で直接書ける形である。依存を増やすと静的エクスポートへの取り込みと WebView 上の動作に不確実性が戻る(§3 前提 5)。
- **実在のシステムメトリクス(CPU・メモリ・ネットワーク)の読み取り** — 理由: 画面に出る値はすべてこのアプリが生成した擬似データとする(`CLAUDE.md` 注意事項)。
- **マウス操作によるツールチップ・系列の表示切り替え・時間範囲の変更・ズーム** — 理由: roadmap のスコープ外(「設定 UI」に類する対話機能)。完了条件は描画と更新の継続のみを求める。
- **Windows・Linux での動作確認** — 理由: roadmap §3 スコープ外(確認環境を macOS のみとすることを依頼者が明示)。
- **配布物の署名・公証、GitHub リリースの作成** — 理由: roadmap §3 スコープ外。
- **描画結果の自動視覚検証(ブラウザ自動化・スクリーンショット比較)** — 理由: roadmap §3 スコープ外。加えて本ホストは画面収録権限を持たず `screencapture` が失敗する(§3 前提 7)。
- **フロントエンドのテスト実行基盤(vitest 等)の導入** — 理由: unit #1〜#3 が TypeScript のテスト 0 件で通しており、本 unit だけで基盤を足すと検証手段の構成が unit 間で揃わない。純関数の不変条件は Go 側の等価な制約とレビューで押さえる。基盤の導入は roadmap の範囲外の判断であり、必要なら別 unit として立てる。
- **凍結済み spec.md(unit #1・#2・#3)の変更** — 理由: 凍結済みの契約であり、本 unit は既存の契約を壊さない拡張のみを行う。

## 3. 前提(未検証の賭け)

1. **折れ線グラフとタコメータの擬似データを 1 つの生成器 `metricSource` にまとめ、1 つのイベントで送る。** — 依頼者へ問える相手が居ないため本仕様で決めた。2 枚は「同じ擬似システムの稼働状況」という 1 つの物語を別々の見せ方で描くパネルであり、値を独立に生成すると折れ線が下がるのに針が上がるといった矛盾が画面に出る。加えて本 unit の主題は 6 パネル同時稼働の負荷であり、送出元を 2 つに増やすと IPC の回数が増える。1 つにまとめれば負荷の上限を 1 か所で押さえられる。検証方法: Requirement 1・4 のテスト / 状態: テストで検証する。
2. **`requestAnimationFrame` のループは、実測して問題が出たときにだけ 1 本へ共有する。** — 依頼者の判断(承認済み)。unit #2・#3 から申し送られた課題だが、6 パネルを同時に動かして実際に描画が滞るかを測ってから決める。`CLAUDE.md`「将来の拡張性のためだけにコードを複雑化しない」に沿う。実測の設計は §9、観測値と結論は §10 に記録する。検証方法: §9 の計測手順 / 状態: 未検証(本セッションで実測を試み、結果を §10 に残す)。
3. **折れ線グラフは 3 系列を 1 枚に重ね、値は Go 側で 0.0〜1.0 に正規化して送る。** — 系列ごとに単位(req/s・ms・%)が違うため、生の値を送るとフロントエンドが軸のスケーリングを持つことになる。スケーリングは擬似データの一部であり Go 側に置く(unit #3 前提 1 と同じ理由: 不変条件を `go test` で押さえられる側へ置く)。画面に出す単位付きの現在値は `MetricFrame` が別に運ぶ。検証方法: Requirement 2・5 のテスト / 状態: テストで検証する。
4. **タコメータは折れ線の 1 系列を指すのではなく、独立した「総合使用率」を指す。** — README が「針が使用率を指す」とだけ定めており、折れ線の 3 系列(throughput / latency / errors)のどれも使用率ではない。物語の整合(前提 1)は、使用率を 3 系列と相関させた擬似値として生成することで保つ。検証方法: Requirement 4 のテスト / 状態: テストで検証する。
5. **2 パネルとも Canvas 2D の 2 次元 API へ自前で描く。可視化ライブラリを使わない。** — unit #2・#3 の規律(`requestAnimationFrame` のループ・`getComputedStyle` によるトークンの実行時解決・配置の計算を純関数へ分離)をそのまま再利用でき、依存を増やさない。折れ線は折れ線パスの描画、タコメータは円弧と針の直線であり、いずれも 2 次元 API で足りる。検証方法: `wails dev` の画面を人間が目視する / 状態: 未検証。
6. **キャンバスへ渡す色は `globals.css` の `@theme` トークンを実行時に解決して得る。新しいトークンは追加しない。** — Canvas 2D は CSS クラスを解釈せず色文字列を要求するため、`.tsx` に色の直値を書かずにトークンへ従う手段が `getComputedStyle` による解決に限られる(unit #2 前提 4・unit #3 前提 6 と同じ)。折れ線の 3 系列と針のゾーンは既存トークンの使い分けと不透明度で表す。検証方法: Requirement 10 / 状態: 未検証(実行時解決の成否は目視と手動確認による)。
7. **画面の見え方に依存する受け入れ基準は、実装するが本セッションでは検証しない。** — 本ホストはターミナルへ macOS の画面収録権限が無く、`screencapture` が sandbox の内外いずれでも `could not create image from display` で失敗する。該当項目は `UNVERIFIED` として `tasks.md` の `## Implementation Notes` へ、人間だけで再現できる手順つきで積む(依頼者が承認済み)。目視できないことを理由に最終検証を NO-GO にしない。検証方法: 人間による目視 / 状態: 未検証。
8. **乱数は `math/rand`(v1)を使う。** — `math/rand/v2` は `wails build` のバインディング生成が `internal error: package "math/rand/v2" without types was imported from "nullops"` で落ちる(unit #1 の実測)。検証方法: `wails build` の成功 / 状態: unit #1〜#3 で検証済み。
9. **`'use client'` は葉のパネルに置き、`DashboardGrid` と `page.tsx` へ広げない。** — 広げると React Strict Mode が描画を 2 回呼び、unit #1 の受け入れ基準 1.4(`console.error` を 1 回)を破る(unit #1 の実測)。検証方法: Requirement 10 / 状態: unit #1〜#3 で検証済み。
10. **`main.go` の `BackgroundColour` の直値の是正を本 unit の範囲に含める。** — 依頼者が「範囲に入れるかは仕様で判断してよい」と委任した項目であり、含めると決めた。理由は 2 つ。(a) roadmap が #4 に与えた責務に「6 パネル同時稼働の調整」と「README の記述と実画面の一致確認」があり、起動直後だけ地色が `--color-surface-0` とずれて見える現象は 6 パネルの見た目の統合に属する。(b) 修正は 1 行(`RGBA{27, 38, 54}` → `--color-surface-0` の `#10141c` と同値の `RGBA{16, 20, 28}`)で、色の正本が `globals.css` にあることをコメントで示せば以後ずれない。検証方法: Requirement 11.1 / 状態: 未検証(起動直後の地色は目視)。
11. **`frontend/biome.jsonc` の `$schema` の版の追随を本 unit の範囲に含める。** — 依頼者が委任した項目であり、含めると決めた。理由は、`npm run lint` が本 unit の受け入れ基準(Requirement 12)の検証コマンドそのものであり、info を出したままだと以後のタスクの合否判定にノイズが乗るためである。導入済みの Biome は 2.5.11 であり、`$schema` を同じ版へ合わせる 1 行の変更で解消する。検証方法: Requirement 12.2 / 状態: テストで検証する(`npm run lint` の出力)。
12. **フロントエンドの純関数はテストコードを持たず、不変条件を実装内の早期 return と型で守る。** — §2 対象外のとおり、TypeScript のテスト基盤を本 unit で導入しない。純関数の事後条件(有限値・0 除算の回避)は、`view.width`・`view.height` が 0 のときに描画へ進まないという受け入れ基準(9.7・10.6 に相当)で外側から押さえる。検証方法: `npm run lint` とレビュー / 状態: 未検証。

## 4. 用語定義

| 用語 | 定義 |
| ---- | ---- |
| 系列(series) | 折れ線グラフの 1 本の線。`throughput` / `latency` / `errors` の 3 本 |
| 正規化値 | 0.0〜1.0 に写した値。折れ線の縦位置に使う。単位の異なる 3 系列を 1 枚に重ねるための表現 |
| 表示値(display) | 画面へ出す単位付きの現在値。正規化前の擬似的な実数(例: 1420 req/s) |
| フレーム(MetricFrame) | 1 回の送出で運ぶ、折れ線の新しい 1 点とタコメータの読みの組 |
| ゾーン(zone) | タコメータの目盛りの帯。`nominal` / `elevated` / `critical` の 3 段 |
| 針の追従 | 目標値へ向けて針を毎フレーム少しずつ動かすこと。値の跳びをそのまま出さない |
| フレーム間隔 | `requestAnimationFrame` のコールバックが連続して呼ばれる時間差(ms)。60 Hz で約 16.7 ms |

## 5. 公開インターフェース(API)

### 5.1. `metricSource`(Go・`main` パッケージ・非公開型)

unit #1〜#3 の各生成器と同じく `feed.Source` を構造的に満たす。`feed` を import しない(依存が逆向きになるため)。

- **定義**:
  ```go
  func newMetricSource(capacity int, rnd *rand.Rand) *metricSource
  func (s *metricSource) EventName() string
  func (s *metricSource) Interval() time.Duration
  func (s *metricSource) Next() any        // MetricFrame を返す
  func (s *metricSource) Snapshot() MetricHistory
  ```
- **入力 / 出力**: `newMetricSource` は保持する時系列の点数の上限と専用の `*rand.Rand` を受ける。`Next` は `MetricFrame`(値)を返す。`Snapshot` は保持している全点を古い順に、最新のゲージの読みとともに返す。
- **事前条件**: `capacity` が 1 以上、`rnd` が nil でない。`rnd` は `metricSource` 専用のインスタンスであること(`*rand.Rand` は並行安全でなく、他の生成器と共有すると互いの mutex で保護されない)。
- **事後条件**: `EventName` はプロセスの生存期間中つねに `"nullops:metric"` を返す。`Interval` はつねに `metricInterval`(500 ms)を返す。`Next` の戻り値は §6.4 の不変条件を満たす。`Next` と `Snapshot` は並行に呼ばれても壊れない(内部の mutex で守る)。`Snapshot` は内部状態を変化させず、内部と別の配列を返す。
- **エラー**: 返さない。`feed.Source` は error 経路を持たないため、事前条件違反は `panic`(プログラマの誤り)、不変条件違反は生成関数が返した error を握らず `panic` する(unit #1〜#3 と同じ規律)。

### 5.2. `App.Snapshot`(Wails のバインディングメソッド・既存の拡張)

- **定義**: `func (a *App) Snapshot() DashboardSnapshot`(シグネチャは変えない)
- **事後条件の追加**: 戻り値の `Metrics` が §6.5 の不変条件を満たす。`startup` を経ずに呼ばれた場合は `Metrics.Series` と `Metrics.Points` が長さ 0 の非 nil スライス、`Metrics.Gauge.Seq` が 0 になる(バインディングは事前条件を持たない)。呼び出しで内部状態は変化しない。
- **エラー**: 返さない(既存の契約を維持する)。

### 5.3. 送信イベント(Go → フロントエンド)

- **定義**: イベント名 `nullops:metric`。payload は `MetricFrame` 1 個。
- **事後条件**: 500 ms ごとに 1 回送出される。購読者が居なければ捨てられる(到達保証は無い。`feed.Emitter` の契約)。アプリ終了時、`Runner` のキャンセル後に新たな送出を開始しない。

### 5.4. フロントエンドの購読(TypeScript・`frontend/src/lib/feed.ts` の拡張)

- **定義**:
  ```ts
  // MetricFrame はバインディング生成器が出力しないため feed.ts が組み立てて export する（§6.4）。
  export function subscribeMetrics(onFrame: (frame: MetricFrame) => void): () => void;
  ```
- **事後条件**: 戻り値を呼ぶとその購読だけが解除される(イベント名に紐づく全リスナーを外す API を使わない。他パネルの購読を切らないため)。同じイベントを 2 つのパネルが購読しても互いの解除に影響しない。
- **エラー**: 例外を投げない。payload が期待の形(`point` と `gauge` を持つ物体)でない場合はコールバックを呼ばず `console.error` に留める(擬似ダッシュボードに本物のエラーを表示しない。unit #1 spec §8 と同じ規律)。

### 5.5. `TimeseriesPanel`(TypeScript・React コンポーネント)

- **定義**: `export function TimeseriesPanel(): React.JSX.Element`。ファイル先頭に `'use client'` を置く(`DashboardGrid` と `page.tsx` へ広げない)。
- **入力 / 出力**: props を取らない。`Panel` の本文領域を満たす `<canvas>` を 1 枚描画する。
- **事前条件**: `Panel` の本文領域(大きさの決まる要素)の内側でマウントされること。
- **事後条件**: マウント中だけ購読と `requestAnimationFrame` のループを持ち、アンマウントで両方を解除する。描画は、表示対象の最新 `Seq` または描画領域の寸法が前フレームから変わったときにだけ行う(静止した図を描き直さない。unit #3 の `CommitGraphPanel` と同じ規律)。
- **エラー**: 2D コンテキストを取得できない場合、例外を投げず `console.error` に留めて描画を行わない(枠は空のまま残る)。

### 5.6. `GaugePanel`(TypeScript・React コンポーネント)

- **定義**: `export function GaugePanel(): React.JSX.Element`。ファイル先頭に `'use client'` を置く。
- **入力 / 出力**: props を取らない。`Panel` の本文領域を満たす `<canvas>` を 1 枚描画する。
- **事前条件**: `TimeseriesPanel` と同じ。
- **事後条件**: マウント中だけ購読と `requestAnimationFrame` のループを持ち、アンマウントで両方を解除する。針の位置は目標値へ毎フレーム漸近させ、目標に達した後は寸法が変わらない限り描画を行わない(針が止まっている間まで描き直さない)。
- **エラー**: `TimeseriesPanel` と同じ。

### 5.7. 折れ線グラフの配置関数(TypeScript・`frontend/src/lib/metrics.ts`)

配置の計算だけを純関数として切り出す(unit #2 の `projectPoint`・unit #3 の `commitRowLayout` と同じ規律)。

- **定義**:
  ```ts
  export type PlotArea = { left: number; top: number; width: number; height: number };
  export function plotArea(view: { width: number; height: number }): PlotArea;
  export function plotX(index: number, count: number, area: PlotArea): number;
  export function plotY(value: number, area: PlotArea): number;
  export function visiblePointCount(area: PlotArea): number;
  ```
- **入力 / 出力**: 描画領域の寸法から目盛りの余白を除いた作図領域を決め、点の添字(0 が最古・左端)と正規化値(0.0〜1.0)をキャンバス座標へ写す。
- **事前条件**: `view.width`・`view.height` が 0 より大きい。`count` が 1 以上。`index` が 0 以上 `count` 未満。`value` が 0.0 以上 1.0 以下。
- **事後条件**: 同じ引数に対してつねに同じ値を返す(純関数)。`area.width`・`area.height` はつねに 0 以上の有限値。`plotY(1, area)` が作図領域の上端、`plotY(0, area)` が下端に等しい(値が大きいほど上)。`count` が 1 のとき `plotX` は作図領域の左端を返す(0 除算を起こさない)。`visiblePointCount` は 1 以上の整数。
- **エラー**: 返さない。

### 5.8. タコメータの配置関数(TypeScript・`frontend/src/lib/metrics.ts`)

- **定義**:
  ```ts
  export type DialGeometry = { cx: number; cy: number; radius: number; startAngle: number; endAngle: number };
  export function dialGeometry(view: { width: number; height: number }): DialGeometry;
  export function dialAngle(value: number, dial: DialGeometry): number;
  export function approach(current: number, target: number, rate: number): number;
  ```
- **入力 / 出力**: 描画領域の寸法から文字盤の中心・半径・目盛りの開始角と終了角を決め、値(0.0〜1.0)を針の角度へ写す。`approach` は現在値を目標値へ `rate`(0〜1)の比で近づける。
- **事前条件**: `view.width`・`view.height` が 0 より大きい。`value` が 0.0 以上 1.0 以下。`rate` が 0.0 以上 1.0 以下。
- **事後条件**: 同じ引数に対してつねに同じ値を返す(純関数)。`radius` はつねに 0 より大きい有限値。`dialAngle(0, dial) === dial.startAngle` かつ `dialAngle(1, dial) === dial.endAngle`。`approach(a, b, 0) === a` かつ `approach(a, b, 1) === b`。`approach` の戻り値はつねに `a` と `b` のあいだにある。
- **エラー**: 返さない。

### 5.9. フレーム間隔の計測(TypeScript・`frontend/src/lib/framestats.ts`)

6 パネル同時稼働時に描画が滞るかを数値で見るための計測器(§3 前提 2・§9)。

- **定義**:
  ```ts
  export function recordFrame(panel: string, now: number): void;
  export function frameReport(): string;
  ```
- **入力 / 出力**: `recordFrame` は各パネルの `requestAnimationFrame` のコールバック先頭で呼び、`performance.now()` の値を渡す。パネルごとにフレーム間隔を貯め、`frameReportInterval`(5000 ms)ごとに 1 行の `console.info` を出す。`frameReport` は同じ内容の文字列を返し、DevTools のコンソールから任意の時点で呼び出せる。
- **事前条件**: なし(いつ・何回呼んでもよい)。
- **事後条件**: 計測は開発時(`process.env.NODE_ENV !== 'production'`)にだけ有効で、それ以外では `recordFrame` が即座に戻る(配布ビルドへ計測の負荷を持ち込まない)。報告には、パネルごとの計測フレーム数・平均フレーム間隔・p95 フレーム間隔・最大フレーム間隔(いずれも ms)を含める。貯める間隔の個数は `frameSampleCap`(600)で頭打ちにする(計測器自身がメモリを食い潰さないため)。
- **エラー**: 例外を投げない。`performance` が利用できない場合は何もしない。

## 6. データ構造

### 6.1. `MetricPoint`(Go)

```go
// MetricPoint は 1 時点の全系列の測定値。折れ線グラフの縦 1 本ぶん。
type MetricPoint struct {
    Seq    uint64    `json:"seq"`
    Values []float64 `json:"values"` // metricSeriesIDs と同じ並び。各 0.0〜1.0 の正規化値
}
```

- **不変条件**: `Seq` は 1 以上。`Values` は nil でなく、長さが `metricSeriesCount`(3)にちょうど等しい。各要素は 0.0 以上 1.0 以下の有限値(NaN・Inf を含まない)。
- **強制**: 生成関数 `newMetricPoint(seq uint64, values []float64) (MetricPoint, error)` を通してのみ作る。違反は `errMetricSeqZero` / `errMetricValueCount` / `errMetricValueRange` / `errMetricValueNotFinite` を `errors.Is` で識別できる形で返す(unit #1 の `newLogLine`・unit #3 の `newCommit` と同じ流儀)。
- **注意**: `Values` は呼び出し側のスライスを内部へ取り込まず複製する(生成後に外から書き換えられて不変条件が崩れるのを防ぐ。unit #3 の `Commit.Parents` と同じ)。

### 6.2. `GaugeReading`(Go)

```go
// GaugeReading はタコメータの 1 回分の読み。Value は針の位置、Display は画面へ出す値。
type GaugeReading struct {
    Seq     uint64  `json:"seq"`
    Value   float64 `json:"value"`   // 0.0〜1.0。針の位置
    Display float64 `json:"display"` // 画面へ出す単位付きの値(0〜100 の使用率)
    Zone    string  `json:"zone"`    // nominal / elevated / critical
    Label   string  `json:"label"`   // 画面へ出す英語のラベル
}
```

- **不変条件**: `Value` は 0.0 以上 1.0 以下の有限値。`Display` は 0.0 以上 100.0 以下の有限値。`Zone` は `ZoneNominal` / `ZoneElevated` / `ZoneCritical` のいずれか。`Label` は 1 文字以上で改行を含まない。`Zone` は `Value` から一意に決まる(`gaugeZoneFor` が単一の正本)。
- **強制**: 生成関数 `newGaugeReading(seq uint64, value float64, label string) (GaugeReading, error)`。`Display` と `Zone` は `value` から導出するため引数に取らない(2 つの正本を作らない)。違反は `errMetricValueRange` / `errMetricValueNotFinite` / `errMetricLabelEmpty` / `errMetricLabelNewline` を返す。
- **`Zone` を独自の型でなく `string` にする理由**: unit #3 の `GraphNode.Health` と同じ。フロントエンドは色の対応表の鍵として文字列を読むだけであり、Go 側で型を足しても得るものが無い。定数と `gaugeZoneValid` による検査で不変条件は同じく保てる。

### 6.3. `MetricSeriesMeta`(Go)

```go
// MetricSeriesMeta は折れ線の 1 系列の見出し。値そのものは MetricPoint.Values が持つ。
type MetricSeriesMeta struct {
    ID      string  `json:"id"`      // 画面へ出す英語のラベル。系列内で一意
    Unit    string  `json:"unit"`    // 画面へ出す英語の単位(req/s・ms・%)
    Display float64 `json:"display"` // 画面へ出す単位付きの現在値(正規化前)
}
```

- **不変条件**: `ID`・`Unit` は 1 文字以上で改行を含まない。`Display` は有限値。
- **強制**: 生成関数 `newMetricSeriesMeta(id, unit string, display float64) (MetricSeriesMeta, error)`。
- **理由**: 正規化値だけでは画面に「1420 req/s」のような読める値を出せない(§3 前提 3)。単位と現在値はフレームごとに変わるため、系列の見出しに同居させる。

### 6.4. `MetricFrame`(Go)

```go
// MetricFrame は 1 回の送出で運ぶ、折れ線の新しい 1 点とタコメータの読みの組。
type MetricFrame struct {
    Series []MetricSeriesMeta `json:"series"` // Point.Values と同じ並び
    Point  MetricPoint        `json:"point"`
    Gauge  GaugeReading       `json:"gauge"`
}
```

- **不変条件**: `Series` は nil でなく、長さが `Point.Values` の長さに等しい。`Series` の `ID` は互いに重複しない。`Point.Seq` と `Gauge.Seq` は等しい(同じフレームであることを両パネルが `Seq` で照合できるため)。
- **ロジックの所在**: 値の揺らし方・ゾーンの遷移・正規化は `metricSource` に集約する。`MetricFrame` は値の運搬に徹する。
- **シリアライズ形式**: `MetricSeriesMeta`・`MetricPoint`・`GaugeReading` は `App.Snapshot` の戻り値から辿れるため、Wails のバインディング生成器が `frontend/wailsjs/go/models.ts` へ TypeScript 型として出力する。**`MetricFrame` 自体は出力されない。** バインディング生成器はバインドされたメソッドのシグネチャから辿れる型だけを出力し、`MetricFrame` はイベントの payload にしか現れないためである(実装で判明。unit #2・#3 の `ScatterCloud`・`DependencyGraph` は `Snapshot` の戻り値の一部であり出力される点が違う)。生成物を手で編集しない規律(`CLAUDE.md`)に従い、フロントエンドは生成された 3 つの型から `frontend/src/lib/feed.ts` で同じ形の `MetricFrame` を組み立てて使う。

### 6.5. `MetricHistory`(Go)

```go
// MetricHistory は起動直後の初期表示に返す時系列の履歴と、最新のゲージの読み。
type MetricHistory struct {
    Series []MetricSeriesMeta `json:"series"`
    Points []MetricPoint      `json:"points"` // 古い順
    Gauge  GaugeReading       `json:"gauge"`
}
```

- **不変条件**: `Series`・`Points` はいずれも nil でない(JSON 化して `null` にしないため)。`Points` は `Seq` の昇順で、件数は `appMetricCapacity` 以下。空の履歴(`startup` 前に `Snapshot` を呼んだ場合)は `Series`・`Points` が長さ 0、`Gauge.Seq` が 0 とする。

### 6.6. `metricSource` の内部状態(非公開)

- 系列ごとの状態 `metricSeriesState{id, unit string; norm float64; base, span float64}` の配列(長さ `metricSeriesCount` = 3)。`norm` は現在の正規化値、`base`・`span` は表示値へ戻すための係数(`Display = base + norm*span`)。
- 系列は `throughput`(req/s)・`latency`(ms)・`errors`(%)の 3 本で固定する。README「スループット・レイテンシ等の時系列」に対応させる。
- 生成のたびに、各系列の `norm` を目標へ引き戻しつつ小さな乱歩を加え、0〜1 へ切り詰める(unit #2 の `drift` / unit #3 の `clampZeroOne` をそのまま使う。同じ計算を書き直さない)。
- ゲージの `Value` は 3 系列の重み付き和から作り、`throughput` と `latency` の上昇に連動させる(§3 前提 4 の「相関させた擬似値」の実体)。重みは `gaugeWeights` に置く。
- 保持点のリングバッファ(`logSource`・`commitSource` と同じ形。上限に達したら最古を上書きする)、`seq`、`capacity`、`rnd`、最新の `MetricFrame`。
- `Snapshot` は保持点の複製と最新のゲージの読みを返す。

### 6.7. `DashboardSnapshot`(Go・既存の拡張)

```go
type DashboardSnapshot struct {
    Log     []LogLine       `json:"log"`
    Scatter ScatterCloud    `json:"scatter"`
    Commits []Commit        `json:"commits"`
    Graph   DependencyGraph `json:"graph"`
    Metrics MetricHistory   `json:"metrics"`
}
```

- **不変条件**: 既存 4 フィールドの不変条件を維持したまま 1 フィールドを足す。`Metrics.Series`・`Metrics.Points` は nil でない。

### 6.8. デザイントークン(CSS)

新しいトークンは追加しない(§3 前提 6)。`globals.css` の `@theme` が正本。

| 用途 | トークン |
| ---- | -------- |
| 折れ線の `throughput` | `--color-accent-line` |
| 折れ線の `latency` | `--color-level-info` |
| 折れ線の `errors` | `--color-level-error` |
| 折れ線の軸・目盛り線 | `--color-border` |
| 折れ線の系列名・単位の文字 | `--color-text-dim` / `--color-text` |
| タコメータの文字盤と針 | `--color-accent-gauge` |
| タコメータの `nominal` の帯 | `--color-accent-graph` |
| タコメータの `elevated` の帯 | `--color-level-warn` |
| タコメータの `critical` の帯 | `--color-level-error` |
| タコメータの数値・ラベルの文字 | `--color-text` / `--color-text-dim` |
| 両パネルの背景 | `--color-surface-1` |
| ウィンドウの地色(`main.go`) | `--color-surface-0` と同値(§3 前提 10) |

## 7. 振る舞い(受け入れ基準)

### Requirement 1: 擬似メトリクス生成器の契約

**対象**: §5.1 `metricSource`

**受け入れ基準**:
1.1. システムは、`metricSource.EventName()` の呼び出しに対してつねに `"nullops:metric"` を返さなければならない。(常時)
1.2. システムは、`metricSource.Interval()` の呼び出しに対してつねに 500 ミリ秒を返さなければならない。(常時)
1.3. `Next` が呼ばれたとき、システムは `MetricFrame` を返さなければならない。(イベント)
1.4. `Next` が呼ばれたとき、システムは直前の戻り値より 1 だけ大きい `Point.Seq` を持つフレームを返さなければならない。(イベント)
1.5. `capacity` が 1 未満、または `rnd` が nil の場合、システムは `newMetricSource` の呼び出しで panic しなければならない。(異常系)
1.6. `Next` と `Snapshot` が複数のゴルーチンから同時に呼ばれている間、システムはデータ競合を起こしてはならない(`go test -race` で検出されない)。(常時)
1.7. `Next` を `capacity` より多く呼び出したとき、システムは `Snapshot().Points` が返す件数を `capacity` 以下に保たなければならない。(状態)
1.8. `Snapshot` が呼ばれたとき、システムは点を古い順(`Seq` の昇順)に並べた、内部と別の配列を返さなければならない。(イベント)

### Requirement 2: 時系列の値の不変条件

**対象**: §6.1 `MetricPoint` / §6.3 `MetricSeriesMeta`

**受け入れ基準**:
2.1. システムは、`newMetricPoint` が返す `MetricPoint` の `Values` の長さを `metricSeriesCount` にちょうど等しくしなければならない。(常時)
2.2. `Values` の長さが `metricSeriesCount` と異なる場合、システムは `errMetricValueCount` を `errors.Is` で識別できる error として返し、panic してはならない。(異常系)
2.3. `Values` の要素が 0.0 未満または 1.0 超の場合は `errMetricValueRange` を、NaN または無限大の場合は `errMetricValueNotFinite` を、`errors.Is` で識別できる error として返さなければならない。(異常系)
2.4. `Seq` が 0 の場合、システムは `errMetricSeqZero` を `errors.Is` で識別できる error として返さなければならない。(異常系)
2.5. `newMetricPoint` が呼ばれたとき、システムは渡された `Values` スライスを複製し、呼び出し側による生成後の書き換えが `MetricPoint` へ波及しないようにしなければならない。(イベント)
2.6. `ID` または `Unit` が空文字・改行を含む場合、システムは `newMetricSeriesMeta` から対応する error を返さなければならない。(異常系)

### Requirement 3: 時系列の時間変化

**対象**: §5.1 `metricSource` / §6.6 内部状態

**受け入れ基準**:
3.1. `Next` を 1000 回連続で呼び出す間、システムはすべての `Point.Values` の各要素を 0.0 以上 1.0 以下に保たなければならない。(状態)
3.2. `Next` を 100 回呼び出す間、システムは各系列について、直前のフレームと値が異なるフレームを 1 回以上生じさせなければならない(線が伸びて変化する)。(状態)
3.3. `Next` を 1000 回連続で呼び出す間、システムは系列の集合(`Series` の `ID` の並び)を変えてはならない。(状態)
3.4. `Next` が呼ばれたとき、システムは `Series` の長さを `Point.Values` の長さに等しく保たなければならない。(イベント)
3.5. `Next` を 1000 回連続で呼び出す間、システムはすべての `Series` の `Display` を有限値に保たなければならない。(状態)

### Requirement 4: タコメータの読みの契約

**対象**: §6.2 `GaugeReading` / §6.6 内部状態

**受け入れ基準**:
4.1. システムは、`newGaugeReading` が返す `GaugeReading` の `Value` を 0.0 以上 1.0 以下、`Display` を 0.0 以上 100.0 以下に保たなければならない。(常時)
4.2. `value` が範囲外の場合は `errMetricValueRange` を、NaN または無限大の場合は `errMetricValueNotFinite` を、`errors.Is` で識別できる error として返さなければならない。(異常系)
4.3. `label` が空文字または改行を含む場合、システムは対応する error を `errors.Is` で識別できる形で返さなければならない。(異常系)
4.4. システムは、`GaugeReading.Zone` を `Value` から一意に決めなければならない(同じ `Value` に対してつねに同じ `Zone`)。(常時)
4.5. `Next` を 1000 回連続で呼び出す間、システムは `Gauge.Value` を 0.0 以上 1.0 以下に、`Gauge.Zone` を定義済みの 3 値のいずれかに保たなければならない。(状態)
4.6. `Next` が呼ばれたとき、システムは `Gauge.Seq` を `Point.Seq` に等しくしなければならない。(イベント)
4.7. `Next` を 1000 回呼び出す間、システムは `Gauge.Zone` が変化するフレームを 1 回以上生じさせなければならない(針がゾーンをまたいで動く)。(状態)

### Requirement 5: 起動直後の初期表示

**対象**: §5.2 `App.Snapshot` / §6.5 `MetricHistory` / §6.7 `DashboardSnapshot`

**受け入れ基準**:
5.1. `Snapshot` が呼ばれたとき、システムは `Metrics.Series`・`Metrics.Points` がいずれも nil でない `DashboardSnapshot` を返さなければならない。(イベント)
5.2. `startup` を経ずに `Snapshot` が呼ばれた場合、システムは error を返さず、`Metrics.Series` と `Metrics.Points` の長さが 0、`Metrics.Gauge.Seq` が 0 の値を返さなければならない。(異常系)
5.3. `Snapshot` が呼ばれたとき、システムは `metricSource` の内部状態(`Seq`・保持点・系列の値)を変化させてはならない。(イベント)
5.4. `startup` の後に `Snapshot` が呼ばれたとき、システムは `Metrics.Series` の長さが `metricSeriesCount` に等しい履歴を返さなければならない。(イベント)
5.5. `Snapshot` が返す `Metrics.Points` を呼び出し側が書き換えても、システムは内部の保持点を変化させてはならない。(イベント)
5.6. `Snapshot` を JSON 化したとき、システムは `metrics.series`・`metrics.points` を `null` でなく空配列として出力しなければならない(0 件のとき)。(常時)

### Requirement 6: 生成器の結線

**対象**: §5.1 / `App.startup`

**受け入れ基準**:
6.1. `startup` が呼ばれたとき、システムは `metricSource` を `feed.Runner` の第 5 の `Source` として登録し、`nullops:metric` の送出を開始しなければならない。(イベント)
6.2. システムは、`metricSource` へ他の生成器と共有しない専用の `*rand.Rand` を渡さなければならない。(常時)
6.3. システムは、`appMetricCapacity` を 240、`metricSeriesCount` を 3、`metricInterval` を 500 ミリ秒に保たなければならない(結線値の固定。生成器自体のテストは小さい値で回すため、ここでしか守れない)。(常時)
6.4. `shutdown` が呼ばれたとき、システムは `nullops:metric` の送出を新たに開始してはならない。(イベント)

### Requirement 7: パネルの購読と初期表示の併合

**対象**: §5.4 購読関数 / §5.5 `TimeseriesPanel` / §5.6 `GaugePanel`

**受け入れ基準**:
7.1. 各パネルがマウントされたとき、システムは購読を開始してからスナップショットを取得しなければならない(取得中に届いたフレームを落とさないため)。(イベント)
7.2. `TimeseriesPanel` は、購読で届いた点とスナップショットの点を `Seq` を鍵に併合し、同一 `Seq` を 1 件だけ残さなければならない。(イベント)
7.3. `GaugePanel` は、購読で届いた読みとスナップショットの読みのうち `Seq` が大きいほうを目標値にしなければならない(針の巻き戻しを防ぐ)。(イベント)
7.4. 各パネルがアンマウントされたとき、システムは購読を解除し、以後コールバックで状態を更新してはならない。(イベント)
7.5. スナップショットの取得が reject された場合、システムは例外を伝播させず、空の履歴・針を 0 の位置として描画を開始しなければならない。(異常系)
7.6. 受け取った payload が期待の形(`point` と `gauge` を持つ物体)でない場合、システムは描画対象を更新せず、`console.error` に記録するだけでなければならない。(異常系)
7.7. 2 つのパネルが同じ `nullops:metric` を購読している状態で一方がアンマウントされたとき、システムは他方の購読を解除してはならない。(イベント)
7.8. `TimeseriesPanel` は、保持する点の件数を `appMetricCapacity` 以下に保たなければならない(長時間の稼働でメモリが増え続けない)。(状態)

### Requirement 8: 折れ線グラフの描画

**対象**: §5.5 `TimeseriesPanel` / §5.7 配置関数

**受け入れ基準**:
8.1. システムは、`plotArea`・`plotX`・`plotY`・`visiblePointCount` が同じ引数に対してつねに同じ値を返さなければならない。(常時)
8.2. システムは、`plotY(1, area)` を作図領域の上端に、`plotY(0, area)` を下端に一致させなければならない(値が大きいほど上)。(常時)
8.3. 描画のとき、システムは 3 系列を互いに異なる色の折れ線で 1 枚に重ね、古い点を左・新しい点を右へ並べなければならない。(イベント)
8.4. 描画のとき、システムは枠に収まる点数(`visiblePointCount`)だけを、新しい側から取って描かなければならない。(イベント)
8.5. 描画のとき、システムは各系列の名前・単位・現在値(`Display`)を英語のまま添え、枠の幅を超える文字列を切り詰めなければならない(横スクロールを出さないため)。(イベント)
8.6. 表示対象の最新 `Seq` と描画領域の寸法がいずれも前フレームから変わっていない場合、システムはキャンバスへの描画を行ってはならない。(常時)
8.7. `view.width` または `view.height` が 0 の場合、システムは描画処理を行わず、次のフレームへ進まなければならない(0 除算による NaN を画面へ出さない)。(異常系)
8.8. 保持している点が 0 件または 1 件の場合、システムは例外を投げず、線を描かずに軸と見出しだけを描かなければならない。(異常系)

### Requirement 9: タコメータの描画

**対象**: §5.6 `GaugePanel` / §5.8 配置関数

**受け入れ基準**:
9.1. システムは、`dialGeometry`・`dialAngle`・`approach` が同じ引数に対してつねに同じ値を返さなければならない。(常時)
9.2. システムは、`dialAngle(0, dial)` を `dial.startAngle` に、`dialAngle(1, dial)` を `dial.endAngle` に一致させなければならない。(常時)
9.3. システムは、`approach(a, b, 0)` を `a` に、`approach(a, b, 1)` を `b` に一致させ、戻り値をつねに `a` と `b` のあいだに保たなければならない。(常時)
9.4. 新しい読みが届いたとき、システムは針を目標値へ瞬間移動させず、毎フレーム `approach` で漸近させなければならない(値の跳びをそのまま出さない)。(イベント)
9.5. 描画のとき、システムは文字盤の帯を `nominal`・`elevated`・`critical` で互いに異なる色に塗り分けなければならない。(イベント)
9.6. 描画のとき、システムは現在の使用率(`Display`)を数値として英語のラベルとともに文字盤の中央に描かなければならない。(イベント)
9.7. 針が目標値に達しており描画領域の寸法も変わっていない場合、システムはキャンバスへの描画を行ってはならない(止まっている針を描き直さない)。(常時)
9.8. `view.width` または `view.height` が 0 の場合、システムは描画処理を行わず、次のフレームへ進まなければならない。(異常系)

### Requirement 10: 描画領域への追随とデザイントークンへの準拠

**対象**: §5.5 / §5.6 両パネル / §6.8 デザイントークン

**受け入れ基準**:
10.1. システムは、両パネルのキャンバスのバッキングストアの画素数を CSS 上の寸法と `devicePixelRatio` の積に一致させなければならない。(常時)
10.2. ウィンドウの大きさが変わって枠の寸法が変わったとき、システムはキャンバスの寸法を新しい寸法へ追随させなければならない。(イベント)
10.3. 枠の寸法が変わっても、システムは描画内容を枠の内側に収め、ページ側にスクロールバーを出してはならない。(常時)
10.4. システムは、両パネルの色を `globals.css` の `@theme` トークンから解決しなければならず、`.ts`・`.tsx` に色の直値(16 進表記)を書いてはならない。(常時)
10.5. トークンの解決に失敗した場合(空文字が返る場合)、システムは既定の色文字列へ退避し、描画を止めてはならない。(異常系)
10.6. 各パネルは、マウント時に 1 度だけトークンを解決し、フレームごとに `getComputedStyle` を呼んではならない。(常時)
10.7. 各パネルがアンマウントされたとき、システムは `requestAnimationFrame` のループと `ResizeObserver` を停止しなければならない。(イベント)
10.8. システムは、`'use client'` を葉のパネルにだけ置き、`DashboardGrid` と `page.tsx` へ広げてはならない(Strict Mode の二重描画で unit #1 の受け入れ基準 1.4 を破らないため)。(常時)

### Requirement 11: 6 パネル同時稼働と見た目の統合

**対象**: 本 unit の全体 / `page.tsx` / `main.go`

**受け入れ基準**:
11.1. システムは、`main.go` の `BackgroundColour` を `globals.css` の `--color-surface-0` と同じ色にしなければならない(起動直後の地色が本文の地色とずれないため)。(常時)
11.2. システムは、`page.tsx` の 6 枠すべてに実装済みのパネルを結線し、`pending` のプレースホルダを 1 つも残してはならない。(常時)
11.3. `wails dev` を起動して 30 秒間観察したとき、システムは 6 パネルすべてを更新し続けなければならない(停止するパネルが無い)。(状態)
11.4. システムは、README「画面」表の 6 行と実画面のパネルを 1 対 1 で対応させなければならない(対応しない箇所があれば README を更新して一致させる)。(常時)
11.5. `macOS で wails build` を実行したとき、システムはエラーなくアプリを生成し、生成したアプリの起動で 6 パネルが描画されなければならない。(イベント)
11.6. システムは、6 パネル同時稼働時の 1 秒あたりの送出回数の合計を 10 回以下に保たなければならない(log は 80〜400 ms・scatter/graph は 1000 ms・commit は 1500 ms・metric は 500 ms。描画の滑らかさを IPC の頻度に依存させない)。(常時)

### Requirement 12: フレーム間隔の実測と検証手段の成立(非機能)

**対象**: §5.9 `framestats.ts` / 本 unit の全体

**受け入れ基準**:
12.1. システムは、`go vet ./...`・`go test ./...`(`-race` を含む)・`cd frontend && npm run lint`・`wails build` がいずれもエラーなく終了する状態を保たなければならない。(常時)
12.2. `cd frontend && npm run lint` を実行したとき、システムは `$schema` の版の不一致に由来する info を出力してはならない(§3 前提 11)。(イベント)
12.3. `go test -race -count=1 ./...` を 5 回連続で実行したとき、システムはすべて成功しなければならない(間欠的な失敗を残さない)。(状態)
12.4. システムは、6 パネル同時稼働時のパネルごとのフレーム間隔(平均・p95・最大)を数値として取得できる手段を備えなければならない(§9)。(常時)
12.5. `process.env.NODE_ENV` が `production` の場合、システムは `recordFrame` の呼び出しで計測を行わず即座に戻らなければならない(配布ビルドへ計測の負荷を持ち込まない)。(常時)
12.6. 実測の結果、いずれかのパネルの p95 フレーム間隔が 20 ミリ秒(50 fps 相当)を継続して超える場合、システムは `requestAnimationFrame` のループを 1 本へ共有する機構を備えなければならない。超えない場合、システムはパネルごとに独立したループのまま据え置かなければならない(§3 前提 2・§10)。(状態)
12.7. システムは、可視化ライブラリを `frontend/package.json` の依存へ追加してはならない。(常時)

## 8. 実現方針

- **描画手段**: 2 パネルとも Canvas 2D。折れ線は `moveTo`/`lineTo` の折れ線パス、タコメータは `arc` の帯と針の直線であり、いずれも 2 次元 API で直接書ける(§3 前提 5)。
- **生成の所在**: Go 側。正規化も Go 側で行い(§3 前提 3)、フロントエンドが持つのは正規化値をキャンバス座標へ写す純関数だけ。`frontend/src/lib/metrics.ts` に置く(unit #2 の `project.ts`・unit #3 の `commitgraph.ts` / `depgraph.ts` と同じ扱い)。折れ線とタコメータを 1 ファイルに置くのは、両者が同じ `MetricFrame` を読む対の部品であり、ファイルを分けても共有する定数が増えるだけだからである。
- **再描画の駆動**: 両パネルとも `requestAnimationFrame` のループを持つ(§3 前提 2)。折れ線は「最新 `Seq` と寸法が前フレームと同じなら描かない」、タコメータは「針が目標に達しており寸法も同じなら描かない」と判定する。描画対象を state に置かず ref に持つのは、毎フレームの再描画を React に起こさせないためである(`CLAUDE.md` TypeScript 規約)。
- **既存構造との関係**: `feed` パッケージには手を入れない。`metricSource` は既存の各生成器と同じく `main` パッケージに置き、`App.startup` で `feed.NewRunner` へ第 5 の `Source` として渡す。依存方向は `main → feed` のままで変わらない。unit #2 の `drift` / `clampUnit` / `symmetricUniform`、unit #3 の `clampZeroOne` を再利用し、同じ計算を書き直さない。
- **色の解決**: `getComputedStyle(document.documentElement).getPropertyValue(...)` で実行時に解決し、マウント時に 1 度だけ読んで ref に持つ(unit #2・#3 と同じ)。退避先には 16 進の直値を置かず CSS のキーワードを使う(受け入れ基準 10.4 と 10.5 を両立させるため)。
- **`main.go` の地色**: `--color-surface-0` の `#10141c` を `options.RGBA{R: 16, G: 20, B: 28, A: 1}` として書く。Wails のオプションは Go の構造体であり CSS 変数を読めないため直値になるが、正本が `globals.css` にあることをコメントで示し、値がずれたときに気付ける形にする。
- **保持件数**: 時系列は `appMetricCapacity`(240 点 = 500 ms × 240 = 2 分)。折れ線の枠幅に収まる点数はこれより少ないため、`visiblePointCount` で新しい側から切り出して描く。
- **unit #2 からの申し送り(点数 256 の妥当性)**: 6 パネル同時稼働時の負荷は §9 の実測で見る。実測で問題が出た場合の対処の候補は、(a) rAF ループの共有、(b) 点群の点数の削減、(c) 更新頻度の低減の順に検討する。順序の理由は、(a) が描画の呼び出し回数そのものを減らすのに対し、(b)(c) は画面に出る情報量を削るためである。
- 用語集(`docs/glossary.md`)はリポジトリに無い。名前は既存コード(`logSource` / `scatterSource` / `commitSource` / `graphSource` / `DashboardSnapshot`)の語彙に合わせた。

## 9. フレーム間隔の実測の設計

§3 前提 2 の判断(rAF ループを共有するか)を数値で決めるための設計。目視に頼らない形にする(依頼者の指示)。

### 9.1. 計測器

`frontend/src/lib/framestats.ts`(§5.9)を置き、6 パネルすべての `requestAnimationFrame` のコールバック先頭で `recordFrame(パネル名, performance.now())` を呼ぶ。計測器はパネルごとに直前の呼び出しからの差分(フレーム間隔)を貯め、`frameReportInterval`(5000 ms)ごとに次の形の 1 行を `console.info` へ出す。

```
[framestats] log n=298 mean=16.8 p95=17.4 max=33.1 | commit n=297 mean=16.8 p95=17.2 max=31.9 | ...
```

`frameReport()` を export するのは、DevTools のコンソールから任意の時点で同じ内容を取り出せるようにするためである(5 秒の周期を待たずに読める)。

### 9.2. 計測の手順(人間が実行する)

1. `wails dev` を起動する。
2. WebView の DevTools を開く(macOS では右クリック → Inspect Element)。または開発サーバが同時に配信する `http://localhost:34115` を通常のブラウザで開き、そちらの DevTools を使う。
3. 6 パネルすべてが描画を始めてから 60 秒待つ。
4. コンソールの `[framestats]` の行のうち、最後の 6 行(30 秒ぶん)を記録する。
5. ウィンドウを最大化して同じ手順を繰り返す(描画面積が増えたときの値を見るため)。

### 9.3. 判定の基準

いずれかのパネルの **p95 フレーム間隔が 20 ms(50 fps 相当)を継続して超える**場合に「描画が滞っている」と判定し、rAF ループを 1 本へ共有する機構を入れる(受け入れ基準 12.6)。超えない場合はパネルごとに独立したループのまま据え置く。

20 ms を閾値にするのは、60 Hz のディスプレイでフレームを 1 枚落とすと間隔が約 33 ms になるためである。20 ms は「1 枚落としが常態化していない」ことを見る位置であり、たまの 33 ms(`max` に現れる)を不合格にしない。

### 9.4. 本セッションの制約

本ホストは macOS の画面収録権限を持たず、`wails dev` の GUI を起動して DevTools のコンソールを読む操作を自動で行えない(§3 前提 7)。計測器の実装と手順の整備までを本 unit で行い、**実測は人間が §9.2 の手順で行う**。結果は §10 へ記録する。

数値が取れない設計しか無いわけではない(計測器はコンソールへ数値を出す)。読み取りの操作だけが人間に残る。

## 10. 実測の記録

> 本節は §9.2 の手順を人間が実行した後に埋める。埋まるまで §3 前提 2 の判断は「据え置き(パネルごとに独立したループ)」を既定とする。

### 10.1. 本セッションでの到達点(2026-09-03)

- **実施日:** 2026-09-03(計測器の実装と結線まで。数値の読み取りは未実施)
- **観測値:** 取得できなかった。
- **結論:** **据え置き(パネルごとに独立した `requestAnimationFrame` のループのまま)。**

**取得できなかった理由。** §9.2 の手順は `wails dev` の GUI を起動し、WebView(または `http://localhost:34115`)の DevTools のコンソールを読む操作を要する。本ホストはターミナルへ macOS の画面収録権限を持たず、GUI の内容を読む手段が無い(§3 前提 7)。`console.info` の出力先は WebView のコンソールであり、`wails dev` の標準出力には現れないため、GUI を経由しない読み取りもできない。ヘッドレスブラウザで代替する案は §2 の対象外(描画結果の自動視覚検証・ブラウザ自動化)に当たり、加えて Chromium の rAF の刻みは macOS の WKWebView の実際の描画を代表しない。

**据え置きとした根拠。** 依頼者の判断は「6 パネルを同時に動かして実際に描画が滞るかを測り、**問題が出たときだけ**共有機構を入れる」である。問題が出たという観測が無い以上、共有機構を入れる条件(受け入れ基準 12.6 の前段)は成立しない。推測で共有機構を入れることは `CLAUDE.md`「将来の拡張性のためだけにコードを複雑化しない」に反する。

**据え置きの妥当性を支える設計上の事実(数値の代わりにはならない)。**

- 6 パネルのうち rAF ループを持つのは 5 本である(`LogStreamPanel` は DOM と React の再描画で進む)。
- `CommitGraphPanel` と `DependencyGraphPanel` は、直前に描いた内容と入力が同じフレームで描画を省く条件付き再描画を持つ。両パネルの入力は 1 秒前後の周期で更新されるため、60 Hz のフレームの大半は早期 return で終わる。
- 毎フレーム実際に描くのは `Scatter3DPanel`(点群の回転)・`TimeseriesPanel`(針の漸近と時系列の再描画)・`GaugePanel`(針の漸近)の 3 本である。
- 色は各パネルがマウント時に 1 度だけ解決して ref に持ち、毎フレームの `getComputedStyle` は起きない。

**残す手当て。** 実測は人間が §9.2 の手順で行い、`p95` が 20 ms を継続して超える場合にのみ共有機構を入れる。手順は `tasks.md` の `## Implementation Notes` にも未検証項目として積んである。

## 11. 参考資料

- `docs/specs/001-dashboard-mvp/roadmap.md` §1・§1.1・§2・§3(unit #4 の範囲・完了条件・未確定項目・スコープ外)
- `docs/specs/001-dashboard-mvp/001-dashboard-shell/spec.md`(凍結済み。`feed.Source`・`feed.Emitter`・`feed.Runner`・`App.Snapshot`・デザイントークンの契約)
- `docs/specs/001-dashboard-mvp/002-scatter3d-panel/spec.md`(凍結済み。Canvas 2D の描画規律・トークンの実行時解決・`DashboardSnapshot` の拡張の前例)
- `docs/specs/001-dashboard-mvp/003-graph-panels/spec.md`(凍結済み。生成器の追加と結線の前例・純関数の切り出しの規律)
- `README.md`「画面」表(6 パネルの要求の本体)
- `CLAUDE.md`(言語規約・Go / TypeScript コーディング規約・注意事項)
