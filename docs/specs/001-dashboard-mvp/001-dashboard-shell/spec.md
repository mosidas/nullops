# dashboard-shell — 仕様

## 1. 目的と背景

nullops は「作業中に見える」ダッシュボードを描くデスクトップアプリであり、README「画面」表が 6 つのパネルを定めている。現在のリポジトリは Wails v2 + Next.js のテンプレートのままで、パネルの描画も擬似データの生成も無い。

この作業単位は、6 パネルのうち**ログストリーム 1 枚**を動く形で作り、あわせて**残り 5 パネルが載る土台**（擬似データを Go で生成してフロントエンドへ供給する経路、6 枠のレイアウト、配色の正本、検証コマンドが通る状態）を用意する。以降の 3 つの作業単位（`scatter3d-panel`・`graph-panels`・`metrics-panels`）は、この土台の拡張点にパネルを足していく。

要求の本体は `README.md`「画面」表、規約は `CLAUDE.md`、作業単位の分解と順序は `docs/specs/001-dashboard-mvp/roadmap.md` にある。本書はそれらを再記述せず参照する。

## 2. スコープ

### 対象（やること）

- 擬似データ生成の骨格（§5.1 `Source`・§5.2 `Emitter`・§5.3 `Runner`）
- フロントエンドへの供給経路（§5.4 `App.Snapshot` の戻り値による初期表示 + §5.5 イベントによる差分）
- 擬似的な作業段階を表す共有フェーズ（§6.4 `scenario`）
- ログストリームパネル（§6.1 `LogLine`・§6.3 `logSource`・§5.6 の購読）
- 6 枠のレイアウトと共通の枠（§5.7 `DashboardGrid`・`Panel`）。ログ以外の 5 枠は見出しのみのプレースホルダとする
- デザイントークンの定義（§6.6）。以後の作業単位はこれを正本とする
- ゴルーチンの終了保証とウィンドウ設定（§6.5）
- 検証手段の立ち上げ（`npm ci` → `npm run lint`、Go のテスト 1 件以上、`wails build`）
- テンプレート残骸の除去（`App.Greet`・`page.tsx` のデモ UI・`layout.tsx` の `metadata`）

### 対象外（やらないこと）

- 残り 5 パネルの `Source` 実装とペイロード型 — 理由: 後続 3 作業単位の範囲。本作業単位は枠と拡張点までを担う
- パネル内の描画領域の追随（Canvas・WebGL の再サイズ） — 理由: 描画を持つパネルの責務であり、描画手段が決まる作業単位で扱う
- 描画ライブラリの導入 — 理由: roadmap の前提どおり各パネルの作業単位の仕様で選定する
- フロントエンドのテストランナーの導入 — 理由: 検証対象のロジックを Go 側に集約するため（§3 の前提 1）、フロントエンドに検証すべきロジックが残らない
- `tsconfig.json` の変更 — 理由: コミット `d27e6c5` が「テンプレートと同じ形に揃える」ことを解決として記録しており、変更は解決済みの問題を再発させる
- `go.mod` の go ディレクティブの引き上げ — 理由: `1.25.0` は README「Go 1.25 以上」と矛盾せず、引き上げを要する機能を使わない
- `public/*.svg`・`logo-universal.png` の削除 — 理由: 残しても検証結果と画面に影響せず、変更範囲を広げない
- Windows・Linux での動作確認 — 理由: roadmap §3 のとおり今回の確認環境を macOS に限る

## 3. 前提（未検証の賭け）

1. **擬似データの生成ロジックを Go 側に集約すれば、フロントエンドに検証すべきロジックが残らない** — 検証方法: `go test ./...` が生成の振る舞いを覆い、フロントエンドの変更が `npm run lint` だけで守れること / 状態: 未検証（本作業単位の実装で確かめる）
2. **1 画面 6 枠を 1440 × 900 で並べても各枠が読める** — 検証方法: `wails dev` で 6 枠を表示し、ログ枠に 300 行の描画が収まることを目視する / 状態: 未検証
3. **80〜400 ms 間隔のログ流入で、6 パネル同時稼働時も描画が滞らない** — 検証方法: 後続作業単位で 6 枚が揃った時点で 30 秒間の観察を行う / 状態: 未検証（本作業単位ではログ 1 枚のみ）
4. **OS 内蔵の等幅フォントスタックで、macOS 上のログ表示が桁揃えを保つ** — 検証方法: `wails dev` でタイムスタンプ列と本文列の左端が揃うことを目視する / 状態: 未検証

## 4. 用語定義

| 用語 | 定義 |
| ---- | ---- |
| フィード（feed） | 1 つのパネルへ供給する擬似データの流れ。1 フィード = 1 つの `Source` = 1 つのイベント名 |
| フレーム | フィードが 1 回の送信で渡す値。ログフィードでは `LogLine` の配列 |
| フェーズ（Phase） | 擬似的な作業の段階（`build` / `test` / `deploy` / `scan`）。全フィードが読む共有の状態 |
| スナップショット | ある時点でパネルが表示すべき内容の全体。差分イベントと対になる |
| プレースホルダ枠 | 見出しだけを持ち、中身を後続の作業単位が埋めるパネル枠 |

プロジェクトは用語集（`docs/glossary.md`）を持たないため、上記は本書で定義し、既存コードの語彙（Wails の `Bind` / `Events`）に合わせている。

## 5. 公開インターフェース（API）

