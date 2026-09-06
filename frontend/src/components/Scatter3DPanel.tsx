'use client';

import { useEffect, useRef } from 'react';
import type { main } from '../../wailsjs/go/models';
import { AXIS_SEGMENTS } from '../lib/axes';
import { loadSnapshot, subscribeScatter } from '../lib/feed';
import { recordFrame } from '../lib/framestats';
import { advanceOrbit, beginDrag, createOrbit, dragBy, endDrag, type Orbit } from '../lib/orbit';
import { type Projected, projectPoint } from '../lib/project';

/** 計測器へ渡すパネル名（spec.md §9.1）。 */
const PANEL_NAME = 'scatter';

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
 * ハローの半径と不透明度の、本体に対する比（spec.md §6.3）。
 *
 * 放射グラデーションではなく同じ色の円を 2 回塗って近似する。グラデーションは
 * 点ごとにオブジェクトを作る API しかなく、毎フレーム 256 個の割り当てになるため。
 */
const HALO_RADIUS_RATIO = 2.2;
const HALO_ALPHA_RATIO = 0.22;

/** 軸線の不透明度。奥（n = 0）で 0.25、手前（n = 1）で 0.9（spec.md §6.2）。 */
const LINE_ALPHA_FAR = 0.25;
const LINE_ALPHA_SPAN = 0.65;

/** 軸線の線幅（CSS ピクセル）。 */
const LINE_WIDTH = 1;

/**
 * トークンの解決に失敗したときの退避先（spec.md §7 9.2）。
 *
 * 16 進の直値を置かないのは、色の正本を globals.css の @theme に一本化する
 * 規律のため（spec.md §7 9.1）。背景を transparent にすると Panel 側の
 * 背景がそのまま透けるので、退避しても画は破綻しない。
 */
const FALLBACK_POINT_COLOR = 'white';
const FALLBACK_BACKGROUND_COLOR = 'transparent';
// 軸線の退避先を gray にするのは、点の white と区別がつくようにするため。
const FALLBACK_LINE_COLOR = 'gray';

