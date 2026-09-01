# scatter3d-panel — 仕様

## 1. 目的と背景

roadmap `001-dashboard-mvp` の unit #2。ダッシュボードの 6 枠のうち `Scatter 3D` の枠は現在 `pending` のプレースホルダである。ここに擬似点群を 3 次元で描画し、回転を継続させる。

この unit を #3・#4 より前に置いた理由は「3D 散布図の不確実性が最も高い」ことにあった(roadmap §1)。その不確実性の中身は WebView 上での WebGL の動作・静的エクスポートでの描画ライブラリの取り込み・同時稼働時の負荷であり、本 unit は **Canvas 2D による 3 次元投影**を採ることで、そのすべてを回避する(§3 前提 1)。roadmap §2「6 パネル同時稼働時の性能の目標値」は描画方式が決まらないと述べられないとしていたため、本 unit で方式を確定させ、負荷の目安を Requirement 10 として数値で置く。

擬似点群の生成は unit #1 が作った `feed.Source` の拡張点に乗せ、Go 側に置く(roadmap 前提・`CLAUDE.md` 注意事項)。

## 2. スコープ

### 対象(やること)

- Go 側の擬似点群生成器 `scatterSource`(`feed.Source` の実装)と、その `Runner` への登録。
- 点群の交換形式 `ScatterCloud` / `ScatterPoint` と、その不変条件を強制する生成関数。
- `DashboardSnapshot` への点群フィールドの追加(起動直後の初期表示)。
- フロントエンドの購読関数と `Scatter3DPanel`(Canvas 2D による回転・投影・描画)。
- `page.tsx` の `Scatter 3D` 枠を `pending` から `Scatter3DPanel` へ差し替える。

### 対象外(やらないこと)

- **WebGL・three.js 等の描画ライブラリの導入** — 理由: 依頼者が Canvas 2D による自前投影を承認済み(§3 前提 1)。依存を増やさないことで静的エクスポートと WebView での動作の不確実性を消す。
- **マウス操作による視点の変更・ズーム・点の選択** — 理由: roadmap のスコープ外(「設定 UI」に類する対話機能)。本 unit の完了条件は自動回転の継続のみを求める。
- **他 5 パネルの実装と 6 パネル同時稼働の最終調整** — 理由: unit #3・#4 の範囲。
- **描画結果の自動視覚検証(ブラウザ自動化・スクリーンショット比較)** — 理由: roadmap スコープ外。加えて本ホストは画面収録権限を持たず `screencapture` が失敗するため、目視に相当する検証を機械で代替できない(§3 前提 5)。
- **`main.go` の `BackgroundColour` に残るテンプレート由来の直値の是正** — 理由: unit #1 からの申し送りであり、扱いを別途決めると依頼者が判断済み。

## 3. 前提(未検証の賭け)

