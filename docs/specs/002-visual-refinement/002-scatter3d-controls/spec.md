# scatter3d-controls — 仕様

## 1. 目的と背景

roadmap `002-visual-refinement` の unit #2。3D 散布図は roadmap `001-dashboard-mvp` の unit `scatter3d-panel` で Canvas 2D への自前投影として動き、unit `dashboard-layout` で画面中央の最も大きい枠(1440×900 でおよそ 589×661 px)を占めるようになった。しかし枠の中には点しか無く、立方体のどこに点があるのかを示す軸線が無い。視点はヨーの自動回転とピッチの固定値だけで、操作する口が無い。点は一様な円である(request.md §2.2。現行コードで確認)。

本 unit は、(1) 軸線を描いて点群の置かれた空間を見せ、(2) ポインタのドラッグでヨーとピッチを変えられるようにし、(3) ドラッグを終えたら自動回転へ戻して放置した画面が動き続ける性格を保ち、(4) 点の形を見直す。操作の方式(ドラッグで回転、終えたら自動回転へ復帰。ズームは入れない)は承認済みである(request.md §5 決定 4)。

要求の本体は `docs/specs/002-visual-refinement/request.md`(§番号で参照)、unit の範囲と完了条件は `docs/specs/002-visual-refinement/roadmap.md` §1・§1.1 にある。凍結済みの `docs/specs/001-dashboard-mvp/002-scatter3d-panel/spec.md`(以下「凍結 spec」)が定めた契約のうち、本書が置き換えるものは §4 と §8 に明記する。

## 2. スコープ

### 対象(やること)

- 視点(ヨー・ピッチ)の状態機械を、描画コンポーネントから切り出した純粋なモジュールとして定める(§5.2・§6.1)。自動回転・ドラッグ中の追従・ドラッグ終了後の復帰をここに集約する
- `Scatter3DPanel` にポインタ操作(ドラッグ)を足し、視点の状態機械へ操作量を渡す(§5.1)
- 軸線(原点を通る 3 軸と、モデル座標の単位立方体の稜線)を点群の背後に描く(§5.3・§6.2)
- 点の形を「本体の円 + 半透明のハロー」の 2 層へ変える(§6.3)
- 視点の状態機械を検証する TypeScript のテストと、その実行コマンド(§5.4)
- 配布ビルドの目視と、`wails build -devtools` のビルドでの p95 の計測(Requirement 9・10)

### 対象外(やらないこと)

- ホイール(スクロール)によるズーム — 理由: 投影に距離の概念を導入する変更になり、承認済みの決定(request.md §4・§5 決定 4)がこれを除く
- 「一度操作したら自動回転を止める」方式 — 理由: 承認済みの決定(request.md §5 決定 4)。放置した画面が動き続ける性格を保つ
- 3D 散布図以外のパネルへの操作の追加 — 理由: request.md §4
- 擬似点群の生成方式(`scattersource.go`・`ScatterPoint`・`ScatterCloud`)の変更 — 理由: request.md §4。Go 側は本 unit で変更しない
- 点の選択・ツールチップ・ラベル(軸名や目盛の文字) — 理由: 画面に載せる文字を増やすと擬似データの「値」を読ませることになり、眺める画面としての性格から外れる。軸線は空間の枠を示すだけに留める
- 慣性(ドラッグを離した後に回転が減衰しながら続く挙動) — 理由: 状態(角速度)が 1 つ増え、自動回転への復帰との合成が要る割に、放置画面としての見え方は変わらない(§3 前提 3)
- キーボード・タッチ固有のジェスチャ — 理由: 対象は macOS のポインタ(マウス・トラックパッド)である(request.md §4)。Pointer Events で受けるためタッチでも動くが、確認しない
- 計測器(`frontend/src/lib/framestats.ts`)の改修 — 理由: roadmap §3
- Windows・Linux での確認 — 理由: request.md §4
- 描画の自動視覚検証 — 理由: roadmap §3。判定は人間の目視で行う

## 3. 前提(未検証の賭け)

