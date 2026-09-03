'use client';

import { useEffect, useRef } from 'react';
import type { main } from '../../wailsjs/go/models';
import { loadSnapshot, type MetricFrame, subscribeMetrics } from '../lib/feed';
import { recordFrame } from '../lib/framestats';
import { type PlotArea, plotArea, plotX, plotY, visiblePointCount } from '../lib/metrics';

/** framestats へ渡すパネル名。報告の 1 列ぶんの見出しになる。 */
const PANEL_NAME = 'timeseries';

/**
 * 保持する点の上限。Go 側の `appMetricCapacity` と対にする。
 *
 * 長時間の稼働で配列が伸び続けないようにするため（受け入れ基準 7.8）。
 */
const MAX_POINTS = 240;

/**
 * トークンの解決に失敗したときの退避先（受け入れ基準 10.5）。
 *
 * 16 進の直値を置かないのは、色の正本を globals.css の @theme に一本化する
 * 規律のため（受け入れ基準 10.4）。unit #2・#3 が採った折衷を踏襲する。
 */
const FALLBACK_SERIES_COLORS = ['aqua', 'deepskyblue', 'red'];
const FALLBACK_BORDER_COLOR = 'gray';
const FALLBACK_TEXT_COLOR = 'white';
const FALLBACK_DIM_COLOR = 'gray';
const FALLBACK_BACKGROUND_COLOR = 'transparent';
const FALLBACK_FONT_FAMILY = 'monospace';

/**
 * 系列ごとの色のトークン。並びは Go 側の `metricSeriesSpecs`
 * （throughput / latency / errors）と対にする（spec.md §6.8）。
 */
const SERIES_COLOR_TOKENS = ['--color-accent-line', '--color-level-info', '--color-level-error'];

/** 描画に使う色。マウント時に 1 度だけ解決する。 */
type PanelColors = {
  series: string[];
  border: string;
  text: string;
  dim: string;
  background: string;
};

/** 線の太さと、横に引く目盛り線の本数（上端・下端を含む）。 */
const LINE_WIDTH = 1.2;
const GRID_LINES = 5;

/** 文字の大きさ（CSS ピクセル）と、見出しの行の縦位置。 */
const FONT_SIZE = 10;
const LEGEND_BASELINE = 9;
const LEGEND_GAP = 10;

/** 見出しの色の印（正方形）の一辺と、印と文字の間隔。 */
const SWATCH_SIZE = 6;
const SWATCH_GAP = 4;

/** 保持している時系列。描画のループが読む。 */
type SeriesState = {
  /** 古い順の点。件数は MAX_POINTS 以下。 */
  points: main.MetricPoint[];
  /** 最新の系列の見出し。Display がフレームごとに変わる。 */
  series: main.MetricSeriesMeta[];
};

/** 点が未着のあいだの描画対象。毎回作り直さないため、モジュールの定数として持つ。 */
const EMPTY_STATE: SeriesState = { points: [], series: [] };

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
 * 新しい点を取り込む。同じ Seq は 1 件だけ残し、古い側から溢れさせる。
 *
 * 購読とスナップショットの取得が同じ世代を重ねて運ぶため、Seq を鍵に
 * 併合する（受け入れ基準 7.2）。
 */
function mergePoints(current: main.MetricPoint[], incoming: readonly main.MetricPoint[]): main.MetricPoint[] {
  if (incoming.length === 0) {
    return current;
  }

  const latestSeq = current.length === 0 ? 0 : current[current.length - 1].seq;
  // 追記だけで済む場合（購読で 1 点ずつ届く通常の経路）は並べ替えを避ける。
  const appended = incoming.filter((p) => p.seq > latestSeq);
  if (appended.length === incoming.length) {
    const merged = current.concat(appended);
    return merged.length > MAX_POINTS ? merged.slice(merged.length - MAX_POINTS) : merged;
  }

  // 古い世代が混ざる場合（スナップショットが購読より遅れて届く経路）だけ
  // Map で重複を落として並べ替える。
  const bySeq = new Map<number, main.MetricPoint>();
  for (const p of current) {
    bySeq.set(p.seq, p);
  }
  for (const p of incoming) {
    bySeq.set(p.seq, p);
  }
  const merged = [...bySeq.values()].sort((a, b) => a.seq - b.seq);
  return merged.length > MAX_POINTS ? merged.slice(merged.length - MAX_POINTS) : merged;
}