Go 側の内部パッケージを本書では `feed` と呼ぶ。パッケージの配置とファイル構成は本書では定めない（dev-decompose の責務）。ただし §5.6 が TypeScript の型を `main.LogLine` / `main.DashboardSnapshot` と書いているとおり、**バインディングに現れる型（`LogLine`・`Level`・`Phase`・`DashboardSnapshot`）と `App`・`logSource`・`scenario` は `main` パッケージに置き、`feed` には `Source`・`Emitter`・`Runner` だけを置く**。`main` は他パッケージから import できないため、この配置が §5.6 の型名と両立する唯一の形である。

### 5.1. `feed.Source`

擬似データ生成器の拡張点。後続の作業単位はこのインターフェースの実装を足してパネルを増やす。

- **定義**:

```go
type Source interface {
    EventName() string
    Interval() time.Duration
    Next() any
}
```

- **入力 / 出力**: 入力を取らない。`Next` は `encoding/json` でシリアライズできる値を返す。ログフィードの `Next` は長さ 1 の `[]LogLine` を返す。1 要素でも配列にするのは、スナップショット（§5.4）と同じ型にしてフロントエンドのハンドラを 1 種類にするためである。
- **事前条件**: 実装は `Next` の呼び出しで `panic` しない。擬似データの生成は外部入力（ファイル・ネットワーク・実在のシステム情報）を読まないため、失敗しうる経路を持たない。
- **事後条件**: `EventName()` はプロセスの生存期間中つねに同じ値を返す。`Interval()` は 1 ミリ秒以上を返す。`Next()` は nil でない値を返す。
- **並行性**: `Next()` は `Runner` のゴルーチンから呼ばれ、同時にバインディング経由の読み取り（§5.4）が起こる。実装は自身の状態を排他制御する。
- **エラー**: エラーを返さない。生成に失敗しうる経路が存在しないため。この前提が崩れる生成器は `Source` に載せない。

### 5.2. `feed.Emitter`

1 フレームをフロントエンドへ送る手段。`feed` パッケージを Wails から切り離し、テストを GUI 無しで実行できるようにするための境界である。

- **定義**:

```go
type Emitter interface {
    Emit(eventName string, payload any)
}
```

- **入力 / 出力**: 戻り値を持たない。
- **事前条件**: `eventName` は空文字でない。`payload` は nil でない。
- **事後条件**: 送信は非同期でよい。到達保証は無い（購読者が居なければ捨てられる）。
- **エラー**: エラーを返さない。Wails の `runtime.EventsEmit` がエラーを返さないため（出典は §9）。
- **定義場所**: 利用側である `feed` パッケージで定義する（`CLAUDE.md`「インターフェースは実装側ではなく利用側のパッケージで定義する」）。Wails に依存する実装は呼び出し側が渡す。

### 5.3. `feed.Runner`

登録された `Source` を各自の間隔で回し、`Emitter` へ送る。

- **定義**:

```go
type Runner struct { /* 非公開フィールド */ }

func NewRunner(emitter Emitter, sources ...Source) (*Runner, error)
func (r *Runner) Run(ctx context.Context)
```

- **`NewRunner` の事前条件**: `emitter` が nil でない。`sources` が 1 個以上。各 `EventName()` が空文字でなく、互いに重複しない。
- **`NewRunner` の事後条件**: 事前条件を満たすとき、非 nil の `*Runner` と nil の error を返す。
- **`Run` の事前条件**: `ctx` が nil でない。同一の `Runner` に対して 2 回以上呼ばない。
- **`Run` の事後条件**: `ctx.Done()` が閉じた後、起動した全ゴルーチンの終了を待ってから戻る。
- **不変条件**: `Run` が戻った時点で、この `Runner` が起動したゴルーチンは 0 個。
- **キャンセル後の送信**: `ctx.Done()` が閉じた後、`Runner` は `Emitter.Emit` の呼び出しを新たに開始しない。閉じた時点で実行中だった `Emit` の 1 回は完了させる。この保証があるため、呼び出し側が `Run` の復帰を待ちきらずに打ち切っても（§6.5）、打ち切り後に送信が残らない。
- **エラー**: `NewRunner` は事前条件違反を error で返す（`panic` しない）。起動時の静的な誤りだが、テストから検査できる形にするため戻り値を選ぶ。`Run` はエラーを返さない。

### 5.4. `App.Snapshot`（Wails のバインディングメソッド）

起動直後の初期表示を 1 回で取得する。

- **定義**:

```go
func (a *App) Snapshot() DashboardSnapshot
```

- **入力 / 出力**: 入力を取らない。出力は §6.2 の `DashboardSnapshot`。
- **事前条件**: 無し。いつ・何回呼んでもよい。
- **事後条件**: 呼び出し時点のスナップショットを返す。呼び出しによって `logSource` と `scenario` の状態は変化しない（副作用なし・冪等）。
- **エラー**: 返さない。
- **戻り値型を持たせる理由**: Wails のバインディング生成器が戻り値の型を `frontend/wailsjs/go/models.ts` へ TypeScript 型として出力するため、Go の型定義がそのままフロントエンドの型になる。イベントのペイロードには型が生成されないので、フロントエンドはこの生成物の型をイベントハンドラでも使う。
- **削除する既存 API**: `App.Greet(name string) string`（テンプレート由来。画面が 6 パネルに置き換わるため残さない）。

### 5.5. 送信イベント（Go → フロントエンド）

