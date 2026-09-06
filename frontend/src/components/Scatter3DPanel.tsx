'use client';

import { useEffect, useRef } from 'react';
import type { main } from '../../wailsjs/go/models';
import { AXIS_SEGMENTS } from '../lib/axes';
import { loadSnapshot, subscribeScatter } from '../lib/feed';
import { recordFrame } from '../lib/framestats';
import { advanceOrbit, beginDrag, createOrbit, dragBy, endDrag, type Orbit } from '../lib/orbit';
import {
  buildRamp,
  DEPTH_BANDS,
  PALETTE_STEPS,
  parseHex,
  type Rgb,
  rotateHue,
  TERRAIN_CYCLE_MS,
  TERRAIN_PHASES,
} from '../lib/palette';
import { createProjectedCloud, type Projected, type ProjectedCloud, projectPoint, projectPoints } from '../lib/project';

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

/** 構造の数（地形・球・トーラス。`ScatterPoint.s` の取りうる値の数。spec.md §6.1）。 */
const STRUCTURE_COUNT = 3;

/** 1 構造あたりのバケット数（帯 × 段）。 */
const BUCKETS_PER_STRUCTURE = DEPTH_BANDS * PALETTE_STEPS;

/** バケットの総数（spec.md §6.4。576）。 */
const BUCKET_COUNT = STRUCTURE_COUNT * BUCKETS_PER_STRUCTURE;

/** 地形の位相 1 つあたりの色相の回転角（度）。36 位相で 1 周する（spec.md §6.5）。 */
const TERRAIN_HUE_STEP_DEGREES = 360 / TERRAIN_PHASES;

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
const FALLBACK_BACKGROUND_COLOR = 'transparent';
// 軸線の退避先を gray にするのは、点の退避色 white と区別がつくようにするため。
const FALLBACK_LINE_COLOR = 'gray';

/** 停止色のトークン名。並びは低 → 高（spec.md §6.5）。 */
const TERRAIN_STOP_TOKENS: readonly string[] = [
  '--color-scatter-terrain-low',
  '--color-scatter-terrain-mid',
  '--color-scatter-terrain-high',
];
const SPHERE_STOP_TOKENS: readonly string[] = ['--color-scatter-sphere-low', '--color-scatter-sphere-high'];
const TORUS_STOP_TOKENS: readonly string[] = ['--color-scatter-torus-low', '--color-scatter-torus-high'];

/** 描画に使う色。マウント時に 1 度だけ解決する。 */
type PanelColors = { background: string; axis: string; edge: string };

/** 帯 × 段の色文字列の表（`buildRamp` の戻り値。不透明度 `BAND_ALPHA` を焼き込み済み）。 */
type Ramp = string[][];

/** 点の色の表。地形は位相ごとに 1 表、球・トーラスは 1 表ずつ（spec.md §6.5）。 */
type Palettes = { terrain: Ramp[]; sphere: Ramp; torus: Ramp };

/**
 * 点群 1 フレームぶんの作業領域。点群の長さが変わったときだけ作り直す（spec.md §7 7.6）。
 *
 * `counts` は counting sort の計数用で、先頭に 0 を置くため長さはバケット数 + 1。
 * `keys` は点ごとのバケット番号（0〜575 なので 16 bit で足りる）。
 * `order` はバケット順に並べた点の添字。
 */
type CloudBuffers = { projected: ProjectedCloud; keys: Uint16Array; counts: Uint32Array; order: Uint32Array };

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

/**
 * 停止色のトークンをまとめて解決する。1 つでも欠けるか `#rrggbb` でなければ null。
 *
 * 部分的に解決して補間すると意図しない色になるため、構造ごとにまとめて退避する（spec.md §6.5）。
 */
function readStops(names: readonly string[]): Rgb[] | null {
  const stops: Rgb[] = [];
  for (const name of names) {
    const rgb = parseHex(readToken(name, ''));
    if (rgb === null) {
      return null;
    }
    stops.push(rgb);
  }
  return stops;
}

/**
 * 全段を退避色で埋めた表を返す（spec.md §7 6.7）。
 *
 * 'white' の文字列をここに直接書くのは、退避先が凍結 spec Requirement 9.2 の許容色であり、
 * トークンの解決に失敗した状況で他のトークンに頼らないため。
 */
function fallbackRamp(label: string): Ramp {
  console.error(`3D 散布図の色トークンを解決できない（${label}）。全段を退避色で描く`);
  const ramp: Ramp = [];
  for (let band = 0; band < DEPTH_BANDS; band += 1) {
    ramp.push(new Array<string>(PALETTE_STEPS).fill('white'));
  }
  return ramp;
}

