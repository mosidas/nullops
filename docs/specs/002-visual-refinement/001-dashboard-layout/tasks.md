# dashboard-layout — 実装タスク

> 仕様の詳細は同じディレクトリの仕様文書 spec.md を参照する。
> このファイルには仕様を転記しない。

## Global Constraints

spec.md が全タスクに掛ける制約(逐語)。

- 「2.6. システムは、色をデザイントークン(`frontend/src/app/globals.css` の `@theme`)経由でのみ参照し、`DashboardGrid`・`Panel` に色の直値を書いてはならない。(常時)」
- 「4.2. システムは、§6.2 の 6 つのパネルコンポーネントのファイルと Go の生成源 5 本を本 unit の変更に含めてはならない。(常時)」
- 「5.5. システムは、ログストリームの 1 行の列構成(時刻・ツール・レベル・本文)と各列の幅、折り返しの規則を変えてはならない。(常時)」
- 「Windows・Linux での確認 — 理由: request.md §4」(§2 対象外。検証はすべて macOS で行う)
- 「凍結済み文書は編集しない。」(§8)
- 検証の前提: `cd frontend && npm ci` と `wails build` を 1 度通してから検証コマンドを回す(`node_modules`・`frontend/wailsjs`・`frontend/dist` が無い作業ツリーでは `npm run lint`・`npx tsc --noEmit`・`go test` が前提不足で失敗するため)

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
| `frontend/src/components/DashboardGrid.tsx` | 変更 | `DashboardSlot` 型・`panels` record の契約、12 列 × 8 行の格子と `grid-template-areas`。子要素数の検査と `console.error` を廃止する |
| `frontend/src/components/Panel.tsx` | 変更 | `slot` から `grid-area` を引く静的対応表。`title`・`h2`・区切り線を廃止する |
| `frontend/src/app/page.tsx` | 変更 | slot と 6 パネルの対応だけを持つ組み立て。`PANEL_TITLES`・`panelBody` を廃止する |
| `README.md` | 変更 | 「画面」節の冒頭文と表(「パネル」「位置」「内容」)の改訂 |
| `docs/specs/002-visual-refinement/001-dashboard-layout/tasks.md` | 変更 | 目視・計測の結果と未検証項目を `## Implementation Notes` へ記録する |

補足(計画の根拠と、意図的に置かなかったもの):

- **削除するファイルは無い**。廃止するのは `PanelProps.title`・`DashboardGrid` の子要素数検査・`page.tsx` の題名定数と分岐であり、いずれもファイル内の削除である。使用ゼロの確認は各タスクの grep で行う。
- **フロントエンドにテストランナーを導入しない**。既存 unit と同じく、検証は `npm run lint`(Biome)と `wails build` の型検査(`next build`)、決定論的な静的検査(grep)、および人間の目視(spec.md Requirement 7.6)で行う。
- **タスク 1 は 2 つのサブタスクに分ける**が、1.1 の完了時点では `page.tsx` が旧契約(`children`・`title`)のままで `next build` の型検査は通らない(`npm run lint` は型検査を行わないため緑)。型検査が緑になるのは 1.2 の完了時点であり、1.1 の検証にはこの中間状態を明記する。3 ファイルを 1 タスクにしないのは、契約(器と枠)と組み立て(`Home`)でレビューの焦点が異なるためである。
- **タスク 2 に `(P)` を付ける**。`README.md` だけを触り、タスク 1 と共有ファイルが無い。
- **spec.md の受け入れ基準を変えず、公開契約も足さない**。`DashboardSlot`・`DashboardGridProps`・`PanelProps` は spec.md §5 の定義をそのまま実装する。

## タスク一覧