| イベント名 | ペイロード | 周期 | 追加する作業単位 |
| :- | :- | :- | :- |
| `nullops:log` | `LogLine[]`（差分は長さ 1） | 80〜400 ms | `dashboard-shell` |
| `nullops:commits` / `nullops:metrics` / `nullops:graph` / `nullops:gauge` / `nullops:scatter` | 各作業単位で定義 | 各作業単位で定義 | 後続 3 作業単位 |

- **差分もスナップショットも配列で表す**: フロントエンドのハンドラを 1 種類にし、判別子を不要にするため。
- **購読の解除には `EventsOn` の戻り値を使い、`EventsOff` を使わない**: 生成される `frontend/wailsjs/runtime/runtime.js` の `EventsOn` は、そのリスナーだけを外す解除関数を返す（生成元は `internal/frontend/runtime/wrapper/runtime.js:39-45`。`wails build` は `pkg/commands/build/base.go:436-439`、バインディング生成は `internal/app/app_bindings.go:103-106` で、いずれもこの `wrapper.RuntimeWrapper` を `frontend/wailsjs/runtime` へ展開する）。型定義も `EventsOn(...): () => void` である（同 `wrapper/runtime.d.ts:41`）。ランタイム本体も dev・production の両ビルドで個別の解除関数を返す（`internal/frontend/runtime/runtime_debug_desktop.js:83`、`runtime_prod_desktop.js` の minify 済み `return f[e].push(o),()=>M(o)`）。
  一方 `EventsOff(eventName)` は `removeListener` を呼び（`runtime_debug_desktop.js:125-132`）、`removeListener` が `delete eventListeners[eventName]` を実行する（同 `:121-124`）ため、**そのイベント名の全リスナーを外す**。パネルが増えるほど誤って他のパネルの購読を切る危険が増すので、本作業単位と後続の作業単位は `EventsOff` を使わない。
  （`pkg/templates/generate/assets/common/frontend/wailsjs/runtime/` にも同名のファイルがあり、そちらの `EventsOn` は戻り値を返さないが、これはテンプレート生成ツールが `rebuildRuntime()` で `wrapper/` からコピーする古い写しであり（`pkg/templates/generate/generate.go:176-188`）、実行時の生成元ではない。行番号が同じで内容が逆のため、参照先を取り違えないこと。）
- **パネルごとにイベント名を分ける**: 購読の解除が個別にできるため技術上の制約ではないが、パネルの更新周期が 1 桁違うため（§8）、束ねると不要な再描画が起きる。

### 5.6. フロントエンドの購読（TypeScript）

- **定義**:

```ts
import type { main } from '../../wailsjs/go/models';

export function subscribeLog(onBatch: (lines: main.LogLine[]) => void): () => void;
export function loadSnapshot(): Promise<main.DashboardSnapshot>;
```

- **`subscribeLog` の事前条件**: 無し。同じイベント名に対して複数回呼んでよい（解除が個別に効くため。§5.5）。
- **`subscribeLog` の事後条件**: 戻り値は `EventsOn` が返した解除関数であり、呼ぶと**その購読だけ**が解除され、以後 `onBatch` は呼ばれない。同じイベント名の他の購読には影響しない。実装は `EventsOff` を呼ばない（§5.5）。
- **`loadSnapshot` の事後条件**: 解決値は呼び出し時点のスナップショット。副作用を持たない。
- **エラー**: `loadSnapshot` は WebView の初期化直後に reject しうる。呼び出し側は例外を握り、0 行の状態で開始する（以後の差分イベントで表示が埋まるため）。**画面にエラーを出さない** — 擬似ダッシュボードに本物のエラー表示を出すと、実在の障害と見分けがつかなくなるため。異常は `console.error` に留める。

### 5.7. `Panel` / `DashboardGrid`（TypeScript）

- **定義**:

```tsx
type PanelProps = {
  title: string;          // 画面に出す見出し。英語で書く
  children: React.ReactNode;
};

export function Panel(props: PanelProps): React.JSX.Element;
export function DashboardGrid(props: { children: React.ReactNode }): React.JSX.Element;
```

- **`DashboardGrid` の事前条件**: `children` はちょうど 6 個の `Panel`。
- **`DashboardGrid` の事後条件**: 各枠はコンテナの幅・高さに追随し、ページ全体はスクロールしない。各枠の内側は独立してスクロールしてよい。
- **エラー**: `children` が 6 個でない場合、`console.error` を出力したうえで受け取った子要素をすべて描画する（画面を空にしない）。
- **見出しを英語にする理由**: `CLAUDE.md`「画面に描画する擬似ログとラベルは英語にする」。
- **6 枠の見出し文字列**: 本作業単位で確定し、以後の作業単位はこの文字列を使う。後続の作業単位が別名を付けるのを防ぐためである。

| グリッド上の位置 | 見出し（画面に出す文字列） | README「画面」表の行 | 実装する作業単位 |
| :- | :- | :- | :- |
| 1 行目 左 | `Log Stream` | ログストリーム | `dashboard-shell` |
| 1 行目 中 | `Commit Graph` | コミットグラフ | `graph-panels` |
| 1 行目 右 | `Timeseries` | 折れ線グラフ | `metrics-panels` |
| 2 行目 左 | `Dependency Graph` | グラフビュー | `graph-panels` |
| 2 行目 中 | `Utilization` | タコメータ | `metrics-panels` |
| 2 行目 右 | `Scatter 3D` | 3D 散布図 | `scatter3d-panel` |

