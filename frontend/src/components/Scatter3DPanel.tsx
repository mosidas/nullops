'use client';

import { useEffect, useRef } from 'react';
import type { main } from '../../wailsjs/go/models';
import { loadSnapshot, subscribeScatter } from '../lib/feed';

/** 点群が未着のあいだの描画対象。毎回作り直さないため、モジュールの定数として持つ。 */
const EMPTY_CLOUD: main.ScatterCloud = { seq: 0, points: [] } as main.ScatterCloud;

/** ヨーの角速度（ラジアン毎秒）。1 周におよそ 26 秒かかる速さ。 */
const YAW_RATE_RAD_PER_SEC = 0.24;

/**
 * 1 フレームとして扱う経過時間の上限（ミリ秒）。
 *
 * ウィンドウの最小化などで requestAnimationFrame が止まると、復帰時の
 * 差分が数秒に達しうる。頭打ちにしないと点群がその分だけ一気に回る。
 */
const MAX_FRAME_MS = 100;

/**
 * 1 フレームを描く。
 *
 * 描画対象は canvas のバッキングストアで、投影は CSS ピクセルで行うため、
 * devicePixelRatio ぶんの拡大は変換行列で吸収する。
 */
function render(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  view: { width: number; height: number },
  _cloud: main.ScatterCloud,
  _yaw: number,
): void {
  const scaleX = canvas.width / view.width;
  const scaleY = canvas.height / view.height;
  ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);
  ctx.clearRect(0, 0, view.width, view.height);
}

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

  // 回転と描画のループ。
  //
  // ヨーを state ではなく ref に持つのは、毎フレームの再描画を React に
  // 起こさせないため（CLAUDE.md TypeScript 規約。spec.md §8）。
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) {
      return;
    }
    const ctx = canvas.getContext('2d');
    if (ctx === null) {
      // 画面にエラーを出さず、枠は空のまま残す（spec.md §5.5）。
      console.error('Canvas の 2D コンテキストを取得できない。3D 散布図の描画を行わない');
      return;
    }

    let yaw = 0;
    let prevMs: number | null = null;
    let handle = 0;

    const frame = (nowMs: number): void => {
      handle = window.requestAnimationFrame(frame);

      // 経過時間の上限を切るのは、最小化からの復帰などでフレームが長く空いたときに
      // ヨーが一気に進んで点群が飛ぶのを防ぐため（spec.md §7 7.3）。
      const elapsed = prevMs === null ? 0 : Math.min(nowMs - prevMs, MAX_FRAME_MS);
      prevMs = nowMs;
      // 点群の更新イベントが 1 度も届かなくても回転を続ける（spec.md §7 7.1）。
      yaw += (elapsed / 1000) * YAW_RATE_RAD_PER_SEC;

      const view = viewRef.current;
      if (view.width === 0 || view.height === 0) {
        // 0 除算で NaN を画面へ出さない（spec.md §7 6.6）。
        return;
      }

      render(ctx, canvas, view, cloudRef.current, yaw);
    };

    handle = window.requestAnimationFrame(frame);
    // アンマウントでループを止める（spec.md §7 7.4）。止めないと外れた
    // キャンバスへ描き続け、パネルの数だけ無駄なフレームが積み上がる。
    return () => {
      window.cancelAnimationFrame(handle);
    };
  }, []);

  // 枠いっぱいに広げる。block にするのは、inline 要素の行下の余白で
  // 枠がわずかに縦へ溢れ、ページ側にスクロールバーが出るのを防ぐため。
  return <canvas ref={canvasRef} className="block h-full w-full" />;
}