1. **軸線は「原点を通る 3 軸の全線(-1〜1)」と「単位立方体の 12 本の稜線」の両方を描き、奥行きは線の不透明度で表す** — 稜線が回転で体積を示し、3 軸が原点と向きを示す。格子(底面のグリッド)は線が増えて点の視認を妨げるため置かない。奥の線を淡く手前の線を濃くする既存の点の規則を線にも当てる。線と点の前後関係(点が線を隠す・線が点を隠す)は Canvas 2D では点ごとの深度比較ができないため、線を先に描いて点を上に重ねる。 — 検証方法: Requirement 4 と配布ビルドの目視 / 状態: 未検証(ユーザーの判断待ち。中継役への報告の論点 1)
2. **ドラッグの操作量と回転量の対応は 1 CSS ピクセルあたり 0.01 ラジアン(ヨー・ピッチとも)とし、ピッチは ±1.45 ラジアン(約 ±83°)で止める** — 描画領域の幅(約 589 px)を横切るドラッグでおよそ 1 周になる。真上・真下を超えさせると、超えた瞬間にヨーの回転方向が見かけ上反転して操作が混乱するため、手前で止める。 — 検証方法: Requirement 2.2・2.3・2.4 のテスト / 状態: 未検証(ユーザーの判断待ち。中継役への報告の論点 2)
3. **ドラッグを終えた瞬間にヨーの自動回転を再開し、ピッチは 1500 ミリ秒かけて既定値(`SCATTER_PITCH`)へ滑らかに戻す。ヨーはドラッグで得た角度から続きで回り、リセットしない。慣性と待ち時間は置かない** — ヨーを戻すと視点が飛ぶ。ピッチを戻さないと真横や真上から見た画のまま回り続け、既定の「斜め上から見た画」を失う。 — 検証方法: Requirement 3 のテスト / 状態: 未検証(ユーザーの判断待ち。中継役への報告の論点 3)
4. **点は「本体の円 + 半径 2.2 倍の半透明のハロー」の 2 層で描く。円を 1 点あたり 2 回描くだけで、放射グラデーションは使わない** — 参考サイト(`https://miabellaai.net/index.html`。`research.md`)は点をグローで見せている。`createRadialGradient` を 256 点ぶん毎フレーム作ると割り当てが増えるため、塗り 2 回で近似する。 — 検証方法: Requirement 5 と配布ビルドの目視、Requirement 9 の計測 / 状態: 未検証(ユーザーの判断待ち。中継役への報告の論点 4)
5. **軸線 15 本とハローの追加(1 フレームの円の描画が 256 回から 512 回へ増える)で、計測対象 5 パネルの p95 は 20 ms を超えない** — unit #1 の完了時に人間が新しい配置(3D 散布図 589×661)で計測し、5 パネルすべて p95 = 18.0 ms・mean 16.7 ms(13 回の出力で同値)だったと中継役が報告した(2026-09-06)。この値はリポジトリにも PR #34 にも記録されておらず、本書と `research.md` が報告を転記した唯一の記録である。旧配置(469×438)での実測は凍結済み `docs/specs/001-dashboard-mvp/005-framestats-runtime/tasks.md` にあり同じ値だった。いずれも rAF の周期(約 16.7 ms)に張り付いている。 — 検証方法: Requirement 9.1 / 状態: 未検証。超えた場合は roadmap §2「未確定」に従い、この unit の中で問いを立てる(削る候補はハロー → 稜線の順)
6. **ドラッグ中はポインタキャプチャで枠の外へ出ても追従を続け、ボタンを離す・`pointercancel`・ウィンドウの `blur` のいずれかでドラッグを終える** — キャプチャが無いと枠の縁で操作が途切れ、`blur` を扱わないと Cmd+Tab 等でボタンを離した通知が届かず「押したまま」の状態に取り残される。 — 検証方法: Requirement 10.6〜10.8 の目視(DOM に依存する振る舞いは `node --test` の対象外。§5.4)/ 状態: 未検証(本書で決めた。中継役への報告の論点 5)
7. **視点の状態機械のテストは Node.js 組み込みの `node --test` で走らせ、依存を足さない** — リポジトリのフロントエンドはテストランナーを持たない(`frontend/src` に `*.test.*` が無い)。実環境の Node.js は v24.16.0 で、型注釈の除去(type stripping)が既定で有効なため、TypeScript を直接実行できる。相対 import に拡張子(`.ts`)が要る場合があり、実装の最初に確かめる。テストの対象は `wailsjs` の生成物を import しない純粋なモジュール(§5.2)に限る。 — 検証方法: `cd frontend && npm test` が成功する(Requirement 9.2) / 状態: 未検証(ユーザーの判断待ち。中継役への報告の論点 6)
8. **Wails の WebView(macOS の WKWebView)で Pointer Events(`pointerdown`・`pointermove`・`pointerup`・`pointercancel`)と `setPointerCapture` が動く** — Safari 13 以降が対応しており、WKWebView は同じエンジンを使う。 — 検証方法: 配布ビルドの目視(Requirement 1) / 状態: 未検証

## 4. 用語定義

