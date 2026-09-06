import type { DashboardSlot } from './DashboardGrid';

export type PanelProps = {
  slot: DashboardSlot; // 占める領域。DashboardGrid の grid-template-areas の領域名と一致する
  children: React.ReactNode;
};

// slot から grid-area のクラス名を引く。列・行の数値は持たず、領域名だけで格子と結び付ける。
// テンプレート文字列で組み立てないのは、Tailwind がソースを静的に走査してクラスを生成するため。
const SLOT_AREA_CLASS: Readonly<Record<DashboardSlot, string>> = {
  timeseries: '[grid-area:timeseries]',
  gauge: '[grid-area:gauge]',
  log: '[grid-area:log]',
  scatter: '[grid-area:scatter]',
  depgraph: '[grid-area:depgraph]',
  commit: '[grid-area:commit]',
};

/**
 * ダッシュボードの 1 枠。見出しを持たず、本文が枠の高さを超えたときは
 * 枠の内側だけが縦にスクロールする。
 */
export function Panel(props: PanelProps): React.JSX.Element {
  return (
    // min-h-0 を省かないのは、flex 項目の既定 min-height:auto では中身が枠を押し広げ、
    // 枠の内側ではなくページ側にスクロールバーが出るため。
    <section
      className={`${SLOT_AREA_CLASS[props.slot]} flex min-h-0 flex-col overflow-hidden rounded border border-border bg-surface-1`}
    >
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2 text-text">{props.children}</div>
    </section>
  );
}