- [x] 1. 格子と枠の契約を slot の record へ作り直す
  - [x] 1.1 `DashboardGrid` と `Panel` を spec.md §5.1・§5.2 の契約へ作り直す。`DashboardGrid` は `DashboardSlot` 型を export し、`panels: Readonly<Record<DashboardSlot, React.ReactElement>>` を受けて 12 列 × 8 行の格子(全トラック `minmax(0, 1fr)`・隙間 8 px・外周余白 8 px・`h-dvh`・`overflow-hidden`)に `grid-template-areas` で §6.1 の 6 領域を宣言し、§6.1 の「順」で 6 個の `Panel` を生成する。子要素数の検査と `console.error` を消す。`Panel` は `title` と `h2`・区切り線を消し、`slot` から `grid-area` のクラス名を静的な対応表(`Record<DashboardSlot, string>`)で引く。`section`・本文領域の `min-h-0`・内側スクロール・枠線・背景・内側余白は現行を保つ。両ファイルとも Server Component のまま(`'use client'` を付けない)。`Panel` は `DashboardGrid` から型だけを `import type` で取る(実行時の循環 import を作らない)
    _Requirements: 1.1, 1.2, 1.3, 1.6, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.2, 3.3, 3.4, 4.4, 5.1_
    _Boundary: DashboardGrid / Panel_
    _Interfaces: Produces `export type DashboardSlot = 'timeseries' | 'gauge' | 'log' | 'scatter' | 'depgraph' | 'commit'`, `export type DashboardGridProps = { panels: Readonly<Record<DashboardSlot, React.ReactElement>> }`, `export function DashboardGrid(props: DashboardGridProps): React.JSX.Element`, `export type PanelProps = { slot: DashboardSlot; children: React.ReactNode }`, `export function Panel(props: PanelProps): React.JSX.Element`_
    - 対象ファイル: `frontend/src/components/DashboardGrid.tsx`(変更), `frontend/src/components/Panel.tsx`(変更)
    - 仕様参照: spec.md §5.1 `DashboardGrid`, §5.2 `Panel`, §6.1 格子と 6 枠の配置, §8 実現方針
    - 検証コマンド: `(cd frontend && npm run lint)` / `grep -nE "h2|Children|console\.error|title" frontend/src/components/DashboardGrid.tsx frontend/src/components/Panel.tsx` が 0 件 / `grep -nE "#[0-9a-fA-F]{3,8}|rgba?\(" frontend/src/components/DashboardGrid.tsx frontend/src/components/Panel.tsx` が 0 件 / `grep -n "use client" frontend/src/components/DashboardGrid.tsx frontend/src/components/Panel.tsx` が 0 件 / `grep -oE "\b(timeseries|gauge|log|scatter|depgraph|commit)\b" frontend/src/components/Panel.tsx | sort -u | wc -l` が 6(対応表に 6 slot の鍵が重複なく揃っている)かつ `grep -oE "\[grid-area:(timeseries|gauge|log|scatter|depgraph|commit)\]" frontend/src/components/Panel.tsx | sort -u | wc -l` が 6(各鍵の値が同名の領域を指す) / この時点では `page.tsx` が旧契約のため `wails build` の型検査は通らない(1.2 で緑にする)
  - [x] 1.2 `Home` を新しい契約に合わせる。`DashboardGrid` に `panels` として §6.2 の対応で 6 つの slot すべてにパネル要素を渡し、`PANEL_TITLES` 等の見出し文字列の定数・`panelBody` の分岐・`Panel` の直接使用・配置の数値を持たない形にする。`'use client'` は付けない
    _Requirements: 3.1, 3.3, 3.5, 4.2, 7.2, 7.3, 7.4, 7.5_
    _Boundary: Home_
    _Depends: 1.1_
    _Interfaces: Consumes `DashboardGrid(props: { panels: Readonly<Record<DashboardSlot, React.ReactElement>> })`, `DashboardSlot` / Produces `build/bin` の配布ビルド(`wails build` の生成物。3.1 が目視・計測に使う)_
    - 対象ファイル: `frontend/src/app/page.tsx`(変更)
    - 仕様参照: spec.md §5.3 `Home`, §6.2 slot とパネルの対応, Requirement 3
    - 検証コマンド: `(cd frontend && npm run lint)` / `grep -nE "TITLE|panelBody|<Panel[ />]|components/Panel'|'use client'" frontend/src/app/page.tsx` が 0 件(`Panel` は `DashboardGrid` が生成するため `page.tsx` から消える。`TimeseriesPanel` 等のパネル名は残るため `Panel\b` で判定しない) / `wails build` が終了コード 0(`next build` の型検査が 3.3 の型を通す)/ `go vet ./... && go test ./...` が終了コード 0 / `git diff --name-only main...HEAD` に §6.2 の 6 パネルコンポーネントと Go の生成源 5 本(`logsource.go`・`commitsource.go`・`graphsource.go`・`scattersource.go`・`metricsource.go`)が含まれない / 3.3 の異常系: 前提として変異前に `(cd frontend && npx tsc --noEmit)` が終了コード 0・エラー 0 件であることを確認したうえで、`page.tsx` の `panels` から 1 つの slot(例: `commit`)を一時的に除き、同コマンドが終了コード 2 で失敗し、そのエラーが `src/app/page.tsx` の `panels` 引数に対する TS2741(`Property 'commit' is missing in type ...`)であること(欠けた slot 名をメッセージに含む)を確認し、元に戻す(コミットしない)。余分な鍵を足す側は `Record<DashboardSlot, ...>` に対する余剰プロパティ検査(TS2353)で同様に失敗することを 1 例だけ確認する

