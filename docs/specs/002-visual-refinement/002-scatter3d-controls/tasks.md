# scatter3d-controls — 実装タスク

> 仕様の詳細は同じディレクトリの仕様文書 spec.md を参照する。
> このファイルには仕様を転記しない。

## Global Constraints

spec.md が全タスクに掛ける制約(逐語)。

- 「2.3. システムは、`dragBy` の後のピッチをつねに -1.45 以上 1.45 以下に保たなければならない。(常時)」
- 「4.1. システムは、`AXIS_SEGMENTS` に `axis` を 3 本、`edge` を 12 本、合わせて 15 本の線分を持たなければならない。(常時)」
- 「4.2. システムは、`AXIS_SEGMENTS` のすべての端点の座標を -1 以上 1 以下に保たなければならない。(常時)」
- 「4.6. システムは、軸線の色を `--color-text-dim`(3 軸)と `--color-border`(稜線)のトークンから解決しなければならず、`.ts`・`.tsx` に色の直値を書いてはならない。(常時)」
- 「5.3. システムは、本体の半径と不透明度の式を現行(凍結 spec §7 6.5。`scale` と `W` から決め、奥ほど小さく淡い)から変えてはならない。(常時)」
- 「7.3. システムは、canvas に `touch-action: none` を与え、ドラッグがページのスクロールやテキスト選択を起こさないようにしなければならない。(常時)」
- 「8.2. システムは、凍結 spec §7 Requirement 5(購読と初期表示の併合)・6.6(描画領域の幅または高さが 0 の場合は描画しない)・7.4(アンマウントで `requestAnimationFrame` のループを停止)・Requirement 8(描画領域への追随)・Requirement 9(デザイントークンへの準拠)の振る舞いを変えてはならない。(常時)」
- 「8.3. システムは、Go 側の契約(`scatterSource`・`ScatterPoint`・`ScatterCloud`・`App.Snapshot`・送信イベント)を変えてはならない。(常時)」
- 「9.1. `wails build -devtools` のビルドを起動して `window.nullops.enableFrameStats()` で計測したとき、システムは計測対象 5 パネル(`commit`・`depgraph`・`gauge`・`scatter`・`timeseries`)の p95 をいずれも 20 ミリ秒以下に保たなければならない(手順は凍結済み `docs/specs/001-dashboard-mvp/005-framestats-runtime/tasks.md` B 節。1440×900 で計測する)。(常時)」
- 「9.2. システムは、`go vet ./...`・`go test ./...`・`cd frontend && npm run lint`・`cd frontend && npm test`・`wails build` がいずれもエラーなく終了する状態を保たなければならない。(常時)」
- 「9.3. システムは、1 フレームの円の描画を 512 回以下(256 点 × 2 層)、線分の描画を 15 本以下に保たなければならない。(常時)」
- 「9.4. システムは、`advanceOrbit`・`dragBy`・`beginDrag`・`endDrag` と毎フレームの描画の中で新しいオブジェクト・配列・関数を作ってはならない(既存の `projectPoint` の戻り値を除く。`CLAUDE.md` TypeScript 規約)。(常時)」
- 「凍結済みの文書は編集しない。」(§8)。承認後の本 unit の spec.md も編集しない
- 検証の前提: `cd frontend && npm ci` と `wails build` を 1 度通してから検証コマンドを回す(`main.go` が `go:embed all:frontend/dist` を持つため、`frontend/dist` が無い作業ツリーでは `go vet ./...`・`go test ./...` が失敗し、`frontend/wailsjs` が無ければ `npm run lint`・`npx tsc --noEmit` も前提不足で失敗する)。検証の順はつねに `npm ci` → `wails build` → `go vet` → `go test` → `npm test` → `npm run lint` とする

人間の回答(spec.md 承認時。spec.md の受け入れ基準を変えない運用上の判断)が全タスクに掛ける制約。