- **文書タイトル**: `layout.tsx` の `metadata.title` を `nullops` とする（現在はテンプレート由来の `Create Next App`）。
- **戻り値の型を `React.JSX.Element` と書く理由**: React 19（`@types/react` 19）でグローバルの `JSX` 名前空間が廃止されたため、`JSX.Element` と書くと型が解決できない。
- **プレースホルダの表示文字列**: `Log Stream` 以外の 5 枠は、中身の位置に `pending` の 1 語だけを表示する（受け入れ基準 1.3）。

## 6. データ構造

### 6.1. `LogLine` / `Level` / `Phase`

```go
type Level string

const (
    LevelInfo  Level = "info"
    LevelWarn  Level = "warn"
    LevelError Level = "error"
    LevelDebug Level = "debug"
)

type Phase string

const (
    PhaseBuild  Phase = "build"
    PhaseTest   Phase = "test"
    PhaseDeploy Phase = "deploy"
    PhaseScan   Phase = "scan"
)

type LogLine struct {
    Seq   uint64 `json:"seq"`
    AtMs  int64  `json:"atMs"`
    Tool  string `json:"tool"`
    Phase Phase  `json:"phase"`
    Level Level  `json:"level"`
    Text  string `json:"text"`
}
```

- **不変条件**（生成時に強制する）:
  - `Seq` は 1 から始まり、同一プロセス内で 1 ずつ増加する（欠番なし）
  - `Text` は 1 文字以上で、改行文字（U+000A・U+000D）を含まない
  - `Tool` は 1 文字以上
  - `Level` は定義済みの 4 値のいずれか
  - `Phase` は定義済みの 4 値のいずれか
- **完全コンストラクタ**: 非公開の生成関数を通してのみ作り、不変条件を満たさない値を存在させない。公開フィールドは JSON 化のために必要だが、生成経路を 1 本に絞ることで不正値の混入を防ぐ。生成関数は不変条件違反を error で返す。
- **ロジックの所在**: 行の組み立て（工具名の選択・語彙・重大度の分布・フェーズによる切り替え）は §6.3 `logSource` に集約する。フロントエンドは受け取った行を加工せずに描画し、`Level` から色トークンへの対応付けだけを持つ。同じ生成ルールが Go と TypeScript に二重化するのを避けるため。
- **時刻を `int64`（Unix ミリ秒）で持つ理由**: `time.Time` は JSON 化すると文字列になり、フロントエンドで再パースする往復が要るため。
- **`Tool` と `Text` を英語にする理由**: `CLAUDE.md`「画面に描画する擬似ログとラベルは英語にする」。

### 6.2. `DashboardSnapshot`

```go
type DashboardSnapshot struct {
    Log []LogLine `json:"log"`
}
```

- **不変条件**: 各スライスは nil でない（空でもよい）。JSON 化したとき `null` にならないことを保証し、フロントエンドの null 分岐を不要にする。
- **拡張点**: 後続の作業単位はフィールドを足す。追加したフィールドは `frontend/wailsjs/go/models.ts` へ自動で反映される。

### 6.3. `logSource`（非公開）

```go
type logSource struct { /* 非公開。mutex で保護 */ }

func newLogSource(capacity int, rnd *rand.Rand, sc *scenario) *logSource

func (s *logSource) EventName() string        // つねに "nullops:log"
func (s *logSource) Interval() time.Duration  // 80〜400 ms
func (s *logSource) Next() any                // 長さ 1 の []LogLine。リングバッファへも積む
func (s *logSource) Snapshot() []LogLine      // 保持している全行のコピー（古い順）
```

- **`newLogSource` の事前条件**: `capacity` が 1 以上、`rnd` と `sc` が nil でない。
- **`Next` の事後条件**: 長さちょうど 1 の `[]LogLine` を返し、その 1 行をリングバッファへも積む。
- **`Next` が error 経路を持たない理由**: `logSource` は、不変条件を満たすことをテストで検査した候補集合からのみ `Tool` と `Text` を選び、`Seq` を自身で採番する。そのため §6.1 の生成関数の事前条件をつねに満たし、生成関数が error を返す状況が起こらない。候補集合が不変条件を満たすことは受け入れ基準 4.2・4.5 の検査対象である。この設計により、`Next` は §5.1 の「エラーを返さない・`panic` しない」という契約を守れる。
- **`*rand.Rand` を共有しない**: `logSource` と `scenario`（および後続の作業単位が足す `Source`）は、それぞれ専用の `*rand.Rand` を受け取る。`*rand.Rand` は並行安全でなく、両者は別々の mutex で自身を守るため、同じインスタンスを共有すると相互に保護されない。
- **不変条件**:
  - 保持件数は 0 以上 `capacity`（500）以下。上限を超えたら最古の 1 行を捨てる
  - 保持している行の `Seq` は昇順で連続する
  - 全メソッドを複数のゴルーチンから安全に呼べる（`Runner` のゴルーチンが `Next` を呼ぶ間に、バインディング経由の `Snapshot` が同じ状態を読むため）
- **`Snapshot` の事後条件**: 返すスライスは内部状態と別の配列であり、呼び出し側の変更が内部へ波及しない。

### 6.4. `scenario`（非公開）

```go
type scenario struct { /* 非公開。mutex で保護 */ }

func newScenario(minHold, maxHold time.Duration, rnd *rand.Rand, now func() time.Time) *scenario

func (s *scenario) Current() Phase
```