/** 描画に使う色。マウント時に 1 度だけ解決する。 */
type PanelColors = { point: string; background: string; axis: string; edge: string };

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
  orbit: Orbit,
  colors: PanelColors,
  buffer: Plotted[],
): void {
  const scaleX = canvas.width / view.width;
  const scaleY = canvas.height / view.height;
  ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);
  ctx.clearRect(0, 0, view.width, view.height);
  ctx.fillStyle = colors.background;
  ctx.fillRect(0, 0, view.width, view.height);

  const yaw = orbit.yaw;
  const pitch = orbit.pitch;

  // 軸線を点より先に描く。点ごとの深度比較を線と行うのは割に合わないため、
  // 線を下に敷いて奥行きは不透明度で表す（spec.md §8）。点群が空でも描く（4.7）。
  ctx.lineWidth = LINE_WIDTH;
  for (let i = 0; i < AXIS_SEGMENTS.length; i += 1) {
    const segment = AXIS_SEGMENTS[i];
    const from = projectPoint(segment.from, yaw, pitch, view);
    const to = projectPoint(segment.to, yaw, pitch, view);
    const nearness = ((from.depth + to.depth) / 2 + DEPTH_LIMIT) / (2 * DEPTH_LIMIT);
    ctx.globalAlpha = LINE_ALPHA_FAR + LINE_ALPHA_SPAN * nearness;
    ctx.strokeStyle = segment.kind === 'axis' ? colors.axis : colors.edge;
    ctx.beginPath();
    ctx.moveTo(from.sx, from.sy);
    ctx.lineTo(to.sx, to.sy);
    ctx.stroke();
  }

  const points = cloud.points;
  if (points.length > 0) {
    // 点数は固定（spec.md §3 前提 3）だが、空の点群から最初の点群へ移る瞬間だけ
    // 長さが変わる。既存の器はそのまま使い、足りないぶんだけ作る。
    if (buffer.length !== points.length) {
      buffer.length = points.length;
    }
    for (let i = 0; i < points.length; i += 1) {
      const point = points[i];
      const projected = projectPoint(point, yaw, pitch, view);
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
      const alpha = (ALPHA_FAR + (ALPHA_NEAR - ALPHA_FAR) * nearness) * weight;

      // ハロー → 本体の順。本体がハローの上に載る（spec.md §6.3）。
      ctx.globalAlpha = alpha * HALO_ALPHA_RATIO;
      ctx.beginPath();
      ctx.arc(projected.sx, projected.sy, radius * HALO_RADIUS_RATIO, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(projected.sx, projected.sy, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // 次のフレームの clearRect / fillRect が半透明にならないよう戻す（spec.md §7 5.5）。
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
  // 視点を state ではなく effect 内のオブジェクトに持つのは、毎フレームの再描画を
  // React に起こさせないため（CLAUDE.md TypeScript 規約。spec.md §8）。
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
      axis: readToken('--color-text-dim', FALLBACK_LINE_COLOR),
      edge: readToken('--color-border', FALLBACK_LINE_COLOR),
    };
    // 投影結果の器。ループの外に置いてフレームごとの確保を避ける。
    const buffer: Plotted[] = [];

    // 視点はこの effect の寿命で 1 つだけ作り、状態機械がその場で更新する（spec.md §6.1）。
    const orbit = createOrbit();
    let prevMs: number | null = null;
    let handle = 0;

    const frame = (nowMs: number): void => {
      handle = window.requestAnimationFrame(frame);
      // requestAnimationFrame が渡す時刻をそのまま使う。performance.now() を
      // 別に読むと、コールバック開始からの誤差が計測へ混じるため（spec.md §9.1）。
      recordFrame(PANEL_NAME, nowMs);

      // 経過時間の切り詰めと自動回転・復帰は状態機械の側にある（spec.md §5.2）。
      // 点群の更新イベントが 1 度も届かなくても回転を続ける（spec.md §7 3.8）。
      advanceOrbit(orbit, prevMs === null ? 0 : nowMs - prevMs);
      prevMs = nowMs;

      const view = viewRef.current;
      if (view.width === 0 || view.height === 0) {
        // 0 除算で NaN を画面へ出さない（spec.md §7 6.6）。
        return;
      }

      render(ctx, canvas, view, cloudRef.current, orbit, colors, buffer);
    };

    // ポインタ操作。前回位置は数値 2 つで持ち、イベントごとにオブジェクトを作らない。
    // Pointer Events を使うのは、setPointerCapture で枠の外への追従が 1 つの API で済むため（spec.md §8）。
    let lastX = 0;
    let lastY = 0;
    const onPointerDown = (event: PointerEvent): void => {
      // 主ボタン以外や副ポインタ（マルチタッチの 2 本目）は視点を変えない（spec.md §7 1.4）。
      if (event.button !== 0 || !event.isPrimary) {
        return;
      }
      beginDrag(orbit);
      lastX = event.clientX;
      lastY = event.clientY;
      try {
        canvas.setPointerCapture(event.pointerId);
      } catch (reason: unknown) {
        // キャプチャできないポインタで drag に居座ると、pointerup を取り逃して
        // 自動回転が止まったままになる。例外を伝播させず auto へ戻す（spec.md §7 6.5）。
        console.error('ポインタのキャプチャに失敗した。ドラッグを中止して自動回転へ戻す:', reason);
        endDrag(orbit);
        return;
      }
      // カーソルは React の再描画ではなく style で切り替える。毎フレーム触らない（spec.md §7 7.2）。
      canvas.style.cursor = 'grabbing';
    };
    const onPointerMove = (event: PointerEvent): void => {
      // auto の間の移動は無視する（spec.md §7 1.5）。dragBy 自体も auto では何もしないが、
      // 前回位置の更新を drag 中に限ることで、ドラッグ開始時の差分が飛ばないようにする。
      if (orbit.mode !== 'drag') {
        return;
      }
      dragBy(orbit, event.clientX - lastX, event.clientY - lastY);
      lastX = event.clientX;
      lastY = event.clientY;
    };
    // pointerup・pointercancel・lostpointercapture・blur は同じ 1 つの関数で受ける。
    // endDrag は冪等なので、続けて届いても復帰をやり直さない（spec.md §7 6.2〜6.4）。
    const stopDrag = (): void => {
      endDrag(orbit);
      canvas.style.cursor = '';
    };
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', stopDrag);
    canvas.addEventListener('pointercancel', stopDrag);
    canvas.addEventListener('lostpointercapture', stopDrag);
    // アプリの切り替えで pointerup が届かない場合に備える（spec.md §3 前提 6）。
    window.addEventListener('blur', stopDrag);

    handle = window.requestAnimationFrame(frame);
    // アンマウントでループを止める（spec.md §7 7.4）。止めないと外れた
    // キャンバスへ描き続け、パネルの数だけ無駄なフレームが積み上がる。
    // リスナーも全部解除する（spec.md §7 6.6）。
    return () => {
      window.cancelAnimationFrame(handle);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', stopDrag);
      canvas.removeEventListener('pointercancel', stopDrag);
      canvas.removeEventListener('lostpointercapture', stopDrag);
      window.removeEventListener('blur', stopDrag);
    };
  }, []);

  // 枠いっぱいに広げる。block にするのは、inline 要素の行下の余白で
  // 枠がわずかに縦へ溢れ、ページ側にスクロールバーが出るのを防ぐため。
  // touch-none はドラッグがページのスクロールやテキスト選択を起こさないため、
  // cursor-grab は auto の間のカーソル（drag 中は style.cursor が上書きする。spec.md §7 7.1〜7.3）。
  return <canvas ref={canvasRef} className="block h-full w-full touch-none cursor-grab" />;
}