- [x] 2. (P) README「画面」節を改訂する
  - [x] 2.1 README「画面」節の冒頭を配置の型(中央主役型)を述べる 1 文に置き換え、表を「パネル」「位置」「内容」の 3 列・§6.1 の「順」の 6 行にし、表の下の 1 文を配置の順(上から下、同じ高さでは左から右)の趣旨に置き換える。ASCII 図は載せない。「内容」列の文は現行を保つ
    _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_
    _Boundary: README_
    _Interfaces: Consumes spec.md §6.1 の「位置」列の語と §6.2 の「パネル」列の語(文書上の対応。コードのシグネチャ共有は無い)_
    - 対象ファイル: `README.md`(変更)
    - 仕様参照: spec.md §6.3 README「画面」節の形式, §6.1 の「順」「位置」列, §6.2 の「パネル」列
    - 検証コマンド: `grep -nE "3 列 2 行|枠の題名|Log Stream|Commit Graph|Dependency Graph|Scatter 3D|Utilization|Timeseries" README.md` が 0 件 / `awk '/^## 画面/{f=1} f&&/^## /&&!/^## 画面/{exit} f' README.md` の出力で、表の 6 行の並びが「折れ線グラフ・タコメータ・ログストリーム・3D 散布図・グラフビュー・コミットグラフ」、「位置」列が「上の帯・右上・左の縦長・中央(最も大きい枠)・右の上段・右の下段」であることを照合 / `grep -nE "^\s*[+|]-+[+|]|┌|└|├" README.md` が 0 件(ASCII 図なし)

- [x] 3. 最終検証(静的検査・目視・計測)
  - [x] 3.1 静的検査を全部通し、配布ビルドと `-devtools` ビルドで人間の目視・計測に委ねる項目を `## Implementation Notes` に整理する。目視・計測は spec.md §6.1 の概算表(±4 px)、Requirement 1.4・1.5・1.6・1.7・2.5・4.1・4.3・5.2〜5.4・7.1・7.6 を対象とし(1.6 は 1440×900 と下限 1100×720 でページに縦横のスクロールバーが出ないこと、2.5 はログストリームの枠にログが溜まった状態で `section` の外へはみ出さず本文領域だけがスクロールすること)、実行環境で確認できたものは結果を、できなかったものは未検証項目として確認手順を残す(前 unit `005-framestats-runtime` の Implementation Notes と同じ形式)
    _Requirements: 1.4, 1.5, 1.6, 1.7, 2.5, 4.1, 4.3, 5.2, 5.3, 5.4, 5.5, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_
    _Boundary: Verification_
    _Depends: 1.2, 2.1_
    _Interfaces: Consumes 1.2 が生成する `build/bin` のアプリと `window.nullops.enableFrameStats()`(既存の計測器。本 unit で変えない)_
    - 対象ファイル: `docs/specs/002-visual-refinement/001-dashboard-layout/tasks.md`(変更。`## Implementation Notes` のみ)
    - 仕様参照: spec.md §6.1 概算表, §6.4, Requirement 1・4・5・7, `docs/specs/001-dashboard-mvp/005-framestats-runtime/tasks.md` B 節
    - 検証コマンド: `(cd frontend && npm ci) && wails build && go vet ./... && go test ./... && (cd frontend && npm run lint)` がこの順で実行され、すべて終了コード 0(`npm ci` → `wails build` を先に置くのは Global Constraints の検証の前提のとおり、`frontend/wailsjs`・`frontend/dist` を生成してから Go 側の検査と lint を回すため) / `git diff --name-only main...HEAD -- frontend/src/components/LogStreamPanel.tsx` が 0 件(5.5) / `wails build -devtools` のビルドで B 節の手順により p95 を計測し、5 パネルとも 20 ms 以下であることを記録(実行できない環境では未検証項目として手順を残す)