- **`newScenario` の事前条件**: `0 < minHold <= maxHold`、`rnd` が nil でない、`now` が nil でない。`rnd` は `scenario` 専用のインスタンスであり、他の `Source` と共有しない（§6.3）。生成時のフェーズは `build` とし、最初の保持時間を `[minHold, maxHold]` の一様乱数で決める。
- **`minHold` / `maxHold` の意味**: 1 つのフェーズを保つ時間の下限と上限。フェーズが切り替わるたびに、この範囲の一様乱数で次の保持時間を引き直す。本作業単位は `minHold` = 15 秒・`maxHold` = 45 秒を渡す（受け入れ基準 5.3）。
- **`Current` の事後条件**: `now()` が返す時刻が現在のフェーズの終了時刻を過ぎている場合、過ぎた分だけフェーズを進めてから現在のフェーズを返す。過ぎていない場合は現在のフェーズをそのまま返す。呼び出し間隔が保持時間より長いときは 1 回の呼び出しで複数段進む。
- **不変条件**: `Current()` はつねに定義済みの `Phase` を返す。複数のゴルーチンから安全に呼べる。
- **フェーズを `Current()` の中で進める理由（専用のゴルーチンを持たない理由）**: フェーズを進める専用のゴルーチンを立てると、それは `Runner` が起動したゴルーチンではないため、`Run` の復帰時にゴルーチンが 0 個であるという §5.3 の不変条件の対象から外れ、Requirement 7 の停止保証に穴が開く。読み取り時に遅延で進める形にすれば、`scenario` はゴルーチンを 1 つも持たない。
- **時刻の取得を `now` で受け取る理由**: 保持時間が 15〜45 秒であり、実時間を待つテストが成立しないため。テストは `now` に任意の時刻を返す関数を渡してフェーズの巡回を検査する。
- **ロジックの所在**: フェーズの巡回と保持時間の決定は `scenario` に集約する。後続の作業単位の `Source` は `Current()` を読むだけとし、フェーズの遷移規則を各自で持たない。

### 6.5. アプリのライフサイクル

```go
type App struct {
    ctx    context.Context    // Wails の ctx。EventsEmit に渡す
    cancel context.CancelFunc // 自前の ctx を止める
    done   chan struct{}      // Runner の終了を待つ
}

func (a *App) startup(ctx context.Context)
func (a *App) shutdown(ctx context.Context)
```

- **`startup` の事後条件**: `context.Background()` から派生させたキャンセル可能な context で `Runner.Run` を開始している。
- **`shutdown` の事後条件**: 自前の context をキャンセルし、`Runner.Run` の復帰を**最大 1 秒**待って戻る（受け入れ基準 7.6）。1 秒で復帰しない場合は待機を打ち切って戻る。打ち切っても送信が残らないのは、§5.3 の「キャンセル後は `Emit` を新たに開始しない」保証があるためである。上限を設けるのは、生成器の不具合でウィンドウが閉じなくなる事態を避けるためである。
- **自前の context を持つ理由**: Wails v2.13.0 が `OnStartup` へ渡す context はキャンセルされない。`internal/app/app_production.go:31` が `context.Background()` を作り、以後は `context.WithValue` を重ねるだけで cancel を持たないためである。この context を `ctx.Done()` で待つゴルーチンはウィンドウを閉じても止まらず、`CLAUDE.md`「ゴルーチンは終了条件を明示し、アプリ終了時に停止させる」を満たせない。
- **`main.go` の変更**: `OnShutdown: app.shutdown` を結線する（現在は `OnStartup` のみ結線されている）。あわせてウィンドウの起動サイズ 1440 × 900、`MinWidth: 1100`、`MinHeight: 720` を設定する。

### 6.6. デザイントークン（CSS）

`frontend/src/app/globals.css` の `@theme` に定義し、以後の作業単位の配色の正本とする。

| トークン | 用途 |
| :- | :- |
| `--color-surface-0` | 画面の地 |
| `--color-surface-1` | パネルの面 |
| `--color-border` | パネルの境界 |
| `--color-text` | 前景・主 |
| `--color-text-dim` | 前景・従（タイムスタンプ・見出しの補助） |
| `--color-accent-log` / `-commit` / `-line` / `-graph` / `-gauge` / `-scatter` | パネル別のアクセント 6 色 |
| `--color-level-info` / `-warn` / `-error` / `-debug` | ログ重大度の 4 色 |
| `--font-mono` | OS 内蔵の等幅フォントスタック。画面全体の既定の書体とする |

- **書体を等幅 1 種類に絞る**: 模倣対象（コンパイラ・パッケージマネージャ・CI）の出力が等幅であり、見出しだけ別書体にする理由が無いため。既存の `globals.css` にある `body { font-family: Arial, Helvetica, sans-serif; }` と、`layout.tsx` が適用する `geistSans.variable` は取り除く。

- **不変条件**: パネルのコンポーネントは色の直値を書かず、トークン経由でのみ参照する。後続の作業単位が個別に色を決めて 6 枚がばらばらに見えるのを防ぐため。
- **色の具体値**: 本書はトークンの名前と用途だけを定め、色の値は実装時に決める。値を本書で固定すると、実画面を見る前の判断で配色を縛ることになるためである。ただし可読性の下限として、`--color-text` と `--color-surface-1` のコントラスト比を 4.5:1 以上とする（受け入れ基準 9.6）。値を変える場合もこの下限を保つ。
- **ダーク 1 系統に限る理由**: 模倣対象（コンパイラ・パッケージマネージャ・CI のログ）にライトテーマが存在せず、2 テーマ分の調整が画面の目的に寄与しないため。既存の `globals.css` にある `prefers-color-scheme` の分岐は削除する。

