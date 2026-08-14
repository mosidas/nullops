type DashboardGridProps = {
  children: React.ReactNode;
};

/**
 * ダッシュボードの 6 枠を 3 列 × 2 行に並べる器。表示領域の幅・高さいっぱいに広がり、
 * ウィンドウの大きさが変わっても追随する。`children` はちょうど 6 個の `Panel` を渡す。
 */
export function DashboardGrid(props: DashboardGridProps): React.JSX.Element {
  return (
    // h-full にしないのは、html・body に高さが無いと解決できず枠が中身なりの高さに潰れるため。
    // dvh はウィンドウの表示領域そのものを指すので、リサイズにもそのまま追随する。
    // grid-cols-3 / grid-rows-2 は minmax(0, 1fr) を敷くため、中身がトラックを押し広げない。
    // overflow-hidden を省かないのは、枠線や中身が 1px でもはみ出すとページ側に
    // 縦横のスクロールバーが出るため（枠の内側のスクロールは Panel が受け持つ）。
    <div className="grid h-dvh w-full grid-cols-3 grid-rows-2 gap-2 overflow-hidden p-2">{props.children}</div>
  );
}
