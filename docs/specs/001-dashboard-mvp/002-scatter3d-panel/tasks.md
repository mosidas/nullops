# scatter3d-panel — 実装タスク

> 仕様の詳細は同じディレクトリの仕様文書 spec.md を参照する。
> このファイルには仕様を転記しない。

## Global Constraints

spec.md がこの作業単位の全体に掛ける制約を逐語で写す。全タスクの要件に暗黙に含まれる。

- **3D 散布図は Canvas 2D の 2 次元 API へ自前で投影して描く。WebGL と描画ライブラリを使わない。**(spec.md §3 前提 1)
- **点群の回転はフロントエンドが `requestAnimationFrame` で毎フレーム進め、Go 側は点の座標だけを低頻度で供給する。**(spec.md §3 前提 2)
- **点群の点数は固定(256 点)とし、増減させない。**(spec.md §3 前提 3)
- **キャンバスへ渡す色は `globals.css` の `@theme` トークンを実行時に解決して得る。**(spec.md §3 前提 4)
- **画面の見え方に依存する受け入れ基準は、実装するが本セッションでは検証しない。**(spec.md §3 前提 5)
- **乱数は `math/rand`(v1)を使う。**(spec.md §3 前提 6)
- **WebGL・three.js 等の描画ライブラリの導入**をしない(spec.md §2 対象外)
- **マウス操作による視点の変更・ズーム・点の選択**をしない(spec.md §2 対象外)
- **他 5 パネルの実装と 6 パネル同時稼働の最終調整**をしない(spec.md §2 対象外)
- **描画結果の自動視覚検証(ブラウザ自動化・スクリーンショット比較)**をしない(spec.md §2 対象外)
- **`main.go` の `BackgroundColour` に残るテンプレート由来の直値の是正**をしない(spec.md §2 対象外)
- 新しいデザイントークンは追加しない。点の描画色は既存の `--color-accent-scatter`、背景は `--color-surface-1` を用いる(`globals.css` の `@theme` が正本)(spec.md §6.5)
- 会話・ドキュメント・コード内コメント・PR/Issue 本文・コミットメッセージは日本語で記述する。画面に描画する擬似ログとラベルは英語にする(`CLAUDE.md` 言語規約)
- `any` を使わない。型が定まらない箇所は `unknown` で受けて絞り込む(`CLAUDE.md`)
- 再描画のたびに新しい関数・オブジェクトを作らない(`CLAUDE.md`)
- Wails が生成するバインディング(`frontend/wailsjs/`)は手で編集しない(`CLAUDE.md`)
- `frontend/dist` と `frontend/wailsjs` は `wails build` の生成物であり、リポジトリに含めない(`CLAUDE.md`)

## File Structure Plan

| ファイルパス                                  | 区分 | 責務                                                                       |
| --------------------------------------------- | ---- | -------------------------------------------------------------------------- |
| `scatterpoint.go`                             | 新規 | `ScatterPoint`・`ScatterCloud` の型定義と、不変条件を強制する `newScatterPoint` |
| `scatterpoint_test.go`                         | 新規 | `newScatterPoint` の不変条件と error 識別のテスト                            |
| `scattersource.go`                            | 新規 | `feed.Source` を満たす擬似点群生成器 `scatterSource`                          |
| `scattersource_test.go`                       | 新規 | `scatterSource` の契約・時間変化・並行安全のテスト                            |
| `snapshot.go`                                 | 変更 | `DashboardSnapshot` へ `Scatter` フィールドを足す                            |
| `app.go`                                      | 変更 | `scatterSource` を `App` に持たせ `Runner` へ登録し、`Snapshot` へ載せる       |
| `app_test.go`                                 | 変更 | `Snapshot` の点群に関する事後条件のテスト                                    |
| `frontend/src/lib/project.ts`                 | 新規 | 3 次元投影の純関数 `projectPoint` と型 `Projected`                            |
| `frontend/src/lib/feed.ts`                    | 変更 | `subscribeScatter` を足す                                                    |
| `frontend/src/components/Scatter3DPanel.tsx`  | 新規 | Canvas 2D による点群の描画・回転・寸法追随                                    |
| `frontend/src/app/page.tsx`                   | 変更 | `Scatter 3D` 枠を `pending` から `Scatter3DPanel` へ差し替える                |