## 7. 振る舞い（受け入れ基準）

### Requirement 1: ダッシュボードの 6 枠レイアウト

**対象**: §5.7 `DashboardGrid` / `Panel` / §5.4 `App.Snapshot`（削除する既存 API）

**受け入れ基準**:
1.1. システムは、画面に 6 個のパネル枠を 3 列 × 2 行のグリッドで配置しなければならない。
1.2. システムは、各パネル枠に §5.7 の表が定める 6 つの見出し文字列を、表が定める位置に表示しなければならない。
1.3. システムは、`Log Stream` 以外の 5 枠について、枠と見出しのみを表示し、中身の位置に `pending` を表示しなければならない。
1.4. `DashboardGrid` が受け取った子要素の個数が 6 でない場合、システムは `console.error` を 1 回出力し、受け取った子要素をすべて描画しなければならない。
1.5. システムは、`layout.tsx` の `metadata.title` を `nullops` としなければならない。
1.6. システムは、`layout.tsx` の `metadata.description` を、テンプレート由来の文字列（`Generated by create next app`）から nullops を説明する文字列へ置き換えなければならない。
1.7. システムは、テンプレート由来の `App.Greet` メソッドとそれを呼ぶデモ画面（ロゴ・名前入力・Greet ボタン）を、バインディングと画面の両方から取り除かなければならない。

### Requirement 2: 擬似ログの流入

**対象**: §5.5 `nullops:log` / §5.6 `subscribeLog` / §6.3 `logSource`

**受け入れ基準**:
2.1. `logSource` が次の行を生成したとき、システムは `nullops:log` イベントで `LogLine` の配列をフロントエンドへ送信しなければならない。
2.2. システムは、`logSource` の生成間隔を 80 ミリ秒以上 400 ミリ秒以下の一様乱数で決めなければならない。
2.3. システムは、`logSource` が保持する行を最新 500 行までとしなければならない。
2.4. 保持している行が 500 行のときに次の行が生成されたとき、システムは最古の 1 行を捨てなければならない。
2.5. ログストリームパネルが `nullops:log` を受信したとき、システムは受信した行を表示の末尾に追加しなければならない。
2.6. システムは、ログストリームパネルが表示する行数を最新 300 行までに制限しなければならない。
2.7. ログストリームパネルのスクロール位置が表示領域の下端から 16 ピクセル以内にある間、システムは行の追加に合わせてスクロール位置を下端に保たなければならない。
2.8. ログストリームパネルがアンマウントされたとき、システムは `subscribeLog` が返した解除関数を呼び、そのハンドラだけを解除しなければならない。
2.9. `wails dev` で起動してから 30 秒間、システムはログストリームパネルへ 60 行以上を流入させ、流入を停止させてはならない。

### Requirement 3: 起動直後の初期表示

**対象**: §5.4 `App.Snapshot` / §5.6 `loadSnapshot` / §6.2 `DashboardSnapshot`

**受け入れ基準**:
3.1. ログストリームパネルがマウントされたとき、システムは `nullops:log` の購読を開始した後に `Snapshot()` を 1 回呼び出さなければならない。
3.2. `Snapshot()` が呼ばれたとき、システムは呼び出し時点で `logSource` が保持する全行を古い順に含む `DashboardSnapshot` を返さなければならない。
3.3. システムは、`Snapshot()` の呼び出しによって `logSource` と `scenario` の状態を変化させてはならない。
3.4. システムは、`DashboardSnapshot.Log` が 0 件のときも JSON 化して `null` にならないよう、空配列を返さなければならない。
3.5. システムは、スナップショットの反映前に受信した行を失わず重複させないよう、スナップショットの行と受信済みの行を `Seq` の昇順で併合し、同一の `Seq` を 1 行だけ残さなければならない。
3.6. `Snapshot()` の呼び出しが失敗した場合、システムは `console.error` を出力し、ログストリームパネルを 0 行の状態で開始しなければならない。

### Requirement 4: ログ行の不変条件

**対象**: §6.1 `LogLine` / `Level` / `Phase`

**受け入れ基準**:
4.1. システムは、生成する `LogLine` の `Seq` を 1 から始め、同一プロセス内で 1 ずつ増加させなければならない。
4.2. システムは、`LogLine.Text` を 1 文字以上とし、改行文字（U+000A・U+000D）を含めてはならない。
4.3. システムは、`LogLine.Level` を `info` / `warn` / `error` / `debug` のいずれかとしなければならない。
4.4. 不変条件を満たさない `LogLine` の生成が要求された場合、システムはその値を返さず error を返さなければならない。
4.5. システムは、`LogLine.Tool` と `LogLine.Text` を英語で生成しなければならない。

### Requirement 5: 擬似的な作業フェーズの巡回

**対象**: §6.4 `scenario` / §6.1 `Phase`