| 用語 | 定義 |
| ---- | ---- |
| ヨー(yaw) | モデル座標の Y 軸まわりの回転角(ラジアン)。自動回転で単調に増え、ドラッグの横移動で変わる。凍結 spec §4 の「時間とともに単調に増える」を「自動回転中は単調に増える」へ置き換える |
| ピッチ(pitch) | モデル座標の X 軸まわりの回転角(ラジアン)。既定値は `SCATTER_PITCH`(-0.42)。ドラッグの縦移動で変わり、ドラッグを終えると既定値へ戻る。凍結 spec §4 の「固定値」を置き換える |
| 視点(orbit) | ヨーとピッチの組と、それを進める状態機械(§6.1)。`auto`(自動回転中)と `drag`(ドラッグ中)の 2 つの mode を持つ |
| 復帰(return) | ドラッグを終えてからピッチが既定値へ戻る過程。`auto` の中の経過であり、mode ではない |
| 自動回転 | `auto` の間、ヨーが経過時間に比例して増えること。角速度は既存の 0.24 rad/s |
| 軸線 | 原点を通る 3 軸の線分(各軸 -1〜1)と、単位立方体の 12 本の稜線(§6.2)。合わせて 15 本 |
| ハロー | 点の本体の外側に描く、半径が大きく不透明度の低い円(§6.3) |
| 単位立方体 | モデル座標の各軸 -1〜1 の立方体。点は必ずこの内側にある(凍結 spec §6.1) |

プロジェクトは用語集(`docs/glossary.md`)を持たないため、上記は本書で定義し、既存コード(`SCATTER_PITCH`・`projectPoint`・`Projected`)の語彙に合わせている。

## 5. 公開インターフェース(API)

ファイルの配置は本書では定めない(dev-decompose の責務)。Go 側の契約(凍結 spec §5.1〜§5.3・§6.1〜§6.3)と `subscribeScatter`(凍結 spec §5.4)は変えない。

### 5.1. `Scatter3DPanel`(TypeScript・React コンポーネント・既存の拡張)

- **定義**: `export function Scatter3DPanel(): React.JSX.Element`(シグネチャは変えない。`'use client'` のまま)
- **入力 / 出力**: props を取らない。`Panel` の本文領域を満たす `<canvas>` を 1 枚描画する。canvas はポインタ操作を受ける要素であり、`touch-action: none` と、ポインタが `auto` の間は `grab`・`drag` の間は `grabbing` のカーソルを持つ。
- **事前条件**: 凍結 spec §5.5 と同じ(`Panel` の本文領域の内側でマウントされる)。
- **事後条件**:
  - マウント中だけ購読・`requestAnimationFrame` のループ・ポインタのリスナー・`window` の `blur` リスナーを持ち、アンマウントで全部解除する。
  - 毎フレーム、視点(§5.2)を経過時間ぶん進めてからヨー・ピッチを読み、軸線(§5.3)→ 点(§6.3)の順に描く。
  - 主ボタン(`button === 0`)の `pointerdown` で `beginDrag` を呼び、その pointerId をキャプチャする。以後の `pointermove` は前回位置との差(CSS ピクセル)を `dragBy` へ渡す。`pointerup`・`pointercancel`・`lostpointercapture`・`window` の `blur` のいずれかで `endDrag` を呼ぶ。ドラッグ中で無いときの `pointermove` は無視する。
  - 主ボタン以外の `pointerdown`、および `isPrimary` が false のポインタは無視する(2 本目の指・右ボタンでドラッグを始めない)。
- **エラー**: 2D コンテキストを取得できない場合は凍結 spec §5.5 と同じ(`console.error` に留め描画しない)。ポインタ操作は例外を投げない。`setPointerCapture` が例外を投げた場合(ポインタが既に無い等)は捕捉して `endDrag` を呼び、`auto` に戻す。

### 5.2. 視点の状態機械(TypeScript・描画コンポーネントから分離した純粋なモジュール)

擬似データの生成と描画を分けるという `CLAUDE.md` の規約に倣い、視点の遷移を描画から切り出す。DOM・React・`wailsjs` に依存しない(`node --test` で検証するため。§3 前提 7)。

- **定義**:
  ```ts
  export type OrbitMode = 'auto' | 'drag';
  export type Orbit = {
    mode: OrbitMode;
    yaw: number;         // ラジアン。上限なし(2π で正規化しない。cos/sin は周期関数のため)
    pitch: number;       // ラジアン。つねに -PITCH_LIMIT 以上 PITCH_LIMIT 以下
    returnFrom: number;  // 復帰の始点のピッチ。auto で復帰中だけ意味を持つ
    returnElapsedMs: number; // 復帰の経過時間。RETURN_MS 以上なら復帰は完了している
  };
  export const YAW_RATE_RAD_PER_SEC = 0.24;   // 自動回転の角速度(既存値を移す)
  export const DRAG_RAD_PER_PX = 0.01;         // 1 CSS ピクセルあたりの回転量
  export const PITCH_LIMIT = 1.45;             // ピッチの可動範囲(絶対値)
  export const RETURN_MS = 1500;               // ピッチが既定値へ戻る時間
  export const MAX_FRAME_MS = 100;             // 1 フレームとして扱う経過時間の上限(既存値を移す)

  export function createOrbit(): Orbit;                          // auto・yaw 0・pitch SCATTER_PITCH・復帰完了
  export function advanceOrbit(orbit: Orbit, elapsedMs: number): void;
  export function beginDrag(orbit: Orbit): void;
  export function dragBy(orbit: Orbit, dxPx: number, dyPx: number): void;
  export function endDrag(orbit: Orbit): void;
  ```