削除対象は無い。

## タスク一覧

- [x] 1. Go 側の点群の契約と生成器
  - [x] 1.1 `ScatterPoint`・`ScatterCloud` の型と不変条件の強制を作る
    _Requirements: 2.1, 2.2, 2.3, 2.4_
    _Boundary: ScatterPoint_
    _Interfaces: Produces `newScatterPoint(x, y, z, w float64) (ScatterPoint, error)` / `ScatterPoint{X, Y, Z, W float64}` / `ScatterCloud{Seq uint64; Points []ScatterPoint}` / `errScatterPointOutOfRange` / `errScatterPointNotFinite`_
    - 対象ファイル: `scatterpoint.go`(新規), `scatterpoint_test.go`(新規)
    - 仕様参照: spec.md §6.1 `ScatterPoint`, §6.2 `ScatterCloud`
    - 検証コマンド: `go vet ./...`, `go test ./...`
  - [x] 1.2 `scatterSource` を作り `feed.Source` を構造的に満たす
    _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 2.5, 3.1, 3.2, 10.2, 10.3_
    _Boundary: scatterSource_
    _Depends: 1.1_
    _Interfaces: Consumes `newScatterPoint(x, y, z, w float64) (ScatterPoint, error)` / `ScatterCloud{Seq uint64; Points []ScatterPoint}` / Produces `newScatterSource(pointCount int, rnd *rand.Rand) *scatterSource` / `(*scatterSource) EventName() string` / `(*scatterSource) Interval() time.Duration` / `(*scatterSource) Next() any` / `(*scatterSource) Snapshot() ScatterCloud` / `scatterEventName = "nullops:scatter"` / `scatterInterval = 1000ms` / `scatterClusterCount = 3`_
    - 対象ファイル: `scattersource.go`(新規), `scattersource_test.go`(新規)
    - 仕様参照: spec.md §5.1 `scatterSource`, §6.4 内部状態, §7 Requirement 1・2.5・3・10.2・10.3
    - 検証コマンド: `go vet ./...`, `go test ./...`, `go test -race ./...`
  - [x] 1.3 `App` へ点群を配線し `Snapshot` に載せる
    _Requirements: 4.1, 4.2, 4.3, 4.4_
    _Boundary: App_
    _Depends: 1.2_
    _Interfaces: Consumes `newScatterSource(pointCount int, rnd *rand.Rand) *scatterSource` / `(*scatterSource) Snapshot() ScatterCloud` / Produces `DashboardSnapshot{Log []LogLine; Scatter ScatterCloud}` / イベント `nullops:scatter`(payload は `ScatterCloud` 1 個)_
    - 対象ファイル: `app.go`(変更), `snapshot.go`(変更), `app_test.go`(変更)
    - 仕様参照: spec.md §5.2 `App.Snapshot`, §5.3 送信イベント, §6.3 `DashboardSnapshot`
    - 検証コマンド: `go vet ./...`, `go test ./...`, `wails build`