**受け入れ基準**:
5.1. システムは、`scenario` の現在のフェーズを `build` / `test` / `deploy` / `scan` のいずれかとしなければならない。
5.2. `Current()` が呼ばれた時点で現在のフェーズの保持時間が経過している場合、システムは `build` → `test` → `deploy` → `scan` → `build` の順にフェーズを進めてから現在のフェーズを返さなければならない。
5.3. システムは、`newScenario` に `minHold` = 15 秒・`maxHold` = 45 秒を渡し、フェーズが切り替わるたびに次の保持時間をこの範囲の一様乱数で引き直さなければならない。
5.4. システムは、生成する `LogLine.Phase` に、その行を生成した時点の `scenario` の現在フェーズを設定しなければならない。
5.5. システムは、`scenario` の現在フェーズごとに異なる `Tool` と `Text` の候補集合からログ行を組み立てなければならない。
5.6. `Current()` が呼ばれた時点で 2 つ以上のフェーズの保持時間が経過している場合、システムは経過した数だけフェーズを進めなければならない。
5.7. システムは、フェーズを進めるための専用のゴルーチンを起動してはならない。

### Requirement 6: 生成器の駆動

**対象**: §5.1 `Source` / §5.2 `Emitter` / §5.3 `Runner`

**受け入れ基準**:
6.1. `Run` が動作している間、システムは各 `Source` について `Interval()` が返す時間だけ待ってから `Next()` を呼び、その戻り値を `EventName()` のイベント名で `Emitter.Emit` へ渡さなければならない。
6.2. システムは、`Source` ごとに独立したゴルーチンを割り当て、ある `Source` の `Interval()` が他の `Source` の送信周期を変えないようにしなければならない。
6.3. `NewRunner` に nil の `Emitter`・0 個の `Source`・空文字の `EventName()` を返す `Source`・`EventName()` が重複する `Source` のいずれかが渡された場合、システムは nil の `Runner` と error を返さなければならない。
6.4. `Source.Interval()` が §5.1 の事後条件に反して 1 ミリ秒未満を返した場合、システムは待ち時間を 1 ミリ秒として扱い、ビジーループに陥ってはならない。

### Requirement 7: アプリ終了時のゴルーチン停止

**対象**: §6.5 `App.startup` / `App.shutdown` / §5.3 `Runner.Run`

**受け入れ基準**:
7.1. `startup` が呼ばれたとき、システムは `context.Background()` から派生させたキャンセル可能な context を生成しなければならない。
7.2. `startup` が呼ばれたとき、システムは 7.1 の context を渡して `Runner.Run` を開始しなければならない。
7.3. `shutdown` が呼ばれたとき、システムは 7.1 の context をキャンセルしなければならない。
7.4. context がキャンセルされたとき、システムは `Runner` が起動した全ゴルーチンの終了を待ってから `Run` を返さなければならない。
7.5. システムは、context のキャンセル後に `Emitter.Emit` の呼び出しを新たに開始してはならない。
7.6. `Run` が `shutdown` の呼び出しから 1 秒以内に返らない場合、システムは待機を打ち切って `shutdown` から戻り、プロセスの終了を妨げてはならない。

### Requirement 8: ウィンドウサイズとリサイズへの追随

**対象**: §5.7 `DashboardGrid` / §6.5 アプリのライフサイクル

**受け入れ基準**:
8.1. システムは、起動時のウィンドウを幅 1440 ピクセル・高さ 900 ピクセルとしなければならない。
8.2. システムは、ウィンドウを幅 1100 ピクセル・高さ 720 ピクセルより小さくできないようにしなければならない。
8.3. ウィンドウの大きさが変わったとき、システムは 6 枠のグリッドをウィンドウの表示領域全体に追随させなければならない。
8.4. システムは、ページ全体に縦方向・横方向のスクロールバーを発生させてはならない。
8.5. ログストリームパネルの内容が枠の高さを超えた場合、システムはその枠の内側だけを縦にスクロールさせなければならない。

### Requirement 9: デザイントークンへの準拠

**対象**: §6.6 デザイントークン

**受け入れ基準**:
9.1. システムは、画面の配色をダーク 1 系統とし、`prefers-color-scheme` による分岐を行ってはならない。
9.2. システムは、コンポーネントから色を §6.6 のトークン経由でのみ参照し、色の直値を書いてはならない。
9.3. システムは、ログストリームパネルの本文に `--font-mono` が指す等幅フォントを適用しなければならない。
9.4. システムは、`LogLine.Level` の 4 値それぞれに `--color-level-info` / `-warn` / `-error` / `-debug` の異なる色を割り当てて表示しなければならない。
9.5. システムは、フォントの取得にビルド時のネットワークアクセスを必要としない指定を用いなければならない。
9.6. システムは、`--color-text` と `--color-surface-1` のコントラスト比を 4.5:1 以上としなければならない。
9.7. システムは、画面全体の既定の書体を `--font-mono` としなければならない。

### Requirement 10: 検証手段の成立（非機能）

**対象**: §5.2 `feed.Emitter` / §6.3 `logSource`

**受け入れ基準**:
10.1. システムは、`Emitter` のテスト実装を差し込むことで、Wails ランタイムを起動せずに `feed` パッケージのテストを実行できなければならない。
10.2. `go test ./...` を実行したとき、システムは 1 件以上のテストを実行し、終了コード 0 で終了しなければならない。
10.3. `go vet ./...` を実行したとき、システムは終了コード 0 で終了しなければならない。
10.4. `frontend` ディレクトリで `npm ci` の後に `npm run lint` を実行したとき、システムは終了コード 0 で終了しなければならない。
10.5. macOS 上で `wails build` を実行したとき、システムは終了コード 0 で終了し、`build/bin` に実行できるアプリを生成しなければならない。

