'use client';

import { useEffect, useRef } from 'react';
import type { main } from '../../wailsjs/go/models';
import { type CommitRowLayout, commitLaneX, commitRowLayout, commitRowY, visibleCommitCount } from '../lib/commitgraph';
import { loadSnapshot, subscribeCommits } from '../lib/feed';
import { recordFrame } from '../lib/framestats';

/** 計測器へ渡すパネル名（spec.md §9.1）。 */
const PANEL_NAME = 'commit';

/**
 * このパネルが読むコミットの形。
 *
 * 生成された main.Commit はメソッド convertValues を持つクラスだが、
 * イベントで届く payload も Snapshot の戻り値も素の JSON であって
 * インスタンスではない（unit #2 の Scatter3DPanel と同じ扱い）。
 */
type Commit = Pick<main.Commit, 'seq' | 'id' | 'lane' | 'parents' | 'branch' | 'summary'>;

/**
 * 保持するコミットの上限。Go 側の appCommitCapacity と対にする。
 *
 * フロントエンド側でも上限を持つのは、購読が続くかぎり配列が伸び続けるのを
 * 防ぐため。Go 側が捨てた古いコミットを画面に残す意味は無い。
 */
const MAX_COMMITS = 120;

/**
 * トークンの解決に失敗したときの退避先（受け入れ基準 11.5）。
 *
 * 16 進の直値を置かないのは、色の正本を globals.css の @theme に一本化する
 * 規律のため（受け入れ基準 11.4）。unit #2 が採った折衷を踏襲する。
 */
const FALLBACK_COMMIT_COLOR = 'white';
const FALLBACK_TEXT_COLOR = 'white';
const FALLBACK_DIM_COLOR = 'gray';
const FALLBACK_BACKGROUND_COLOR = 'transparent';

/** 描画に使う色。マウント時に 1 度だけ解決する。 */
type PanelColors = { commit: string; text: string; dim: string; background: string };

/**
 * レーンの上限。Go 側の commitMaxLanes と対にする。
 *
 * 配置の初回計算で使う。実際に使われているレーン数は描く直前に数え直す。
 */
const MAX_LANES = 4;

/** レーン 0（主線）と、それ以外のレーンの不透明度（受け入れ基準 9.5）。 */
const ALPHA_MAIN_LANE = 1.0;
const ALPHA_SIDE_LANE = 0.5;

/** コミットの点の半径（CSS ピクセル）と、レーンの間隔に対する上限の比。 */
const DOT_RADIUS = 3;
const DOT_RADIUS_LANE_RATIO = 0.32;

/** 親への線の太さ（CSS ピクセル）。 */
const EDGE_WIDTH = 1.4;

/** 文字の大きさ（CSS ピクセル）と、ブランチ名と要約のあいだの余白。 */
const FONT_SIZE = 11;
const TEXT_GAP = 6;

/** 右端に残す余白。文字が枠の縁に触れないようにする（受け入れ基準 11.3）。 */
const RIGHT_PADDING = 6;

/** 切り詰めた文字列の末尾に付ける印。画面に出る文字は英語のまま扱う。 */
const ELLIPSIS = '...';

/**
 * 等幅フォントのトークンが解決できなかったときの退避先。
 *
 * 色と違い @theme のトークンは font-family であり、空文字のまま
 * ctx.font へ渡すと代入が黙って無視される。
 */
const FALLBACK_FONT_FAMILY = 'monospace';

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
 * 届いたコミットを既存の履歴へ併合し、新しい順に並べた配列を返す。
 *
 * Seq を鍵に重複を 1 件へ潰すのは、購読とスナップショットの取得が
 * 同じコミットを重ねて運ぶため（受け入れ基準 8.2）。
 */
function mergeCommits(current: readonly Commit[], incoming: readonly Commit[]): Commit[] {
  const bySeq = new Map<number, Commit>();
  for (const commit of current) {
    bySeq.set(commit.seq, commit);
  }
  for (const commit of incoming) {
    bySeq.set(commit.seq, commit);
  }
  // 新しい順。描画は 0 番目を上端に置く（受け入れ基準 9.3）。
  const merged = Array.from(bySeq.values()).sort((a, b) => b.seq - a.seq);
  merged.length = Math.min(merged.length, MAX_COMMITS);
  return merged;
}

/**
 * 擬似コミット履歴を Canvas 2D へ描く。
 *
 * 'use client' をこの葉のコンポーネントに置くのは、DashboardGrid と page.tsx へ
 * 広げると Strict Mode が描画を 2 回呼び、作業単位 dashboard-shell の
 * 受け入れ基準 1.4 を破るため。
 */
