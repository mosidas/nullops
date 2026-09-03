'use client';

import { useEffect, useRef } from 'react';
import type { main } from '../../wailsjs/go/models';
import { lerp, type NodePlacement, placeNode } from '../lib/depgraph';
import { loadSnapshot, subscribeGraph } from '../lib/feed';
import { recordFrame } from '../lib/framestats';

/** 計測器へ渡すパネル名（spec.md §9.1）。 */
const PANEL_NAME = 'depgraph';

/**
 * このパネルが読むグラフの形。
 *
 * 生成された main.DependencyGraph はメソッド convertValues を持つクラスだが、
 * イベントで届く payload も Snapshot の戻り値も素の JSON であって
 * インスタンスではない（unit #2 の Scatter3DPanel と同じ扱い）。
 */
type Graph = Pick<main.DependencyGraph, 'seq' | 'nodes' | 'edges'>;

/** グラフが未着のあいだの描画対象。毎回作り直さないため、モジュールの定数として持つ。 */
const EMPTY_GRAPH: Graph = { seq: 0, nodes: [], edges: [] };

/**
 * トークンの解決に失敗したときの退避先（受け入れ基準 11.5）。
 *
 * 16 進の直値を置かないのは、色の正本を globals.css の @theme に一本化する
 * 規律のため（受け入れ基準 11.4）。unit #2 が採った折衷を踏襲する。
 */
const FALLBACK_GRAPH_COLOR = 'white';
const FALLBACK_WARN_COLOR = 'orange';
const FALLBACK_DOWN_COLOR = 'red';
const FALLBACK_DIM_COLOR = 'gray';
const FALLBACK_BACKGROUND_COLOR = 'transparent';

/** 描画に使う色。マウント時に 1 度だけ解決する。 */
type PanelColors = { ok: string; warn: string; down: string; dim: string; background: string };

/**
 * 補間に掛ける時間（ミリ秒）。Go 側の graphInterval と対にする。
 *
 * 送出の間隔ちょうどを使うのは、次のグラフが届いた瞬間に補間が
 * 終わっているようにするため。届くのが遅れた場合は比を 1 で頭打ちにする
 * （受け入れ基準 10.7）。
 */
const GRAPH_INTERVAL_MS = 1000;

/** エッジの線の太さ（CSS ピクセル）と、流量 1.0 で足される太さ。 */
const EDGE_WIDTH_BASE = 0.6;
const EDGE_WIDTH_FLOW = 1.6;

/** 流量 0 のエッジに残す不透明度と、流量 1.0 で達する不透明度。 */
const EDGE_ALPHA_BASE = 0.18;
const EDGE_ALPHA_FLOW = 0.52;

/** ノードの輪郭の太さ（CSS ピクセル）。塗りより暗い背景色で縁取り、重なりを見分ける。 */
const NODE_STROKE_WIDTH = 1;

/** 文字の大きさ（CSS ピクセル）と、円の下端から文字の中心までの距離。 */
const FONT_SIZE = 10;
const LABEL_OFFSET = 7;

/**
 * 等幅フォントのトークンが解決できなかったときの退避先。
 *
 * 色と違い @theme のトークンは font-family であり、空文字のまま
 * ctx.font へ渡すと代入が黙って無視される。
 */
const FALLBACK_FONT_FAMILY = 'monospace';

/**
 * フレームごとに使い回す器。
 *
 * 毎フレーム Map を作り直さないのは、10 ノードでも 60 回毎秒の割り当てが
 * 6 パネル同時稼働で積み上がるため（CLAUDE.md TypeScript 規約）。
 */
type RenderScratch = {
  previousById: Map<string, main.GraphNode>;
  placements: Map<string, NodePlacement>;
};

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
 * 補間のための 2 世代ぶんのグラフと、最新が届いた時刻。
 *
 * 1 つの ref にまとめて持つのは、3 つを別々に更新すると描画側が
 * 世代の食い違った組み合わせを読みうるため。
 */
type GraphState = { previous: Graph; latest: Graph; arrivedAt: number };

/**
 * 新しいグラフを取り込む。Seq が進んでいないものは捨てる。
 *
 * 購読とスナップショットの取得が同じ世代・古い世代を重ねて運ぶため、
 * Seq が大きいほうだけを描画対象にする（受け入れ基準 8.3）。
 */
function advance(current: GraphState, incoming: Graph, now: number): GraphState {
  if (incoming.seq <= current.latest.seq) {
    return current;
  }
  return { previous: current.latest, latest: incoming, arrivedAt: now };
}

/**
 * 擬似依存関係を Canvas 2D へ描く。
 *
 * 'use client' をこの葉のコンポーネントに置くのは、DashboardGrid と page.tsx へ
 * 広げると Strict Mode が描画を 2 回呼び、作業単位 dashboard-shell の
 * 受け入れ基準 1.4 を破るため。
 */
