'use client';

import { useEffect, useRef } from 'react';
import type { main } from '../../wailsjs/go/models';
import { loadSnapshot, subscribeScatter } from '../lib/feed';

/** 点群が未着のあいだの描画対象。毎回作り直さないため、モジュールの定数として持つ。 */
const EMPTY_CLOUD: main.ScatterCloud = { seq: 0, points: [] } as main.ScatterCloud;

/**
 * 擬似的な 3 次元の点群を Canvas 2D へ投影して描き、回転させる。
 *
 * 'use client' をこの葉のコンポーネントに置くのは、DashboardGrid と page.tsx へ
 * 広げると Strict Mode が描画を 2 回呼び、作業単位 dashboard-shell の
 * 受け入れ基準 1.4 を破るため。
 */
export function Scatter3DPanel(): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // 点群を state に置かないのは、毎秒の更新で React の再描画を起こす必要がないため。
  // 描画は requestAnimationFrame のループが ref を読んで行う（CLAUDE.md TypeScript 規約）。
  const cloudRef = useRef<main.ScatterCloud>(EMPTY_CLOUD);
  // 描画領域の CSS 上の寸法。バッキングストアの画素数と分けて持つのは、
  // 投影の計算を CSS ピクセルで行い、devicePixelRatio を変換行列側へ寄せるため。
  const viewRef = useRef({ width: 0, height: 0 });

  // キャンバスの寸法を枠と devicePixelRatio へ追随させる。
  //
  // width/height 属性を CSS 上の寸法にそのまま合わせると、高解像度ディスプレイで
  // バッキングストアが足りず点がぼやける（spec.md §7 8.1）。
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) {
      return;
    }

    const resize = (): void => {
      const rect = canvas.getBoundingClientRect();
      viewRef.current = { width: rect.width, height: rect.height };
      // 0 のときは属性を書き換えない。0 の canvas への setTransform は
      // 意味が無く、描画側は viewRef の 0 を見てフレームを飛ばす（spec.md §7 6.6）。
      if (rect.width === 0 || rect.height === 0) {
        return;
      }
      const dpr = window.devicePixelRatio || 1;
      const w = Math.round(rect.width * dpr);
      const h = Math.round(rect.height * dpr);
      // 同じ値の代入でも canvas はバッファを捨てて内容が消えるため、変化時だけ書く。
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    };

    resize();

    // ウィンドウの resize ではなく要素を観測するのは、枠の寸法が
    // グリッドの再配置でも変わり、window の resize だけでは取り逃すため。
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    // スナップショットより先に購読を始めるのは、取得中に届いたフレームを落とさないため。
    const unsubscribe = subscribeScatter((cloud) => {
      cloudRef.current = cloud;
    });

    loadSnapshot()
      .then((snapshot) => {
        // Seq が大きいほうを採る。取得のあいだに購読側が新しいフレームを受けている
        // 場合があり、無条件に上書きすると表示が巻き戻るため（spec.md §7 5.1）。
        if (snapshot.scatter.seq > cloudRef.current.seq) {
          cloudRef.current = snapshot.scatter;
        }
      })
      .catch((reason: unknown) => {
        // 画面にエラーを出さず空の点群で開始する。以後の更新イベントで表示は埋まる
        // （spec.md §7 5.3）。
        console.error('初期スナップショットの取得に失敗した。空の点群で開始する:', reason);
      });

    return unsubscribe;
  }, []);

  // 枠いっぱいに広げる。block にするのは、inline 要素の行下の余白で
  // 枠がわずかに縦へ溢れ、ページ側にスクロールバーが出るのを防ぐため。
  return <canvas ref={canvasRef} className="block h-full w-full" />;
}
