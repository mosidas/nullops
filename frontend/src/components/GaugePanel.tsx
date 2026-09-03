'use client';

import { useEffect, useRef } from 'react';
import { loadSnapshot, type MetricFrame, subscribeMetrics } from '../lib/feed';
import { recordFrame } from '../lib/framestats';
import { approach, type DialGeometry, dialAngle, dialGeometry } from '../lib/metrics';

/** framestats へ渡すパネル名。報告の 1 列ぶんの見出しになる。 */
const PANEL_NAME = 'gauge';

/**
 * トークンの解決に失敗したときの退避先（受け入れ基準 10.5）。
 *
 * 16 進の直値を置かないのは、色の正本を globals.css の @theme に一本化する
 * 規律のため（受け入れ基準 10.4）。
 */
const FALLBACK_GAUGE_COLOR = 'orange';
const FALLBACK_NOMINAL_COLOR = 'green';
const FALLBACK_ELEVATED_COLOR = 'gold';
const FALLBACK_CRITICAL_COLOR = 'red';
const FALLBACK_TEXT_COLOR = 'white';
const FALLBACK_DIM_COLOR = 'gray';
const FALLBACK_BACKGROUND_COLOR = 'transparent';
const FALLBACK_FONT_FAMILY = 'monospace';

/** 描画に使う色。マウント時に 1 度だけ解決する。 */
type PanelColors = {
  gauge: string;
  nominal: string;
  elevated: string;
  critical: string;
  text: string;
  dim: string;
  background: string;
};

/**
 * ゾーンの境界。Go 側の `zoneElevatedFrom` / `zoneCriticalFrom` と対にする。
 *
 * 帯を塗る位置を決めるためだけに持つ。値からゾーンを決める判断は Go 側の
 * `gaugeZoneFor` が単一の正本であり、こちらは読みの `zone` をそのまま使う。
 */
const ZONE_ELEVATED_FROM = 0.6;
const ZONE_CRITICAL_FROM = 0.85;

/**
 * 針が目標へ近づく 1 フレームあたりの比（受け入れ基準 9.4）。
 *
 * 値の跳びをそのまま出さず、60 Hz でおよそ 0.2 秒かけて目標へ収束する
 * 大きさにする。送出間隔（500 ms）より短く、次の読みが届く前に落ち着く。
 */
const NEEDLE_RATE = 0.18;

/**
 * 針が「目標に達した」とみなす差。
 *
 * approach は指数的に近づくため厳密には一致しない。これを置かないと
 * 差が浮動小数の丸め幅になるまで描き続け、受け入れ基準 9.7 を満たせない。
 */
const NEEDLE_EPSILON = 0.0005;

/** 文字盤の帯・針・目盛りの太さ（CSS ピクセルに対する半径の比、または実寸）。 */
const BAND_WIDTH_RATIO = 0.16;
const NEEDLE_WIDTH = 2.5;
const HUB_RADIUS_RATIO = 0.08;

/** 文字の大きさ（半径に対する比）と、中央の数値・ラベルの縦位置（同）。 */
const VALUE_FONT_RATIO = 0.42;
const LABEL_FONT_RATIO = 0.2;
const VALUE_Y_RATIO = 0.42;
const LABEL_Y_RATIO = 0.72;

/** 針の目標。購読とスナップショットのうち Seq が大きいほうを採る。 */
type GaugeTarget = { seq: number; value: number; display: number; zone: string; label: string };

/** 読みが未着のあいだの目標。毎回作り直さないため、モジュールの定数として持つ。 */
const EMPTY_TARGET: GaugeTarget = { seq: 0, value: 0, display: 0, zone: '', label: '' };

/**
 * @theme のトークンを実行時に解決する。
 *
 * Canvas 2D は CSS クラスを解釈せず色文字列を要求するため、トークンへ従う
 * 手段が getComputedStyle による解決に限られる（spec.md §3 前提 6）。
 */
function readToken(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value === '' ? fallback : value;
}

/**
 * 新しい読みを取り込む。Seq が進んでいないものは捨てる。
 *
 * 購読とスナップショットの取得が同じ世代・古い世代を重ねて運ぶため、
 * Seq が大きいほうだけを目標にする（受け入れ基準 7.3）。針の巻き戻しを防ぐ。
 */
function adopt(current: GaugeTarget, incoming: GaugeTarget): GaugeTarget {
  return incoming.seq > current.seq ? incoming : current;
}