- **入力 / 出力**: 関数はすべて `orbit` を**その場で更新**し、新しいオブジェクトを返さない(毎フレーム呼ばれるため。`CLAUDE.md` TypeScript 規約)。`elapsedMs`・`dxPx`・`dyPx` は有限の数値。
- **事前条件**: `orbit` は `createOrbit` が作ったもの、またはそれを本モジュールの関数だけで更新したもの。
- **事後条件**:
  - `advanceOrbit`: `elapsedMs` を `[0, MAX_FRAME_MS]` に切り詰めてから使う(負値は 0、上限超えは `MAX_FRAME_MS`)。`auto` の間はヨーを `YAW_RATE_RAD_PER_SEC × 秒` だけ増やし、復帰が未完了なら `returnElapsedMs` を進めてピッチを `returnFrom` から `SCATTER_PITCH` へ ease-out(3 次。`1 - (1 - t)^3`、`t = returnElapsedMs / RETURN_MS`)で補間する。`t` が 1 に達したらピッチを `SCATTER_PITCH` ちょうどにする。`drag` の間はヨー・ピッチとも変えない。
  - `beginDrag`: mode を `drag` にする。ヨー・ピッチは変えない(復帰の途中なら、その時点の値で止まる)。
  - `dragBy`: `drag` の間だけ、ヨーに `dxPx × DRAG_RAD_PER_PX` を足し、ピッチに `dyPx × DRAG_RAD_PER_PX` を足してから `[-PITCH_LIMIT, PITCH_LIMIT]` に切り詰める。`auto` の間に呼ばれた場合は何もしない。
  - `endDrag`: mode を `auto` にし、`returnFrom` を現在のピッチ、`returnElapsedMs` を 0 にして復帰を始める。`auto` の間に呼ばれた場合は何もしない(冪等。`pointerup` と `lostpointercapture` が続けて届いても復帰をやり直さない)。
  - どの関数の後でも `pitch` は `[-PITCH_LIMIT, PITCH_LIMIT]` に収まり、`yaw`・`pitch` は有限値である。
- **エラー**: 返さない・投げない。`NaN`・`Infinity` の引数は 0 として扱う(画面へ NaN を出さない)。

### 5.3. 軸線の投影(TypeScript・`projectPoint` の利用)

軸線の端点は §6.2 の定数として持ち、既存の `projectPoint`(凍結 spec §5.6)で毎フレーム投影する。新しい投影関数は足さない。

- **定義**: 第 1 引数の型を `main.ScatterPoint` から `{ x: number; y: number; z: number }`(§6.2 の `Vec3`)へ広げる。`projectPoint` は `w` を読まないため既存の呼び出し(`ScatterPoint` を渡す)は互換であり、戻り値・事前条件・事後条件(純関数・`scale` は正の有限値)は凍結 spec §5.6 のまま変えない。線分の両端(`Vec3`)をそのまま渡し、毎フレーム新しいオブジェクトを作らない(Requirement 9.4)。
- **事後条件(利用側の規則)**: 1 本の線分の不透明度は両端の `depth` の平均から決め、奥の線ほど淡くする(§6.2)。軸線は点より先に描く。

### 5.4. テストの実行コマンド(`frontend/package.json` の `scripts`)

- **定義**: `npm test` → `node --test "src/lib/**/*.test.ts"`(`frontend/` で実行)
- **事前条件**: Node.js が TypeScript の型注釈を剥がして実行できる版であること(§3 前提 7)。テストとその対象が `wailsjs`・DOM・React を import しないこと。
- **事後条件**: 終了コード 0 で全テストが成功する。
- **エラー**: テストの失敗は終了コード 1 で表す。

## 6. データ構造

### 6.1. `Orbit`(TypeScript・§5.2)