- [x] 2. フロントエンドの投影と購読(Go 側の契約に依存する薄い層)
  - [x] 2.1 投影の純関数 `projectPoint` を作る
    _Requirements: 6.1, 6.2, 6.3_
    _Boundary: project_
    _Depends: 1.3_
    _Interfaces: Consumes `main.ScatterPoint`(`frontend/wailsjs/go/models.ts`。`wails build` が生成) / Produces `type Projected = { sx: number; sy: number; scale: number; depth: number }` / `projectPoint(p: main.ScatterPoint, yaw: number, pitch: number, view: { width: number; height: number }): Projected` / `SCATTER_PITCH: number`_
    - 対象ファイル: `frontend/src/lib/project.ts`(新規)
    - 仕様参照: spec.md §5.6 投影関数, §8 実現方針(透視投影 `scale = f / (f - z')`)
    - 検証コマンド: `cd frontend && npm run lint`
  - [x] 2.2 `subscribeScatter` を `feed.ts` へ足す
    _Requirements: 5.4_
    _Boundary: feed_
    _Depends: 1.3_
    _Interfaces: Consumes イベント `nullops:scatter`(payload は `main.ScatterCloud` 1 個) / Produces `subscribeScatter(onCloud: (cloud: main.ScatterCloud) => void): () => void`_
    - 対象ファイル: `frontend/src/lib/feed.ts`(変更)
    - 仕様参照: spec.md §5.4 フロントエンドの購読
    - 検証コマンド: `cd frontend && npm run lint`

- [x] 3. `Scatter3DPanel` の描画
  - [x] 3.1 パネルの骨格と、購読・スナップショットの併合を作る
    _Requirements: 5.1, 5.2, 5.3_
    _Boundary: Scatter3DPanel_
    _Depends: 2.2_
    _Interfaces: Consumes `subscribeScatter(onCloud: (cloud: main.ScatterCloud) => void): () => void` / `loadSnapshot(): Promise<main.DashboardSnapshot>` / Produces `Scatter3DPanel(): React.JSX.Element`_
    - 対象ファイル: `frontend/src/components/Scatter3DPanel.tsx`(新規)
    - 仕様参照: spec.md §5.5 `Scatter3DPanel`, §7 Requirement 5
    - 検証コマンド: `cd frontend && npm run lint`
  - [x] 3.2 キャンバスの寸法を枠と `devicePixelRatio` へ追随させる
    _Requirements: 8.1, 8.2, 8.3, 6.6_
    _Boundary: Scatter3DPanel_
    _Depends: 3.1_
    _Interfaces: Consumes `Scatter3DPanel(): React.JSX.Element`(3.1 が作った骨格)_
    - 対象ファイル: `frontend/src/components/Scatter3DPanel.tsx`(変更)
    - 仕様参照: spec.md §7 Requirement 8, 6.6
    - 検証コマンド: `cd frontend && npm run lint`
  - [x] 3.3 `requestAnimationFrame` による回転のループを作る
    _Requirements: 7.1, 7.2, 7.3, 7.4_
    _Boundary: Scatter3DPanel_
    _Depends: 3.2_
    _Interfaces: Consumes `Scatter3DPanel(): React.JSX.Element`(3.2 までの骨格と寸法追随)_
    - 対象ファイル: `frontend/src/components/Scatter3DPanel.tsx`(変更)
    - 仕様参照: spec.md §7 Requirement 7, §8 実現方針(回転の駆動)
    - 検証コマンド: `cd frontend && npm run lint`
  - [x] 3.4 点群の描画(奥行き順・大きさと不透明度・トークンの解決)を作る
    _Requirements: 6.4, 6.5, 9.1, 9.2_
    _Boundary: Scatter3DPanel_
    _Depends: 3.3, 2.1_
    _Interfaces: Consumes `projectPoint(p: main.ScatterPoint, yaw: number, pitch: number, view: { width: number; height: number }): Projected` / `type Projected = { sx: number; sy: number; scale: number; depth: number }`_
    - 対象ファイル: `frontend/src/components/Scatter3DPanel.tsx`(変更)
    - 仕様参照: spec.md §7 Requirement 6.4・6.5・9, §6.5 デザイントークン, §8 実現方針(色の解決)
    - 検証コマンド: `cd frontend && npm run lint`, `grep -rn '#[0-9a-fA-F]\{3,8\}' --include="*.ts" --include="*.tsx" frontend/src`(色の直値が無いこと)

