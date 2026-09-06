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

- [ ] 1. 格子と枠の契約を slot の record へ作り直す
  - [ ] 1.1 `DashboardGrid` と `Panel` を spec.md §5.1・§5.2 の契約へ作り直す。`DashboardGrid` は `DashboardSlot` 型を export し、`panels: Readonly<Record<DashboardSlot, React.ReactElement>>` を受けて 12 列 × 8 行の格子(全トラック `minmax(0, 1fr)`・隙間 8 px・外周余白 8 px・`h-dvh`・`overflow-hidden`)に `grid-template-areas` で §6.1 の 6 領域を宣言し、§6.1 の「順」で 6 個の `Panel` を生成する。子要素数の検査と `console.error` を消す。`Panel` は `title` と `h2`・区切り線を消し、`slot` から `grid-area` のクラス名を静的な対応表(`Record<DashboardSlot, string>`)で引く。`section`・本文領域の `min-h-0`・内側スクロール・枠線・背景・内側余白は現行を保つ。両ファイルとも Server Component のまま(`'use client'` を付けない)。`Panel` は `DashboardGrid` から型だけを `import type` で取る(実行時の循環 import を作らない)
    _Requirements: 1.1, 1.2, 1.3, 1.6, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.2, 3.3, 3.4, 4.4, 5.1_
    _Boundary: DashboardGrid / Panel_
    _Interfaces: Produces `export type DashboardSlot = 'timeseries' | 'gauge' | 'log' | 'scatter' | 'depgraph' | 'commit'`, `export type DashboardGridProps = { panels: Readonly<Record<DashboardSlot, React.ReactElement>> }`, `export function DashboardGrid(props: DashboardGridProps): React.JSX.Element`, `export type PanelProps = { slot: DashboardSlot; children: React.ReactNode }`, `export function Panel(props: PanelProps): React.JSX.Element`_
    - 対象ファイル: `frontend/src/components/DashboardGrid.tsx`(変更), `frontend/src/components/Panel.tsx`(変更)
    - 仕様参照: spec.md §5.1 `DashboardGrid`, §5.2 `Panel`, §6.1 格子と 6 枠の配置, §8 実現方針
    - 検証コマンド: `cd frontend && npm run lint` / `grep -nE "h2|Children|console\.error|title" frontend/src/components/DashboardGrid.tsx frontend/src/components/Panel.tsx` が 0 件 / `grep -nE "#[0-9a-fA-F]{3,8}|rgba?\(" frontend/src/components/DashboardGrid.tsx frontend/src/components/Panel.tsx` が 0 件 / `grep -n "use client" frontend/src/components/DashboardGrid.tsx frontend/src/components/Panel.tsx` が 0 件 / `grep -c "grid-area\|area-\[" frontend/src/components/Panel.tsx` で 6 slot 分の領域名が対応表に揃っていることを確認 / この時点では `page.tsx` が旧契約のため `wails build` の型検査は通らない(1.2 で緑にする)
  - [ ] 1.2 `Home` を新しい契約に合わせる。`DashboardGrid` に `panels` として §6.2 の対応で 6 つの slot すべてにパネル要素を渡し、`PANEL_TITLES` 等の見出し文字列の定数・`panelBody` の分岐・`Panel` の直接使用・配置の数値を持たない形にする。`'use client'` は付けない
    _Requirements: 3.1, 3.5, 4.2, 7.2, 7.3, 7.4, 7.5_
    _Boundary: Home_
    _Depends: 1.1_
    _Interfaces: Consumes `DashboardGrid(props: { panels: Readonly<Record<DashboardSlot, React.ReactElement>> })`, `DashboardSlot`_
    - 対象ファイル: `frontend/src/app/page.tsx`(変更)
    - 仕様参照: spec.md §5.3 `Home`, §6.2 slot とパネルの対応, Requirement 3
    - 検証コマンド: `cd frontend && npm run lint` / `grep -nE "TITLE|panelBody|Panel\b|'use client'" frontend/src/app/page.tsx` が 0 件(`Panel` は `DashboardGrid` が生成するため `page.tsx` から消える) / `wails build` が終了コード 0(`next build` の型検査が 3.3 の型を通す)/ `go vet ./... && go test ./...` が終了コード 0 / `git diff --name-only main...HEAD` に §6.2 の 6 パネルコンポーネントと Go の生成源 5 本(`logsource.go`・`commitsource.go`・`graphsource.go`・`scattersource.go`・`metricsource.go`)が含まれない / 3.3 の異常系: `panels` から 1 つの slot を一時的に除いた状態で `cd frontend && npx tsc --noEmit` が型エラーを返すことを確認し、元に戻す(コミットしない)