- **不変条件**: `pitch ∈ [-PITCH_LIMIT, PITCH_LIMIT]`、`yaw`・`pitch`・`returnFrom` は有限値、`returnElapsedMs ≥ 0`。`mode === 'drag'` の間は `advanceOrbit` がヨー・ピッチを変えない。
- **強制**: `createOrbit` だけがオブジェクトを作り、§5.2 の 4 関数だけが更新する。呼び出し側(`Scatter3DPanel`)はフィールドを読むが書かない。
- **ロジックの所在**: 自動回転・切り詰め・復帰の補間・冪等性はすべて §5.2 のモジュールに集約する。`Scatter3DPanel` はイベントを操作量(ピクセル差)へ変換して渡し、フレームごとに `advanceOrbit` を呼ぶだけとする(貧血ドメインモデルを避ける)。

### 6.2. 軸線の幾何(TypeScript・定数)

```ts
export type Vec3 = { x: number; y: number; z: number };
export type Segment = { from: Vec3; to: Vec3; kind: 'axis' | 'edge' };
export const AXIS_SEGMENTS: readonly Segment[]; // 長さ 15
```

- **不変条件**: `axis` が 3 本(X・Y・Z の各軸で `(-1,0,0)→(1,0,0)`、`(0,-1,0)→(0,1,0)`、`(0,0,-1)→(0,0,1)`)、`edge` が 12 本(単位立方体の稜線。各端点の座標は ±1 の組)。すべての端点は単位立方体の内側または面上にある(`projectPoint` の事後条件「単位立方体に収まる限り有限値」に乗るため)。
- **描画の規則**: 線幅 1 CSS ピクセル。色は `axis` が `--color-text-dim`、`edge` が `--color-border`(いずれも `globals.css` の `@theme` にある既存トークン。新しいトークンは足さない)。不透明度は両端の `depth` の平均を `[-√3, √3]` で `[0, 1]` に正規化した値 `n` に対し `0.25 + 0.65 × n`(奥 0.25・手前 0.9)。
- **ロジックの所在**: 端点の投影は `projectPoint`、不透明度の算出は描画側。幾何は定数で、実行時に生成しない。

### 6.3. 点の描画規則(TypeScript・`Scatter3DPanel` の描画)

凍結 spec §7 Requirement 6.5「点の半径と不透明度を `scale` と `W` から決め、奥の点ほど小さく淡くする」を保ったまま、形を 2 層にする。

- **本体**: 現行と同じ円。半径 `r = max(baseRadius × scale × weight, MIN_POINT_RADIUS)`、不透明度 `α = (ALPHA_FAR + (ALPHA_NEAR − ALPHA_FAR) × nearness) × weight`(いずれも既存の式)。
- **ハロー**: 本体と同じ中心・同じ色の円。半径 `2.2 × r`、不透明度 `0.22 × α`。本体より先に描く(本体がハローの上に載る)。
- **順序**: 点ごとに「ハロー → 本体」を描き、点どうしは `depth` の昇順(奥から手前)を保つ(凍結 spec §7 6.4)。
- **色**: 既存の `--color-accent-scatter`。新しいトークンは足さない。
- **ロジックの所在**: 半径・不透明度の式は描画側の定数と関数に置く。`projectPoint` と `ScatterPoint` は変えない。

## 7. 振る舞い(受け入れ基準)

### Requirement 1: ドラッグによる視点の操作

**対象**: §5.1 `Scatter3DPanel` / §5.2 視点の状態機械

(1.1〜1.5 のうち DOM に依存する部分は Requirement 10.2・10.6 の目視で確かめ、状態機械の部分は Requirement 2・3 のテストで確かめる)

**受け入れ基準**:
1.1. 主ボタンによる `pointerdown` が canvas に届いたとき、システムは視点を `drag` にし、その pointerId をキャプチャしなければならない。(イベント)
1.2. `drag` の間に `pointermove` が届いたとき、システムは前回のポインタ位置との差(CSS ピクセル)を `dragBy` に渡さなければならない(反映は次の描画フレームで起きる)。(イベント)
1.3. `drag` の間、システムはヨーを自動で進めてはならない。(状態)
1.4. 主ボタン以外の `pointerdown`、または `isPrimary` が false のポインタが届いた場合、システムは視点を変えてはならない。(異常系)
1.5. `auto` の間に `pointermove` が届いた場合、システムは視点を変えてはならない。(異常系)

### Requirement 2: 操作量と回転量の対応

**対象**: §5.2 視点の状態機械 / §6.1 `Orbit`