/**
 * パレットの表を作る。マウント時に 1 度だけ呼ぶ（spec.md §6.5、§3 前提 7）。
 *
 * 地形は停止色の色相を位相ぶん回してから補間する。毎フレーム補間すると段数ぶんの文字列を
 * 作ることになり、CLAUDE.md の規約に反する（spec.md §8）。
 */
function buildPalettes(): Palettes {
  const terrainStops = readStops(TERRAIN_STOP_TOKENS);
  const terrain: Ramp[] = [];
  if (terrainStops === null) {
    const fallback = fallbackRamp('terrain');
    for (let phase = 0; phase < TERRAIN_PHASES; phase += 1) {
      terrain.push(fallback);
    }
  } else {
    for (let phase = 0; phase < TERRAIN_PHASES; phase += 1) {
      const degrees = TERRAIN_HUE_STEP_DEGREES * phase;
      terrain.push(buildRamp(terrainStops.map((stop) => rotateHue(stop, degrees))));
    }
  }

  const sphereStops = readStops(SPHERE_STOP_TOKENS);
  const sphere = sphereStops === null ? fallbackRamp('sphere') : buildRamp(sphereStops);
  const torusStops = readStops(TORUS_STOP_TOKENS);
  const torus = torusStops === null ? fallbackRamp('torus') : buildRamp(torusStops);
  return { terrain, sphere, torus };
}

/** 点群の長さに合わせた作業領域を作る。描画関数の外（長さが変わった分岐）でだけ呼ぶ。 */
function allocateBuffers(length: number): CloudBuffers {
  return {
    projected: createProjectedCloud(length),
    keys: new Uint16Array(length),
    counts: new Uint32Array(BUCKET_COUNT + 1),
    order: new Uint32Array(length),
  };
}

/**
 * 1 フレームを描く。
 *
 * 描画対象は canvas のバッキングストアで、投影は CSS ピクセルで行うため、
 * devicePixelRatio ぶんの拡大は変換行列で吸収する。
 *
 * `axisFrom`・`axisTo`・`buffers` は呼び出し側が持ち回る作業領域で、内容はこの関数が上書きする。
 * この関数の中では新しいオブジェクト・配列・関数・文字列を作らない（spec.md §7 7.7、9.4）。
 */