1. **3D 散布図は Canvas 2D の 2 次元 API へ自前で投影して描く。WebGL と描画ライブラリを使わない。** — 依頼者が承認済みの決定。見た目が WebGL 実装に劣りうることは承知のうえ。検証方法: `wails dev` の画面で点群が立体に見えることを人間が目視する / 状態: 未検証。
2. **点群の回転はフロントエンドが `requestAnimationFrame` で毎フレーム進め、Go 側は点の座標だけを低頻度で供給する。** — 回転角を Go から送ると送出間隔がそのままフレーム間隔になり、滑らかにするには 1 秒あたり数十回の IPC が要る。回転は状態を持たない時間の関数であり、フロントエンドで閉じられる。検証方法: 回転が滑らかに継続することを人間が目視する / 状態: 未検証。
3. **点群の点数は固定(256 点)とし、増減させない。** — 点数を動かすと画面の情報量が揺れ、描画負荷の見積もりも動く。擬似的な「動き」は座標のドリフトと回転で足りる。検証方法: Requirement 1.3 のテスト / 状態: テストで検証する。
4. **キャンバスへ渡す色は `globals.css` の `@theme` トークンを実行時に解決して得る。** — Canvas 2D は CSS クラスを解釈せず色文字列を要求するため、`.tsx` に色の直値を書かずにトークンへ従う手段が `getComputedStyle` による解決に限られる(unit #1 の受け入れ基準 9 と同じ規律を満たす)。検証方法: Requirement 9 / 状態: 未検証(実行時解決の成否は目視と手動確認による)。
5. **画面の見え方に依存する受け入れ基準は、実装するが本セッションでは検証しない。** — 本ホストはターミナルへ macOS の画面収録権限が無く、`screencapture` が sandbox の内外いずれでも失敗する。該当項目は未検証として実装ノートへ再現手順つきで積み、人間が目視で確認する(依頼者が承認済み)。検証方法: 人間による目視 / 状態: 未検証。
6. **乱数は `math/rand`(v1)を使う。** — `math/rand/v2` は `wails build` のバインディング生成が `internal error: package "math/rand/v2" without types was imported from "nullops"` で落ちる(unit #1 の実測)。検証方法: `wails build` の成功 / 状態: unit #1 で検証済み。

## 4. 用語定義

| 用語 | 定義 |
| ---- | ---- |
| 点群(cloud) | 1 フレーム分の擬似的な 3 次元の点の集合。`ScatterCloud` が表す |
| クラスタ | 点群の中で 1 つの中心の周りに集まる部分集合。中心はゆっくり漂う |
| モデル座標 | Go が供給する回転前の座標。各軸 -1.0〜1.0 の立方体に収まる |
| ヨー(yaw) | モデル座標の Y 軸まわりの回転角。時間とともに単調に増える |
| ピッチ(pitch) | モデル座標の X 軸まわりの回転角。固定値で、点群を斜め上から見た画にする |
| 投影 | 回転後の座標を透視投影でキャンバスの 2 次元座標へ落とす計算 |

## 5. 公開インターフェース(API)

### 5.1. `scatterSource`(Go・`main` パッケージ・非公開型)

unit #1 の `logSource` と同じく `feed.Source` を構造的に満たす。`feed` を import しない(依存が逆向きになるため)。

- **定義**:
  ```go
  func newScatterSource(pointCount int, rnd *rand.Rand) *scatterSource
  func (s *scatterSource) EventName() string
  func (s *scatterSource) Interval() time.Duration
  func (s *scatterSource) Next() any        // ScatterCloud を返す
  func (s *scatterSource) Snapshot() ScatterCloud
  ```
- **入力 / 出力**: `newScatterSource` は点数と専用の `*rand.Rand` を受ける。`Next` は `ScatterCloud`(スライスではなく値)を返す。`Snapshot` は最後に生成した点群の複製を返す。
- **事前条件**: `pointCount` が 1 以上、`rnd` が nil でない。`rnd` は `scatterSource` 専用のインスタンスであること(`*rand.Rand` は並行安全でなく、他の生成器と共有すると互いの mutex で保護されない)。
- **事後条件**: `EventName` はプロセスの生存期間中つねに `"nullops:scatter"` を返す。`Interval` はつねに `scatterInterval`(1000 ms)を返す。`Next` の戻り値は §6.1 の不変条件を満たし、`Points` は長さ `pointCount` で nil でない。`Next` と `Snapshot` は並行に呼ばれても壊れない(内部の mutex で守る)。`Snapshot` は内部状態を変化させない。
- **エラー**: 返さない。`feed.Source` は error 経路を持たないため、事前条件違反は `panic`(プログラマの誤り)、不変条件違反は生成関数が返した error を握らず `panic` する(unit #1 の `logSource.Next` と同じ規律)。

### 5.2. `App.Snapshot`(Wails のバインディングメソッド・既存の拡張)

- **定義**: `func (a *App) Snapshot() DashboardSnapshot`(シグネチャは変えない)
- **事後条件の追加**: 戻り値の `Scatter` が §6.2 の不変条件を満たす。`startup` を経ずに呼ばれた場合は `Points` が長さ 0 の非 nil スライスである点群を返す(バインディングは事前条件を持たない)。呼び出しで内部状態は変化しない。
- **エラー**: 返さない(既存の契約を維持する)。

### 5.3. 送信イベント(Go → フロントエンド)

- **定義**: イベント名 `nullops:scatter`。payload は `ScatterCloud` 1 個。
- **事後条件**: 1000 ms ごとに 1 回送出される。購読者が居なければ捨てられる(到達保証は無い。`feed.Emitter` の契約)。アプリ終了時、`Runner` のキャンセル後に新たな送出を開始しない。

### 5.4. フロントエンドの購読(TypeScript・`frontend/src/lib/feed.ts` の拡張)

- **定義**:
  ```ts
  export function subscribeScatter(onCloud: (cloud: main.ScatterCloud) => void): () => void;
  ```
- **事後条件**: 戻り値を呼ぶとこの購読だけが解除される(イベント名に紐づく全リスナーを外す API を使わない。他パネルの購読を切らないため)。
- **エラー**: 例外を投げない。payload が期待の形でない場合はコールバックを呼ばず `console.error` に留める(擬似ダッシュボードに本物のエラーを表示しない。unit #1 spec §8 と同じ規律)。

### 5.5. `Scatter3DPanel`(TypeScript・React コンポーネント)

- **定義**: `export function Scatter3DPanel(): React.JSX.Element`。ファイル先頭に `'use client'` を置く(`DashboardGrid` と `page.tsx` へ広げない)。
- **入力 / 出力**: props を取らない。`Panel` の本文領域を満たす `<canvas>` を 1 枚描画する。
- **事前条件**: `Panel` の本文領域(大きさの決まる要素)の内側でマウントされること。
- **事後条件**: マウント中だけ購読と `requestAnimationFrame` のループを持ち、アンマウントで両方を解除する。ヨーは経過時間に比例して単調に増え、点群の更新が無くても回転が続く。
- **エラー**: 2D コンテキストを取得できない場合、例外を投げず `console.error` に留めて描画を行わない(枠は空のまま残る)。

### 5.6. 投影関数(TypeScript・描画コンポーネントから分離)

擬似データの生成と描画を分けるという `CLAUDE.md` の規約に倣い、座標変換だけを純関数として切り出す。

- **定義**:
  ```ts
  export type Projected = { sx: number; sy: number; scale: number; depth: number };
  export function projectPoint(
    p: main.ScatterPoint, yaw: number, pitch: number, view: { width: number; height: number },
  ): Projected;
  ```
- **入力 / 出力**: モデル座標の 1 点と回転角・描画領域の寸法を受け、キャンバス座標 `sx`/`sy`、大きさの倍率 `scale`、奥行き `depth`(大きいほど手前)を返す。
- **事前条件**: `view.width`・`view.height` が 0 より大きい。
- **事後条件**: 同じ引数に対してつねに同じ値を返す(純関数)。`scale` はつねに 0 より大きい有限値であり、モデル座標が単位立方体に収まる限り `sx`/`sy` は有限値になる。
- **エラー**: 返さない。

## 6. データ構造

### 6.1. `ScatterPoint`(Go)

```go
// ScatterPoint は 3D 散布図の 1 点。座標は回転前のモデル座標。
type ScatterPoint struct {
    X float64 `json:"x"`
    Y float64 `json:"y"`
    Z float64 `json:"z"`
    W float64 `json:"w"` // 点の大小と明度に使う重み
}
```

- **不変条件**: `X`・`Y`・`Z` はいずれも -1.0 以上 1.0 以下。`W` は 0.0 以上 1.0 以下。すべて有限値(NaN・Inf を含まない)。
- **強制**: 生成関数 `newScatterPoint(x, y, z, w float64) (ScatterPoint, error)` を通してのみ作る。違反は `errScatterPointOutOfRange` / `errScatterPointNotFinite` を `errors.Is` で識別できる形で返す(unit #1 の `newLogLine` と同じ流儀)。
- **ロジックの所在**: 座標の切り詰め(生成器が漂わせた点を立方体へ収める)は生成器側の責務であり、`newScatterPoint` は検査のみを行う。

### 6.2. `ScatterCloud`(Go)

```go
// ScatterCloud は 1 フレーム分の点群。
type ScatterCloud struct {
    Seq    uint64         `json:"seq"`
    Points []ScatterPoint `json:"points"`
}
```

- **不変条件**: `Points` は nil でない(JSON 化して `null` にしないため)。空の点群は長さ 0 のスライスで表す。`Seq` は生成のたびに 1 から 1 ずつ増える。空の点群(`Snapshot` を `startup` 前に呼んだ場合)の `Seq` は 0 とする。
- **ロジックの所在**: 点の漂わせ方(クラスタ中心への引き戻しと乱歩)は `scatterSource` に集約する。`ScatterCloud` は値の運搬に徹する。
- **シリアライズ形式**: Wails のバインディング生成器が `frontend/wailsjs/go/models.ts` へ TypeScript 型として出力し、フロントエンドはそれをイベントハンドラでも使う。

### 6.3. `DashboardSnapshot`(Go・既存の拡張)

```go
type DashboardSnapshot struct {
    Log     []LogLine    `json:"log"`
    Scatter ScatterCloud `json:"scatter"`
}
```

- **不変条件**: 既存の `Log` の不変条件を維持したまま `Scatter` を足す。`Scatter.Points` は nil でない。
- **注意**: unit #1 の `logline_test.go` が `LogLine` の JSON 直列化結果を文字列で固定している。`DashboardSnapshot` に固定した期待値があれば更新が要る(実装時に確認する)。

### 6.4. `scatterSource` の内部状態(非公開)

- クラスタ中心の配列(`scatterClusterCount` = 3)。各中心はモデル座標の内側をゆっくり漂う。
- 点ごとの現在座標と、その点が属するクラスタの添字。
- 生成のたびに、各点を「所属クラスタの中心へわずかに引き戻す」+「小さな乱歩を加える」で更新し、単位立方体へ切り詰める。この規則を採るのは、独立な乱歩だと点が拡散して立方体の壁に貼り付き、クラスタの塊が消えるためである。
- `Seq` と最後に生成した点群。`Snapshot` はこの複製を返す。

### 6.5. デザイントークン(CSS)

新しいトークンは追加しない。点の描画色は既存の `--color-accent-scatter`、背景は `--color-surface-1` を用いる(`globals.css` の `@theme` が正本)。

## 7. 振る舞い(受け入れ基準)

### Requirement 1: 擬似点群の生成

**対象**: §5.1 `scatterSource` / §6.2 `ScatterCloud`

**受け入れ基準**:
1.1. システムは、`scatterSource.EventName()` の呼び出しに対してつねに `"nullops:scatter"` を返さなければならない。(常時)
1.2. システムは、`scatterSource.Interval()` の呼び出しに対してつねに 1000 ミリ秒を返さなければならない。(常時)
1.3. `Next` が呼ばれたとき、システムは `Points` の長さが `newScatterSource` に渡した点数に等しい `ScatterCloud` を返さなければならない。(イベント)
1.4. `Next` が呼ばれたとき、システムは直前の戻り値より 1 だけ大きい `Seq` を持つ `ScatterCloud` を返さなければならない。(イベント)
1.5. `pointCount` が 1 未満、または `rnd` が nil の場合、システムは `newScatterSource` の呼び出しで panic しなければならない。(異常系)
1.6. `Next` と `Snapshot` が複数のゴルーチンから同時に呼ばれている間、システムはデータ競合を起こしてはならない(`go test -race` で検出されない)。(常時)

### Requirement 2: 点群の不変条件

**対象**: §6.1 `ScatterPoint` / §5.1 `scatterSource`

**受け入れ基準**:
2.1. システムは、`newScatterPoint` が返す `ScatterPoint` の X・Y・Z がいずれも -1.0 以上 1.0 以下であることを保証しなければならない。(常時)
2.2. システムは、`newScatterPoint` が返す `ScatterPoint` の W が 0.0 以上 1.0 以下であることを保証しなければならない。(常時)
2.3. 引数のいずれかが範囲外の場合、システムは `errScatterPointOutOfRange` を `errors.Is` で識別できる error を返し、panic してはならない。(異常系)
2.4. 引数のいずれかが NaN または無限大の場合、システムは `errScatterPointNotFinite` を `errors.Is` で識別できる error を返さなければならない。(異常系)
2.5. `Next` を 1000 回連続で呼び出す間、システムはすべての点の座標を -1.0 以上 1.0 以下に保たなければならない。(状態)

### Requirement 3: 点群の時間変化

**対象**: §5.1 `scatterSource` / §6.4 内部状態

**受け入れ基準**:
3.1. `Next` が呼ばれたとき、システムは直前のフレームと少なくとも 1 点の座標が異なる点群を返さなければならない。(イベント)
3.2. `Next` を 1000 回呼び出した後、システムは点群の座標の標準偏差が初回フレームの 0.5 倍以上 2.0 倍以下に留まる点群を返さなければならない(クラスタが拡散も収縮もし切らない)。(状態)

### Requirement 4: 起動直後の初期表示

**対象**: §5.2 `App.Snapshot` / §6.3 `DashboardSnapshot`

**受け入れ基準**:
4.1. `Snapshot` が呼ばれたとき、システムは `Scatter.Points` が nil でない `DashboardSnapshot` を返さなければならない。(イベント)
4.2. `startup` を経ずに `Snapshot` が呼ばれた場合、システムは error を返さず、`Scatter.Seq` が 0 かつ `Scatter.Points` の長さが 0 の点群を返さなければならない。(異常系)
4.3. `Snapshot` が呼ばれたとき、システムは `scatterSource` の内部状態(`Seq`・点の座標)を変化させてはならない。(イベント)
4.4. `startup` の後に `Snapshot` が呼ばれたとき、システムは `Scatter.Points` の長さが設定した点数に等しい点群を返さなければならない。(イベント)

### Requirement 5: パネルの購読と初期表示の併合

**対象**: §5.4 `subscribeScatter` / §5.5 `Scatter3DPanel`

**受け入れ基準**:
5.1. `Scatter3DPanel` がマウントされたとき、システムは購読を開始してからスナップショットを取得し、両者の点群のうち `Seq` が大きいほうを描画対象にしなければならない(初期表示の欠落と、購読済みの新しいフレームの巻き戻しを同時に防ぐ)。(イベント)
5.2. `Scatter3DPanel` がアンマウントされたとき、システムは購読を解除し、以後コールバックで状態を更新してはならない。(イベント)
5.3. スナップショットの取得が reject された場合、システムは例外を伝播させず、空の点群で描画を開始しなければならない。(異常系)
5.4. 受け取った payload が `points` 配列を持たない場合、システムは描画対象を更新せず、`console.error` に記録するだけでなければならない。(異常系)

### Requirement 6: 3 次元投影と描画

**対象**: §5.6 `projectPoint` / §5.5 `Scatter3DPanel`

**受け入れ基準**:
6.1. システムは、`projectPoint` が同じ引数に対してつねに同じ値を返さなければならない。(常時)
6.2. システムは、`projectPoint` が返す `scale` をつねに 0 より大きい有限値にしなければならない。(常時)
6.3. モデル座標の Z が大きい(手前の)点ほど、システムは `projectPoint` が返す `scale` を大きくしなければならない。(常時)
6.4. 描画のとき、システムは点を `depth` の昇順(奥から手前)に描き、手前の点が奥の点の上に重なるようにしなければならない。(イベント)
6.5. 描画のとき、システムは点の半径と不透明度を `scale` と `W` から決め、奥の点ほど小さく淡くしなければならない。(イベント)
6.6. `view.width` または `view.height` が 0 の場合、システムは描画処理を行わず、次のフレームへ進まなければならない(0 除算による NaN を画面へ出さない)。(異常系)

### Requirement 7: 回転の継続

**対象**: §5.5 `Scatter3DPanel`

**受け入れ基準**:
7.1. `Scatter3DPanel` がマウントされている間、システムはヨーを経過時間に比例して増やし続けなければならない(点群の更新イベントが 1 度も届かなくても回転が止まらない)。(状態)
7.2. ウィンドウが最小化されて `requestAnimationFrame` が停止し、その後復帰したとき、システムは回転と描画を再開しなければならない。(イベント)
7.3. フレーム間の経過時間が 100 ミリ秒を超える場合、システムはヨーの増分を 100 ミリ秒相当で頭打ちにしなければならない(復帰直後に点群が飛ぶのを防ぐ)。(異常系)
7.4. `Scatter3DPanel` がアンマウントされたとき、システムは `requestAnimationFrame` のループを停止しなければならない。(イベント)

### Requirement 8: 描画領域への追随

**対象**: §5.5 `Scatter3DPanel`

**受け入れ基準**:
8.1. システムは、キャンバスのバッキングストアの画素数を CSS 上の寸法と `devicePixelRatio` の積に一致させなければならない(高解像度ディスプレイで点がぼやけない)。(常時)
8.2. ウィンドウの大きさが変わって枠の寸法が変わったとき、システムはキャンバスの寸法を新しい寸法へ追随させなければならない。(イベント)
8.3. 枠の寸法が変わっても、システムは点群を枠の内側に収め、ページ側にスクロールバーを出してはならない。(常時)

### Requirement 9: デザイントークンへの準拠

**対象**: §6.5 デザイントークン / §5.5 `Scatter3DPanel`

**受け入れ基準**:
9.1. システムは、点と背景の色を `globals.css` の `@theme` トークンから解決しなければならず、`.ts`・`.tsx` に色の直値を書いてはならない。(常時)
9.2. トークンの解決に失敗した場合(空文字が返る場合)、システムは既定の色文字列へ退避し、描画を止めてはならない。(異常系)

### Requirement 10: 検証手段の成立(非機能)

**対象**: §5.1 `scatterSource` / §5.5 `Scatter3DPanel`

**受け入れ基準**:
10.1. システムは、`go vet ./...`・`go test ./...`・`cd frontend && npm run lint`・`wails build` がいずれもエラーなく終了する状態を保たなければならない。(常時)
10.2. システムは、1 フレームの投影と描画の対象を 256 点以下に保たなければならない(6 パネル同時稼働時の負荷の上限を、点数の固定で押さえる)。(常時)
10.3. システムは、Go からフロントエンドへの点群の送出を毎秒 1 回以下に保たなければならない(回転の滑らかさを IPC の頻度に依存させない)。(常時)

## 8. 実現方針

- **描画手段**: Canvas 2D。ヨーを Y 軸まわり、ピッチを固定値として X 軸まわりに回した後、透視投影(`scale = f / (f - z')`)でキャンバス座標へ落とす。依頼者の承認済みの決定であり、依存を 1 つも増やさない点で `CLAUDE.md`「過度な抽象化を避ける」にも沿う。
- **回転の駆動**: `requestAnimationFrame` のコールバックが受け取るタイムスタンプの差分を累積してヨーを進める。角度を state に置かず ref に持つのは、毎フレームの再描画を React に起こさせないためである(`CLAUDE.md` TypeScript 規約)。
- **既存構造との関係**: `feed` パッケージには手を入れない。`scatterSource` は `logSource` と同じく `main` パッケージに置き、`App.startup` で `feed.NewRunner` へ第 2 の `Source` として渡す。依存方向は `main → feed` のままで変わらない。
- **色の解決**: `getComputedStyle(document.documentElement).getPropertyValue('--color-accent-scatter')` で実行時に解決し、マウント時に 1 度だけ読んで ref に持つ。毎フレーム読むと描画のたびにスタイル計算が走る。
- **点数の固定**: 256 点。`Panel` 1 枠の大きさで塊として見え、かつ 6 パネル同時稼働時の描画負荷を押さえられる値として置く。実画面を見て過不足があれば unit #4 の同時稼働の調整で見直す。
- 用語集(`docs/glossary.md`)はリポジトリに無い。名前は既存コード(`logSource` / `LogLine` / `DashboardSnapshot`)の語彙に合わせた。

## 9. 参考資料

- `docs/specs/001-dashboard-mvp/roadmap.md` §1・§1.1・§2(unit #2 の範囲・完了条件・未確定項目)
- `docs/specs/001-dashboard-mvp/001-dashboard-shell/spec.md`(凍結済み。`feed.Source`・`feed.Emitter`・`feed.Runner`・`App.Snapshot`・デザイントークンの契約)
- `CLAUDE.md`(言語規約・Go / TypeScript コーディング規約・注意事項)