**受け入れ基準**:
2.1. `drag` の間に `dragBy(orbit, dx, dy)` が呼ばれたとき、システムはヨーを `dx × 0.01` ラジアンだけ増やさなければならない(右へ動かすと手前の面が右へ動く)。(イベント)
2.2. `drag` の間に `dragBy(orbit, dx, dy)` が呼ばれたとき、システムはピッチを `dy × 0.01` ラジアンだけ増やさなければならない(下へ動かすと手前の面が下へ動く)。(イベント)
2.3. システムは、`dragBy` の後のピッチをつねに -1.45 以上 1.45 以下に保たなければならない。(常時)
2.4. 累計の縦移動がピッチの可動範囲を超えた場合、システムはピッチを上限または下限で止め、反転させてはならない。(異常系)
2.5. `dx`・`dy` のいずれかが NaN または無限大の場合、システムはその成分を 0 として扱い、ヨー・ピッチを有限値に保たなければならない。(異常系)

### Requirement 3: ドラッグ終了後の自動回転への復帰

**対象**: §5.2 視点の状態機械 / §6.1 `Orbit`

**受け入れ基準**:
3.1. `drag` の間に `endDrag` が呼ばれたとき、システムは視点を `auto` にし、次の `advanceOrbit` からヨーを経過時間に比例して増やさなければならない(待ち時間を置かない)。(イベント)
3.2. `endDrag` が呼ばれたとき、システムはヨーをドラッグで得た値のまま保ち、0 や以前の値へ戻してはならない。(イベント)
3.3. `endDrag` の後、`advanceOrbit` の累計経過時間が 1500 ミリ秒に達したとき、システムはピッチを `SCATTER_PITCH` ちょうどにしなければならない。(イベント)
3.4. `endDrag` の後、累計経過時間が 1500 ミリ秒未満の間、システムはピッチを `endDrag` 時点の値と `SCATTER_PITCH` の間の値(両端を含む)に保ち、時間に対して単調に `SCATTER_PITCH` へ近づけなければならない。(状態)
3.5. 復帰の途中で `beginDrag` が呼ばれたとき、システムはその時点のピッチで復帰を止め、以後のドラッグをそこから始めなければならない。(イベント)
3.6. `auto` の間に `endDrag` が呼ばれた場合、システムは視点を変えず、復帰をやり直してはならない。(異常系)
3.7. `advanceOrbit` の `elapsedMs` が 100 を超える、または負の場合、システムはそれぞれ 100・0 として扱わなければならない(復帰直後に視点が飛ぶのを防ぐ。凍結 spec §7 7.3 の規則を視点の状態機械へ移す)。(異常系)
3.8. `Scatter3DPanel` がマウントされ `auto` の間、システムはヨーを毎秒 0.24 ラジアンの割合で増やし続けなければならない(点群の更新が届かなくても止まらない。凍結 spec §7 7.1 を引き継ぐ)。(状態)

### Requirement 4: 軸線の描画

**対象**: §5.3 軸線の投影 / §6.2 軸線の幾何

**受け入れ基準**:
4.1. システムは、`AXIS_SEGMENTS` に `axis` を 3 本、`edge` を 12 本、合わせて 15 本の線分を持たなければならない。(常時)
4.2. システムは、`AXIS_SEGMENTS` のすべての端点の座標を -1 以上 1 以下に保たなければならない。(常時)
4.3. 描画のとき、システムは 15 本の線分の両端を現在のヨー・ピッチで `projectPoint` により投影し、線幅 1 CSS ピクセルで描かなければならない。(イベント)
4.4. 描画のとき、システムは線分の不透明度を両端の `depth` の平均から決め、奥の線ほど淡く(0.25)、手前の線ほど濃く(0.9)しなければならない。(イベント)
4.5. 描画のとき、システムは軸線を点より先に描き、点が軸線の上に重なるようにしなければならない。(イベント)
4.6. システムは、軸線の色を `--color-text-dim`(3 軸)と `--color-border`(稜線)のトークンから解決しなければならず、`.ts`・`.tsx` に色の直値を書いてはならない。(常時)
4.7. 点群が空(長さ 0)の間も、システムは軸線を描き続けなければならない(起動直後に枠が空白にならない)。(状態)

### Requirement 5: 点の形

**対象**: §6.3 点の描画規則

**受け入れ基準**:
5.1. 描画のとき、システムは各点について本体の円とハローの円の 2 つを、ハロー → 本体の順に描かなければならない。(イベント)
5.2. 描画のとき、システムはハローの半径を本体の 2.2 倍、不透明度を本体の 0.22 倍にしなければならない。(イベント)
5.3. システムは、本体の半径と不透明度の式を現行(凍結 spec §7 6.5。`scale` と `W` から決め、奥ほど小さく淡い)から変えてはならない。(常時)
5.4. 描画のとき、システムは点どうしを `depth` の昇順(奥から手前)に描かなければならない(凍結 spec §7 6.4 を引き継ぐ)。(イベント)
5.5. 描画の終わりに、システムは `globalAlpha` を 1 へ戻さなければならない(次のフレームの背景の塗りが半透明にならない)。(イベント)