- 視点の状態機械(§5.2)は `lib/project.ts` を import して `SCATTER_PITCH` を取ってよい。`SCATTER_PITCH` を二重定義しない。`project.ts` の `wailsjs` 参照は `import type` だけであり、Node.js の型注釈の除去とバンドルの両方で消えるため、§5.4 の「`wailsjs` を import しない」に反しない
- p95 の閾値を判断する場面では、2026-09-06 に中継役が測った 13 回(5 パネルとも p95 = 18.0 ms)を基準にする(凍結済み記録の depgraph 19.0 ms の 1 行は用いない)
- 前提 7 の確認結果(このタスク分解の時点で一時ディレクトリにより確認済み。Node.js v24.16.0): `node --test` は `.ts` を直接実行でき、`"src/lib/**/*.test.ts"` の glob も解決する。ただし相対 import は拡張子なし(`./mod`)では `ERR_MODULE_NOT_FOUND` で失敗し、`./mod.ts` なら成功する。したがって `node --test` の実行経路に乗るファイル(状態機械・軸線の幾何・そのテスト・`project.ts`)の相対 import は `.ts` 拡張子付きで書き、`frontend/tsconfig.json` の `compilerOptions` に `"allowImportingTsExtensions": true` を足す(`noEmit: true` のため許される。`tsc --noEmit` で通過を確認済み)。`.tsx` 側の既存 import は変えない

CLAUDE.md が全タスクに掛ける制約(逐語)。

- 「会話・ドキュメント・コード内コメント・PR/Issue 本文・コミットメッセージは日本語で記述しなければならない(MUST)。」
- 「画面に描画する擬似ログとラベルは英語にする。模倣対象のツール(コンパイラ・パッケージマネージャ・CI 等)が英語で出力するため。」
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
| `frontend/src/lib/orbit.ts` | 新規 | 視点の状態機械(spec.md §5.2・§6.1)。`Orbit`・`OrbitMode`・5 定数・`createOrbit`/`advanceOrbit`/`beginDrag`/`dragBy`/`endDrag`。`SCATTER_PITCH` は `./project.ts` から取る |
| `frontend/src/lib/orbit.test.ts` | 新規 | `node --test` による状態機械の検証(Requirement 2・3・8.1 の状態機械側) |
| `frontend/src/lib/axes.ts` | 新規 | 軸線の幾何(spec.md §6.2)。`Vec3`・`Segment`・`AXIS_SEGMENTS`。実行時に生成しない定数 |
| `frontend/src/lib/axes.test.ts` | 新規 | `AXIS_SEGMENTS` の本数・種別・端点の範囲の検証(Requirement 4.1・4.2) |
| `frontend/src/lib/project.ts` | 変更 | `projectPoint` の第 1 引数の型を `Vec3` へ広げる(spec.md §5.3)。`import type { main }` を外し `./axes.ts` から `Vec3` を取る。計算・戻り値は変えない |
| `frontend/src/components/Scatter3DPanel.tsx` | 変更 | 視点を `Orbit` に置き換え、軸線 → ハロー → 本体の描画、Pointer Events とキャプチャ、`blur`、カーソルと `touch-action` |
| `frontend/package.json` | 変更 | `scripts.test` に `node --test "src/lib/**/*.test.ts"` を足す(spec.md §5.4) |
| `frontend/tsconfig.json` | 変更 | `allowImportingTsExtensions: true`(前提 7 の確認結果。Global Constraints) |
| `docs/specs/002-visual-refinement/002-scatter3d-controls/tasks.md` | 変更 | 目視・計測の手順と未検証項目を `## Implementation Notes` へ記録する |

補足(計画の根拠と、意図的に置かなかったもの):

