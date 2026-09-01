type PanelProps = {
  title: string;
  children: React.ReactNode;
};

/**
 * ダッシュボードの 1 枠。見出しと本文領域を持ち、本文が枠の高さを超えたときは
 * 枠の内側だけが縦にスクロールする。
 */
export function Panel(props: PanelProps): React.JSX.Element {
  return (
    // min-h-0 を省かないのは、flex 項目の既定 min-height:auto では中身が枠を押し広げ、
    // 枠の内側ではなくページ側にスクロールバーが出るため。
    <section className="flex min-h-0 flex-col overflow-hidden rounded border border-border bg-surface-1">
      <h2 className="shrink-0 border-border border-b px-3 py-2 text-sm text-text-dim tracking-wide">{props.title}</h2>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2 text-text">{props.children}</div>
    </section>
  );
}