- [x] 4. 画面への接続と検証手段の成立
  - [x] 4.1 `page.tsx` の `Scatter 3D` 枠を `Scatter3DPanel` へ差し替える
    _Requirements: 10.1_
    _Boundary: page_
    _Depends: 3.4_
    _Interfaces: Consumes `Scatter3DPanel(): React.JSX.Element`_
    - 対象ファイル: `frontend/src/app/page.tsx`(変更)
    - 仕様参照: spec.md §2 スコープ(対象), §7 Requirement 10.1
    - 検証コマンド: `go vet ./...`, `go test ./...`, `cd frontend && npm run lint`, `wails build`
  - [x] 4.2 目視でしか確かめられない受け入れ基準を、人間の再現手順つきで実装ノートへ積む
    _Requirements: 10.1_
    _Boundary: docs_
    _Depends: 4.1_
    _Interfaces: Consumes 4.1 までの実装(`wails dev` で起動できる状態)_
    - 対象ファイル: `docs/specs/001-dashboard-mvp/002-scatter3d-panel/tasks.md`(変更。`## Implementation Notes`)
    - 仕様参照: spec.md §3 前提 1・2・5, §7 Requirement 6.4・6.5・7.1・7.2・8.2・8.3・9.1
    - 検証コマンド: なし(文書のみ)

## Implementation Notes

### 進捗台帳

サブタスクとコミットの対応。次のセッションが現在地を再導出する手掛かりとして残す。

| サブタスク | コミット |
| :- | :- |
| 1.1 点群の型と不変条件の強制 | `1067605` |
| 1.2 `scatterSource` | `561ebfd` |
| 1.3 `App` への配線と `Snapshot` への搭載 | `8faa3f5` |
| 2.1 `projectPoint` | `4ba1f29` |
| 2.2 `subscribeScatter` | `35f58a4` |
| 3.1 `Scatter3DPanel` の骨格と購読 | `d189649` |
| 3.2 キャンバスの寸法の追随 | `076fd49` |
| 3.3 `requestAnimationFrame` の回転ループ | `ea66ea2` |
| 3.4 点群の描画(奥行き順・大きさと不透明度・トークンの解決) | `5854a2c` |
| 4.1 `page.tsx` の枠の差し替え | `0178ef2` |
| 4.2 未検証項目の実装ノートへの記録 | (このコミット) |

### 実行した検証

作業ツリーの根で実行し、いずれも成功した。

| コマンド | 結果 |
| :- | :- |
| `go vet ./...` | 成功 |
| `go test ./...` | 成功(`nullops` / `nullops/feed`) |
| `go test -race ./...` | 成功(受け入れ基準 1.6) |
| `cd frontend && npx tsc --noEmit` | 成功 |
| `cd frontend && npm run lint` | 成功(Biome の schema 版ずれの info 1 件のみ。既存の指摘であり本作業単位の変更ではない) |
| `wails build` | 成功 |
| `grep -rn '#[0-9a-fA-F]\{3,8\}' --include="*.ts" --include="*.tsx" frontend/src` | 該当なし(受け入れ基準 9.1) |

### 未検証項目(人間が確認すべきこと)

spec.md §3 前提 5 のとおり、画面の見え方に依存する受け入れ基準は実装したが本セッションでは検証していない。
本ホストのターミナルに macOS の画面収録権限が無く、`screencapture` が sandbox の内外いずれでも
`could not create image from display` で失敗するため、目視に相当する検証を機械で代替できない。

以下はすべて **UNVERIFIED** である。人間だけで再現できる手順を添える。

#### 共通の準備

1. 作業ツリーの根で `cd frontend && npm ci`(初回のみ)。
2. 作業ツリーの根へ戻り `wails dev` を実行する。
3. 起動したウィンドウの右下の枠(題名 `Scatter 3D`)を見る。
4. `wails dev` の実行後は `git status` を確認する。Next.js 16 が `tsconfig.json` を書き換え、
   `AGENTS.md` / `CLAUDE.md` を自動生成することがあるため、これらをコミットに混ぜない。