## Implementation Notes

### 進捗台帳

| サブタスク | 状態 | コミット |
| :-- | :-- | :-- |
| 1.1 `DashboardGrid`・`Panel` の契約 | 完了 | `7b33314` |
| 1.2 `Home` の組み立て | 完了 | `0fca46e`(検証の反映 `ddadc32`) |
| 2.1 README「画面」節 | 完了 | `5cf7080` |
| 3.1 静的検査と本節の整理 | 完了(目視・計測は人間へ委ねる) | 本節を含むコミット |

### 本セッションで実行した検証コマンドと結果(3.1)

tasks.md 3.1 の検証コマンドの順で実行した(2026-09-06、macOS)。

| コマンド | 結果 |
| :-- | :-- |
| `cd frontend && npm ci` | 終了コード 0 |
| `wails build` | 終了コード 0(`build/bin/nullops.app` を生成。`next build` の型検査を通過) |
| `go vet ./...` | 終了コード 0 |
| `go test ./...` | `ok nullops` / `ok nullops/feed` |
| `cd frontend && npm run lint` | `Checked 22 files. No fixes applied.` |
| `cd frontend && npx tsc --noEmit` | 終了コード 0 |
| `git diff --name-only main...HEAD` に §6.2 の 6 パネルと Go 生成源 5 本が含まれないこと | 0 件(要件 4.2・5.5) |
| `grep -o "<h2" frontend/dist/index.html \| wc -l` | 0(要件 1.3・4.4 の静的側。配布ビルドの HTML に見出しが無い) |
| README の順・位置の照合(2.1 の検証コマンド) | 6 行の並びと「位置」列が spec §6.1 と一致。ASCII 図 0 件(要件 6.1〜6.5) |

コマンド以外に確認した内容:

- **§6.1 の格子定義**: `DashboardGrid.tsx` は `grid-cols-12 grid-rows-8 gap-2 p-2 h-dvh overflow-hidden` で、`grid-template-areas` は上 2 行 `timeseries×10 gauge×2`、3〜5 行 `log×4 scatter×5 depgraph×3`、6〜8 行 `log×4 scatter×5 commit×3`(96 セルを余さず埋め、`scatter` 30 セル > `depgraph` 9 セル)。DOM 順は `timeseries, gauge, log, scatter, depgraph, commit`。
- **`Panel` の対応表**: 6 slot がそれぞれ同名の `grid-area` を指し、列・行の数値を持たない(§6.1「ロジックの所在」)。
- **`grid-template-areas` の渡し方**: Tailwind の任意値クラスではなく、モジュール定数 `GRID_STYLE` を `style` prop で渡している。理由: 8 行ぶんの文字列を任意値クラスに詰めると空白のエスケープで可読性が落ち、定数なら再描画のたびに新しいオブジェクトを作らない規約も満たす。最終検証パネルの判定は下の「最終検証パネルの結果」を参照。

### 未検証項目(人間が確認すべきこと)

このセッションは画面の目視と WebView のコンソールを読めないため、次は **UNVERIFIED** のまま残し、判定を人間に委ねる。**コードを一時的に壊して確かめる手順は含めない。**

| 要件 | 内容 | 確認の手順 |
| :-- | :-- | :-- |
| 1.4 / 1.5 / 1.7 / 7.6 | 6 枠が案 D の配置で見え、大きさが §6.1 の概算表 ±4 px に収まる | 下の A の 3〜5 |
| 1.6 | 1440×900 と下限 1100×720 でページに縦横のスクロールバーが出ない | 下の A の 6 |
| 2.5 | ログが溜まってもログストリームの本文領域だけがスクロールし、`section` の外へはみ出さない | 下の A の 7 |
| 4.1 / 4.3 / 7.1 | 6 パネルとも 30 秒観察して止まるものが無く、起動後すぐ描画される | 下の A の 3 |
| 5.2〜5.4 | ログストリームの本文幅・列構成・折り返しが現行と同値(§6.4) | 下の A の 8 |
| 7.2〜7.5 | 5 パネルの p95 が 20 ms 以下 | 下の B |

### A. 配布ビルドでの目視(所要 5 分)