/**
 * 擬似的な総合使用率を Canvas 2D のタコメータとして描く。
 *
 * 'use client' をこの葉のコンポーネントに置くのは、DashboardGrid と page.tsx へ
 * 広げると Strict Mode が描画を 2 回呼び、作業単位 dashboard-shell の
 * 受け入れ基準 1.4 を破るため（受け入れ基準 10.8）。
 */
export function GaugePanel(): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // 目標を state に置かないのは、毎秒 2 回の更新で React の再描画を起こす
  // 必要がないため。描画は requestAnimationFrame のループが ref を読んで行う
  // （CLAUDE.md TypeScript 規約）。
  const targetRef = useRef<GaugeTarget>(EMPTY_TARGET);
  const viewRef = useRef({ width: 0, height: 0 });

  // キャンバスの寸法を枠と devicePixelRatio へ追随させる（受け入れ基準 10.1・10.2）。
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) {
      return;
    }

    const resize = (): void => {
      const rect = canvas.getBoundingClientRect();
      viewRef.current = { width: rect.width, height: rect.height };
      // 0 のときは属性を書き換えない。描画側は viewRef の 0 を見てフレームを
      // 飛ばす（受け入れ基準 9.8）。
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

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    // アンマウントで観測を止める（受け入れ基準 10.7）。
    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    // スナップショットより先に購読を始めるのは、取得中に届いたフレームを
    // 落とさないため（受け入れ基準 7.1）。
    const unsubscribe = subscribeMetrics((frame: MetricFrame) => {
      targetRef.current = adopt(targetRef.current, frame.gauge);
    });

    loadSnapshot()
      .then((snapshot) => {
        targetRef.current = adopt(targetRef.current, snapshot.metrics.gauge);
      })
      .catch((reason: unknown) => {
        // 画面にエラーを出さず、針を 0 の位置として開始する（受け入れ基準 7.5）。
        console.error('初期スナップショットの取得に失敗した。針を 0 の位置で開始する:', reason);
      });

    // アンマウントで購読を解除する（受け入れ基準 7.4・7.7）。
    return unsubscribe;
  }, []);

  // 描画のループ。
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) {
      return;
    }
    const ctx = canvas.getContext('2d');
    if (ctx === null) {
      // 画面にエラーを出さず、枠は空のまま残す（spec.md §5.6）。
      console.error('Canvas の 2D コンテキストを取得できない。タコメータの描画を行わない');
      return;
    }

    // 色はマウント時に 1 度だけ読む。毎フレーム読むと描画のたびに
    // スタイル計算が走る（受け入れ基準 10.6）。
    const colors: PanelColors = {
      gauge: readToken('--color-accent-gauge', FALLBACK_GAUGE_COLOR),
      nominal: readToken('--color-accent-graph', FALLBACK_NOMINAL_COLOR),
      elevated: readToken('--color-level-warn', FALLBACK_ELEVATED_COLOR),
      critical: readToken('--color-level-error', FALLBACK_CRITICAL_COLOR),
      text: readToken('--color-text', FALLBACK_TEXT_COLOR),
      dim: readToken('--color-text-dim', FALLBACK_DIM_COLOR),
      background: readToken('--color-surface-1', FALLBACK_BACKGROUND_COLOR),
    };
    const fontFamily = readToken('--font-mono', FALLBACK_FONT_FAMILY);

    // 針の現在位置。目標へ毎フレーム漸近させる（受け入れ基準 9.4）。
    let needle = 0;
    let drawnWidth = -1;
    let drawnHeight = -1;
    // 直前に描いた読み。数値の表示が針と一緒に更新されるようにするため。
    let drawnSeq = -1;

    let handle = 0;

    const frame = (): void => {
      handle = window.requestAnimationFrame(frame);
      recordFrame(PANEL_NAME, performance.now());

      const view = viewRef.current;
      if (view.width === 0 || view.height === 0) {
        // 0 除算で NaN を画面へ出さない（受け入れ基準 9.8）。
        return;
      }

      const target = targetRef.current;
      const settled = Math.abs(target.value - needle) < NEEDLE_EPSILON;
      const sameView = view.width === drawnWidth && view.height === drawnHeight;
      if (settled && sameView && target.seq === drawnSeq) {
        // 止まっている針を描き直さない（受け入れ基準 9.7）。
        return;
      }

      // 収束したら目標へ吸着させる。指数的な接近が永久に終わらないため。
      needle = settled ? target.value : approach(needle, target.value, NEEDLE_RATE);
      drawnWidth = view.width;
      drawnHeight = view.height;
      drawnSeq = target.seq;

      render(ctx, canvas, view, needle, target, colors, fontFamily);
    };

    handle = window.requestAnimationFrame(frame);
    // アンマウントでループを止める（受け入れ基準 10.7）。
    return () => {
      window.cancelAnimationFrame(handle);
    };
  }, []);

  // 枠いっぱいに広げる。block にするのは、inline 要素の行下の余白で
  // 枠がわずかに縦へ溢れ、ページ側にスクロールバーが出るのを防ぐため
  // （受け入れ基準 10.3）。
  return <canvas ref={canvasRef} className="block h-full w-full" />;
}