### Requirement 6: ポインタが枠を離れたとき・フォーカスを失ったとき

**対象**: §5.1 `Scatter3DPanel`

**受け入れ基準**:
6.1. `drag` の間にポインタが canvas の外へ出たとき、システムはキャプチャにより追従を続け、`endDrag` を呼んではならない。(イベント)
6.2. `drag` の間に `pointerup` が届いたとき、システムは `endDrag` を呼ばなければならない(canvas の外で離した場合を含む)。(イベント)
6.3. `drag` の間に `pointercancel` または `lostpointercapture` が届いたとき、システムは `endDrag` を呼ばなければならない。(イベント)
6.4. `drag` の間に `window` が `blur` を受けたとき、システムは `endDrag` を呼び、フォーカスが戻った後も `auto` のままでなければならない。(イベント)
6.5. `setPointerCapture` が例外を投げた場合、システムは例外を伝播させず `endDrag` を呼んで `auto` に戻さなければならない。(異常系)
6.6. `Scatter3DPanel` がアンマウントされたとき、システムはポインタと `blur` のリスナーをすべて解除しなければならない。(イベント)

### Requirement 7: カーソルと選択の抑止

**対象**: §5.1 `Scatter3DPanel`

(検証は Requirement 10.8 の目視と、canvas のクラス名の静的な確認による)

**受け入れ基準**:
7.1. `auto` の間、システムは canvas の上でカーソルを `grab` にしなければならない。(状態)
7.2. `drag` の間、システムはカーソルを `grabbing` にしなければならない。(状態)
7.3. システムは、canvas に `touch-action: none` を与え、ドラッグがページのスクロールやテキスト選択を起こさないようにしなければならない。(常時)

### Requirement 8: 既存の振る舞いの維持

**対象**: §5.1 `Scatter3DPanel` / §5.2 視点の状態機械

**受け入れ基準**:
8.1. `Scatter3DPanel` がマウントされたとき、システムはヨー 0・ピッチ `SCATTER_PITCH`・`auto` の視点から始めなければならない(起動直後の画が現行と同じ)。(イベント)
8.2. システムは、凍結 spec §7 Requirement 5(購読と初期表示の併合)・6.6(描画領域の幅または高さが 0 の場合は描画しない)・7.4(アンマウントで `requestAnimationFrame` のループを停止)・Requirement 8(描画領域への追随)・Requirement 9(デザイントークンへの準拠)の振る舞いを変えてはならない。(常時)
8.3. システムは、Go 側の契約(`scatterSource`・`ScatterPoint`・`ScatterCloud`・`App.Snapshot`・送信イベント)を変えてはならない。(常時)
8.4. `view.width` または `view.height` が 0 の場合、システムは軸線も点も描かず、次のフレームへ進まなければならない(Requirement 4.7 の「点群が空でも軸線を描く」はこの条件より優先されない)。(異常系)
8.5. ウィンドウが最小化されて `requestAnimationFrame` が停止し、その後復帰したとき、システムは自動回転と描画を再開しなければならない(凍結 spec §7 7.2 を引き継ぐ)。(イベント)

### Requirement 9: 検証手段の成立と描画の負荷(非機能)

**対象**: §5.1 `Scatter3DPanel` / §5.4 テストの実行コマンド

**受け入れ基準**:
9.1. `wails build -devtools` のビルドを起動して `window.nullops.enableFrameStats()` で計測したとき、システムは計測対象 5 パネル(`commit`・`depgraph`・`gauge`・`scatter`・`timeseries`)の p95 をいずれも 20 ミリ秒以下に保たなければならない(手順は凍結済み `docs/specs/001-dashboard-mvp/005-framestats-runtime/tasks.md` B 節。1440×900 で計測する)。(常時)
9.2. システムは、`go vet ./...`・`go test ./...`・`cd frontend && npm run lint`・`cd frontend && npm test`・`wails build` がいずれもエラーなく終了する状態を保たなければならない。(常時)
9.3. システムは、1 フレームの円の描画を 512 回以下(256 点 × 2 層)、線分の描画を 15 本以下に保たなければならない。(常時)
9.4. システムは、`advanceOrbit`・`dragBy`・`beginDrag`・`endDrag` と毎フレームの描画の中で新しいオブジェクト・配列・関数を作ってはならない(既存の `projectPoint` の戻り値を除く。`CLAUDE.md` TypeScript 規約)。(常時)

### Requirement 10: 配布ビルドの目視(人間による承認)

**対象**: §5.1 `Scatter3DPanel`

