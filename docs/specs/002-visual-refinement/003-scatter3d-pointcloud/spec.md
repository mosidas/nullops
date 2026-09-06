# scatter3d-pointcloud — 仕様

## 1. 目的と背景

roadmap `002-visual-refinement` の unit #3。unit #2(`scatter3d-controls`)の完了時点で、3D 散布図は軸線を持ちドラッグで視点を変えられるが、点群は 256 点の「3 クラスタの雲」であり、点は半径 2〜7 px の円 + ハローの 2 層で、色は単色(`--color-accent-scatter`)である。ユーザーは配布ビルドを中継役から渡された参考画像 3 枚(request.md §2.2 の参考サイトの画面。2026-09-06)と見比べ、点の密度・色・構造・パネルの 4 点で参考に及んでいないと判断した。本 unit は前 3 点を扱い、パネル・格子・目盛り・影・背景の地は unit #4 が扱う(roadmap §1)。

参考画像 3 枚から読み取った、本 unit が近づける目標(画像はリポジトリに置かない。観察は 2026-09-06 に本セッションが行った):

- 点は 1〜2 px の微細な点で、数千〜数万点が密に集まって面を作る。点どうしの重なりは読み取れず、奥行きは点の明るさ(奥ほど暗い)で読める。
- 構造は 3 種類で同時に見える。(a) 枠の底面いっぱいに広がる**地形**(複数の峰を持つ高さ場。峰の高さは枠の高さの半分を超える)、(b) 空中に浮く**球**(表面だけに点がある殻)、(c) 底面の近くに横たわる**トーラス**(らせん状の縞を持つ環。本書では「らせん」の構造をトーラスとして作る)。
- 色は構造ごとに独立した色系統を持つ。地形は高さに応じて連続的に変わり(1 枚目は桃〜白、2 枚目は青〜水色〜黄、3 枚目は緑〜橙〜赤)、球は 2 色が混ざり、トーラスは環に沿って色が流れる。地形の色系統が画像ごとに違うことを「時間でゆっくり巡る」と解釈する(2026-09-06 にユーザーが決定)。