- **`Vec3` の置き場所を `axes.ts` にし、`project.ts` がそこから型を取る**。`project.ts` に `Vec3` を置くと `axes.ts` → `project.ts` の向きになり、それでも動くが「幾何(データ)→ 投影(変換)」の依存の向きが自然である。`orbit.ts` → `project.ts` → `axes.ts` は一方向で循環しない。spec.md §6.2 は `Vec3` を「§6.2 の `Vec3`」と呼ぶだけで配置を定めないため、配置はこの計画の判断であり公開契約を足さない。
- **`orbit.ts` に `SCATTER_PITCH` を再エクスポートしない**。`Scatter3DPanel` は既存どおり `project.ts` から読む。二重定義の禁止(人間の回答 4)を守る最小の形。
- **Go 側のファイルは 1 本も変えない**(8.3)。`wailsjs` の再生成も起きない(`main.go` の公開型に変更が無いため)。
- **描画の 2 層化と軸線は `Scatter3DPanel.tsx` の `render` 内で完結させ、新しい描画モジュールは切らない**。切り出すと `CanvasRenderingContext2D` を渡す関数が増えるだけで、`node --test` の対象にもならない(DOM 依存)。
- **タスク 1 と 2 は並行可能 `(P)`**。共有ファイルは `project.ts`(2 が変更)と `tsconfig.json`・`package.json`(1 が変更)で重ならない。ただし 1 の `orbit.ts` は `./project.ts` を `.ts` 拡張子で import するため、1 の完了時点で `tsconfig.json` の変更が要る。2 は 1 の後に着手すれば `tsconfig` の重複変更を避けられるので、順に進める場合は 1 → 2 とする。
- **spec.md の受け入れ基準を変えず、公開契約も足さない**。`Orbit`・5 定数・5 関数・`Vec3`・`Segment`・`AXIS_SEGMENTS`・`projectPoint` の引数型・`npm test` は spec.md §5・§6 の定義をそのまま実装する。`tsconfig.json` の 1 行はビルド設定であり契約ではない。

## タスク一覧

- [ ] 1. 視点の状態機械と `npm test` の成立
  - [ ] 1.1 `frontend/package.json` に `"test": "node --test \"src/lib/**/*.test.ts\""` を足し、`frontend/tsconfig.json` に `allowImportingTsExtensions: true` を足す。`frontend/src/lib/orbit.ts` を spec.md §5.2 の定義どおりに新設し(`SCATTER_PITCH` は `./project.ts` から import。`YAW_RATE_RAD_PER_SEC`・`MAX_FRAME_MS` は既存値を `Scatter3DPanel.tsx` から移す)、`frontend/src/lib/orbit.test.ts` を TDD で先に書く。テストの観点: 初期値(auto・yaw 0・pitch `SCATTER_PITCH`・復帰完了)/ auto でのヨーの増分が `0.24 × 秒` / `elapsedMs` の切り詰め(負 → 0・100 超 → 100・NaN → 0)/ drag 中は `advanceOrbit` がヨー・ピッチを変えない / `dragBy` の増分 `dx × 0.01`・`dy × 0.01` と `±1.45` の切り詰め(超過しても反転しない)/ `dx`・`dy` の NaN・Infinity を 0 として扱う / auto 中の `dragBy` は無視 / `endDrag` でヨーを保ち、次の `advanceOrbit` から待ち時間なしにヨーが進む / 復帰: 累計 1500 ms 未満で `endDrag` 時点の値と `SCATTER_PITCH` の間(両端含む)にあり単調に近づく、1500 ms 到達でちょうど `SCATTER_PITCH`、ease-out(3 次)の 1 点を数値で照合 / 復帰途中の `beginDrag` はその時点のピッチで止まる / auto 中の `endDrag` は何もしない(冪等)/ 全関数が引数の `orbit` と同一の参照を保つ(戻り値なし・その場で更新)。`orbit.ts` の関数はオブジェクト・配列・関数を作らない
    _Requirements: 1.3, 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 8.1, 9.2, 9.4_
    _Boundary: Orbit_
    _Interfaces: Produces `export type OrbitMode`, `export type Orbit`, `export const YAW_RATE_RAD_PER_SEC | DRAG_RAD_PER_PX | PITCH_LIMIT | RETURN_MS | MAX_FRAME_MS`, `export function createOrbit(): Orbit`, `advanceOrbit(orbit, elapsedMs): void`, `beginDrag(orbit): void`, `dragBy(orbit, dxPx, dyPx): void`, `endDrag(orbit): void` / Consumes `SCATTER_PITCH`(`./project.ts`)/ Produces `npm test`(spec.md §5.4)_
    - 対象ファイル: `frontend/src/lib/orbit.ts`(新規), `frontend/src/lib/orbit.test.ts`(新規), `frontend/package.json`(変更), `frontend/tsconfig.json`(変更)
    - 仕様参照: spec.md §5.2 視点の状態機械, §5.4 テストの実行コマンド, §6.1 `Orbit`, §3 前提 2・3・7, Requirement 2・3
    - 検証コマンド: `(cd frontend && npm test)` が終了コード 0 で全テスト成功 / `(cd frontend && npm run lint)` / `(cd frontend && npx tsc --noEmit)` が終了コード 0 / `grep -nE "wailsjs|react|document|window" frontend/src/lib/orbit.ts frontend/src/lib/orbit.test.ts` が 0 件(§5.4 事前条件) / `grep -cE "SCATTER_PITCH\s*=" frontend/src/lib/orbit.ts` が 0(二重定義なし)かつ `grep -n "from './project.ts'" frontend/src/lib/orbit.ts` が 1 件 / `grep -nE "\bnew\b|=>|\[\]|\{\s*\}" frontend/src/lib/orbit.ts` の該当が関数本体に無いこと(9.4 の静的側。型注釈・`createOrbit` の戻り値は除く) / 前提 7 が成立しない事象(`npm test` が import 解決以外の理由で失敗する)が出たら `_Blocked:` を立てて停止する