- [ ] 2. (P) README「画面」節を改訂する
  - [ ] 2.1 README「画面」節の冒頭を配置の型(中央主役型)を述べる 1 文に置き換え、表を「パネル」「位置」「内容」の 3 列・§6.1 の「順」の 6 行にし、表の下の 1 文を配置の順(上から下、同じ高さでは左から右)の趣旨に置き換える。ASCII 図は載せない。「内容」列の文は現行を保つ
    _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_
    _Boundary: README_
    _Interfaces: Consumes spec.md §6.1 の「位置」列の語と §6.2 の「パネル」列の語(文書上の対応。コードのシグネチャ共有は無い)_
    - 対象ファイル: `README.md`(変更)
    - 仕様参照: spec.md §6.3 README「画面」節の形式, §6.1 の「順」「位置」列, §6.2 の「パネル」列
    - 検証コマンド: `grep -nE "3 列 2 行|枠の題名|Log Stream|Commit Graph|Dependency Graph|Scatter 3D|Utilization|Timeseries" README.md` が 0 件 / `awk '/^## 画面/{f=1} f&&/^## /&&!/^## 画面/{exit} f' README.md` の出力で、表の 6 行の並びが「折れ線グラフ・タコメータ・ログストリーム・3D 散布図・グラフビュー・コミットグラフ」、「位置」列が「上の帯・右上・左の縦長・中央(最も大きい枠)・右の上段・右の下段」であることを照合 / `grep -nE "^\s*[+|]-+[+|]|┌|└|├" README.md` が 0 件(ASCII 図なし)

- [ ] 3. 最終検証(静的検査・目視・計測)
  - [ ]* 3.1 静的検査を全部通し、配布ビルドと `-devtools` ビルドで人間の目視・計測に委ねる項目を `## Implementation Notes` に整理する。目視・計測は spec.md §6.1 の概算表(±4 px)、Requirement 1.4・1.5・1.7・4.1・4.3・5.2〜5.4・7.1・7.6 を対象とし、実行環境で確認できたものは結果を、できなかったものは未検証項目として確認手順を残す(前 unit `005-framestats-runtime` の Implementation Notes と同じ形式)
    _Requirements: 1.4, 1.5, 1.7, 4.1, 4.3, 5.2, 5.3, 5.4, 5.5, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_
    _Boundary: Verification_
    _Depends: 1.2, 2.1_
    _Interfaces: Consumes 1.2 が生成する `build/bin` のアプリと `window.nullops.enableFrameStats()`(既存の計測器。本 unit で変えない)_
    - 対象ファイル: `docs/specs/002-visual-refinement/001-dashboard-layout/tasks.md`(変更。`## Implementation Notes` のみ)
    - 仕様参照: spec.md §6.1 概算表, §6.4, Requirement 1・4・5・7, `docs/specs/001-dashboard-mvp/005-framestats-runtime/tasks.md` B 節
    - 検証コマンド: `go vet ./... && go test ./... && (cd frontend && npm ci && npm run lint) && wails build` がすべて終了コード 0 / `git diff --name-only main...HEAD -- frontend/src/components/LogStreamPanel.tsx` が 0 件(5.5) / `wails build -devtools` のビルドで B 節の手順により p95 を計測し、5 パネルとも 20 ms 以下であることを記録(実行できない環境では未検証項目として手順を残す)

## Implementation Notes

### 進捗台帳