1. 作業ツリーのルートで `wails build` を実行し、`open build/bin/nullops.app` で起動する(既定のウィンドウは 1440×900)。
2. アプリのウィンドウを前面に出し、他のウィンドウで覆わない。
3. **30 秒観察**する。合格: 6 枠すべてが起動直後から描画され、折れ線・針・ログ・点群・グラフ・コミットグラフのいずれも 30 秒間止まらない(要件 4.1・4.3・7.1)。
4. **配置の照合**。合格: 上に横長の折れ線グラフ、その右端にタコメータ、左の縦長がログストリーム、中央の最も大きい枠が 3D 散布図、右にグラフビュー(上)とコミットグラフ(下)。見出し(`h2`)がどの枠にも無く、枠線と背景の差で境界が分かる(要件 1.3〜1.5・7.6)。README「画面」表の 6 行と 1 対 1 で対応する(要件 6.4)。
5. **大きさの照合**(要件 1.7)。`wails build -devtools` でビルドし直し、起動後に ⌘⇧F12 で Web インスペクタを開く(開き方の詳細は `docs/specs/001-dashboard-mvp/005-framestats-runtime/tasks.md` B.4)。Elements で各 `section` を選び、`getBoundingClientRect()` の幅・高さが §6.1 の概算表の 1440×900 列と ±4 px で一致すれば合格。概算表: `timeseries` 1185×215、`gauge` 231×215、`log` 469×661、`scatter` 589×661、`depgraph` 350×327、`commit` 350×327。
6. **下限サイズ**(要件 1.6)。ウィンドウを 1100×720 まで縮める(macOS では下限で止まる)。合格: ページに縦横のスクロールバーが出ず、6 枠の配置が変わらず、大きさが概算表の 1100×720 列と ±4 px で一致する(`timeseries` 902×170、`gauge` 174×170、`log` 356×526、`scatter` 447×526、`depgraph` 265×259、`commit` 265×259)。
7. **ログの内側スクロール**(要件 2.5)。1440×900 に戻し、ログストリームの枠にログが溜まるまで 1 分ほど待つ。合格: ログの本文領域だけがスクロールし、枠(`section`)の外へ文字がはみ出さず、ページ全体も動かない。
8. **本文幅**(要件 5.2〜5.4)。ログの 1 行が「時刻・ツール・レベル・本文」の 4 列で、本文が枠内で折り返す(`break-all`)。合格: Elements で本文列の幅が 1440×900 で約 227 px、1100×720 で約 114 px(§6.4 の表)。

### B. p95 の計測(所要 8 分)

`docs/specs/001-dashboard-mvp/005-framestats-runtime/tasks.md` の「B. 配布ビルドでの実測」1〜10 をそのまま実行する(`wails build -devtools` → ⌘⇧F12 → `nullops.enableFrameStats()` → 40 秒以上前面で待つ → 最後の 6 行を読む)。合格: `commit` / `depgraph` / `gauge` / `scatter` / `timeseries` の 5 パネルとも、最後の 6 行すべてで `p95` が 20 ms 以下(要件 7.2〜7.5)。境目付近(18〜22 ms)はその旨を添えて報告する。読んだ数値は本書ではなく PR のコメントへ残す。

### 最終検証パネルの結果(1 回目: 2 観点、いずれも GO)

| 観点 | 判定 | 主な指摘 | 対応 |
| :-- | :-- | :-- | :-- |
| 仕様適合 | GO | Critical / Major / Nit 0 件。§5 の型・§6.1 の `grid-template-areas`(配布ビルドの `dist/index.html` の `style` 属性で照合)・DOM 順・§6.3 の README・2.6 / 3.x / 4.2 / 4.4 / 6.x が適合 | なし |
| 構造・規約 | GO | Nit: `Panel.tsx` の `children` に付いた `// 本文` は型名の訳で why が無い | コメントを削除した |

`grid-template-areas` をモジュール定数 `GRID_STYLE` の `style` prop で渡す判断は、両観点とも「許容、書き直し不要」と判定した。根拠: spec §6.1 は置き場所だけを規定し手段を規定しない。96 トークンを任意値クラスに詰めると可読性が落ちる。モジュール定数なので再描画のたびにオブジェクトを作らない。

目視(A)と p95 計測(B)は本セッションでは実行しておらず、判定は人間に委ねる。