- [ ] 2. (P) 軸線の幾何と `projectPoint` の引数型の拡張
  - [ ] 2.1 `frontend/src/lib/axes.ts` に spec.md §6.2 の `Vec3`・`Segment`・`AXIS_SEGMENTS`(`axis` 3 本・`edge` 12 本、モジュール定数、`readonly`)を新設し、`frontend/src/lib/axes.test.ts` で本数・種別の内訳・全端点が `[-1, 1]`・`axis` の 3 本が §6.2 の端点・`edge` の端点が ±1 の組・15 本に重複が無いことを検証する。`project.ts` の `projectPoint` の第 1 引数の型を `Vec3`(`./axes.ts` から `import type`)へ広げ、`import type { main }` を外す。計算・戻り値・`SCATTER_PITCH`・`FOCAL`・`FILL` は変えない
    _Requirements: 4.1, 4.2, 5.3, 8.2, 9.2_
    _Boundary: Axes / project_
    _Interfaces: Produces `export type Vec3`, `export type Segment`, `export const AXIS_SEGMENTS: readonly Segment[]`(長さ 15)/ Changes `projectPoint(p: Vec3, yaw, pitch, view): Projected`(既存の `ScatterPoint` の呼び出しは互換)_
    - 対象ファイル: `frontend/src/lib/axes.ts`(新規), `frontend/src/lib/axes.test.ts`(新規), `frontend/src/lib/project.ts`(変更)
    - 仕様参照: spec.md §5.3 軸線の投影, §6.2 軸線の幾何, §3 前提 1, 凍結 `docs/specs/001-dashboard-mvp/002-scatter3d-panel/spec.md` §5.6
    - 検証コマンド: `(cd frontend && npm test)` が終了コード 0 / `(cd frontend && npm run lint)` / `(cd frontend && npx tsc --noEmit)` が終了コード 0 / `grep -n "wailsjs" frontend/src/lib/project.ts frontend/src/lib/axes.ts` が 0 件 / `git diff main...HEAD -- frontend/src/lib/project.ts | grep -E "^[-+]" | grep -vE "^(\+\+\+|---)" | grep -vE "import|Vec3|main\.ScatterPoint|^\+\s*$|^-\s*$"` が空に近く、`FOCAL`・`FILL`・`SCATTER_PITCH` の値と `return` の式の行に変更が無いこと(5.3・8.2) / `git diff --name-only main...HEAD -- '*.go'` が 0 件(8.3)