#### V-1: 点群が立体に見える(spec.md §3 前提 1)

- 手順: 共通の準備のあと `Scatter 3D` の枠を 30 秒ほど眺める。
- 期待: 点が 3 つ前後の塊(クラスタ)を作り、回転にともなって塊の前後関係が入れ替わって見える。
  平面に貼り付いた散らばりに見えるなら不合格。
- 不合格のときに触る箇所: `frontend/src/lib/project.ts` の `SCATTER_PITCH`(斜め上からの見下ろし角)と
  `FOCAL`(小さくするほど遠近が強調される)。

#### V-2: 回転が滑らかに継続する(spec.md §3 前提 2 / 受け入れ基準 7.1)

- 手順: 共通の準備のあと、枠を 60 秒以上続けて眺める。点群の更新は毎秒 1 回しか来ないため、
  その間隔でカクつくなら回転がイベント駆動になっている。
- 期待: 毎秒 1 回の更新とは無関係に、回転が一定の速さで途切れなく続く。1 周およそ 26 秒。
- 不合格のときに触る箇所: `frontend/src/components/Scatter3DPanel.tsx` の `YAW_RATE_RAD_PER_SEC`。

#### V-3: 奥行き順の重なりと、奥ほど小さく淡い表現(受け入れ基準 6.4・6.5)

- 手順: 枠を眺め、手前を通る点と奥を通る点が重なる瞬間を探す。
- 期待: 手前の点が奥の点の上に描かれる。奥の点ほど小さく、かつ淡い。
- 不合格のときに触る箇所: `Scatter3DPanel.tsx` の `ALPHA_FAR` / `ALPHA_NEAR` /
  `POINT_RADIUS_RATIO` / `WEIGHT_FLOOR`。

#### V-4: デザイントークンの実行時解決(受け入れ基準 9.1・9.2)

- 手順: 点の色を目視する。より確実に確かめるなら、`wails dev` が開く WebView の開発者ツールで
  コンソールに `getComputedStyle(document.documentElement).getPropertyValue('--color-accent-scatter')`
  を打ち、返る値と画面の点の色を突き合わせる。
- 期待: 点の色が `globals.css` の `--color-accent-scatter`(桃色)である。背景が
  `--color-surface-1` であり、他の 5 枠の背景と同じに見える。
- 補足: 退避先(トークンが空文字のとき)は白と透明であり、16 進の直値は `.ts` / `.tsx` に置いていない。
  退避の経路はコードを一時的に壊さないと通せないため、この経路自体は未検証である。

#### V-5: 最小化からの復帰(受け入れ基準 7.2・7.3)

- 手順: ウィンドウを最小化し、10 秒以上おいてから復帰させる。
- 期待: 回転と描画が再開する。復帰の瞬間に点群が大きく飛ばない(1 フレームぶんの回転は
  `MAX_FRAME_MS` = 100 ミリ秒相当で頭打ちになる)。

#### V-6: 枠の寸法への追随とスクロールバー(受け入れ基準 8.1・8.2・8.3)

- 手順: ウィンドウの端をつかんで、横長・縦長・十分に小さい大きさへそれぞれ変える。
- 期待: 点群がつねに枠の内側に収まる。点が滲まない(高解像度ディスプレイでの `devicePixelRatio` 追随)。
  ページ側に縦横いずれのスクロールバーも出ない。

#### V-7: 初期スナップショットの失敗経路(受け入れ基準 5.3)

- 状態: **UNVERIFIED かつ本セッションでは再現手段を用意しない。** 再現には `Snapshot` の
  バインディングを一時的に失敗させる必要があり、コードを一時的に壊す手順は取らない方針のため。
- コード上の担保: `loadSnapshot().catch(...)` が例外を伝播させず、`console.error` に留めて
  空の点群のまま描画を続ける。