要求の本体は `docs/specs/002-visual-refinement/request.md`(§番号で参照)、unit の範囲と完了条件は `docs/specs/002-visual-refinement/roadmap.md` §1・§1.1 にある。凍結済みの `docs/specs/001-dashboard-mvp/002-scatter3d-panel/spec.md`(以下「凍結 spec」)と完了済みの `docs/specs/002-visual-refinement/002-scatter3d-controls/spec.md`(以下「#2 spec」)が定めた契約のうち、本書が置き換えるものは §3 前提 1 と §8 に列挙する。

## 2. スコープ

### 対象(やること)

- Go 側の点群の生成を、3 クラスタの雲から「地形(高さ場)・球・トーラス」の 3 構造へ置き換える(§5.1・§6.3)。形は固定し、位相と高さ場の振幅を時間でゆっくり変える
- `ScatterPoint` の契約変更: 重み `W` を廃し、構造の識別子 `S` とカラーマップ用の値 `C` を足す(§6.1)
- 点数を 256 から 6,000 へ増やし、上限 8,192・下限 2,000 を `go test` で固定する(§6.2・Requirement 1・9)
- `projectPoint` を出力先の器を受け取る形へ改修し、点群用に一括投影 `projectPoints` を足す(§5.3)
- 構造ごとの連続カラーマップ(段階的なパレット)と、そのトークンを `globals.css` へ足す(§5.4・§6.5)
- 点の描画を「円 + ハロー」から「色ごとにまとめた `fillRect` の 1〜2 px の点」へ変え、奥行き順の並べ替えを廃止する(§5.2・§6.4)
- Go のテスト(点数の範囲・構造の幾何)と TypeScript のテスト(器渡し・パレットの段差)の追加と、既存テストの置き換え(Requirement 1〜3・5・6)
- 着手時(unit #2 の状態)と完了時の p95・mean・max の計測と記録(Requirement 9)、配布ビルドの目視(Requirement 10)

### 対象外(やらないこと)

- 背面・底面のパネル、格子、目盛り、軸名、点群の影、背景の地 — 理由: unit #4 の範囲(roadmap §1)
- 原点を通る 3 軸の削除 — 理由: unit #4 でパネルと格子に置き換える際に消す(2026-09-06 にユーザーが決定)。本 unit は `axes.ts` に触れない
- WebGL・描画ライブラリの導入、発光・ぼかしのポストエフェクト — 理由: roadmap §3。Canvas 2D の枠内で近づける
- 点群の転送を JSON 以外(バイナリ・共有メモリ)にすること — 理由: Wails v2 のイベントは JSON で運ばれ、Go 側が生成しフロントエンドが写像する分担(request.md §4)の中で座標の桁数の切り詰め(§6.1)により転送量を抑える。バイナリ化は経路の追加になり、本 unit の点数(§6.2)では要らない(§3 前提 4)
- 視点の操作・自動回転の変更 — 理由: unit #2 の成果をそのまま使う(roadmap 前提)
- 計測器(`framestats.ts`)の改修 — 理由: roadmap §3
- Windows・Linux での確認、描画の自動視覚検証 — 理由: request.md §4、roadmap §3

## 3. 前提(未検証の賭け)

1. **置き換える凍結済み・完了済みの契約は次のとおりで、これ以外は引き継ぐ。** 凍結 spec: §3 前提 3(256 点固定)→ §6.2 / §5.6(`projectPoint` の定義)→ §5.3 / §6.1(`ScatterPoint` の `W`)→ §6.1 / Requirement 2.2(`W` の範囲)→ Requirement 2.2 / §6.4(3 クラスタの内部状態)→ §6.3 / §6.5(新しいトークンは追加しない)→ §6.5 / Requirement 3.2(標準偏差の安定)→ Requirement 3 / 6.4(奥行き順)→ Requirement 7.4 / 6.5(半径と不透明度の式)→ Requirement 7.3 / 10.2(256 点以下)→ Requirement 9.3。#2 spec: §3 前提 4(円 + ハローの 2 層)→ §6.4 / §5.3(`projectPoint` の定義を変えない)→ §5.3 / §6.3(2 層の点)→ §6.4 / Requirement 5(ハロー)→ Requirement 7 / 8.3(Go 側の契約を変えない)→ Requirement 1・2 / 9.3(円 512 回以下)→ Requirement 9.3 / 9.4(`projectPoint` の例外)→ Requirement 9.4。凍結済み・完了済みの文書は編集しない。 — 検証方法: Requirement 8 が引き継ぐ側を列挙し、`check.py` と文書ゲートで参照の実在を確かめる / 状態: 決定済み(roadmap §1 表の #3 行と前提節)
2. **点数は 6,000 点(地形 4,000・球 1,000・トーラス 1,000)とし、`fillRect` を色ごとにまとめて描けば、計測対象 5 パネルの p95 は 20 ms を超えない。** 根拠の見積もり: (a) 描画は 1 点 1 回の `fillRect` で、Canvas 2D の小さな矩形の塗りは円(`arc` + `fill`)より 1 桁安く、6,000 回の `fillRect` は unit #2 の 512 回の円と同程度かそれ以下の時間に収まる見込み。(b) 塗りの色の切り替え(`fillStyle` への文字列代入)は解析を伴い高いため、点を色のバケットへ振り分けてバケットごとに 1 回だけ切り替える(§6.4。切り替えは最大 576 回)。(c) 転送は毎秒 1 回で、1 点あたり座標 3 個(小数 4 桁)+ 識別子 + 色値で `{"x":-0.1234,"y":0.5678,"z":-0.9012,"s":0,"c":0.123}` のおよそ 55 バイト、6,000 点で約 330 KB の JSON。受信側の解析は 1 フレームに集中するが毎秒 1 フレームだけであり、p95(60 フレーム中の 3 番目に遅いフレーム)には現れない。max には現れる(Requirement 9.7 が max を記録する理由)。上限 8,192 は (a)〜(c) が線形に伸びる範囲の目安で、下限 2,000 は roadmap §1.1。 — 検証方法: Requirement 9.1(完了時の p95)・9.7(着手時・完了時の記録)/ 状態: 未検証。超えた場合の削る順は §8 に定める
3. **1〜2 px の点では奥行き順の並べ替えが見え方に寄与しない。** 点の面積が小さく、異なる点が同じ画素に落ちる割合は密な地形の稜線付近に限られ、どちらが上に載っても色の差は 1 段の範囲に留まる。並べ替え(6,000 要素の比較ソート)を毎フレーム行うより、奥行きは不透明度の帯(§6.4)で表すほうが安い。 — 検証方法: Requirement 10.1・10.2 の目視(奥の点が手前の点を覆って構造が読めない事象が無いこと)/ 状態: 未検証
4. **Wails v2 のイベントで 330 KB の JSON を毎秒 1 回送っても、WebView 側でフレーム落ちが常態化しない。** JSON の解析は数ミリ秒で、毎秒 1 フレームの max の悪化として現れる。 — 検証方法: Requirement 9.7 の max の記録 / 状態: 未検証。max が 50 ms を超える場合は §8 の削る順に従う
5. **パレットの段数 64 でバンディング(色の段差)が目視で見えない。** 点が 1〜2 px で面を作るとき、隣り合う段は隣接画素に並ばず点の疎密の中に散るため、隣の段との差が sRGB 各成分で 12/255 以下なら段差として読めない。2 色を 64 段で補間すると差は最大 255/63 ≈ 4/255、3 色を 64 段(32 段 × 2 区間)で補間すると最大 255/31 ≈ 8.2/255 であり、いずれも 12/255 以下。 — 検証方法: Requirement 6.3 のテストと Requirement 10.3 の目視 / 状態: 未検証
6. **`ScatterPoint` の `W` を廃しても他パネルに影響しない。** `W` を読むのは `Scatter3DPanel.tsx` だけである(2026-09-06 に `grep -rn "\.w\b\|\bW\b" frontend/src *.go` で確認。`scatterpoint.go`・`scattersource.go`・そのテスト・`Scatter3DPanel.tsx` にしか無い)。 — 検証方法: `wails build`(バインディングの再生成)と `npx tsc --noEmit` / 状態: 検証済み(静的な確認)。ビルドは未検証
7. **地形の色系統の巡り(色相の回転)は、位相ごとに前計算した色文字列の表を引くだけで実現でき、毎フレームの割り当てを増やさない。** 表は 36 位相 × 3 帯 × 64 段 = 6,912 本の文字列で、マウント時に 1 度だけ作る。 — 検証方法: Requirement 6.5・9.4 / 状態: 未検証
8. **着手時の計測(unit #2 の状態)は、本 unit の最初の実装コミットより前に、`main` へマージ済みの unit #2 の成果(PR #35)のビルドで行う。** 計測は中継役(人間)がホストで行い、その値を `tasks.md` Implementation Notes に記録する。 — 検証方法: Requirement 9.7 / 状態: 未実施

## 4. 用語定義

| 用語 | 定義 |
| ---- | ---- |
| 構造(structure) | 点群を構成する部分集合の種類。地形(`terrain`)・球(`sphere`)・トーラス(`torus`)の 3 つ。`ScatterPoint.S` で識別する |
| 地形(terrain) | 底面 `(x, z) ∈ [-1, 1]²` の上に定義した高さ場 `h(x, z, φ)` に載る点の集合。凍結 spec §4「クラスタ」を置き換える |
| 球(sphere) | 固定した中心と半径の球面上の点の集合 |
| トーラス(torus) | 固定した中心・大半径・小半径のトーラス面上の点の集合。request.md §2.2 の「らせん」に対応する |
| 位相(phase) | 生成器が `Next` ごとに一定量だけ進める角度(ラジアン)。地形の振幅・球の回転・トーラスの色の流れを時間で変えるために使う |
| 色値(`C`) | 各点のカラーマップ上の位置。0〜1。構造ごとに意味が違う(地形: 高さ、球: 緯度、トーラス: 環に沿った角度)。Go 側が計算する |
| パレット | トークンの色を補間して作った色文字列の配列(§6.5)。段数は 64 |
| 帯(band) | 奥行きの 3 区分(奥・中・手前)。点の不透明度と大きさを決める(§6.4) |
| バケット | 構造・帯・段の組(3 × 3 × 64 = 576)。同じバケットの点は同じ `fillStyle` で描く |

## 5. 公開インターフェース(API)

ファイルの配置は本書では定めない(dev-decompose の責務)。`App.Snapshot`・送信イベント `nullops:scatter`・`subscribeScatter`・`DashboardSnapshot`(凍結 spec §5.2〜§5.4・§6.3)と、視点の状態機械・軸線の幾何(#2 spec §5.2・§6.2)は変えない。

### 5.1. `scatterSource`(Go・`main` パッケージ・非公開型・既存の置き換え)

- **定義**:
  ```go
  func newScatterSource(pointCount int, rnd *rand.Rand) *scatterSource
  func (s *scatterSource) EventName() string
  func (s *scatterSource) Interval() time.Duration
  func (s *scatterSource) Next() any        // ScatterCloud を返す
  func (s *scatterSource) Snapshot() ScatterCloud
  ```
  シグネチャは凍結 spec §5.1 のまま。`App.startup` は `scatterPointCount`(§6.2)を渡す。
- **入力 / 出力**: `pointCount` は総点数。構造への配分は `pointCount` から §6.2 の規則で決める。`Next` は `ScatterCloud` を返し、`Snapshot` は最後に生成した点群の複製を返す。
- **事前条件**: `pointCount` が 1 以上、`rnd` が nil でなく `scatterSource` 専用(凍結 spec §5.1 と同じ)。
- **事後条件**: `EventName` はつねに `"nullops:scatter"`、`Interval` はつねに 1000 ms。`Next` の戻り値は §6.1 の不変条件を満たし、`Points` の長さは `pointCount`、構造ごとの点数は §6.2 の配分に一致し、各点は所属する構造の幾何(§6.3)に許容誤差の範囲で載る。`Next` は現在の位相で点群を生成してから位相を 1 段(§6.3)進め、`Seq` を 1 増やす(生成器の作成直後の位相は 0。したがって 1 回目の `Next` は位相 0、121 回目は位相 2π ≡ 0 で生成する)。`Next` と `Snapshot` は並行に呼ばれても壊れない。`Snapshot` は内部状態を変えない。
- **エラー**: 返さない。事前条件違反は `panic`、不変条件違反は `newScatterPoint` の error を握らず `panic`(凍結 spec §5.1 の規律)。

### 5.2. `Scatter3DPanel`(TypeScript・React コンポーネント・既存の拡張)

- **定義**: `export function Scatter3DPanel(): React.JSX.Element`(シグネチャ・`'use client'`・ポインタ操作・購読は #2 spec §5.1 のまま)
- **事前条件**: #2 spec §5.1 と同じ(`Panel` の本文領域の内側でマウントされる)。
- **事後条件(本 unit で変わる部分)**:
  - 毎フレーム、視点を進めた後、背景 → 軸線(#2 spec §5.3)→ 点の順に描く。点は §6.4 の規則で「バケットごとに `fillStyle` を 1 回設定し、そのバケットの点を `fillRect` で描く」。円(`arc`)とハローは描かない。奥行き順の並べ替えを行わない。
  - 点の投影は §5.3 `projectPoints` で一括して行い、軸線の端点の投影は §5.3 `projectPoint` に器を渡して行う。毎フレームの描画で新しいオブジェクト・配列・関数・文字列を作らない(点群の長さが変わったときの器の作り直しを除く)。
  - パレット(§6.5)はマウント時に 1 度だけ作り、地形のパレットは経過時間から位相を選んで引く。
  - 点群が空の間も軸線を描く(#2 spec Requirement 4.7)。
- **エラー**: #2 spec §5.1 と同じ。トークンの解決に失敗した段は退避色で埋め、描画を止めない(凍結 spec Requirement 9.2)。

### 5.3. 投影(TypeScript・`projectPoint` の置き換えと `projectPoints` の追加)

凍結 spec §5.6 と #2 spec §5.3 の `projectPoint` の定義を置き換える。純関数であること(同じ引数につねに同じ値を書く)は保つ。

- **定義**:
  ```ts
  export type Projected = { sx: number; sy: number; scale: number; depth: number };
  export function projectPoint(
    p: Vec3, yaw: number, pitch: number, view: { width: number; height: number }, out: Projected,
  ): Projected;   // out を書き換えて out 自身を返す

  /** 点群 1 フレームぶんの投影結果。長さ capacity の typed array を持つ器。 */
  export type ProjectedCloud = {
    sx: Float32Array; sy: Float32Array; depth: Float32Array; length: number;
  };
  export function createProjectedCloud(capacity: number): ProjectedCloud;
  export function projectPoints(
    points: readonly Vec3[], yaw: number, pitch: number,
    view: { width: number; height: number }, out: ProjectedCloud,
  ): void;
  export const SCATTER_PITCH: number;  // 既存値 -0.42 のまま
  ```
- **入力 / 出力**: `projectPoint` は 1 点を投影して `out` の 4 フィールドを上書きし、`out` と同一の参照を返す(戻り値を捨ててもよい)。`projectPoints` は `points` の各要素を同じ変換で投影し、`out.sx[i]`・`out.sy[i]`・`out.depth[i]` に書き、`out.length` を `points.length` にする。`scale` は点群では使わないため書かない(点の大きさは帯で決める。§6.4)。
- **事前条件**: `view.width`・`view.height` が 0 より大きい。`projectPoints` は `out` の容量が `points.length` 以上であること。
- **事後条件**: 同じ引数につねに同じ値を書く。`projectPoint` の計算(ヨー → ピッチの回転、`FOCAL = 3.2` の透視投影、`FILL = 0.78`)は変えず、`out` に書く値は置き換え前の戻り値と同じである。`projectPoints` の各要素の `sx`・`sy`・`depth` は `projectPoint` に同じ点を渡した結果と(Float32 への丸めを除き)一致する。`projectPoints` は三角関数を 1 回の呼び出しにつき 4 回だけ評価する(点ごとに評価しない)。どちらも新しいオブジェクト・配列を作らない。
- **エラー**: 返さない・投げない。`projectPoints` の容量不足はプログラマの誤りであり、`out.length` を容量までに切り詰めて `console.error` に記録する(画面を止めない)。

### 5.4. パレットの生成(TypeScript・描画コンポーネントから分離した純粋なモジュール)

`node --test` で段差(§3 前提 5)を検証するため、色の補間を DOM から切り離す。トークンの解決(`getComputedStyle`)は `Scatter3DPanel` 側に残す。

- **定義**:
  ```ts
  export const PALETTE_STEPS = 64;          // 段数
  export const TERRAIN_PHASES = 36;         // 地形の色相の位相数(10° 刻み)
  export const TERRAIN_CYCLE_MS = 360_000;  // 地形の色相が 1 周する時間
  export const DEPTH_BANDS = 3;
  export const BAND_ALPHA: readonly number[];  // [0.45, 0.7, 1.0](奥・中・手前)

  export type Rgb = { r: number; g: number; b: number };  // 0〜255 の整数
  export function parseHex(color: string): Rgb | null;     // "#rrggbb" のみ。他は null
  export function rotateHue(color: Rgb, degrees: number): Rgb;
  /** 停止色(2 色または 3 色)を PALETTE_STEPS 段に補間し、帯ごとの不透明度を焼き込んだ色文字列を返す。
      戻り値は [band][step] の 2 次元配列(長さ DEPTH_BANDS × PALETTE_STEPS)。 */
  export function buildRamp(stops: readonly Rgb[]): string[][];
  ```
- **入力 / 出力**: `parseHex` は `#rrggbb` を受けて成分を返す。`rotateHue` は HSL の色相を `degrees` だけ回して返す(彩度・明度は保つ)。`buildRamp` は sRGB の各成分を区間ごとに線形補間し、`rgba(r, g, b, a)` 形式の文字列を作る。
- **事前条件**: `buildRamp` の `stops` は長さ 2 または 3。
- **事後条件**: `buildRamp` の戻り値の隣り合う段は sRGB 各成分の差が 12/255 以下(§3 前提 5)。各帯の段 0 の RGB 成分が `stops[0]`、最後の段の RGB 成分が `stops[stops.length − 1]` に一致する(`a` は帯の値)。`rotateHue` を 360° 回すと元の色に(丸め誤差 1/255 以内で)戻る。
- **エラー**: `parseHex` は解釈できない文字列に `null` を返す(投げない)。`buildRamp` は長さ 2・3 以外の `stops` に例外を投げる(プログラマの誤り)。

### 5.5. テストの実行コマンド

#2 spec §5.4 のまま(`cd frontend && npm test` → `node --test "src/lib/**/*.test.ts"`)。本 unit は `project.ts` と §5.4 のモジュールのテストを足す。Go のテストは `go test ./...`。

## 6. データ構造

### 6.1. `ScatterPoint`(Go・既存の置き換え)

```go
// ScatterPoint は 3D 散布図の 1 点。座標は回転前のモデル座標。
type ScatterPoint struct {
    X float64 `json:"x"`
    Y float64 `json:"y"`   // 高さ。地形の色値の元になる
    Z float64 `json:"z"`
    S uint8   `json:"s"`   // 構造の識別子。0 = 地形、1 = 球、2 = トーラス
    C float64 `json:"c"`   // カラーマップ用の値。0.0〜1.0
}
```

- **不変条件**: `X`・`Y`・`Z` はいずれも -1.0 以上 1.0 以下で、小数第 4 位までに丸めた値(`math.Round(v*1e4)/1e4` の不動点)。`S` は 0・1・2 のいずれか。`C` は 0.0 以上 1.0 以下で、小数第 3 位までに丸めた値。すべて有限値。
- **強制**: 生成関数 `newScatterPoint(x, y, z float64, s uint8, c float64) (ScatterPoint, error)` を通してのみ作る。違反は `errScatterPointOutOfRange`(範囲)・`errScatterPointNotFinite`(有限性)・`errScatterPointUnknownStructure`(`S` が 3 以上)を `errors.Is` で識別できる形で返す。丸めは生成関数が行う(呼び出し側は丸めない)。
- **ロジックの所在**: 座標を単位立方体へ収めることは生成器(§6.3)の責務。`newScatterPoint` は丸めと検査だけを行う。
- **丸めの理由**: JSON の桁数を抑えるため。`float64` の最短表現は 17 桁になりうるが、画面の点の位置は 1/10,000 の粒度で足りる(枠の短辺 589 px に対し 1 段が 0.03 px)。
- **置き換え**: 凍結 spec §6.1 の `W`(重み)を廃する。点の大小と明度は帯(§6.4)で決める。

### 6.2. 点数と配分(Go・定数)

```go
const scatterPointCount = 6000     // App.startup が渡す点数
const scatterPointCountMin = 2000  // roadmap §1.1 の下限
const scatterPointCountMax = 8192  // §3 前提 2 の上限
```

- **配分の規則**: `pointCount` に対し、球とトーラスは各 `pointCount / 6`(整数除算)、地形は残り(`pointCount − 2 × (pointCount / 6)`)。`pointCount` が 6 未満のときは球・トーラスが 0 点になり、地形だけになる(テストの小さな点数を許すため)。6,000 点では地形 4,000・球 1,000・トーラス 1,000。
- **不変条件**: `scatterPointCountMin ≤ scatterPointCount ≤ scatterPointCountMax`(Requirement 9.3 がテストで固定する)。
- **置き換え**: 凍結 spec §3 前提 3・Requirement 10.2(256 点固定)。

### 6.3. 構造の幾何(Go・`scatterSource` の内部状態)

点は「構造への所属」と「構造上のパラメータ」を持ち、座標はパラメータと位相から毎フレーム計算する(乱歩しない)。

- **共通**: 位相 `φ` は `Next` ごとに `2π / 120` 進む(120 秒で 1 周)。各点のパラメータは `newScatterSource` で `rnd` から一様に決めて固定する。計算した座標は `clampUnit` で `[-1, 1]` へ収めるが、以下の寸法は収まるように選んであり、切り詰めが効くのは丸め誤差だけである。
- **地形(`S = 0`)**: 点ごとに `(x, z)` を `[-0.98, 0.98]²` の一様乱数で固定する。高さは
  `h(x, z, φ) = yFloor + Σ_{k=1..5} A_k · (0.8 + 0.2 · sin(φ + θ_k)) · exp(−((x − px_k)² + (z − pz_k)²) / (2 σ_k²))`
  で、`yFloor = −0.95`、峰 5 個の `(px_k, pz_k)` は `[-0.7, 0.7]²`・`A_k` は `[0.6, 1.8]`・`σ_k` は `[0.18, 0.4]` の一様乱数で固定する。峰の重なりで `h` が `yTop = 0.9` を超える場合は `yTop` で切る。色値 `C = (h − yFloor) / (yTop − yFloor)`。振幅の `sin` 項が「峰が呼吸する」動きを作る。
- **球(`S = 1`)**: 中心 `(0.38, 0.15, −0.25)`・半径 `0.28`。点ごとに球面上の一様な方向 `(u, v)` を固定し、座標は「方向ベクトルを Y 軸まわりに `φ` だけ回したもの」× 半径 + 中心(中心は動かさない)。色値 `C = (y − cy + r) / (2r)`(緯度)。
- **トーラス(`S = 2`)**: 中心 `(−0.25, −0.6, 0.2)`・大半径 `R = 0.42`・小半径 `r = 0.1`、環は XZ 平面に平行。点ごとに `(u, v) ∈ [0, 2π)²` を固定し、座標は `x = cx + (R + r cos v) cos u`、`y = cy + r sin v`、`z = cz + (R + r cos v) sin u`。色値 `C = ((u + φ) mod 2π) / 2π`(色が環に沿って流れる)。
- **不変条件(テストで検証する幾何)**: 地形の点は `|y − h(x, z, φ)| ≤ 1e-4`(丸め)、かつ `yFloor ≤ y ≤ yTop`。球の点は `|‖p − center‖ − 0.28| ≤ 2e-4`。トーラスの点は `|√((√(x²+z²)_{中心基準} − R)² + (y − cy)²) − r| ≤ 2e-4`。地形の点の `(x, z)` は `Next` を重ねても変わらない(形は固定)。
- **ロジックの所在**: 高さ場・球面・トーラス面の計算と位相の更新は `scatterSource` に集約する。テストが同じ式で照合できるよう、`h` は `scatterSource` の状態を引数に取る非公開関数として置く。
- **置き換え**: 凍結 spec §6.4(3 クラスタ・錨・乱歩)と Requirement 3.2(標準偏差の安定)。

### 6.4. 点の描画規則(TypeScript・`Scatter3DPanel` の描画)

- **帯**: 各点の `depth` を `[-√3, √3]` で `[0, 1]` に正規化した `n` から、`n < 1/3` を奥、`1/3 ≤ n < 2/3` を中、`2/3 ≤ n` を手前とする。不透明度は帯で決め(`BAND_ALPHA`。奥 0.45・中 0.7・手前 1.0)、パレットの文字列に焼き込む。大きさは奥・中が 1 CSS ピクセル、手前が 2 CSS ピクセルの正方形(`fillRect(sx, sy, size, size)`)。
- **段**: `step = min(PALETTE_STEPS − 1, floor(C × PALETTE_STEPS))`。
- **バケット**: `key = S × (DEPTH_BANDS × PALETTE_STEPS) + band × PALETTE_STEPS + step`(0〜575)。フレームごとに全点の `key` を数え上げ(counting sort)、バケット順に点の添字を並べた `Uint32Array` を作る。この配列・計数用の配列・`ProjectedCloud` は点群の長さが変わったときだけ作り直す。
- **描画順**: `key` の昇順。すなわち地形 → 球 → トーラスの順で、各構造の中は奥の帯から手前の帯へ、帯の中は段の順。奥行き順の並べ替えは行わない(§3 前提 3)。
- **色**: `fillStyle` はバケットごとに 1 回設定する。地形の文字列は `terrainTable[phase][band][step]`、球・トーラスは `sphereTable[band][step]`・`torusTable[band][step]`(§6.5)。`phase = floor((elapsedMs mod TERRAIN_CYCLE_MS) / TERRAIN_CYCLE_MS × TERRAIN_PHASES)`。
- **置き換え**: 凍結 spec Requirement 6.4(奥行き順)・6.5(`scale` と `W` による半径・不透明度)、#2 spec §6.3(円 + ハロー)。

### 6.5. デザイントークン(CSS・`globals.css` の `@theme` への追加)

凍結 spec §6.5「新しいトークンは追加しない」を置き換える(roadmap 前提節。2026-09-06 にユーザーが承認)。色の直値は `globals.css` にだけ置き、`.ts`・`.tsx` には書かない(凍結 spec Requirement 9.1 を維持)。

```css
/* 3D 散布図のカラーマップの停止色。地形は色相を時間で回すため、彩度の高い 3 色にする。 */
--color-scatter-terrain-low:  #2f6df6;
--color-scatter-terrain-mid:  #3fd6c8;
--color-scatter-terrain-high: #f2e14a;
--color-scatter-sphere-low:   #4c7dff;
--color-scatter-sphere-high:  #ff5470;
--color-scatter-torus-low:    #ffd54a;
--color-scatter-torus-high:   #ff6ea8;
```

- **パレット**: 地形は 3 停止色を `buildRamp` で 64 段にし、位相 `k`(0〜35)ごとに停止色を `rotateHue(色, 10° × k)` してから補間した表を 36 個作る。球・トーラスは 2 停止色を 64 段にした表を 1 個ずつ作る。いずれもマウント時に 1 度だけ作る(§3 前提 7)。
- **退避**: いずれかの停止色のトークンが空文字または `parseHex` が `null` を返す文字列だった場合、その構造の全段を `'white'` にし(凍結 spec Requirement 9.2 と同じ退避)、`console.error` に記録する。
- **既存トークン**: `--color-accent-scatter` は点の色としては使わなくなるが、他の用途(README の色の表など)があるため削除しない。`--color-surface-1`(背景)・`--color-text-dim`・`--color-border`(軸線)は変えない。

## 7. 振る舞い(受け入れ基準)

### Requirement 1: 点群の生成(点数・配分・順序)

**対象**: §5.1 `scatterSource` / §6.2 点数と配分

**受け入れ基準**:
1.1. `Next` が呼ばれたとき、システムは `Points` の長さが `pointCount` に等しく、`S = 1` の点が `pointCount / 6` 個、`S = 2` の点が `pointCount / 6` 個、残りが `S = 0` である点群を返さなければならない。(イベント)
1.2. `Next` が呼ばれたとき、システムは `Seq` を直前より 1 大きくしなければならない(初回は 1)。(イベント)
1.3. `pointCount` が 6 未満の場合、システムは球・トーラスを 0 点とし、全点を地形にして panic してはならない。(異常系)
1.4. `pointCount` が 1 未満、または `rnd` が nil の場合、システムは `panic` しなければならない。(異常系)
1.5. `Next` と `Snapshot` が複数のゴルーチンから同時に呼ばれている間、システムはデータ競合を起こしてはならない(`go test -race`)。(常時)
1.6. `Snapshot` が呼ばれたとき、システムは `Seq`・点の座標・位相を変化させてはならず、返したスライスへの書き込みが内部へ波及してはならない。(イベント)
1.7. `Next` を 1 度も呼んでいない生成器の `Snapshot` は、`Seq` が 0 で `Points` が長さ 0 の非 nil スライスでなければならない。(常時)

### Requirement 2: `ScatterPoint` の不変条件

**対象**: §6.1 `ScatterPoint`

**受け入れ基準**:
2.1. システムは、`newScatterPoint` が返す `ScatterPoint` の X・Y・Z がいずれも -1.0 以上 1.0 以下で、小数第 4 位までに丸められていることを保証しなければならない。(常時)
2.2. システムは、`newScatterPoint` が返す `ScatterPoint` の C が 0.0 以上 1.0 以下で、小数第 3 位までに丸められ、S が 0・1・2 のいずれかであることを保証しなければならない。(常時)
2.3. 座標または C が範囲外の場合、システムは `errScatterPointOutOfRange` を `errors.Is` で識別できる error を返し、panic してはならない。(異常系)
2.4. 引数のいずれかが NaN または無限大の場合、システムは `errScatterPointNotFinite` を `errors.Is` で識別できる error を返さなければならない。(異常系)
2.5. S が 3 以上の場合、システムは `errScatterPointUnknownStructure` を `errors.Is` で識別できる error を返さなければならない。(異常系)
2.6. `ScatterPoint` を JSON 化したとき、システムはキー `x`・`y`・`z`・`s`・`c` の 5 個だけを持つオブジェクトにしなければならない(`w` を出さない)。(常時)
2.7. `Next` を 1000 回連続で呼び出す間、システムはすべての点を 2.1・2.2 の範囲に保たなければならない。(状態)

### Requirement 3: 構造の幾何と時間変化

**対象**: §5.1 `scatterSource` / §6.3 構造の幾何

(凍結 spec Requirement 3.2 の「標準偏差の安定」を置き換える。3.1〜3.4 は現状の 3 クラスタの雲に対して失敗するテストであり、構造の生成が Go 側にあることの検証を兼ねる)

**受け入れ基準**:
3.1. `Next` が呼ばれたとき、システムは `S = 0` のすべての点について `|y − h(x, z, φ)| ≤ 1e-4` かつ `−0.95 ≤ y ≤ 0.9` を満たす点群を返さなければならない。(イベント)
3.2. `Next` が呼ばれたとき、システムは `S = 1` のすべての点について中心 `(0.38, 0.15, −0.25)` からの距離が 0.28 ± 2e-4 である点群を返さなければならない。(イベント)
3.3. `Next` が呼ばれたとき、システムは `S = 2` のすべての点についてトーラス面(中心 `(−0.25, −0.6, 0.2)`・大半径 0.42・小半径 0.1)からの距離が 2e-4 以下である点群を返さなければならない。(イベント)
3.4. `Next` を 100 回呼び出す間、システムは `S = 0` の各点の `(x, z)` を初回と同じに保たなければならない(地形の形は固定で、高さだけが変わる)。(状態)
3.5. `Next` が呼ばれたとき、システムは直前のフレームと少なくとも 1 点の座標または C が異なる点群を返さなければならない。(イベント)
3.6. `Next` を 121 回呼び出したとき、システムは 121 回目の戻り値の地形の各点の高さを 1 回目の戻り値の値 ± 1e-4 にしなければならない(位相の周期 120 段 = 120 秒。§5.1 の更新順序)。(イベント)
3.7. システムは、地形の点の C を `(y − (−0.95)) / 1.85` ± 1e-3、球の点の C を緯度 `(y − 0.15 + 0.28) / 0.56` ± 1e-3、トーラスの点の C を `((atan2(z − 0.2, x − (−0.25)) + φ) mod 2π) / 2π` ± 1e-3(0 と 1 の境界は同一視する)にしなければならない。(常時)

### Requirement 4: 起動直後の初期表示と購読(引き継ぎ)

**対象**: §5.1 `scatterSource` / §5.2 `Scatter3DPanel`

**受け入れ基準**:
4.1. `startup` の後に `App.Snapshot` が呼ばれたとき、システムは `Scatter.Points` の長さが `scatterPointCount` に等しい点群を返さなければならない。(イベント)
4.2. システムは、凍結 spec Requirement 4.1〜4.3(`Points` が nil でない・`startup` 前は `Seq` 0 で長さ 0・`Snapshot` が内部状態を変えない)と Requirement 5(購読と初期表示の併合・解除・reject・不正な payload)の振る舞いを変えてはならない。(常時)
4.3. 受け取った点群の要素に `s` または `c` が無い場合(旧形式の payload)、システムは例外を投げず、`s` を 0・`c` を 0 として描かなければならない。(異常系)

### Requirement 5: 投影の器渡し

**対象**: §5.3 投影

**受け入れ基準**:
5.1. `projectPoint(p, yaw, pitch, view, out)` が呼ばれたとき、システムは `out` の `sx`・`sy`・`scale`・`depth` を上書きし、`out` と同一の参照を返さなければならない(新しいオブジェクトを作らない)。(イベント)
5.2. システムは、`projectPoint` が同じ引数に対してつねに同じ値を書き、`scale` を 0 より大きい有限値、モデル座標が単位立方体に収まる限り `sx`・`sy` を有限値にし、回転後の Z が大きい(手前の)点ほど `scale` を大きくしなければならない(凍結 spec Requirement 6.1〜6.3 を器渡しで引き継ぐ)。(常時)
5.3. `projectPoints(points, yaw, pitch, view, out)` が呼ばれたとき、システムは各 `i` について `out.sx[i]`・`out.sy[i]`・`out.depth[i]` を `projectPoint(points[i], …)` の結果と 1e-3 以内で一致させ、`out.length` を `points.length` にしなければならない。(イベント)
5.4. `projectPoints` の `out` の容量が `points.length` 未満の場合、システムは容量までの点を書いて `out.length` を容量にし、例外を投げてはならない。(異常系)
5.5. システムは、`projectPoints` の中で `Math.cos`・`Math.sin` を合わせて 4 回だけ評価し、点ごとに評価してはならない。(常時)
5.6. システムは、`Scatter3DPanel` が `projectPoint` へ渡す器(`Projected`)を effect の寿命で 2 個だけ作り、毎フレーム同じ器を渡さなければならない(器の生成が描画関数の中に無い。roadmap §1.1「戻り値を新規生成する呼び出しが残っていない」の静的検査)。(常時)

### Requirement 6: カラーマップとトークン

**対象**: §5.4 パレットの生成 / §6.5 デザイントークン

**受け入れ基準**:
6.1. システムは、§6.5 の 7 個のトークンを `globals.css` の `@theme` に持ち、点の色をそれらから解決しなければならず、`.ts`・`.tsx` に色の直値を書いてはならない(凍結 spec Requirement 9.1 と同じ粒度。§6.5 の退避色と既存の退避色 `'white'`・`'transparent'`・`'gray'` は凍結 spec Requirement 9.2 の退避先として除く。`rgba(…)` の文字列はトークンから計算して作る)。(常時)
6.2. `buildRamp` が呼ばれたとき、システムは `DEPTH_BANDS × PALETTE_STEPS`(3 × 64)本の `rgba(r, g, b, a)` 文字列を返し、各帯の段 0 の RGB 成分を `stops[0]`、最後の段の RGB 成分を最後の停止色に一致させなければならない(不透明度 `a` は帯の値)。(イベント)
6.3. システムは、`buildRamp` の戻り値の隣り合う段の sRGB 各成分の差を 12/255 以下に保たなければならない。(常時)
6.4. `buildRamp` の `stops` の長さが 2・3 以外の場合、システムは例外を投げなければならない。(異常系)
6.5. `Scatter3DPanel` がマウントされたとき、システムは地形 36 位相・球 1・トーラス 1 の表を 1 度だけ作り、以後のフレームで色文字列を作ってはならない。(イベント)
6.6. `rotateHue(c, 360)` が呼ばれたとき、システムは各成分が `c` と 1/255 以内で一致する色を返さなければならない。(イベント)
6.7. トークンの解決に失敗した(空文字または `parseHex` が `null`)場合、システムはその構造の全段を `'white'` にして `console.error` に記録し、描画を止めてはならない。(異常系)
6.8. `Scatter3DPanel` がマウントされている間、システムは地形のパレットの位相を経過時間 `TERRAIN_CYCLE_MS / TERRAIN_PHASES`(10 秒)ごとに 1 つ進め、36 位相で 1 周させなければならない。(状態)

### Requirement 7: 点の描画

**対象**: §5.2 `Scatter3DPanel` / §6.4 点の描画規則

(#2 spec Requirement 5(ハロー)と凍結 spec Requirement 6.4・6.5 を置き換える。7.1〜7.5 は `Scatter3DPanel.tsx` の静的検査と目視で確かめる)

**受け入れ基準**:
7.1. 描画のとき、システムは各点を `fillRect` の正方形 1 回で描き、`arc` を点の描画に使ってはならない。(イベント)
7.2. 描画のとき、システムは点を §6.4 のバケット(576 個)へ振り分け、バケットごとに `fillStyle` を 1 回だけ設定してからそのバケットの点を続けて描かなければならない。(イベント)
7.3. 描画のとき、システムは点の大きさを奥・中の帯で 1 CSS ピクセル、手前の帯で 2 CSS ピクセルにし、不透明度を帯ごとに 0.45・0.7・1.0 にしなければならない。(イベント)
7.4. 描画のとき、システムは点を奥行き順に並べ替えてはならない(バケットの `key` の昇順で描く)。(イベント)
7.5. 描画のとき、システムは軸線を点より先に描き、描画の終わりに `globalAlpha` を 1 へ戻さなければならない(#2 spec Requirement 4.5・5.5 を引き継ぐ)。(イベント)
7.6. 点群の長さが直前のフレームと異なるとき、システムは `ProjectedCloud`・バケットの配列を新しい長さで作り直さなければならない。(イベント)
7.7. 点群の長さが直前のフレームと同じ間、システムは描画の中で新しいオブジェクト・配列・関数・文字列を作ってはならない(`CLAUDE.md` TypeScript 規約)。(状態)

### Requirement 8: 既存の振る舞いの維持

**対象**: §5.2 `Scatter3DPanel`

**受け入れ基準**:
8.1. システムは、#2 spec Requirement 1〜4・6〜8(ドラッグ・操作量・復帰・軸線・ポインタの離脱・カーソル・既存の維持)の振る舞いを変えてはならず、`orbit.ts`・`axes.ts` を変更してはならない。(常時)
8.2. システムは、凍結 spec Requirement 7(回転の継続)・8(描画領域への追随)・9(デザイントークンへの準拠)の振る舞いを変えてはならない。(常時)
8.3. システムは、`EventName`・`Interval`・送信イベント名 `nullops:scatter`・`App.Snapshot` のシグネチャ・`subscribeScatter` のシグネチャを変えてはならない。(常時)
8.4. `view.width` または `view.height` が 0 の場合、システムは軸線も点も描かず、次のフレームへ進まなければならない。(異常系)

### Requirement 9: 検証手段の成立と描画の負荷(非機能)

**対象**: §5.1 `scatterSource` / §5.2 `Scatter3DPanel` / §5.5 テストの実行コマンド

**受け入れ基準**:
9.1. 完了時に `wails build -devtools` のビルドを起動し `window.nullops.enableFrameStats()` で計測したとき(手順は凍結済み `docs/specs/001-dashboard-mvp/005-framestats-runtime/tasks.md` B 節。1440×900)、システムは計測対象 5 パネル(`commit`・`depgraph`・`gauge`・`scatter`・`timeseries`)のいずれについても、報告の最後の 6 行(30 秒ぶん)すべてで p95 が 20 ミリ秒を超える状態にしてはならない(集計規則は B 節 9 と同じ。1 行でも 20 ms 以下なら超過と見なさない)。(イベント)
9.2. システムは、`go vet ./...`・`go test ./...`・`cd frontend && npm run lint`・`cd frontend && npm test`・`wails build` がいずれもエラーなく終了する状態を保たなければならない。(常時)
9.3. システムは、`scatterPointCount` を 2,000 以上 8,192 以下に保たなければならない(`go test` で固定する。凍結 spec Requirement 10.2 を置き換える)。(常時)
9.4. システムは、`projectPoint`・`projectPoints`・毎フレームの描画の中で新しいオブジェクト・配列・関数を作ってはならない(点群の長さが変わったときの器の作り直しを除く。#2 spec Requirement 9.4 の例外を消す)。(常時)
9.5. システムは、Go からフロントエンドへの点群の送出を毎秒 1 回以下に保たなければならない(凍結 spec Requirement 10.3 を引き継ぐ)。(常時)
9.6. システムは、1 フレームの点の描画における `fillStyle` の設定回数を 576 回以下(背景の塗りの 1 回を含めない)、`fillRect` の呼び出し回数を点数以下に保たなければならない。(常時)
9.7. システムは、着手時(unit #2 の成果。§3 前提 8)と完了時の両方の計測の p95・mean・max(5 パネルぶん)を unit の `tasks.md` Implementation Notes に記録していなければならない(着手時の値は基準の記録であり、9.1 の閾値を掛けない)。(常時)

### Requirement 10: 配布ビルドの目視(人間による承認)

**対象**: §5.2 `Scatter3DPanel`

**受け入れ基準**:
10.1. 配布ビルドを起動して放置したとき、システムは 1〜2 px の点が密に集まって面を作り、地形(複数の峰)・球・トーラスの 3 つが同時に見分けられる 3D 散布図を描かなければならない。(イベント)
10.2. 視点をドラッグで回したとき、システムは奥の点が手前の点を覆って構造が読めなくなる事象を起こしてはならない(§3 前提 3 の目視)。(イベント)
10.3. 地形を見たとき、システムは最も低い点と最も高い点を異なる色相で描き、その間の色をバンディング(色の段差)が見えない連続した変化にしていなければならない(単色でないことと、§3 前提 5 の段数が足りることの目視)。(イベント)
10.4. 地形・球・トーラスを見比べたとき、システムはそれぞれ異なる色系統で描いていなければならない。(イベント)
10.5. 5 分間放置して観察したとき、システムは地形の色系統を 1 回以上変えなければならない(色相の回転)。(イベント)
10.6. 30 秒間観察したとき、システムは点群の表示を 1 回以上変えなければならない(峰の高さ・球の回転・トーラスの色の流れ)。(イベント)
10.7. ドラッグによる視点の操作と、ドラッグ終了後の自動回転への復帰が、unit #2 の完了時点と同じに動かなければならない。(常時)

## 8. 実現方針

- **点数と描画方法(6,000 点・`fillRect` をバケット順)**: `ImageData` へ直接書く方法は点 1 個あたり最も安いが、`putImageData` が変換行列・合成を無視するため devicePixelRatio の扱いと、unit #4 で足す背面パネル・影との合成に別経路(オフスクリーンキャンバス経由の `drawImage`)が要る。`fillRect` は既存の描画経路(変換行列・`globalAlpha`・軸線)にそのまま載り、6,000 点なら間に合う見込みである(§3 前提 2)。色の切り替えをバケットごとに 1 回へ抑えるため counting sort で点を並べる(比較ソートを使わない)。
- **p95 が 20 ms を超えた、または max が 50 ms を超えたときの削る順**: (1) `scatterPointCount` を 6,000 → 4,000 → 3,000 の順に減らす(2,000 未満にしない。配分の規則 §6.2 は変えない)、(2) 帯を 3 から 2 へ(バケット数を 384 へ)、(3) 地形の位相数を 36 から 18 へ(表の生成時間のみに効く)。いずれも受け入れ基準の数値(1.1・6.5・7.3・9.3)に触れるため、削る判断は人間に委ね、値の変更は spec の更新として行う。逆に目視(Requirement 10.1)で密度が足りない場合に 8,192 まで増やす判断も同じ扱いとする(p95 の余裕を見て人間が決め、spec を更新する)。
- **転送量**: 座標の小数第 4 位への丸めで 1 点およそ 55 バイト、6,000 点で約 330 KB/秒(丸めない場合は 1 点 90 バイト超)。丸めは `newScatterPoint` に置いて不変条件にする(生成器の式が変わっても JSON の桁数が戻らないため)。
- **奥行き順の廃止**: §3 前提 3。奥行きは帯の不透明度で残す。
- **地形の色相の回転**: 停止色の色相を HSL で回してから補間する。位相ごとの表を前計算するのは、毎フレームの補間が段数ぶんの文字列を作って `CLAUDE.md` の規約に反するため。10° 刻みで 10 秒ごとに切り替わる段差は、点が疎密の中に散っているため目視で気づきにくいと見込む(気になる場合は位相数を増やす。表は位相数に比例して増える)。
- **`ScatterPoint` の `W` の廃止**: 点ごとの大小と明度は帯で決めるため、点ごとの重みを持つ意味が無い。`W` を残すと JSON が 1 点あたり 20 バイト増える。
- **色の直値の検査**: `.ts`・`.tsx` に `#rrggbb` や色名を書かない規律は保つが、`rgba(` の文字列はトークンから計算して作るため、unit #2 の tasks.md が使った静的検査(`rgba?\(` の grep)はそのままでは偽陽性になる。tasks.md では「`rgba(` の出現が §5.4 のモジュールの文字列テンプレート 1 箇所に限る」形へ検査を変える。
- **テストの置き換え**: `scattersource_test.go` の `TestScatterPointCountWithinBudget`(256 以下)を Requirement 9.3 の範囲検査に、`TestScatterSourceSpreadStaysStable`(標準偏差)を Requirement 3.1〜3.4 の幾何の検査に置き換える。`scatterpoint_test.go` の `W` の検査を `S`・`C` の検査に置き換える。`TestScatterSourceKeepsPointsInUnitCube` は `p.W` の範囲検査を `p.C`・`p.S` の検査へ差し替えて残す。それ以外(イベント名・間隔・長さと Seq・panic・競合・Snapshot)は残す。
- **参考画像**: 中継役から渡された参考画像 3 枚(request.md §2.2 の参考サイト)。WebGL の実装であり(#2 spec `research.md` §1)、同じ見た目への到達を完了条件にしない(roadmap §3)。
- 用語集(`docs/glossary.md`)はリポジトリに無い。名前は既存コードの語彙に合わせた。

## 9. 参考資料

- `docs/specs/002-visual-refinement/request.md` §2.2・§3・§4・§5・§6
- `docs/specs/002-visual-refinement/roadmap.md` §1・§1.1・§2・§3(unit #3 の範囲・完了条件・置き換える契約の列挙)
- `docs/specs/001-dashboard-mvp/002-scatter3d-panel/spec.md`(凍結済み。置き換える契約と引き継ぐ契約)
- `docs/specs/002-visual-refinement/002-scatter3d-controls/spec.md`・`research.md`・`tasks.md` Implementation Notes(完了済み。置き換える契約、参考サイトの調査、最終検証パネルの Major と未実施の 9.1)
- `docs/specs/001-dashboard-mvp/005-framestats-runtime/tasks.md` B 節(凍結済み。p95 の計測手順)
- Canvas 2D `fillRect`・`putImageData`(合成と変換行列の扱い): https://html.spec.whatwg.org/multipage/canvas.html#drawing-rectangles-to-the-bitmap 、 https://html.spec.whatwg.org/multipage/canvas.html#dom-context-2d-putimagedata
- `CLAUDE.md`(言語規約・Go / TypeScript コーディング規約・注意事項)