/**
 * 擬似メトリクスの時系列を Canvas 2D の折れ線グラフとして描く。
 *
 * 'use client' をこの葉のコンポーネントに置くのは、DashboardGrid と page.tsx へ
 * 広げると Strict Mode が描画を 2 回呼び、作業単位 dashboard-shell の
 * 受け入れ基準 1.4 を破るため（受け入れ基準 10.8）。
 */
export function TimeseriesPanel(): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // 時系列を state に置かないのは、毎秒 2 回の更新で React の再描画を起こす
  // 必要がないため。描画は requestAnimationFrame のループが ref を読んで行う
  // （CLAUDE.md TypeScript 規約）。
  const stateRef = useRef<SeriesState>(EMPTY_STATE);
  // 描画領域の CSS 上の寸法。バッキングストアの画素数と分けて持つのは、
  // 配置の計算を CSS ピクセルで行い、devicePixelRatio を変換行列側へ寄せるため。
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
      // 0 のときは属性を書き換えない。0 の canvas への setTransform は
      // 意味が無く、描画側は viewRef の 0 を見てフレームを飛ばす（受け入れ基準 8.7）。
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
    // アンマウントで観測を止める（受け入れ基準 10.7）。
    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    // スナップショットより先に購読を始めるのは、取得中に届いたフレームを
    // 落とさないため（受け入れ基準 7.1）。
    const unsubscribe = subscribeMetrics((frame: MetricFrame) => {
      stateRef.current = {
        points: mergePoints(stateRef.current.points, [frame.point]),
        series: frame.series,
      };
    });

    loadSnapshot()
      .then((snapshot) => {
        // 取得のあいだに購読側が新しい点を受けている場合があり、無条件に
        // 上書きすると表示が巻き戻る（受け入れ基準 7.2）。
        const history = snapshot.metrics;
        stateRef.current = {
          points: mergePoints(stateRef.current.points, history.points),
          // 見出しは購読で届いた最新のほうが新しい。空のときだけ履歴から取る。
          series: stateRef.current.series.length === 0 ? history.series : stateRef.current.series,
        };
      })
      .catch((reason: unknown) => {
        // 画面にエラーを出さず空の履歴で開始する。以後の更新イベントで表示は埋まる
        // （受け入れ基準 7.5）。
        console.error('初期スナップショットの取得に失敗した。空の時系列で開始する:', reason);
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
      // 画面にエラーを出さず、枠は空のまま残す（spec.md §5.5）。
      console.error('Canvas の 2D コンテキストを取得できない。時系列の描画を行わない');
      return;
    }

    // 色はマウント時に 1 度だけ読む。毎フレーム読むと描画のたびに
    // スタイル計算が走る（受け入れ基準 10.6）。
    const colors: PanelColors = {
      series: SERIES_COLOR_TOKENS.map((token, i) => readToken(token, FALLBACK_SERIES_COLORS[i])),
      border: readToken('--color-border', FALLBACK_BORDER_COLOR),
      text: readToken('--color-text', FALLBACK_TEXT_COLOR),
      dim: readToken('--color-text-dim', FALLBACK_DIM_COLOR),
      background: readToken('--color-surface-1', FALLBACK_BACKGROUND_COLOR),
    };
    const font = `${FONT_SIZE}px ${readToken('--font-mono', FALLBACK_FONT_FAMILY)}`;

    // 前フレームで描いた対象。変わっていなければ描き直さない（受け入れ基準 8.6）。
    let drawnSeq = -1;
    let drawnWidth = -1;
    let drawnHeight = -1;

    let handle = 0;

    const frame = (): void => {
      handle = window.requestAnimationFrame(frame);
      recordFrame(PANEL_NAME, performance.now());

      const view = viewRef.current;
      if (view.width === 0 || view.height === 0) {
        // 0 除算で NaN を画面へ出さない（受け入れ基準 8.7）。
        return;
      }

      const state = stateRef.current;
      const latestSeq = state.points.length === 0 ? 0 : state.points[state.points.length - 1].seq;
      if (latestSeq === drawnSeq && view.width === drawnWidth && view.height === drawnHeight) {
        // 静止した図を描き直さない（受け入れ基準 8.6）。
        return;
      }
      drawnSeq = latestSeq;
      drawnWidth = view.width;
      drawnHeight = view.height;

      render(ctx, canvas, view, state, colors, font);
    };

    handle = window.requestAnimationFrame(frame);
    // アンマウントでループを止める（受け入れ基準 10.7）。止めないと外れた
    // キャンバスへ描き続け、パネルの数だけ無駄なフレームが積み上がる。
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
  state: SeriesState,
  colors: PanelColors,
  font: string,
): void {
  const scaleX = canvas.width / view.width;
  const scaleY = canvas.height / view.height;
  ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);
  ctx.clearRect(0, 0, view.width, view.height);
  ctx.fillStyle = colors.background;
  ctx.fillRect(0, 0, view.width, view.height);

  const area = plotArea(view);
  drawGrid(ctx, area, colors);
  // 点が 0 件・1 件でも軸と見出しは描く（受け入れ基準 8.8）。
  drawLegend(ctx, state.series, colors, font, view.width);

  if (state.points.length < 2 || area.width <= 0 || area.height <= 0) {
    return;
  }

  // 枠に収まる点数だけを新しい側から取る（受け入れ基準 8.4）。
  const visible = visiblePointCount(area);
  const from = Math.max(0, state.points.length - visible);
  drawLines(ctx, state.points, from, area, colors);
}

