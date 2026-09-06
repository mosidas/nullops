import { Panel } from './Panel';

/** 6 枠の slot。`Panel` の領域名(`grid-area`)と一致する。 */
export type DashboardSlot = 'timeseries' | 'gauge' | 'log' | 'scatter' | 'depgraph' | 'commit';

export type DashboardGridProps = {
  // 各 slot に置くパネルの本文。値を ReactElement に限るのは、null・文字列・配列を
  // 型の段階で排除し、6 枠すべてに要素が入ることを保証するためである。
  panels: Readonly<Record<DashboardSlot, React.ReactElement>>;
};

// DOM 順(領域の左上のセルを上から下、同じ行なら左から右)。README「画面」表の行の並びと同じ。
const SLOT_ORDER: readonly DashboardSlot[] = ['timeseries', 'gauge', 'log', 'scatter', 'depgraph', 'commit'];

// 12 列 × 8 行の名前付き領域。名前付き領域はコンテナ側の宣言が無いと解決されず暗黙トラックへ
// 流れるため、slot ごとの grid-area(Panel 側)とこの宣言を対で持つ。
// Tailwind の任意値で書かないのは、空白を _ に置き換えた 96 トークンがクラス名として読めないため。
const ROW_TOP =
  'timeseries timeseries timeseries timeseries timeseries timeseries timeseries timeseries timeseries timeseries gauge gauge';
const ROW_UPPER = 'log log log log scatter scatter scatter scatter scatter depgraph depgraph depgraph';
const ROW_LOWER = 'log log log log scatter scatter scatter scatter scatter commit commit commit';
const GRID_STYLE: React.CSSProperties = {
  gridTemplateAreas: [ROW_TOP, ROW_TOP, ROW_UPPER, ROW_UPPER, ROW_UPPER, ROW_LOWER, ROW_LOWER, ROW_LOWER]
    .map((row) => `"${row}"`)
    .join(' '),
};

/**
 * ダッシュボードの 6 枠を 12 列 × 8 行の格子に配置する器。表示領域の幅・高さいっぱいに広がり、
 * ウィンドウの大きさが変わっても追随する。slot の欠落や余分な鍵は `panels` の型が排除するため、
 * 実行時の個数検査は持たない。
 */
export function DashboardGrid(props: DashboardGridProps): React.JSX.Element {
  return (
    // h-full にしないのは、html・body に高さが無いと解決できず枠が中身なりの高さに潰れるため。
    // dvh はウィンドウの表示領域そのものを指すので、リサイズにもそのまま追随する。
    // grid-cols-12 / grid-rows-8 は minmax(0, 1fr) を敷くため、中身がトラックを押し広げない。
    // overflow-hidden を省かないのは、枠線や中身が 1px でもはみ出すとページ側に
    // 縦横のスクロールバーが出るため(枠の内側のスクロールは Panel が受け持つ)。
    <div className="grid h-dvh w-full grid-cols-12 grid-rows-8 gap-2 overflow-hidden p-2" style={GRID_STYLE}>
      {SLOT_ORDER.map((slot) => (
        <Panel key={slot} slot={slot}>
          {props.panels[slot]}
        </Panel>
      ))}
    </div>
  );
}