**受け入れ基準**:
10.1. 配布ビルドを起動して放置したとき、システムは軸線の描かれた 3D 散布図を自動回転させ続けなければならない(30 秒の観察で止まらない)。(イベント)
10.2. 枠の上でポインタをドラッグしたとき、システムはヨーとピッチをポインタに追従させ、視点を変えなければならない。(イベント)
10.3. ドラッグを終えたとき、システムは自動回転を再開し、30 秒の観察で回転が止まってはならない。(イベント)
10.4. ドラッグを終えたとき、システムはピッチを 2 秒以内に既定の斜め上からの画へ戻さなければならない。(イベント)
10.5. 描画のとき、システムは各点の本体の外側に半径の大きい淡い輪(ハロー)を描き、目視でハローが見えなければならない。(イベント)
10.6. 枠の内側でドラッグを始めてポインタを枠の外へ出したとき、システムは視点をポインタに追従させ続け、枠の外でボタンを離した時点で自動回転を再開しなければならない(Requirement 6.1・6.2 の目視)。(イベント)
10.7. ドラッグ中に Cmd+Tab で別のアプリへ切り替え、ボタンを離してから戻ったとき、システムは自動回転を続けており、ポインタを動かしても視点が追従してはならない(Requirement 6.4 の目視)。(イベント)
10.8. 枠の上にポインタを置いたとき、システムはカーソルを `grab` にし、ドラッグ中は `grabbing` にしなければならない(Requirement 7 の目視)。(イベント)

## 8. 実現方針

- **視点の状態機械を純粋なモジュールに切り出す**: `projectPoint` を `lib/project.ts` に切り出した凍結 spec §5.6 と同じ流儀。DOM に依存させないのは、`node --test` で復帰の補間・切り詰め・冪等性を検証するためであり(§3 前提 7)、目視でしか確かめられない振る舞いを減らす。オブジェクトをその場で更新するのは `CLAUDE.md` の規約(再描画のたびに新しいオブジェクトを作らない)による。
- **凍結 spec からの置き換え**: 凍結 spec §4 の「ヨーは時間とともに単調に増える」「ピッチは固定値」、§5.5 の事後条件「ヨーは経過時間に比例して単調に増え」、§7 7.1・7.3 の規則を、本書の §4・§5.2・Requirement 3 で置き換える。それ以外(購読・追随・トークン・Go 側)は引き継ぐ(Requirement 8)。凍結済みの文書は編集しない。
- **Pointer Events とキャプチャ**: `mousedown`/`mousemove` ではなく Pointer Events を使うのは、`setPointerCapture` で枠の外への追従が 1 つの API で済み、マウスとトラックパッドの両方を 1 経路で受けられるため。`window` の `blur` を足すのは、アプリの切り替えで `pointerup` が届かない場合に備えるため(§3 前提 6)。
- **軸線の描画順**: 点ごとの深度比較を Canvas 2D で行うには線分を点の間で分割して並べ替える必要があり、割に合わない。線を先に描いて点を上に載せ、奥行きは線の不透明度で表す(§3 前提 1)。
- **ハローの実装**: 放射グラデーションではなく塗り 2 回で近似する(§3 前提 4)。p95 が超えた場合の削る候補はハロー → 稜線の順(§3 前提 5)。
- **色**: 既存トークン(`--color-accent-scatter`・`--color-text-dim`・`--color-border`)だけを使い、`getComputedStyle` でマウント時に 1 度だけ解決する(凍結 spec §8 と同じ)。
- **参考サイト**: `https://miabellaai.net/index.html` は WebGL の自前実装で、クリック&ドラッグで回転・クリックで自動回転の切り替え・スクロールでズーム・透明度による奥行き表現を持つ(`research.md`)。本 unit は承認済みの決定に従い、ドラッグ回転と奥行きの透明度だけを取り入れる。

## 9. 参考資料

- `docs/specs/002-visual-refinement/request.md` §2.2・§4・§5・§6
- `docs/specs/002-visual-refinement/roadmap.md` §1・§1.1・§2・§3
- `docs/specs/002-visual-refinement/002-scatter3d-controls/research.md`(参考サイトの調査)
- `docs/specs/001-dashboard-mvp/002-scatter3d-panel/spec.md`(凍結済み。置き換える契約と引き継ぐ契約)
- `docs/specs/001-dashboard-mvp/005-framestats-runtime/tasks.md` B 節(凍結済み。p95 の計測手順)
- Pointer Events(`setPointerCapture`・`pointercancel`・`lostpointercapture`): https://www.w3.org/TR/pointerevents/
- Node.js のテストランナーと型注釈の除去: https://nodejs.org/api/test.html 、 https://nodejs.org/api/typescript.html
- `CLAUDE.md`(言語規約・TypeScript コーディング規約・注意事項)