/** 目盛り線を横に引く。値の高さを読み取る手掛かりにする。 */
function drawGrid(ctx: CanvasRenderingContext2D, area: PlotArea, colors: PanelColors): void {
  if (area.width <= 0 || area.height <= 0) {
    return;
  }
  ctx.strokeStyle = colors.border;
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.35;
  ctx.beginPath();
  for (let i = 0; i < GRID_LINES; i++) {
    // 0.5 ずらすのは、幅 1 の線が画素の境界にまたがって滲むのを防ぐため。
    const y = Math.round(plotY(i / (GRID_LINES - 1), area)) + 0.5;
    ctx.moveTo(area.left, y);
    ctx.lineTo(area.left + area.width, y);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/** 3 系列を互いに異なる色の折れ線で 1 枚に重ねる（受け入れ基準 8.3）。 */
function drawLines(
  ctx: CanvasRenderingContext2D,
  points: readonly main.MetricPoint[],
  from: number,
  area: PlotArea,
  colors: PanelColors,
): void {
  const count = points.length - from;
  const seriesCount = points[points.length - 1].values.length;

  ctx.lineWidth = LINE_WIDTH;
  ctx.lineJoin = 'round';
  for (let s = 0; s < seriesCount; s++) {
    // 系列の数がトークンの数を超えた場合も色を割り当てる。Go 側の契約
    // （3 系列）が変わったときに線が消えるより、色が巡回するほうがよい。
    ctx.strokeStyle = colors.series[s % colors.series.length];
    ctx.beginPath();
    for (let i = 0; i < count; i++) {
      const value = points[from + i].values[s];
      if (value === undefined) {
        continue;
      }
      const x = plotX(i, count, area);
      const y = plotY(value, area);
      if (i === 0) {
        ctx.moveTo(x, y);
        continue;
      }
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

/**
 * 系列の名前・単位・現在値を枠の上に添える（受け入れ基準 8.5）。
 *
 * 画面に出る文字は英語のまま扱う（CLAUDE.md 言語規約）。枠の幅を超える
 * 見出しは描かずに打ち切り、横スクロールを出さない。
 */
function drawLegend(
  ctx: CanvasRenderingContext2D,
  series: readonly main.MetricSeriesMeta[],
  colors: PanelColors,
  font: string,
  viewWidth: number,
): void {
  if (series.length === 0) {
    return;
  }

  ctx.font = font;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';

  let x = 4;
  for (let i = 0; i < series.length; i++) {
    const meta = series[i];
    const label = `${meta.id} ${formatDisplay(meta.display)}${meta.unit}`;
    const width = SWATCH_SIZE + SWATCH_GAP + ctx.measureText(label).width;
    if (x + width > viewWidth) {
      // 収まらない見出しはここで打ち切る。切れた文字を出すより、
      // 出せる系列だけを完全な形で見せるほうが読める。
      return;
    }

    ctx.fillStyle = colors.series[i % colors.series.length];
    ctx.fillRect(x, LEGEND_BASELINE - SWATCH_SIZE / 2, SWATCH_SIZE, SWATCH_SIZE);
    ctx.fillStyle = colors.text;
    ctx.fillText(label, x + SWATCH_SIZE + SWATCH_GAP, LEGEND_BASELINE);
    x += width + LEGEND_GAP;
  }
}

/**
 * 表示値を桁数の揃った短い文字列にする。
 *
 * 大きい値ほど小数を落とすのは、req/s（4 桁）と %（1 桁）を同じ幅の
 * 見出しに並べるため。
 */
function formatDisplay(value: number): string {
  if (!Number.isFinite(value)) {
    return '-';
  }
  if (Math.abs(value) >= 100) {
    return value.toFixed(0);
  }
  return value.toFixed(1);
}
