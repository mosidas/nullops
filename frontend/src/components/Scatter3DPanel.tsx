'use client';

import { useEffect, useRef } from 'react';
import type { main } from '../../wailsjs/go/models';
import { loadSnapshot, subscribeScatter } from '../lib/feed';
import { type Projected, projectPoint, SCATTER_PITCH } from '../lib/project';

/**
 * このパネルが読む点群の形。
 *
 * 生成された main.ScatterCloud はメソッド convertValues を持つクラスだが、
 * イベントで届く payload も Snapshot の戻り値も素の JSON であって
 * インスタンスではない。読む項目だけに絞った型にすることで、空の点群を
 * リテラルで書けるようにする（キャストで嘘をつかない）。
 */
type Cloud = Pick<main.ScatterCloud, 'seq' | 'points'>;

/** 点群が未着のあいだの描画対象。毎回作り直さないため、モジュールの定数として持つ。 */
const EMPTY_CLOUD: Cloud = { seq: 0, points: [] };

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
 * 回転後の Z がとりうる絶対値の上限。
 *
 * モデル座標は各軸 -1〜1 の立方体に収まるため（spec.md §6.1）、
 * どう回しても原点からの距離は立方体の対角線の半分 √3 を超えない。
 * 奥行きを 0〜1 へ正規化する基準に使う。
 */
const DEPTH_LIMIT = Math.sqrt(3);

/** 描画領域の短辺に対する点の半径の比。 */
const POINT_RADIUS_RATIO = 0.012;

/** 点の半径の下限（CSS ピクセル）。小さい枠でも点が消えないようにする。 */
const MIN_POINT_RADIUS = 0.6;

/** 最も奥の点・最も手前の点の不透明度。 */
const ALPHA_FAR = 0.18;
const ALPHA_NEAR = 1.0;

/** 重み W が 0 の点に残す割合。0 にすると W が小さい点が完全に消える。 */
const WEIGHT_FLOOR = 0.45;

/**
 * トークンの解決に失敗したときの退避先（spec.md §7 9.2）。
 *
 * 16 進の直値を置かないのは、色の正本を globals.css の @theme に一本化する
 * 規律のため（spec.md §7 9.1）。背景を transparent にすると Panel 側の
 * 背景がそのまま透けるので、退避しても画は破綻しない。
 */
const FALLBACK_POINT_COLOR = 'white';
const FALLBACK_BACKGROUND_COLOR = 'transparent';

/** 描画に使う色。マウント時に 1 度だけ解決する。 */
type PanelColors = { point: string; background: string };

/**
 * @theme のトークンを実行時に解決する。
 *
 * Canvas 2D は CSS クラスを解釈せず色文字列を要求するため、トークンへ従う
 * 手段が getComputedStyle による解決に限られる（spec.md §3 前提 4）。
 */
function readToken(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value === '' ? fallback : value;
}

/** 1 点ぶんの描画材料。フレームごとに作り直さないよう、器を使い回す。 */
type Plotted = { point: main.ScatterPoint; projected: Projected };

/** 奥行きの昇順（奥→手前）に並べる比較関数。毎フレーム作らないため外に置く。 */
function byDepthAscending(a: Plotted, b: Plotted): number {
  return a.projected.depth - b.projected.depth;
}

/**
 * 1 フレームを描く。
 *
 * 描画対象は canvas のバッキングストアで、投影は CSS ピクセルで行うため、
 * devicePixelRatio ぶんの拡大は変換行列で吸収する。
 *
 * `buffer` は呼び出し側が持ち回る作業領域。毎フレーム配列を作らないための器で
 * あり、内容はこの関数が上書きする（CLAUDE.md TypeScript 規約）。
 */
function render(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  view: { width: number; height: number },
  cloud: Cloud,
  yaw: number,
  colors: PanelColors,
  buffer: Plotted[],
): void {
  const scaleX = canvas.width / view.width;
  const scaleY = canvas.height / view.height;
  ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);
  ctx.clearRect(0, 0, view.width, view.height);
  ctx.fillStyle = colors.background;
  ctx.fillRect(0, 0, view.width, view.height);

  const points = cloud.points;
  if (points.length === 0) {
    return;
  }

  // 点数は固定（spec.md §3 前提 3）だが、空の点群から最初の点群へ移る瞬間だけ
  // 長さが変わる。既存の器はそのまま使い、足りないぶんだけ作る。
  if (buffer.length !== points.length) {
    buffer.length = points.length;
  }
  for (let i = 0; i < points.length; i += 1) {
    const point = points[i];
    const projected = projectPoint(point, yaw, SCATTER_PITCH, view);
    const entry = buffer[i];
    if (entry === undefined) {
      buffer[i] = { point, projected };
    } else {
      entry.point = point;
      entry.projected = projected;
    }
  }

  // 奥から手前へ描くことで、手前の点が奥の点に重なる（spec.md §7 6.4）。
  buffer.sort(byDepthAscending);

  const baseRadius = Math.min(view.width, view.height) * POINT_RADIUS_RATIO;
  ctx.fillStyle = colors.point;
  for (const { point, projected } of buffer) {
    // 0（奥）〜1（手前）。透視投影の scale と同じ向きに動くが、
    // 焦点距離に依存しない値にするため回転後の Z から求める。
    const nearness = (projected.depth + DEPTH_LIMIT) / (2 * DEPTH_LIMIT);
    const weight = WEIGHT_FLOOR + (1 - WEIGHT_FLOOR) * point.w;

    // 奥の点ほど小さく淡くする（spec.md §7 6.5）。
    const radius = Math.max(baseRadius * projected.scale * weight, MIN_POINT_RADIUS);
    ctx.globalAlpha = (ALPHA_FAR + (ALPHA_NEAR - ALPHA_FAR) * nearness) * weight;

    ctx.beginPath();
    ctx.arc(projected.sx, projected.sy, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  // 次のフレームの clearRect / fillRect が半透明にならないよう戻す。
  ctx.globalAlpha = 1;
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
  const cloudRef = useRef<Cloud>(EMPTY_CLOUD);
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

    // 色はマウント時に 1 度だけ読む。毎フレーム読むと描画のたびに
    // スタイル計算が走る（spec.md §8 色の解決）。
    const colors: PanelColors = {
      point: readToken('--color-accent-scatter', FALLBACK_POINT_COLOR),
      background: readToken('--color-surface-1', FALLBACK_BACKGROUND_COLOR),
    };
    // 投影結果の器。ループの外に置いてフレームごとの確保を避ける。
    const buffer: Plotted[] = [];

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

      render(ctx, canvas, view, cloudRef.current, yaw, colors, buffer);
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