export function DependencyGraphPanel(): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // グラフを state に置かないのは、毎秒 1 回の更新で React の再描画を起こす必要が
  // ないため。描画は requestAnimationFrame のループが ref を読んで行う
  // （CLAUDE.md TypeScript 規約）。
  const graphRef = useRef<GraphState>({ previous: EMPTY_GRAPH, latest: EMPTY_GRAPH, arrivedAt: 0 });
  // 描画領域の CSS 上の寸法。バッキングストアの画素数と分けて持つのは、
  // 配置の計算を CSS ピクセルで行い、devicePixelRatio を変換行列側へ寄せるため。
  const viewRef = useRef({ width: 0, height: 0 });

  // キャンバスの寸法を枠と devicePixelRatio へ追随させる（受け入れ基準 11.1・11.2）。
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) {
      return;
    }

    const resize = (): void => {
      const rect = canvas.getBoundingClientRect();
      viewRef.current = { width: rect.width, height: rect.height };
      // 0 のときは属性を書き換えない。0 の canvas への setTransform は
      // 意味が無く、描画側は viewRef の 0 を見てフレームを飛ばす（受け入れ基準 10.9）。
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
    // アンマウントで観測を止める（受け入れ基準 11.7）。
    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    // スナップショットより先に購読を始めるのは、取得中に届いたフレームを
    // 落とさないため（受け入れ基準 8.1）。
    const unsubscribe = subscribeGraph((graph) => {
      graphRef.current = advance(graphRef.current, graph, performance.now());
    });

    loadSnapshot()
      .then((snapshot) => {
        // 取得のあいだに購読側が新しい世代を受けている場合があり、無条件に
        // 上書きすると表示が巻き戻る（受け入れ基準 8.3）。
        graphRef.current = advance(graphRef.current, snapshot.graph, performance.now());
      })
      .catch((reason: unknown) => {
        // 画面にエラーを出さず空のグラフで開始する。以後の更新イベントで表示は埋まる
        // （受け入れ基準 8.5）。
        console.error('初期スナップショットの取得に失敗した。空の依存グラフで開始する:', reason);
      });

    // アンマウントで購読を解除する（受け入れ基準 8.4）。
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
      // 画面にエラーを出さず、枠は空のまま残す（spec.md §5.7）。
      console.error('Canvas の 2D コンテキストを取得できない。依存グラフの描画を行わない');
      return;
    }

    // 色はマウント時に 1 度だけ読む。毎フレーム読むと描画のたびに
    // スタイル計算が走る（受け入れ基準 11.6）。
    const colors: PanelColors = {
      ok: readToken('--color-accent-graph', FALLBACK_GRAPH_COLOR),
      warn: readToken('--color-level-warn', FALLBACK_WARN_COLOR),
      down: readToken('--color-level-error', FALLBACK_DOWN_COLOR),
      dim: readToken('--color-text-dim', FALLBACK_DIM_COLOR),
      background: readToken('--color-surface-1', FALLBACK_BACKGROUND_COLOR),
    };

    // 色と同じくマウント時に 1 度だけ組み立てる（受け入れ基準 11.6）。
    const font = `${FONT_SIZE}px ${readToken('--font-mono', FALLBACK_FONT_FAMILY)}`;
    // フレームごとに作り直さず、ループの寿命のあいだ使い回す。
    const scratch: RenderScratch = { previousById: new Map(), placements: new Map() };

    let handle = 0;

    const frame = (): void => {
      handle = window.requestAnimationFrame(frame);
      // 早期 return より前に記録する。描き直しを省いたフレームも 1 枚として
      // 数えないと、パネルごとのフレーム間隔が比較できなくなるため（spec.md §9.1）。
      recordFrame(PANEL_NAME, performance.now());

      const view = viewRef.current;
      if (view.width === 0 || view.height === 0) {
        // 0 除算で NaN を画面へ出さない（受け入れ基準 10.9）。
        return;
      }

      // コミットグラフと違い条件で間引かない。座標を補間して毎フレーム描くのが
      // このパネルの要件である（受け入れ基準 10.6）。
      render(ctx, canvas, view, graphRef.current, performance.now(), colors, font, scratch);
    };

    handle = window.requestAnimationFrame(frame);
    // アンマウントでループを止める（受け入れ基準 11.7）。止めないと外れた
    // キャンバスへ描き続け、パネルの数だけ無駄なフレームが積み上がる。
    return () => {
      window.cancelAnimationFrame(handle);
    };
  }, []);

  // 枠いっぱいに広げる。block にするのは、inline 要素の行下の余白で
  // 枠がわずかに縦へ溢れ、ページ側にスクロールバーが出るのを防ぐため
  // （受け入れ基準 11.3）。
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
  state: GraphState,
  now: number,
  colors: PanelColors,
  font: string,
  scratch: RenderScratch,
): void {
  const scaleX = canvas.width / view.width;
  const scaleY = canvas.height / view.height;
  ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);
  ctx.clearRect(0, 0, view.width, view.height);
  ctx.fillStyle = colors.background;
  ctx.fillRect(0, 0, view.width, view.height);

  if (state.latest.nodes.length === 0) {
    return;
  }

  // 経過が送出間隔を超えても比を 1 で頭打ちにし、最新の座標のまま描き続ける
  // （受け入れ基準 10.7）。lerp 側でも 0〜1 の外を端点へ丸める。
  const t = (now - state.arrivedAt) / GRAPH_INTERVAL_MS;

  const { previousById, placements } = scratch;
  previousById.clear();
  for (const node of state.previous.nodes) {
    previousById.set(node.id, node);
  }

  placements.clear();
  for (const node of state.latest.nodes) {
    const previous = previousById.get(node.id);
    if (previous === undefined) {
      // 直前の世代に居ないノードは補間せず最新の座標をそのまま使う
      // （受け入れ基準 10.8）。原点から飛んでくるように見せないため。
      placements.set(node.id, placeNode(node.x, node.y, node.load, view));
      continue;
    }
    // 負荷も混ぜるのは、半径だけが毎秒 1 回跳ねると座標を補間した意味が
    // 消えるため。座標の補間が要件（受け入れ基準 10.6）で、半径はその見え方に従う。
    placements.set(
      node.id,
      placeNode(lerp(previous.x, node.x, t), lerp(previous.y, node.y, t), lerp(previous.load, node.load, t), view),
    );
  }

  // エッジを先に、ノードを後に描く。線がノードの円の上に重ならないようにするため
  // （受け入れ基準 10.4）。
  drawEdges(ctx, state.latest.edges, placements, colors);
  drawNodes(ctx, state.latest.nodes, placements, colors);
  drawLabels(ctx, state.latest.nodes, placements, colors, font);
}