- [ ] 3. `Scatter3DPanel` への統合
  - [ ] 3.1 描画の統合。`Scatter3DPanel.tsx` のヨー変数・`YAW_RATE_RAD_PER_SEC`・`MAX_FRAME_MS` を消し、`createOrbit()` を effect 内で 1 度作って毎フレーム `advanceOrbit(orbit, nowMs - prevMs)` を呼び、`orbit.yaw`・`orbit.pitch` で投影する(`SCATTER_PITCH` の直接使用は `render` から消える)。`render` は `view` の 0 判定の後、背景 → 軸線(`AXIS_SEGMENTS` 15 本を `projectPoint` で投影し、線幅 1、色は `--color-text-dim`(axis)/`--color-border`(edge) をマウント時に `readToken` で解決、不透明度は両端 `depth` の平均を `[-√3, √3]` で正規化した `n` に対し `0.25 + 0.65 × n`)→ 点(点ごとにハロー(半径 `2.2 × r`・不透明度 `0.22 × α`)→ 本体、`depth` 昇順)の順に描き、終わりに `globalAlpha = 1` に戻す。点群が空でも軸線は描く。毎フレームの割り当てを増やさない(線分の端点はモジュール定数をそのまま渡す。色は `PanelColors` に 2 項目を足す)
    _Requirements: 1.3, 3.8, 4.3, 4.4, 4.5, 4.6, 4.7, 5.1, 5.2, 5.3, 5.4, 5.5, 8.1, 8.2, 8.4, 8.5, 9.3, 9.4_
    _Boundary: Scatter3DPanel(描画)_
    _Depends: 1.1, 2.1_
    _Interfaces: Consumes `createOrbit`/`advanceOrbit`/`Orbit`(1.1), `AXIS_SEGMENTS`/`Segment`(2.1), `projectPoint(Vec3, …)`(2.1), 既存 `readToken`・`recordFrame`・`subscribeScatter`・`loadSnapshot`_
    - 対象ファイル: `frontend/src/components/Scatter3DPanel.tsx`(変更)
    - 仕様参照: spec.md §5.1 事後条件, §5.3, §6.2 描画の規則, §6.3 点の描画規則, §8 軸線の描画順・ハローの実装・色, Requirement 4・5・8
    - 検証コマンド: `(cd frontend && npm run lint)` / `(cd frontend && npx tsc --noEmit)` が終了コード 0 / `grep -nE "#[0-9a-fA-F]{3,8}|rgba?\(" frontend/src/components/Scatter3DPanel.tsx frontend/src/lib/axes.ts` が 0 件(4.6) / `grep -n "YAW_RATE_RAD_PER_SEC\|MAX_FRAME_MS" frontend/src/components/Scatter3DPanel.tsx` が 0 件(定数は `orbit.ts` へ移った) / `grep -c "ctx.arc(" frontend/src/components/Scatter3DPanel.tsx` が 2 以下かつ点のループが 1 つ(9.3: 1 点あたり 2 回、線分は `AXIS_SEGMENTS` の走査 1 つ) / `grep -n "--color-text-dim\|--color-border\|--color-accent-scatter" frontend/src/components/Scatter3DPanel.tsx` が各 1 件 / `grep -nE "globalAlpha = 1" frontend/src/components/Scatter3DPanel.tsx` が 1 件以上(5.5) / 軸線の描画呼び出しが点の描画より前にあること(行番号の比較。4.5) / `render` の関数本体に `new`・配列リテラル・オブジェクトリテラル(`projectPoint` の戻り値の代入を除く)が増えていないこと(9.4)
  - [ ] 3.2 ポインタ操作。canvas の `className` に `touch-none` と `cursor-grab`(auto)/ `cursor-grabbing`(drag)を持たせ(カーソルは `orbit.mode` を読んで `canvas.style.cursor` またはクラス切り替えで反映。React の再描画を起こさない)、effect で `pointerdown`(`button === 0` かつ `isPrimary` のみ。`beginDrag` → `setPointerCapture(pointerId)`。例外は捕捉して `endDrag`)・`pointermove`(drag 中のみ前回位置との差を `dragBy` へ。前回位置は ref/クロージャの数値 2 つで持つ)・`pointerup`・`pointercancel`・`lostpointercapture`・`window` の `blur`(いずれも `endDrag`)を登録し、クリーンアップで全部解除する。リスナー関数は effect 内で 1 度だけ作る
    _Requirements: 1.1, 1.2, 1.4, 1.5, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 7.1, 7.2, 7.3_
    _Boundary: Scatter3DPanel(入力)_
    _Depends: 3.1_
    _Interfaces: Consumes `beginDrag`/`dragBy`/`endDrag`/`Orbit.mode`(1.1)_
    - 対象ファイル: `frontend/src/components/Scatter3DPanel.tsx`(変更)
    - 仕様参照: spec.md §5.1 事後条件・エラー, §3 前提 6・8, §8 Pointer Events とキャプチャ, Requirement 1・6・7
    - 検証コマンド: `(cd frontend && npm run lint)` / `(cd frontend && npx tsc --noEmit)` が終了コード 0 / `grep -nE "touch-none|cursor-grab" frontend/src/components/Scatter3DPanel.tsx` が 1 件以上(7.3・7.1) / `grep -c "addEventListener" frontend/src/components/Scatter3DPanel.tsx` と `grep -c "removeEventListener" frontend/src/components/Scatter3DPanel.tsx` が等しい(6.6) / `grep -nE "pointerdown|pointermove|pointerup|pointercancel|lostpointercapture|'blur'" frontend/src/components/Scatter3DPanel.tsx` に 6 種すべてが現れる / `grep -n "setPointerCapture" frontend/src/components/Scatter3DPanel.tsx` が `try` の内側にある(6.5) / `grep -nE "button === 0|isPrimary" frontend/src/components/Scatter3DPanel.tsx` が各 1 件以上(1.4) / `grep -nE "mousedown|mousemove|mouseup" frontend/src/components/Scatter3DPanel.tsx` が 0 件 / `wails build` が終了コード 0