### 最終検証パネル(観点別レビュー)

3 観点を read-only のレビュアーへ分けて実行した(実行時検証は呼び出し側が済ませ、レビュアーには静的読解のみを課した。
同じ作業ツリーで互いの判定材料を壊さないため)。**判定は 3 観点とも GO。blocker と major の指摘は無い。**

| 観点 | 判定 | 主な指摘 |
| :- | :- | :- |
| 仕様適合(受け入れ基準 1〜10 の網羅) | GO | minor 2 件(いずれも spec 文言側の緊張) |
| Go の正しさ・並行安全・境界値 | GO | 指摘なし |
| フロントエンドの正しさ・性能・規約準拠 | GO | minor 2 件 |

#### 対応を見送った指摘と、その理由

1. **受け入れ基準 9.1(色の直値の禁止)と 9.2(既定色への退避)の張り合い。** — 上記「仕様と実装のあいだで判断した点」1
   のとおり CSS キーワードで折衷済み。是正には承認済み spec.md の書き換えが要るため見送る。
2. **受け入れ基準 6.3 の「(常時)」の文言。** — 任意のヨーに対する「Z が大きいほど `scale` が大きい」は
   3 次元回転の性質上どの実装でも成り立たない(ヨーが 90 度のとき Z は奥行きへ寄与しない)。基準の意図は
   代表的なヨーでの単調性と読み、実装はそれを満たす。spec.md の文言の是正は承認済み文書の書き換えになるため見送る。
3. **`projectPoint` が毎フレーム戻り値のオブジェクトを作る。** — 上記「仕様と実装のあいだで判断した点」3 のとおり、
   §5.6 が戻り値の型を定めた承認済みの契約であるため変えない。出力先を引数で渡す形は契約の変更にあたる。
4. **`isScatterCloud` の payload 検査が浅い(`points` が配列であることしか見ない)。** — 既存の `subscribeLog` と
   同水準であり本作業単位での後退ではない。受け入れ基準 5.4 は `points` 配列の有無だけを求めている。
   点ごとのフィールド型の検査は範囲を超えるため見送る。
5. **`App.scatter` / `App.logs` への代入が `startup` 完了前提の安全性に依っている。** — 既存 `logs` と同じ形であり
   本作業単位が持ち込んだものではない。unit #1 からの構造であるため触らない。

### 仕様と実装のあいだで判断した点

1. **受け入れ基準 9.1 と 9.2 の張り合い。** 9.1 は `.ts` / `.tsx` への色の直値を禁じ、9.2 は
   解決に失敗したときの「既定の色文字列」への退避を求める。退避先を 16 進で書くと 9.1 に触れるため、
   CSS のキーワード(点は `white`、背景は `transparent`)を退避先に採った。検証コマンドの
   grep(16 進の直値)にも掛からない。
2. **`main.ScatterCloud` を直に型として使わない。** `wails build` が生成する `main.ScatterCloud` は
   メソッド `convertValues` を持つクラスだが、イベントの payload も `Snapshot()` の戻り値も
   素の JSON でありインスタンスではない。空の点群をリテラルで書くと `tsc` がメソッド不足で
   落ちるため、読む項目だけに絞った `Pick<main.ScatterCloud, 'seq' | 'points'>` を経由する。
   `npm run lint`(Biome)は型検査をしないため、この破れは `tsc --noEmit` で初めて見つかった。
3. **`projectPoint` はフレームごとに戻り値のオブジェクトを作る。** spec.md §5.6 が戻り値を
   `Projected` と定めており、承認済みの契約を変えないためそのままにした。CLAUDE.md の
   「再描画のたびに新しいオブジェクトを作らない」へは、投影結果を並べ替える配列と各要素の器を
   マウント時に 1 度だけ確保して使い回すことで応えている(256 点固定のため配列は伸び縮みしない)。