/**
 * 1 フレームを描く。
 *
 * 描画対象は canvas のバッキングストアで、配置は CSS ピクセルで行うため、
 * devicePixelRatio ぶんの拡大は変換行列で吸収する。
 */
function render(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  view: { width: number; height: number },
  needle: number,
  target: GaugeTarget,
  colors: PanelColors,
  fontFamily: string,
): void {
  const scaleX = canvas.width / view.width;
  const scaleY = canvas.height / view.height;
  ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);
  ctx.clearRect(0, 0, view.width, view.height);
  ctx.fillStyle = colors.background;
  ctx.fillRect(0, 0, view.width, view.height);

  const dial = dialGeometry(view);
  if (dial.radius <= 0) {
    return;
  }

  drawBands(ctx, dial, colors);
  drawNeedle(ctx, dial, needle, colors);
  drawReadout(ctx, dial, target, colors, fontFamily);
}

/** 文字盤の帯を 3 つのゾーンで塗り分ける（受け入れ基準 9.5）。 */
function drawBands(ctx: CanvasRenderingContext2D, dial: DialGeometry, colors: PanelColors): void {
  const width = dial.radius * BAND_WIDTH_RATIO;
  // 帯の中心線に沿って引く。線幅の半分ずつ内外へ広がるため半径から引いておく。
  const radius = dial.radius - width / 2;

  const bands: ReadonlyArray<{ from: number; to: number; color: string }> = [
    { from: 0, to: ZONE_ELEVATED_FROM, color: colors.nominal },
    { from: ZONE_ELEVATED_FROM, to: ZONE_CRITICAL_FROM, color: colors.elevated },
    { from: ZONE_CRITICAL_FROM, to: 1, color: colors.critical },
  ];

  ctx.lineWidth = width;
  ctx.lineCap = 'butt';
  for (const band of bands) {
    ctx.strokeStyle = band.color;
    ctx.beginPath();
    ctx.arc(dial.cx, dial.cy, radius, dialAngle(band.from, dial), dialAngle(band.to, dial));
    ctx.stroke();
  }
}

/** 針と軸の円を描く。 */
function drawNeedle(ctx: CanvasRenderingContext2D, dial: DialGeometry, value: number, colors: PanelColors): void {
  // 帯の内側で止める。針の先が帯を覆うと、どのゾーンを指しているかが読めない。
  const length = dial.radius * (1 - BAND_WIDTH_RATIO * 1.4);
  const angle = dialAngle(value, dial);

  ctx.strokeStyle = colors.gauge;
  ctx.lineWidth = NEEDLE_WIDTH;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(dial.cx, dial.cy);
  ctx.lineTo(dial.cx + Math.cos(angle) * length, dial.cy + Math.sin(angle) * length);
  ctx.stroke();

  ctx.fillStyle = colors.gauge;
  ctx.beginPath();
  ctx.arc(dial.cx, dial.cy, dial.radius * HUB_RADIUS_RATIO, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * 使用率の数値とラベルを文字盤の中央に描く（受け入れ基準 9.6）。
 *
 * 画面に出る文字は英語のまま扱う（CLAUDE.md 言語規約）。
 */
function drawReadout(
  ctx: CanvasRenderingContext2D,
  dial: DialGeometry,
  target: GaugeTarget,
  colors: PanelColors,
  fontFamily: string,
): void {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.font = `${(dial.radius * VALUE_FONT_RATIO).toFixed(1)}px ${fontFamily}`;
  ctx.fillStyle = colors.text;
  ctx.fillText(`${target.display.toFixed(0)}%`, dial.cx, dial.cy + dial.radius * VALUE_Y_RATIO);

  // ラベルが未着（読みが 1 度も届いていない）のあいだは何も出さない。
  if (target.label === '') {
    return;
  }
  ctx.font = `${(dial.radius * LABEL_FONT_RATIO).toFixed(1)}px ${fontFamily}`;
  ctx.fillStyle = colors.dim;
  ctx.fillText(target.label, dial.cx, dial.cy + dial.radius * LABEL_Y_RATIO);
}