function render(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  view: { width: number; height: number },
  cloud: Cloud,
  orbit: Orbit,
  colors: PanelColors,
  palettes: Palettes,
  terrainPhase: number,
  axisFrom: Projected,
  axisTo: Projected,
  buffers: CloudBuffers,
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
    projectPoint(segment.from, yaw, pitch, view, axisFrom);
    projectPoint(segment.to, yaw, pitch, view, axisTo);
    const nearness = ((axisFrom.depth + axisTo.depth) / 2 + DEPTH_LIMIT) / (2 * DEPTH_LIMIT);
    ctx.globalAlpha = LINE_ALPHA_FAR + LINE_ALPHA_SPAN * nearness;
    ctx.strokeStyle = segment.kind === 'axis' ? colors.axis : colors.edge;
    ctx.beginPath();
    ctx.moveTo(axisFrom.sx, axisFrom.sy);
    ctx.lineTo(axisTo.sx, axisTo.sy);
    ctx.stroke();
  }
  // 点の不透明度は帯ごとに色文字列へ焼き込んである（BAND_ALPHA）ため、点の描画では
  // globalAlpha を触らない。軸線が残した値を 1 へ戻してから点を描く（spec.md §7 7.5）。
  ctx.globalAlpha = 1;

  const points = cloud.points;
  const projected = buffers.projected;
  const keys = buffers.keys;
  const counts = buffers.counts;
  const order = buffers.order;

  // 投影は一括で行い、三角関数の評価を 4 回に抑える（spec.md §5.3）。
  projectPoints(points, yaw, pitch, view, projected);
  const length = projected.length;

  // 第 1 段: 各点のバケット番号を求め、バケットごとの点数を数える（spec.md §6.4）。
  // 旧形式の payload では s・c が無いので 0 として読む（spec.md §7 4.3）。
  counts.fill(0);
  for (let i = 0; i < length; i += 1) {
    const point = points[i];
    const nearness = (projected.depth[i] + DEPTH_LIMIT) / (2 * DEPTH_LIMIT);
    const band = Math.min(DEPTH_BANDS - 1, Math.floor(nearness * DEPTH_BANDS));
    const structure = Math.min(STRUCTURE_COUNT - 1, Math.max(0, point.s ?? 0));
    const step = Math.min(PALETTE_STEPS - 1, Math.floor((point.c ?? 0) * PALETTE_STEPS));
    const key = structure * BUCKETS_PER_STRUCTURE + band * PALETTE_STEPS + step;
    keys[i] = key;
    counts[key + 1] += 1;
  }
  // 第 2 段: 累積和でバケットの先頭位置にし、添字をバケット順へ並べる（counting sort。比較ソートを使わない。spec.md §7 7.4）。
  for (let key = 1; key <= BUCKET_COUNT; key += 1) {
    counts[key] += counts[key - 1];
  }
  for (let i = 0; i < length; i += 1) {
    const key = keys[i];
    order[counts[key]] = i;
    counts[key] += 1;
  }

  // 第 3 段: バケットの昇順に描く。fillStyle の設定はバケットごとに 1 回（spec.md §7 7.2、9.6）。
  // 並べ替えの後、counts[key] はバケット key の終端（= 次のバケットの先頭）になっている。
  const terrain = palettes.terrain[terrainPhase];
  let start = 0;
  for (let key = 0; key < BUCKET_COUNT; key += 1) {
    const end = counts[key];
    if (end === start) {
      continue;
    }
    const structure = Math.floor(key / BUCKETS_PER_STRUCTURE);
    const band = Math.floor((key % BUCKETS_PER_STRUCTURE) / PALETTE_STEPS);
    const step = key % PALETTE_STEPS;
    const table = structure === 0 ? terrain : structure === 1 ? palettes.sphere : palettes.torus;
    ctx.fillStyle = table[band][step];
    // 奥・中の帯は 1 px、手前の帯は 2 px の正方形（spec.md §7 7.3）。
    const size = band === DEPTH_BANDS - 1 ? 2 : 1;
    for (let j = start; j < end; j += 1) {
      const index = order[j];
      ctx.fillRect(projected.sx[index], projected.sy[index], size, size);
    }
    start = end;
  }
  // 次のフレームの clearRect / fillRect が半透明にならないよう戻す（spec.md §7 7.5）。
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
      background: readToken('--color-surface-1', FALLBACK_BACKGROUND_COLOR),
      axis: readToken('--color-text-dim', FALLBACK_LINE_COLOR),
      edge: readToken('--color-border', FALLBACK_LINE_COLOR),
    };
    // 点のパレットもマウント時に 1 度だけ作る（spec.md §6.5）。
    const palettes = buildPalettes();

    // 軸線の両端の投影を受ける器。effect の寿命で 2 個だけ作り、毎フレーム同じ器を渡す（spec.md §7 5.6）。
    const axisFrom: Projected = { sx: 0, sy: 0, scale: 0, depth: 0 };
    const axisTo: Projected = { sx: 0, sy: 0, scale: 0, depth: 0 };
    // 点群の作業領域。長さが変わった分岐（下の frame）でだけ作り直す（spec.md §7 7.6）。
    let buffers = allocateBuffers(0);

    // 視点はこの effect の寿命で 1 つだけ作り、状態機械がその場で更新する（spec.md §6.1）。
    const orbit = createOrbit();
    let prevMs: number | null = null;
    // 地形の位相の起点。マウントからの経過時間で位相を進める（spec.md §7 6.8）。
    let startMs: number | null = null;
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
      if (startMs === null) {
        startMs = nowMs;
      }

      const view = viewRef.current;
      if (view.width === 0 || view.height === 0) {
        // 0 除算で NaN を画面へ出さない（spec.md §7 6.6、8.4）。
        return;
      }

      const cloud = cloudRef.current;
      // 点数は固定（spec.md §3 前提 3）だが、空の点群から最初の点群へ移る瞬間だけ長さが変わる。
      // そのときだけ器を作り直す（spec.md §7 7.6）。
      if (cloud.points.length !== buffers.order.length) {
        buffers = allocateBuffers(cloud.points.length);
      }
      const elapsedMs = nowMs - startMs;
      const terrainPhase = Math.floor(((elapsedMs % TERRAIN_CYCLE_MS) / TERRAIN_CYCLE_MS) * TERRAIN_PHASES);

      render(ctx, canvas, view, cloud, orbit, colors, palettes, terrainPhase, axisFrom, axisTo, buffers);
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
