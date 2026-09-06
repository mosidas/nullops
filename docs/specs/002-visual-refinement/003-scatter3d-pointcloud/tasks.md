# scatter3d-pointcloud — 実装タスク

> 仕様の詳細は同じディレクトリの仕様文書 spec.md を参照する。
> このファイルには仕様を転記しない。

## Global Constraints

spec.md が全タスクに掛ける制約(逐語)。

- 「1.5. `Next` と `Snapshot` が複数のゴルーチンから同時に呼ばれている間、システムはデータ競合を起こしてはならない(`go test -race`)。(常時)」
- 「2.1. システムは、`newScatterPoint` が返す `ScatterPoint` の X・Y・Z がいずれも -1.0 以上 1.0 以下で、小数第 4 位までに丸められていることを保証しなければならない。(常時)」
- 「2.2. システムは、`newScatterPoint` が返す `ScatterPoint` の C が 0.0 以上 1.0 以下で、小数第 3 位までに丸められ、S が 0・1・2 のいずれかであることを保証しなければならない。(常時)」
- 「2.6. `ScatterPoint` を JSON 化したとき、システムはキー `x`・`y`・`z`・`s`・`c` の 5 個だけを持つオブジェクトにしなければならない(`w` を出さない)。(常時)」
- 「4.2. システムは、凍結 spec Requirement 4.1〜4.3(`Points` が nil でない・`startup` 前は `Seq` 0 で長さ 0・`Snapshot` が内部状態を変えない)と Requirement 5(購読と初期表示の併合・解除・reject・不正な payload)の振る舞いを変えてはならない。(常時)」
- 「5.5. システムは、`projectPoints` の中で `Math.cos`・`Math.sin` を合わせて 4 回だけ評価し、点ごとに評価してはならない。(常時)」
- 「5.6. システムは、`Scatter3DPanel` が `projectPoint` へ渡す器(`Projected`)を effect の寿命で 2 個だけ作り、毎フレーム同じ器を渡さなければならない(器の生成が描画関数の中に無い。roadmap §1.1「戻り値を新規生成する呼び出しが残っていない」の静的検査)。(常時)」
- 「6.1. システムは、§6.5 の 7 個のトークンを `globals.css` の `@theme` に持ち、点の色をそれらから解決しなければならず、`.ts`・`.tsx` に色の直値を書いてはならない(凍結 spec Requirement 9.1 と同じ粒度。§6.5 の退避色と既存の退避色 `'white'`・`'transparent'`・`'gray'` は凍結 spec Requirement 9.2 の退避先として除く。`rgba(…)` の文字列はトークンから計算して作る)。(常時)」
- 「6.3. システムは、`buildRamp` の戻り値の隣り合う段の sRGB 各成分の差を 12/255 以下に保たなければならない。(常時)」
- 「8.1. システムは、#2 spec Requirement 1〜4・6〜8(ドラッグ・操作量・復帰・軸線・ポインタの離脱・カーソル・既存の維持)の振る舞いを変えてはならず、`orbit.ts`・`axes.ts` を変更してはならない。(常時)」
- 「8.2. システムは、凍結 spec Requirement 7(回転の継続)・8(描画領域への追随)・9(デザイントークンへの準拠)の振る舞いを変えてはならない。(常時)」
- 「8.3. システムは、`EventName`・`Interval`・送信イベント名 `nullops:scatter`・`App.Snapshot` のシグネチャ・`subscribeScatter` のシグネチャを変えてはならない。(常時)」
- 「9.2. システムは、`go vet ./...`・`go test ./...`・`cd frontend && npm run lint`・`cd frontend && npm test`・`wails build` がいずれもエラーなく終了する状態を保たなければならない。(常時)」
- 「9.3. システムは、`scatterPointCount` を 2,000 以上 8,192 以下に保たなければならない(`go test` で固定する。凍結 spec Requirement 10.2 を置き換える)。(常時)」
- 「9.4. システムは、`projectPoint`・`projectPoints`・毎フレームの描画の中で新しいオブジェクト・配列・関数を作ってはならない(点群の長さが変わったときの器の作り直しを除く。#2 spec Requirement 9.4 の例外を消す)。(常時)」
- 「9.5. システムは、Go からフロントエンドへの点群の送出を毎秒 1 回以下に保たなければならない(凍結 spec Requirement 10.3 を引き継ぐ)。(常時)」
- 「9.6. システムは、1 フレームの点の描画における `fillStyle` の設定回数を 576 回以下(背景の塗りの 1 回を含めない)、`fillRect` の呼び出し回数を点数以下に保たなければならない。(常時)」
- 「9.7. システムは、着手時(unit #2 の成果。§3 前提 8)と完了時の両方の計測の p95・mean・max(5 パネルぶん)を unit の `tasks.md` Implementation Notes に記録していなければならない(着手時の値は基準の記録であり、9.1 の閾値を掛けない)。(常時)」
- 「凍結済み・完了済みの文書は編集しない。」(§3 前提 1)。承認後の本 unit の spec.md も編集しない
- 検証の前提: `cd frontend && npm ci` と `wails build` を 1 度通してから検証コマンドを回す(`main.go` が `go:embed all:frontend/dist` を持つため、`frontend/dist` が無い作業ツリーでは `go vet ./...`・`go test ./...` が失敗し、`frontend/wailsjs` が無ければ `npm run lint`・`npx tsc --noEmit` も前提不足で失敗する。unit #1 ではこの漏れで内蔵レビューゲートが 2 周とも REJECTED になった)。検証の順はつねに `npm ci` → `wails build` → `go vet` → `go test` → `npm test` → `npm run lint` とする。`ScatterPoint` の契約を変えるタスク(1.1)以降は `wails build` で `frontend/wailsjs` を再生成してから TypeScript 側の検証を回す(`main.ScatterPoint` の型が `s`・`c` を持つのはバインディングの再生成後)
- 色の直値の静的検査(spec.md §8「色の直値の検査」。unit #2 の `rgba?\(` の grep を置き換える): `grep -rnE "#[0-9a-fA-F]{3,8}\b" frontend/src --include='*.ts' --include='*.tsx'` が 0 件(既存の退避色の色名 `'white'`・`'transparent'`・`'gray'` は許す)/ `grep -rn "rgba(" frontend/src --include='*.ts' --include='*.tsx' | grep -v "\.test\.ts"` の出現が `frontend/src/lib/palette.ts` の文字列テンプレート 1 箇所に限る
- 人間の回答(spec.md 承認時。受け入れ基準を変えない運用上の判断): 着手時の p95 の計測(§3 前提 8・Requirement 9.7)は中継役がホストで実行して後から渡す。この計測を待たずに実装を進める。Implementation Notes の該当項目は「未取得。中継役が渡す」と明記して残し、完了時の計測と合わせて記録する
- 文書ゲート 3 回目の Nit・FYI のうち spec.md を編集せずに本ファイルで吸収するもの: (a) 退避色 `'white'` と帯の不透明度の関係 → 退避時は 3 帯とも `'white'`(不透明度を焼き込まない。凍結 spec Requirement 9.2 と同じ退避であり、描画を止めないことだけを保証する)。(b) `buildRamp` の戻り値の表現 → `string[][]`(外側が帯・内側が段。`readonly` は付けない。`Scatter3DPanel` は読むだけ)。(c) 1 基準 1 振る舞いの粒度 → 検証コマンドで基準ごとに 1 項目を割り当てる。(d) Requirement 4.3・6.5・7.6・7.7 の検証手段 → 3.1・3.2 の検証コマンドに置く

CLAUDE.md が全タスクに掛ける制約(逐語)。

- 「会話・ドキュメント・コード内コメント・PR/Issue 本文・コミットメッセージは日本語で記述しなければならない(MUST)。」
- 「画面に描画する擬似ログとラベルは英語にする。模倣対象のツール(コンパイラ・パッケージマネージャ・CI 等)が英語で出力するため。」
- 「エラーは戻り値で返す。`panic` はプログラマの誤りに限る」
- 「`any` を使わない。型が定まらない箇所は `unknown` で受けて絞り込む」
- 「描画コンポーネントと擬似データの生成を別ファイルに分ける」
- 「再描画のたびに新しい関数・オブジェクトを作らない(アニメーションの発火頻度が高いため)」
- 「Wails が生成するバインディング(`frontend/wailsjs/`)は手で編集しない」
- 「why / why not を書く。コードを読めば分かることは書かない」
- 「実在のシステム情報を読み取らず、外部へも通信しない。画面に出る値はすべてこのアプリが生成した擬似データとする」
- 「`frontend/dist` と `frontend/wailsjs` は `wails build` の生成物であり、リポジトリに含めない」

## File Structure Plan

| ファイルパス | 区分 | 責務 |
| ------------ | ---- | ---- |
| `scatterpoint.go` | 変更 | `ScatterPoint` の `W` を廃し `S`・`C` を足す(spec.md §6.1)。`newScatterPoint(x, y, z, s, c)` と `errScatterPointUnknownStructure` |
| `scatterpoint_test.go` | 変更 | `W` の検査を `S`・`C` の検査へ置き換え、JSON のキー 5 個・`S ≥ 3` の error を足す(Requirement 2) |
| `scattersource.go` | 変更 | 3 クラスタの雲を地形・球・トーラス(spec.md §6.3)へ置き換える。点数の定数 3 個(§6.2)、配分、位相、高さ場の非公開関数 |
| `scattersource_test.go` | 変更 | `TestScatterPointCountWithinBudget` を範囲検査へ、`TestScatterSourceSpreadStaysStable` を幾何の検査へ置き換え、`TestScatterSourceKeepsPointsInUnitCube` の `W` を `S`・`C` へ差し替える(Requirement 1・3・9.3) |
| `frontend/src/lib/project.ts` | 変更 | `projectPoint` を器渡しへ置き換え、`ProjectedCloud`・`createProjectedCloud`・`projectPoints` を足す(spec.md §5.3) |
| `frontend/src/lib/project.test.ts` | 新規 | 器渡し・純関数性・`projectPoints` の一致・容量不足・三角関数 4 回の検証(Requirement 5) |
| `frontend/src/lib/palette.ts` | 新規 | パレットの生成(spec.md §5.4)。DOM に依存しない純粋なモジュール。`rgba(` の文字列テンプレートはここ 1 箇所 |
| `frontend/src/lib/palette.test.ts` | 新規 | 段差・端点・帯・例外・`rotateHue` の検証(Requirement 6.2・6.3・6.4・6.6) |
| `frontend/src/app/globals.css` | 変更 | `@theme` へ 7 個のトークンを足す(spec.md §6.5) |
| `frontend/src/components/Scatter3DPanel.tsx` | 変更 | パレットの表の生成(マウント時)、バケット順の `fillRect` 描画、`projectPoints` と器の再利用、旧形式の payload の扱い(spec.md §5.2・§6.4) |
| `docs/specs/002-visual-refinement/003-scatter3d-pointcloud/tasks.md` | 変更 | 目視・計測の手順と未検証項目を `## Implementation Notes` へ記録する |

補足(計画の根拠と、意図的に置かなかったもの):

- **パレットのモジュールを `frontend/src/lib/palette.ts` に置く**。`npm test` の glob `src/lib/**/*.test.ts` に載る位置であり(文書ゲートの FYI)、`orbit.ts`・`axes.ts` と同じ規律(`wailsjs`・`react`・`document`・`window` を参照しない、相対 import は `.ts` 拡張子付き)に従う。
- **トークンの解決は `Scatter3DPanel.tsx` に残す**(spec.md §5.4)。`palette.ts` は `Rgb` と文字列だけを扱い、`getComputedStyle` に触れない。
- **`ProjectedCloud` とバケットの配列は `Scatter3DPanel.tsx` の effect の中で持つ**。器の作り直し(7.6)は点群の長さが変わった購読のコールバックで行い、描画関数は器を受け取るだけにする。
- **描画モジュールを新設しない**。バケットの数え上げと `fillRect` は `render` の中で完結する(unit #2 と同じ理由。`CanvasRenderingContext2D` に依存し `node --test` の対象にならない)。
- **`feed.ts` の `isScatterCloud` は変えない**(4.2・8.3)。旧形式の payload(4.3)は描画側で `s`・`c` の欠落を 0 として読む。
- **`orbit.ts`・`axes.ts`・`framestats.ts` を変えない**(8.1)。
- **タスク 1 と 2 は並行可能 `(P)`**。1 は Go 側、2 は `frontend/src/lib` と `globals.css` だけを触る。ただし 2.1 の `project.test.ts` は `Vec3` に対する検証であり `main.ScatterPoint` を参照しないため、1 の完了を待たない。3 は 1 と 2 の両方に依存する。
- **spec.md の受け入れ基準を変えず、公開契約も足さない**。`ScatterPoint`・3 定数・`projectPoint`/`projectPoints`/`createProjectedCloud`/`ProjectedCloud`/`Projected`・`palette.ts` の定数 5 個と関数 3 個・7 トークンは spec.md §5・§6 の定義をそのまま実装する。ファイルの配置は spec.md §5 が dev-decompose の責務と定めた範囲内の判断である。

## タスク一覧

- [ ] 1. Go 側: `ScatterPoint` の契約変更と構造の生成
  - [x] 1.1 `ScatterPoint` の `W` を廃し `S uint8`(`json:"s"`)・`C float64`(`json:"c"`)を足す。`newScatterPoint(x, y, z float64, s uint8, c float64) (ScatterPoint, error)` にし、`C` の小数第 3 位への丸めと範囲検査、`S ≥ 3` の `errScatterPointUnknownStructure` を足す。既存の `errScatterPointOutOfRange`・`errScatterPointNotFinite` は保つ。テストを先に書く: 範囲内の受理と丸め(X・Y・Z は第 4 位、C は第 3 位)/ C の範囲外で `errScatterPointOutOfRange` / NaN・Inf で `errScatterPointNotFinite` / S = 3 で `errScatterPointUnknownStructure` / JSON のキーが `x`・`y`・`z`・`s`・`c` の 5 個だけ。`scattersource.go` の呼び出しはコンパイルが通る最小の変更(`S = 0`・`C = 0`)にとどめ、幾何は 1.2 で入れる
    _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_
    _Boundary: ScatterPoint_
    _Interfaces: Changes `newScatterPoint(x, y, z, s, c)` / Produces `errScatterPointUnknownStructure` / Changes JSON の形(`w` → `s`・`c`。`wails build` で `frontend/wailsjs` の `main.ScatterPoint` が再生成される)_
    - 対象ファイル: `scatterpoint.go`(変更), `scatterpoint_test.go`(変更), `scattersource.go`(変更。呼び出しの追従のみ)
    - 仕様参照: spec.md §6.1 `ScatterPoint`, §8 `ScatterPoint` の `W` の廃止, Requirement 2, §3 前提 6
    - 検証コマンド: `wails build` が終了コード 0 / `go vet ./...` / `go test ./...` が終了コード 0 / (2.1・2.2)`go test -run 'TestNewScatterPoint' ./...` が成功 / (2.3〜2.5)同テストに `errors.Is` の 3 分岐がある / (2.6)`grep -n 'json:"w"' *.go` が 0 件かつ `grep -c 'json:"[xyzsc]"' scatterpoint.go` が 5 / `grep -n "\.W\b" *.go` が 0 件(§3 前提 6)
  - [x] 1.2 `scattersource.go` を spec.md §6.3 の 3 構造へ置き換える。定数 `scatterPointCount = 6000`・`scatterPointCountMin = 2000`・`scatterPointCountMax = 8192`(§6.2)。`newScatterSource` で配分(球・トーラス各 `pointCount / 6`、地形は残り)と各点のパラメータ(地形の `(x, z)`、球の方向、トーラスの `(u, v)`)と峰 5 個(`px_k, pz_k, A_k, σ_k, θ_k`)を `rnd` から固定する。位相は `Next` ごとに `2π / 120` 進め、`Next` は現在の位相で生成してから進める(§5.1 事後条件)。高さ場 `h` は `scatterSource` の状態を引数に取る非公開関数として置く。`Next` は `newScatterPoint` の error を握らず `panic`。テストを先に書く(置き換え): `TestScatterPointCountWithinBudget` → `scatterPointCountMin ≤ scatterPointCount ≤ scatterPointCountMax`(9.3)/ `TestScatterSourceSpreadStaysStable` → 幾何の検査(3.1 地形 `|y − h| ≤ 1e-4` と `[−0.95, 0.9]`、3.2 球の距離 `0.28 ± 2e-4`、3.3 トーラス面からの距離 `≤ 2e-4`、3.4 100 回で地形の `(x, z)` が不変、3.6 121 回目の高さが 1 回目 ± 1e-4、3.7 各構造の C の式)/ `TestScatterSourceNextLengthAndSeq` に配分(1.1: `S = 1`・`S = 2` が各 `pointCount / 6`)を足す / `pointCount = 5` で地形のみ・panic なし(1.3)/ `TestScatterSourceKeepsPointsInUnitCube` の `W` を `S ∈ {0,1,2}`・`C ∈ [0, 1]` に差し替え、1000 回で保つ(2.7)。既存の `EventName`・`Interval`・panic・競合・Snapshot・`PointsMoveEachFrame`(3.5)のテストは残す。`app_test.go` の `Snapshot` の長さの照合は `scatterPointCount` を参照していれば変えない(4.1)
    _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 2.7, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 4.1, 4.2, 8.3, 9.3, 9.5_
    _Boundary: scatterSource_
    _Depends: 1.1_
    _Interfaces: Consumes `newScatterPoint(x, y, z, s, c)`(1.1)/ Produces `scatterPointCount`・`scatterPointCountMin`・`scatterPointCountMax`(`App.startup` は既存どおり `scatterPointCount` を渡す)/ Keeps `EventName`・`Interval`・`Next`・`Snapshot` のシグネチャ_
    - 対象ファイル: `scattersource.go`(変更), `scattersource_test.go`(変更)
    - 仕様参照: spec.md §5.1 `scatterSource`, §6.2 点数と配分, §6.3 構造の幾何, §8 テストの置き換え, Requirement 1・3・9.3
    - 検証コマンド: `go vet ./...` / `go test ./...` / `go test -race -run 'TestScatterSource' ./...` が終了コード 0(1.5) / (9.3)`grep -nE "scatterPointCount(Min|Max)? = [0-9]+" scattersource.go` が 3 件で値が 6000・2000・8192 / (3.1〜3.4・3.6・3.7)`go test -run 'TestScatterSourceGeometry|TestScatterSourceTerrain|TestScatterSourceSphere|TestScatterSourceTorus' -v ./...` に各基準の subtest が現れて成功 / (1.3)`go test -run 'TestScatterSourceSmallCount' ./...` が成功 / (9.5)`go test -run 'TestScatterSourceInterval' ./...` が成功(1000 ms のまま) / (4.1・4.2)`go test -run 'TestApp' ./...` が成功し `git diff --stat main...HEAD -- app.go` が 0 件 / `grep -n "TestScatterSourceSpreadStaysStable\|TestScatterPointCountWithinBudget" scattersource_test.go` で前者が 0 件・後者は範囲検査に書き換わっている
- [ ] 2. (P) TypeScript 側の純粋なモジュール: 投影の器渡しとパレット
  - [x] 2.1 `frontend/src/lib/project.ts` の `projectPoint` を spec.md §5.3 の器渡し(第 5 引数 `out: Projected` を上書きして `out` を返す)へ置き換え、`ProjectedCloud`・`createProjectedCloud(capacity)`(`Float32Array` × 3 と `length: 0`)・`projectPoints(points, yaw, pitch, view, out)` を足す。`FOCAL`・`FILL`・`SCATTER_PITCH` と計算は変えない。`projectPoints` は `cos`・`sin` を関数の先頭で 4 回だけ評価し、点ごとのループの中でオブジェクトを作らない。容量不足は `out.length` を容量に切り詰め `console.error` に記録する。`frontend/src/lib/project.test.ts` を先に書く: 5.1(戻り値が `out` と同一参照。`Object.is`)/ 5.2(同じ引数で同じ値、`scale > 0` かつ有限、単位立方体の 8 頂点で `sx`・`sy` が有限、Z が大きい点ほど `scale` が大きい)/ 5.3(`projectPoints` の各要素が `projectPoint` と 1e-3 以内、`length` が `points.length`)/ 5.4(容量 2 に 3 点で `length` 2・例外なし)/ 5.5(`Math.cos`・`Math.sin` をテスト内で計数用の関数に差し替えて呼び出し回数が合わせて 4 回。テスト後に元へ戻す)
    _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 9.4_
    _Boundary: project_
    _Interfaces: Changes `projectPoint(p, yaw, pitch, view, out): Projected` / Produces `export type ProjectedCloud`, `createProjectedCloud(capacity): ProjectedCloud`, `projectPoints(points, yaw, pitch, view, out): void` / Keeps `SCATTER_PITCH`・`Projected`_
    - 対象ファイル: `frontend/src/lib/project.ts`(変更), `frontend/src/lib/project.test.ts`(新規)
    - 仕様参照: spec.md §5.3 投影, §5.5 テストの実行コマンド, Requirement 5, roadmap §1.1
    - 検証コマンド: `(cd frontend && npm test)` が終了コード 0 で `project.test.ts` が実行されている / `(cd frontend && npx tsc --noEmit)` が終了コード 0(この時点で `Scatter3DPanel.tsx` が旧シグネチャで呼んでいれば失敗するため、2.1 では `Scatter3DPanel.tsx` の呼び出しを器渡しへ最小限追従させてよい。描画の置き換えは 3.1) / `grep -nE "wailsjs|react|document|window" frontend/src/lib/project.ts frontend/src/lib/project.test.ts` が 0 件 / (5.5)`grep -c "Math\.\(cos\|sin\)(" frontend/src/lib/project.ts` の `projectPoints` の本体での出現が 4 / (9.4)`projectPoint`・`projectPoints` の本体に `new`・`{`(オブジェクトリテラル)・`[]`・`=>` が無い(`createProjectedCloud` は除く)
  - [x] 2.2 `frontend/src/lib/palette.ts` を spec.md §5.4 の定義どおりに新設する(`PALETTE_STEPS = 64`・`TERRAIN_PHASES = 36`・`TERRAIN_CYCLE_MS = 360_000`・`DEPTH_BANDS = 3`・`BAND_ALPHA = [0.45, 0.7, 1.0]`・`Rgb`・`parseHex`・`rotateHue`・`buildRamp`)。`buildRamp` は 2 色なら 63 区間、3 色なら 32 段 × 2 区間で sRGB 各成分を線形補間し、帯ごとに `rgba(r, g, b, a)` を焼き込んだ `string[][]`(`[band][step]`)を返す。`rotateHue` は RGB → HSL → 色相を回す → RGB。`frontend/src/app/globals.css` の `@theme` に §6.5 の 7 トークンを足す(値は §6.5 のとおり)。`frontend/src/lib/palette.test.ts` を先に書く: 6.2(3 × 64 本、各帯の段 0 と段 63 の RGB が停止色、`a` が帯の値。2 色・3 色の両方)/ 6.3(隣り合う段の各成分の差 ≤ 12。2 色・3 色の両方)/ 6.4(長さ 1・4 で例外)/ 6.6(`rotateHue(c, 360)` が 1/255 以内)/ `parseHex` の `#rrggbb` 受理と、空文字・`#fff`・`rgb(...)` で `null`
    _Requirements: 6.1, 6.2, 6.3, 6.4, 6.6_
    _Boundary: palette_
    _Interfaces: Produces `PALETTE_STEPS`・`TERRAIN_PHASES`・`TERRAIN_CYCLE_MS`・`DEPTH_BANDS`・`BAND_ALPHA`・`Rgb`・`parseHex`・`rotateHue`・`buildRamp` / Produces 7 トークン(`--color-scatter-terrain-low|mid|high`・`--color-scatter-sphere-low|high`・`--color-scatter-torus-low|high`)_
    - 対象ファイル: `frontend/src/lib/palette.ts`(新規), `frontend/src/lib/palette.test.ts`(新規), `frontend/src/app/globals.css`(変更)
    - 仕様参照: spec.md §5.4 パレットの生成, §6.5 デザイントークン, §3 前提 5・7, §8 地形の色相の回転, Requirement 6
    - 検証コマンド: `(cd frontend && npm test)` が終了コード 0 で `palette.test.ts` が実行されている / `(cd frontend && npx tsc --noEmit)` / `(cd frontend && npm run lint)` が終了コード 0 / `grep -nE "wailsjs|react|document|window" frontend/src/lib/palette.ts frontend/src/lib/palette.test.ts` が 0 件 / (6.1)`grep -c "^\s*--color-scatter-" frontend/src/app/globals.css` が 7 かつ Global Constraints の色の直値の静的検査(`rgba(` が `palette.ts` の 1 箇所) / `grep -n "accent-scatter" frontend/src/app/globals.css` が 1 件(既存トークンを消していない)
- [ ] 3. `Scatter3DPanel` への統合
  - [x] 3.1 描画の置き換え。マウント時に `readToken` で 7 トークンを解決し、`parseHex` → 地形は 36 位相ぶん `rotateHue(色, 10° × k)` → `buildRamp`、球・トーラスは `buildRamp` 1 回ずつで表を作る(effect 内で 1 度だけ)。解決に失敗した構造は 3 帯 × 64 段を `'white'` で埋め `console.error` に記録する(6.7)。effect で `Projected` の器を 2 個(軸線の両端)、`ProjectedCloud`・バケットの計数用 `Uint32Array(576 + 1)`・添字用 `Uint32Array(length)` を持ち、購読のコールバックで点群の長さが変わったときだけ作り直す(7.6)。`render` は `view` の 0 判定(8.4)の後、背景 → 軸線(`projectPoint` に器を渡す)→ 点の順。点は `projectPoints` で一括投影し、`depth` を `[−√3, √3]` で正規化して帯、`C` から段、`S` からバケットの `key` を求めて counting sort で添字を並べ、`key` 昇順にバケットごとに `fillStyle` を 1 回設定して `fillRect(sx, sy, size, size)`(奥・中 1 px、手前 2 px)を打つ。`globalAlpha` は不透明度を文字列に焼き込んであるため点の描画では触らず、終わりに 1 へ戻す(7.5)。地形の位相は `floor((elapsedMs mod TERRAIN_CYCLE_MS) / TERRAIN_CYCLE_MS × TERRAIN_PHASES)`(6.8)。`arc`・ハロー・奥行きソート・`W`・`--color-accent-scatter` の参照を消す。旧形式の payload は `s`・`c` を `?? 0` で読む(4.3。`main.ScatterPoint` の型は再生成後に `s`・`c` を持つが、実行時の欠落に備える)
    _Requirements: 4.3, 5.6, 6.1, 6.5, 6.7, 6.8, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 8.1, 8.2, 8.4, 9.4, 9.6_
    _Boundary: Scatter3DPanel(描画)_
    _Depends: 1.2, 2.1, 2.2_
    _Interfaces: Consumes `projectPoint(…, out)`・`projectPoints`・`createProjectedCloud`(2.1)、`palette.ts` の定数と関数(2.2)、7 トークン(2.2)、`main.ScatterPoint.s`・`.c`(1.1 のバインディング)、既存 `readToken`・`recordFrame`・`subscribeScatter`・`loadSnapshot`・`createOrbit`/`advanceOrbit`・`AXIS_SEGMENTS`_
    - 対象ファイル: `frontend/src/components/Scatter3DPanel.tsx`(変更)
    - 仕様参照: spec.md §5.2 `Scatter3DPanel`, §6.4 点の描画規則, §6.5 パレットと退避, §8 点数と描画方法, Requirement 4.3・6.5・6.7・6.8・7・8
    - 検証コマンド: `wails build` / `(cd frontend && npx tsc --noEmit)` / `(cd frontend && npm run lint)` が終了コード 0 / (7.1)`grep -c "ctx.arc(" frontend/src/components/Scatter3DPanel.tsx` が 0 かつ `grep -c "fillRect(" frontend/src/components/Scatter3DPanel.tsx` が 2(背景 1 + 点 1) / (7.2・9.6)点のループで `fillStyle =` の代入がバケットの外側のループに 1 箇所だけあり、点ごとの内側のループに無い(行の目視。`grep -n "fillStyle" frontend/src/components/Scatter3DPanel.tsx`) / (7.3)`grep -nE "BAND_ALPHA|DEPTH_BANDS|PALETTE_STEPS" frontend/src/components/Scatter3DPanel.tsx` が各 1 件以上で、点の大きさが帯の添字で 1 か 2 に決まる式が 1 箇所 / (7.4)`grep -nE "\.sort\(" frontend/src/components/Scatter3DPanel.tsx` が 0 件 / (7.5)軸線の描画呼び出しが点の描画より前にある(行番号の比較)かつ `grep -c "globalAlpha = 1" frontend/src/components/Scatter3DPanel.tsx` が 1 以上 / (7.6)`createProjectedCloud(`・`new Uint32Array(` の呼び出しが購読のコールバック(または長さ比較の分岐)の中にだけあり `render` の本体に無い(`grep -n "createProjectedCloud(\|new Uint32Array(" frontend/src/components/Scatter3DPanel.tsx` の行番号が `render` の範囲外) / (7.7・9.4)`render` の本体に `new`・配列リテラル・オブジェクトリテラル・`=>`・テンプレート文字列・文字列連結が無い(コードの検査。`projectPoint` の戻り値の代入も無い) / (5.6)`grep -c "sx: 0, sy: 0, scale: 0, depth: 0" frontend/src/components/Scatter3DPanel.tsx`(または同等の器の初期化)が 2 で、いずれも effect の中・`render` の外 / (6.5)`buildRamp(`・`rotateHue(` の呼び出しが effect の中で `render` の外にあり、`render` の本体に無い / (6.7)`grep -n "'white'" frontend/src/components/Scatter3DPanel.tsx` が 1 件以上で `console.error` と同じ分岐にある / (6.8)`TERRAIN_CYCLE_MS`・`TERRAIN_PHASES` を使う位相の式が 1 箇所 / (4.3)`grep -nE "\.s \?\? 0|\.c \?\? 0" frontend/src/components/Scatter3DPanel.tsx` が各 1 件以上 / (6.1・8.2)`grep -n "accent-scatter" frontend/src/components/Scatter3DPanel.tsx` が 0 件、`grep -c "\-\-color-scatter-" frontend/src/components/Scatter3DPanel.tsx` が 7、Global Constraints の色の直値の静的検査 / (8.1)`git diff --name-only main...HEAD -- frontend/src/lib/orbit.ts frontend/src/lib/axes.ts frontend/src/lib/feed.ts frontend/src/lib/framestats.ts` が 0 件 / (8.4)`view` の 0 判定が `render` の先頭に残っている
  - [ ] 3.2 統合後の全体検証。Global Constraints の順で `npm ci` → `wails build` → `go vet` → `go test` → `npm test` → `npm run lint` を通し、`W` の残骸(`.w`・`W`)が `frontend/src`・`*.go` に無いことを確かめる。人間の回答で spec を編集せず吸収した 3 件((a)〜(c))と 4.3・6.5・7.6・7.7 の検証結果を Implementation Notes に書く
    _Requirements: 4.2, 8.1, 8.2, 8.3, 9.2_
    _Boundary: Verification(静的)_
    _Depends: 3.1_
    _Interfaces: なし(検証のみ)_
    - 対象ファイル: `docs/specs/002-visual-refinement/003-scatter3d-pointcloud/tasks.md`(変更。`## Implementation Notes` のみ)
    - 仕様参照: spec.md Requirement 8・9.2, §3 前提 6
    - 検証コマンド: `(cd frontend && npm ci) && wails build && go vet ./... && go test ./... && (cd frontend && npm test) && (cd frontend && npm run lint)` がこの順で実行され、すべて終了コード 0 / `grep -rnE "\.w\b" frontend/src --include='*.ts' --include='*.tsx'` が 0 件かつ `grep -n "\.W\b" *.go` が 0 件 / `git diff --name-only main...HEAD` に `frontend/dist`・`frontend/wailsjs` が無い
- [ ] 4. 最終検証(計測・目視)
  - [ ] 4.1 人間(中継役)がホストで行う目視(Requirement 10.1〜10.7)と p95 の計測(9.1・9.7)の手順・合格条件を `## Implementation Notes` に整理する。着手時の計測は「未取得。中継役が渡す」と明記して残し、完了時の計測と合わせて記録する欄を置く。p95 が 20 ms 以上、または max が 50 ms を超えた場合の削る順(spec.md §8: 点数 → 帯 → 位相数。いずれも人間の判断と spec の更新を要する)を記す。実行環境で確認できたものは結果を、できなかったものは未検証項目として残す(unit #2 の Implementation Notes と同じ形式)
    _Requirements: 9.1, 9.7, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7_
    _Boundary: Verification(人間)_
    _Depends: 3.2_
    _Interfaces: Consumes `build/bin` の配布ビルドと `window.nullops.enableFrameStats()`(既存の計測器。本 unit で変えない)_
    - 対象ファイル: `docs/specs/002-visual-refinement/003-scatter3d-pointcloud/tasks.md`(変更。`## Implementation Notes` のみ)
    - 仕様参照: spec.md Requirement 9.1・9.7・10, §3 前提 2〜5・8, §8 削る順, `docs/specs/001-dashboard-mvp/005-framestats-runtime/tasks.md` B 節, `docs/specs/002-visual-refinement/002-scatter3d-controls/tasks.md` Implementation Notes
    - 検証コマンド: `wails build -devtools` が終了コード 0(ビルドまで。計測と目視は中継役) / Implementation Notes に「着手時(未取得。中継役が渡す)」「完了時」の 2 欄と 10.1〜10.7 の手順があること

## Implementation Notes

### 進捗台帳

(サブタスクの完了ごとに追記する)

- 1.1 完了(2026-09-06): `scatterpoint.go` を `S`・`C` の契約へ置き換え(`newScatterPoint(x, y, z, s, c)`、丸めを生成関数に寄せ、`errScatterPointUnknownStructure` を追加)。検証: `wails build` 0 / `go vet ./...` 0 / `go test ./...` 0 / `go test -run TestNewScatterPoint` 5 件 PASS / `grep 'json:"w"' *.go` 0 件 / `grep -c 'json:"[xyzsc]"' scatterpoint.go` = 5 / `grep '\.W\b' *.go` 0 件 / `errors.Is` 3 分岐(2.3〜2.5)。`wails build` で `frontend/wailsjs` の `main.ScatterPoint` が `s`・`c` を持つことを確認。補足: 契約変更で `Scatter3DPanel.tsx` の `point.w` が型検査に落ちるため、3.1 までの繋ぎとして `point.c` を重みに読む 1 行だけを変えた(描画の置き換えは 3.1)。丸めの前に範囲検査を置き、1.00004 のような値が丸めで 1.0 に化けて通るのを防ぐテストを足した。
- 1.2 の補足(2026-09-06): `TestScatterSourceKeepsPointsInUnitCube` を既定の `scatterPointCount`(6,000)で回すよう直した(spec 2.7「すべての点」)。繰り返しは位相 1 周ぶんの `scatterPhaseSteps`(120)にし、各点のパラメータが生成時に固定されて位相が 120 回で 1 周する以上、120 回で 1000 回連続と同じ意味になることをコードのコメントに書いた。所要: `go test -run TestScatterSourceKeepsPointsInUnitCube` 0.8 秒、`go test -race -run TestScatterSource` 2.0 秒。
- 2.1 完了(2026-09-06): `project.ts` の `projectPoint` を器渡し(第 5 引数 `out` を上書きして返す)へ置き換え、`ProjectedCloud`・`createProjectedCloud`・`projectPoints` を足した。`project.test.ts` を新設(5.1〜5.5 の 7 件)。検証: `npm test` 28 件 PASS(project.test.ts を含む)/ `npx tsc --noEmit` 0 / `npm run lint` 0 / `grep -nE "wailsjs|react|document|window"` 0 件 / `Math.cos`・`Math.sin` の出現は `projectPoint` 4 + `projectPoints` 4 の計 8(`projectPoints` の本体で 4)/ 両関数の本体に `new`・オブジェクトリテラル・`[]`・`=>` なし。補足: `Scatter3DPanel.tsx` は型検査を通す最小の追従にとどめた(軸線用の器 2 個をモジュール定数に置き、点はバッファの `projected` を使い回す)。器を effect の寿命へ移すのは 3.1(5.6)。
- 2.2 完了(2026-09-06): `palette.ts` を新設(定数 5 個・`Rgb`・`parseHex`・`rotateHue`・`buildRamp`。3 色は段 0〜31 を第 1 区間、32〜63 を第 2 区間として補間)。`palette.test.ts` を新設(6.2・6.3 を 2 色・3 色の両方、6.4、6.6、`parseHex` の受理と `null` の計 9 件)。`globals.css` の `@theme` に §6.5 の 7 トークンを追加。検証: `npm test` 37 件 PASS(palette.test.ts を含む)/ `npx tsc --noEmit` 0 / `npm run lint` 0 / `grep -nE "wailsjs|react|document|window"` 0 件 / `--color-scatter-` 7 件 / `accent-scatter` 1 件 / 色の直値の静的検査: `#` + 16 進が `frontend/src` の `.ts`・`.tsx` に 0 件(テストは `#` を連結して作る)、`rgba(` は `palette.ts` のテンプレート 1 箇所のみ。
- 3.1 完了(2026-09-06): `Scatter3DPanel.tsx` の描画を置き換えた。マウント時に `readStops`(`readToken` → `parseHex`)で 7 トークンを解決し、地形は 36 位相ぶん `rotateHue` → `buildRamp`、球・トーラスは `buildRamp` 1 回ずつで表を作る(`buildPalettes`。effect 内で 1 度だけ)。解決に失敗した構造は `fallbackRamp` が 3 帯 × 64 段を `'white'` で埋めて `console.error` に記録する。軸線の器 2 個は effect の寿命へ移し、`ProjectedCloud`・`keys`(`Uint16Array`)・`counts`(`Uint32Array(577)`)・`order`(`Uint32Array`)は `allocateBuffers` にまとめ、`frame` の長さ比較の分岐でだけ作り直す(購読は別の effect にあり、スナップショット経由の更新も同じ分岐で拾えるため、コールバックではなく `frame` 側に置いた)。`render` は `view` の 0 判定の後、背景 → 軸線 → `projectPoints` で一括投影 → counting sort → `key` 昇順にバケットごとに `fillStyle` 1 回 + `fillRect`(奥・中 1 px、手前 2 px)。`globalAlpha` は軸線の後と描画の終わりに 1 へ戻す。地形の位相はマウントからの経過時間で求める。`Plotted`・`byDepthAscending`・`arc`・ハロー・`W`・`--color-accent-scatter` の参照を消した。検証: `wails build` 0 / `npx tsc --noEmit` 0 / `npm run lint` 0 / `npm test` 37 件 PASS / `ctx.arc(` 0 件・`fillRect(` 2 件(7.1)/ `fillStyle =` は背景 1 + バケットの外側ループ 1 の計 2 箇所で点ごとのループに無い(7.2・9.6)/ `DEPTH_BANDS`・`PALETTE_STEPS` は本体で、`BAND_ALPHA` はコメントで参照し、大きさは `band === DEPTH_BANDS - 1 ? 2 : 1` の 1 箇所(7.3)/ `.sort(` 0 件(7.4)/ 軸線の `stroke()` が点の `fillRect` より前で `globalAlpha = 1` 2 件(7.5)/ `createProjectedCloud(`・`new Uint16Array(`・`new Uint32Array(` は `allocateBuffers` の中だけで `render` の外(7.6)/ `render` の本体に `new`・配列/オブジェクトリテラル・`=>`・テンプレート文字列・文字列連結なし(7.7・9.4)/ 器の初期化 `{ sx: 0, sy: 0, scale: 0, depth: 0 }` 2 件、いずれも effect の中・`render` の外(5.6)/ `buildRamp(`・`rotateHue(` は `buildPalettes` の中だけ(6.5)/ `'white'` は `fallbackRamp` の `console.error` と同じ関数(6.7)/ `TERRAIN_CYCLE_MS`・`TERRAIN_PHASES` の位相の式 1 箇所(6.8)/ `.s ?? 0`・`.c ?? 0` 各 1 件(4.3)/ `accent-scatter` 0 件・`--color-scatter-` 7 件・`#rrggbb` 0 件・`rgba(` 0 件(6.1・8.2)/ `orbit.ts`・`axes.ts`・`feed.ts`・`framestats.ts` の差分 0 件(8.1)/ `view` の 0 判定は `frame` の先頭(`render` の呼び出し前)に残る(8.4)。補足: `BAND_ALPHA` は `buildRamp` が焼き込むため `Scatter3DPanel.tsx` からは import せず(未使用 import で lint が落ちる)、コメントでの参照にとどめた。`s` は範囲外の値でも添字が溢れないよう 0〜2 に切り詰めている。