export function CommitGraphPanel(): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // 履歴を state に置かないのは、1.5 秒ごとの更新で React の再描画を起こす必要が
  // ないため。描画は requestAnimationFrame のループが ref を読んで行う
  // （CLAUDE.md TypeScript 規約）。
  const commitsRef = useRef<Commit[]>([]);
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
      // 意味が無く、描画側は viewRef の 0 を見てフレームを飛ばす（受け入れ基準 9.8）。
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
    const unsubscribe = subscribeCommits((batch) => {
      commitsRef.current = mergeCommits(commitsRef.current, batch);
    });

    loadSnapshot()
      .then((snapshot) => {
        // Seq を鍵に併合する。取得のあいだに購読側が新しいコミットを受けている
        // 場合があり、無条件に上書きすると表示が巻き戻る（受け入れ基準 8.2）。
        commitsRef.current = mergeCommits(commitsRef.current, snapshot.commits);
      })
      .catch((reason: unknown) => {
        // 画面にエラーを出さず空の履歴で開始する。以後の更新イベントで表示は埋まる
        // （受け入れ基準 8.5）。
        console.error('初期スナップショットの取得に失敗した。空のコミット履歴で開始する:', reason);
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
      // 画面にエラーを出さず、枠は空のまま残す（spec.md §5.6）。
      console.error('Canvas の 2D コンテキストを取得できない。コミットグラフの描画を行わない');
      return;
    }

    // 色はマウント時に 1 度だけ読む。毎フレーム読むと描画のたびに
    // スタイル計算が走る（受け入れ基準 11.6）。
    const colors: PanelColors = {
      commit: readToken('--color-accent-commit', FALLBACK_COMMIT_COLOR),
      text: readToken('--color-text', FALLBACK_TEXT_COLOR),
      dim: readToken('--color-text-dim', FALLBACK_DIM_COLOR),
      background: readToken('--color-surface-1', FALLBACK_BACKGROUND_COLOR),
    };
    // 色と同じくマウント時に 1 度だけ組み立てる（受け入れ基準 11.6）。
    const font = `${FONT_SIZE}px ${readToken('--font-mono', FALLBACK_FONT_FAMILY)}`;

    // 前フレームの描画条件。変化していなければ描き直さない（受け入れ基準 9.7）。
    let drawnSeq = -1;
    let drawnWidth = -1;
    let drawnHeight = -1;
    let handle = 0;

    const frame = (): void => {
      handle = window.requestAnimationFrame(frame);
      // 早期 return より前に記録する。描き直しを省いたフレームも 1 枚として
      // 数えないと、パネルごとのフレーム間隔が比較できなくなるため（spec.md §9.1）。
      recordFrame(PANEL_NAME, performance.now());

      const view = viewRef.current;
      if (view.width === 0 || view.height === 0) {
        // 0 除算で NaN を画面へ出さない（受け入れ基準 9.8）。
        return;
      }

      const commits = commitsRef.current;
      const latestSeq = commits.length === 0 ? 0 : commits[0].seq;
      if (latestSeq === drawnSeq && view.width === drawnWidth && view.height === drawnHeight) {
        // 静止した図であり、同じ画を描き直しても 6 パネル同時稼働時の負荷が
        // 増えるだけである（spec.md §3 前提 2）。
        return;
      }
      drawnSeq = latestSeq;
      drawnWidth = view.width;
      drawnHeight = view.height;

      render(ctx, canvas, view, commits, colors, font);
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
  commits: readonly Commit[],
  colors: PanelColors,
  font: string,
): void {
  const scaleX = canvas.width / view.width;
  const scaleY = canvas.height / view.height;
  ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);
  ctx.clearRect(0, 0, view.width, view.height);
  ctx.fillStyle = colors.background;
  ctx.fillRect(0, 0, view.width, view.height);

  if (commits.length === 0) {
    return;
  }

  // 行の高さはレーン数に依らないが、そこへ寄りかからないよう 2 段で決める。
  // まず上限のレーン数で枠に収まる行数を出し、その範囲で実際に使われている
  // レーン数を数え直してから配置を確定する（受け入れ基準 9.3）。
  const provisional = commitRowLayout(view, MAX_LANES);
  const count = Math.min(visibleCommitCount(view, provisional), commits.length);

  let usedLanes = 1;
  for (let i = 0; i < count; i += 1) {
    usedLanes = Math.max(usedLanes, commits[i].lane + 1);
  }
  const layout = commitRowLayout(view, usedLanes);

  // 親の行位置を引くための索引。描画範囲の外の親は線を引かない（受け入れ基準 9.4）。
  const rowBySeq = new Map<number, number>();
  for (let i = 0; i < count; i += 1) {
    rowBySeq.set(commits[i].seq, i);
  }

  drawEdges(ctx, commits, count, layout, rowBySeq, colors);
  drawDots(ctx, commits, count, layout, colors);
  drawLabels(ctx, commits, count, layout, view, colors, font);
}

