import { Children } from 'react';

type DashboardGridProps = {
  children: React.ReactNode;
};

const EXPECTED_PANEL_COUNT = 6;

/**
 * ダッシュボードの 6 枠を 3 列 × 2 行に並べる器。表示領域の幅・高さいっぱいに広がり、
 * ウィンドウの大きさが変わっても追随する。`children` はちょうど 6 個の `Panel` を渡す。
 * 個数が違うときは開発者向けに `console.error` を出したうえで、受け取った子要素をすべて描画する。
 * この出力先は WebView の DevTools ではなく、`wails dev` の開発サーバのログと `wails build` の
 * ビルドログである（Server Component として描画されるため）。
 */
export function DashboardGrid(props: DashboardGridProps): React.JSX.Element {
  // props.children.length で数えないのは、children の形が呼び出し側の書き方で変わるため。
  // 子が単一の配列式なら length は通るが、複数の子・Fragment・入れ子の配列では通らない。
  // Children.count はいずれの形でも葉の個数を数える。
  const childCount = Children.count(props.children);
  if (childCount !== EXPECTED_PANEL_COUNT) {
    // useEffect へ逃がさないのは、Strict Mode が開発時に効果を 2 度実行し「1 回だけ出す」を
    // 満たせなくなるため。このコンポーネントは Server Component で描画が 1 度きりなので、
    // 描画中に呼べば出力は 1 回で済む（'use client' を付けると同じ理由で 2 回出る）。
    console.error(
      `DashboardGrid は子要素をちょうど ${EXPECTED_PANEL_COUNT} 個受け取る前提だが、${childCount} 個を受け取った。3 列 × 2 行のグリッドが崩れる。`,
    );
  }

  // 個数が違っても早期 return しないのは、擬似ダッシュボードで画面が空になると
  // 実在の障害と見分けがつかなくなるため。受け取った分はそのまま描画する。
  return (
    // h-full にしないのは、html・body に高さが無いと解決できず枠が中身なりの高さに潰れるため。
    // dvh はウィンドウの表示領域そのものを指すので、リサイズにもそのまま追随する。
    // grid-cols-3 / grid-rows-2 は minmax(0, 1fr) を敷くため、中身がトラックを押し広げない。
    // overflow-hidden を省かないのは、枠線や中身が 1px でもはみ出すとページ側に
    // 縦横のスクロールバーが出るため（枠の内側のスクロールは Panel が受け持つ）。
    <div className="grid h-dvh w-full grid-cols-3 grid-rows-2 gap-2 overflow-hidden p-2">{props.children}</div>
  );
}