## 8. 実現方針

- **供給方式はハイブリッド**: 差分は Wails のイベント push、初期表示はバインディングメソッドの戻り値。push だけだと購読前の行が失われ、ログパネルは 500 行たまるまで約 120 秒（平均間隔 240 ミリ秒 × 500 行）スカスカのままになる。ポーリングだけだと取りこぼしと重複除去が要る。バインディングの戻り値を使う副次効果として、Go の型が `wailsjs/go/models.ts` へ TypeScript 型として生成される。
- **フィードは独立、フェーズだけ共有**: 更新周期が 1 桁違うパネル（タコメータと コミットグラフ）を 1 イベントに束ねると、最速の周期に全パネルが引きずられて再描画が無駄になる。一方で全パネルが無関係に動くと 1 つのシステムを見ている感じが出ない。共有するのは §6.4 の `scenario` だけとし、周期とイベント名は分ける。
- **フェーズは読み取り時に遅延で進める**: 専用のゴルーチンでフェーズを進めると、そのゴルーチンは `Runner` が起動したものではないため `Run` の復帰時の待ち合わせから外れ、アプリ終了時の停止保証（Requirement 7）に穴が開く。`Current()` が呼ばれた時点で経過を検査して進める形にすれば、`scenario` はゴルーチンを持たない。時刻の取得を関数で受け取るのは、15〜45 秒の保持時間を実時間で待つテストが成立しないためである。
- **`Emitter` を境界に置く理由**: `feed` パッケージを Wails から切り離し、`go test ./...` を GUI 無しで成立させるため（roadmap の完了条件「1 件以上のテストを実行して成功する」の実現手段）。
- **`NewRunner` の事前条件違反を error で返す**: `CLAUDE.md`「`panic` はプログラマの誤りに限る」は `panic` を使ってよい範囲を定めるものであり、プログラマの誤りに `panic` を強制するものではない。テストから検査できる形を選ぶ。
- **`next/font/google` を使わない**: ビルド時に外部からフォントを取得するため、`wails build` がネットワークに依存する。ダッシュボードの表示は等幅が主であり、Geist Sans を使う箇所が残らない。
- **画面にエラーを出さない**: 擬似ダッシュボードに本物のエラー表示を出すと、実在の障害と見分けがつかなくなる。異常は `console.error` に留める。
- **既存構造との関係**: 既存の Go 資産は Wails のテンプレートのままで、守るべき独自の意図を持たない（コミット `543157f`）。ただし `tsconfig.json` はコミット `d27e6c5` が意図を持って現在の形に戻しており、変更しない。
- **用語集**: プロジェクトは `docs/glossary.md` を持たない。§4 で定義した語（フィード・フレーム・フェーズ・スナップショット・プレースホルダ枠）は本書を出所とし、用語集ファイルへの追記は行わない。

## 9. 参考資料

- 要求: `README.md`「画面」表
- 規約: `CLAUDE.md`（言語規約・Go / TypeScript コーディング規約・注意事項）
- 分解と順序: `docs/specs/001-dashboard-mvp/roadmap.md`
- Wails v2.13.0 の実ソース（`~/go/pkg/mod/github.com/wailsapp/wails/v2@v2.13.0`）
  - `pkg/runtime/events.go:45-46` — `EventsEmit` の宣言。戻り値を持たずエラーを返さない
  - `internal/app/app_production.go:31` — `ctx := context.Background()`。`OnStartup` へ渡る context はこれに `context.WithValue` を重ねたもので、キャンセルされない
  - `internal/app/app_production.go:21-22` — `OnShutdown`（`shutdownCallback`）は `Run` の復帰時に呼ばれる
  - `internal/frontend/runtime/runtime_debug_desktop.js:79-87` — ランタイム本体の `EventsOnMultiple` は解除関数を返し、`EventsOn` はそれをそのまま返す
  - `internal/frontend/runtime/runtime_debug_desktop.js:121-124` — `removeListener` が `delete eventListeners[eventName]` を実行する
  - `internal/frontend/runtime/runtime_debug_desktop.js:125-132` — `EventsOff` は `removeListener` を呼ぶ
  - `internal/frontend/runtime/wrapper/runtime.js:39-45` — **プロジェクトへ生成される**ラッパーの `EventsOnMultiple` / `EventsOn` は解除関数を返す
  - `internal/frontend/runtime/wrapper/runtime.d.ts:41` — 同ラッパーの型定義は `EventsOn(...): () => void`
  - `internal/frontend/runtime/wrapper/wrapper.go:5-6` — 上記 2 ファイルを埋め込む `RuntimeWrapper`
  - `pkg/commands/build/base.go:436-439` / `internal/app/app_bindings.go:103-106` — `frontend/wailsjs/runtime` を消して `RuntimeWrapper` を展開する（生成物の出所）
  - `pkg/templates/generate/generate.go:176-188` — `pkg/templates/generate/assets/common/.../runtime/` は `wrapper/` からの写しであり、実行時の生成元ではない
  - `pkg/options/options.go:41-42` — `options.App` の `MinWidth` / `MinHeight`
  - `pkg/options/options.go:61-64` — `options.App` の `OnStartup` / `OnDomReady` / `OnShutdown` / `OnBeforeClose`
- 既存コードの意図: コミット `543157f`（初期構成）・`d27e6c5`（`tsconfig.json` を戻した理由）