- [ ] 4. 最終検証(静的検査・目視・計測)
  - [ ] 4.1 検証コマンドを Global Constraints の順で全部通し、人間が行う目視(Requirement 10.1〜10.8)と p95 の計測(9.1)の手順・合格条件を `## Implementation Notes` に整理する。実行環境で確認できたものは結果を、できなかったものは未検証項目として残す(前 unit `001-dashboard-layout` の Implementation Notes と同じ形式)。p95 の判断基準は Global Constraints の「13 回 18.0 ms」を用い、超えた場合の削る候補(ハロー → 稜線)を spec.md §8 のとおり記す
    _Requirements: 8.3, 9.1, 9.2, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8_
    _Boundary: Verification_
    _Depends: 3.2_
    _Interfaces: Consumes `build/bin` の配布ビルドと `window.nullops.enableFrameStats()`(既存の計測器。本 unit で変えない)_
    - 対象ファイル: `docs/specs/002-visual-refinement/002-scatter3d-controls/tasks.md`(変更。`## Implementation Notes` のみ)
    - 仕様参照: spec.md Requirement 9・10, §3 前提 5, `docs/specs/001-dashboard-mvp/005-framestats-runtime/tasks.md` B 節, `docs/specs/002-visual-refinement/001-dashboard-layout/tasks.md` Implementation Notes
    - 検証コマンド: `(cd frontend && npm ci) && wails build && go vet ./... && go test ./... && (cd frontend && npm test) && (cd frontend && npm run lint)` がこの順で実行され、すべて終了コード 0(Global Constraints の検証の前提) / `git diff --name-only main...HEAD -- '*.go' frontend/src/lib/framestats.ts frontend/src/lib/feed.ts` が 0 件(8.3・§2 対象外) / `wails build -devtools` のビルドで B 節の手順により p95 を計測し、5 パネルとも 20 ms 以下であることを記録(実行できない環境では未検証項目として手順を残す)