/** エッジを流量に応じた太さと濃さで引く。両端の配置が揃わないエッジは描かない。 */
function drawEdges(
  ctx: CanvasRenderingContext2D,
  edges: readonly main.GraphEdge[],
  placements: ReadonlyMap<string, NodePlacement>,
  colors: PanelColors,
): void {
  ctx.strokeStyle = colors.ok;

  for (const edge of edges) {
    const from = placements.get(edge.from);
    const to = placements.get(edge.to);
    if (from === undefined || to === undefined) {
      continue;
    }
    ctx.lineWidth = EDGE_WIDTH_BASE + EDGE_WIDTH_FLOW * edge.flow;
    ctx.globalAlpha = EDGE_ALPHA_BASE + EDGE_ALPHA_FLOW * edge.flow;
    ctx.beginPath();
    ctx.moveTo(from.cx, from.cy);
    ctx.lineTo(to.cx, to.cy);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/** ノードの円を健康状態の色で塗る（受け入れ基準 10.5）。 */
function drawNodes(
  ctx: CanvasRenderingContext2D,
  nodes: readonly main.GraphNode[],
  placements: ReadonlyMap<string, NodePlacement>,
  colors: PanelColors,
): void {
  // 背景色で縁取るのは、重なった円の境目を色の違いだけに頼らず示すため。
  ctx.strokeStyle = colors.background;
  ctx.lineWidth = NODE_STROKE_WIDTH;

  for (const node of nodes) {
    const placement = placements.get(node.id);
    if (placement === undefined) {
      continue;
    }
    ctx.fillStyle = healthColor(node.health, colors);
    ctx.beginPath();
    ctx.arc(placement.cx, placement.cy, placement.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}

/** ノード名を円の下に添える。画面に出る文字は英語のまま扱う。 */
function drawLabels(
  ctx: CanvasRenderingContext2D,
  nodes: readonly main.GraphNode[],
  placements: ReadonlyMap<string, NodePlacement>,
  colors: PanelColors,
  font: string,
): void {
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = colors.dim;

  for (const node of nodes) {
    const placement = placements.get(node.id);
    if (placement === undefined) {
      continue;
    }
    ctx.fillText(node.id, placement.cx, placement.cy + placement.radius + LABEL_OFFSET);
  }
}

/**
 * 健康状態を色へ写す。ok・warn・down を互いに異なる色にする（受け入れ基準 10.5）。
 *
 * 未知の値を ok ではなく dim へ落とすのは、Go 側が 3 値以外を返しえない契約
 * （§6.3）を破ったときに、正常として見過ごさないため。
 */
function healthColor(health: string, colors: PanelColors): string {
  switch (health) {
    case 'ok':
      return colors.ok;
    case 'warn':
      return colors.warn;
    case 'down':
      return colors.down;
    default:
      return colors.dim;
  }
}