/** 各コミットから、描画範囲にある親へ線を引く。点より先に描いて円の下へ回す。 */
function drawEdges(
  ctx: CanvasRenderingContext2D,
  commits: readonly Commit[],
  count: number,
  layout: CommitRowLayout,
  rowBySeq: ReadonlyMap<number, number>,
  colors: PanelColors,
): void {
  ctx.strokeStyle = colors.commit;
  ctx.lineWidth = EDGE_WIDTH;

  for (let i = 0; i < count; i += 1) {
    const commit = commits[i];
    const childX = commitLaneX(commit.lane, layout);
    const childY = commitRowY(i, layout);

    for (const parentSeq of commit.parents) {
      const parentRow = rowBySeq.get(parentSeq);
      if (parentRow === undefined) {
        continue;
      }
      const parent = commits[parentRow];
      const parentX = commitLaneX(parent.lane, layout);
      const parentY = commitRowY(parentRow, layout);

      // 線の濃さは子と親の浅いほうのレーンに合わせる。主線から枝が出る箇所を
      // 薄い側に引きずられて見失わないようにするため。
      ctx.globalAlpha = laneAlpha(Math.min(commit.lane, parent.lane));
      ctx.beginPath();
      ctx.moveTo(childX, childY);
      if (childX === parentX) {
        ctx.lineTo(parentX, parentY);
      } else {
        // レーンをまたぐときだけ曲げる。折れ線にすると分岐とマージの向きが
        // 直角になり、履歴の枝分かれとして読みにくい。
        ctx.bezierCurveTo(childX, (childY + parentY) / 2, parentX, (childY + parentY) / 2, parentX, parentY);
      }
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}

/** 各コミットの点を、その Lane に対応する列へ置く。 */
function drawDots(
  ctx: CanvasRenderingContext2D,
  commits: readonly Commit[],
  count: number,
  layout: CommitRowLayout,
  colors: PanelColors,
): void {
  // レーンが詰まった狭い枠でも円どうしが重ならないよう、間隔に対して頭打ちにする。
  const radius = Math.min(DOT_RADIUS, layout.laneStep * DOT_RADIUS_LANE_RATIO);
  ctx.fillStyle = colors.commit;

  for (let i = 0; i < count; i += 1) {
    const commit = commits[i];
    ctx.globalAlpha = laneAlpha(commit.lane);
    ctx.beginPath();
    ctx.arc(commitLaneX(commit.lane, layout), commitRowY(i, layout), radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** 各行にブランチ名と要約を添える。いずれも枠の幅で切り詰める（受け入れ基準 9.6）。 */
function drawLabels(
  ctx: CanvasRenderingContext2D,
  commits: readonly Commit[],
  count: number,
  layout: CommitRowLayout,
  view: { width: number; height: number },
  colors: PanelColors,
  font: string,
): void {
  ctx.font = font;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';

  const rightEdge = view.width - RIGHT_PADDING;

  for (let i = 0; i < count; i += 1) {
    const commit = commits[i];
    const y = commitRowY(i, layout);

    // ブランチ名は要約より先に切る。どの枝の変更かのほうが、要約の末尾より
    // 履歴として読む価値が高い。
    ctx.fillStyle = colors.dim;
    const branch = truncateToWidth(ctx, commit.branch, rightEdge - layout.textOriginX);
    ctx.fillText(branch, layout.textOriginX, y);

    const summaryX = layout.textOriginX + ctx.measureText(branch).width + TEXT_GAP;
    ctx.fillStyle = colors.text;
    ctx.fillText(truncateToWidth(ctx, commit.summary, rightEdge - summaryX), summaryX, y);
  }
}

/** レーン 0（主線）を最も強く描く（受け入れ基準 9.5)。 */
function laneAlpha(lane: number): number {
  return lane === 0 ? ALPHA_MAIN_LANE : ALPHA_SIDE_LANE;
}

/**
 * 指定した幅に収まるところまで文字列を切り詰め、切ったことを印で示す。
 *
 * 二分探索で測るのは、等幅フォントが解決できず 1 文字の幅が一定にならない
 * 場合でも正しく収めるため。1 行あたりの measureText の回数は log に留まる。
 */
function truncateToWidth(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (maxWidth <= 0) {
    return '';
  }
  if (ctx.measureText(text).width <= maxWidth) {
    return text;
  }

  let fits = 0;
  let upper = text.length;
  while (fits < upper) {
    const mid = Math.ceil((fits + upper) / 2);
    if (ctx.measureText(text.slice(0, mid) + ELLIPSIS).width <= maxWidth) {
      fits = mid;
    } else {
      upper = mid - 1;
    }
  }
  // 印すら収まらないときは何も描かない。印だけが並ぶ行にしても情報が無い。
  return fits === 0 ? '' : text.slice(0, fits) + ELLIPSIS;
}
