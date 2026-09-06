'use client';

import { useEffect, useRef } from 'react';
import type { main } from '../../wailsjs/go/models';
import { loadSnapshot, subscribeScatter } from '../lib/feed';
import { recordFrame } from '../lib/framestats';
import { labelFrame } from '../lib/labels';
import { advanceOrbit, beginDrag, createOrbit, dragBy, endDrag, type Orbit } from '../lib/orbit';
import { buildRamp, DEPTH_BANDS, PALETTE_STEPS, rotateHue, TERRAIN_CYCLE_MS, TERRAIN_PHASES } from '../lib/palette';
import { PANES, WALL_IDS, wallWeights } from '../lib/panes';
import { createProjectedCloud, type ProjectedCloud, projectPoints } from '../lib/project';
import { buildGroundImage, buildLabelImages } from '../lib/scatterImages';
import {
  buildShadowPalettes,
  createScene,
  drawPane,
  type PanelColors,
  readColors,
  readStops,
  type Scene,
  SHADOW_BUCKET_COUNT,
  SHADOW_STEPS,
  SHADOW_STRIDE,
  type ShadowPalettes,
  SPHERE_STOP_TOKENS,
  STRUCTURE_COUNT,
  TERRAIN_HUE_STEP_DEGREES,
  TERRAIN_STOP_TOKENS,
  TORUS_STOP_TOKENS,
} from '../lib/scatterPanes';

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

/** 1 構造あたりのバケット数（帯 × 段）。 */
const BUCKETS_PER_STRUCTURE = DEPTH_BANDS * PALETTE_STEPS;

/** バケットの総数（spec.md §6.4。576）。 */
const BUCKET_COUNT = STRUCTURE_COUNT * BUCKETS_PER_STRUCTURE;

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
type CloudBuffers = {
  projected: ProjectedCloud;
  keys: Uint16Array;
  counts: Uint32Array;
  order: Uint32Array;
  /** 影用。間引いた点（ceil(点数 / 2)）の投影と、24 バケットの counting sort の作業領域（#4 spec §6.4）。 */
  shadow: ProjectedCloud;
  shadowKeys: Uint8Array;
  shadowCounts: Uint32Array;
  shadowOrder: Uint32Array;
};

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
  const terrainStops = readStops(readToken, TERRAIN_STOP_TOKENS);
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

  const sphereStops = readStops(readToken, SPHERE_STOP_TOKENS);
  const sphere = sphereStops === null ? fallbackRamp('sphere') : buildRamp(sphereStops);
  const torusStops = readStops(readToken, TORUS_STOP_TOKENS);
  const torus = torusStops === null ? fallbackRamp('torus') : buildRamp(torusStops);
  return { terrain, sphere, torus };
}

/** 点群の長さに合わせた作業領域を作る。描画関数の外（長さが変わった分岐）でだけ呼ぶ。 */
function allocateBuffers(length: number): CloudBuffers {
  const shadowLength = Math.ceil(length / SHADOW_STRIDE);
  return {
    projected: createProjectedCloud(length),
    keys: new Uint16Array(length),
    counts: new Uint32Array(BUCKET_COUNT + 1),
    order: new Uint32Array(length),
    shadow: createProjectedCloud(shadowLength),
    shadowKeys: new Uint8Array(shadowLength),
    shadowCounts: new Uint32Array(SHADOW_BUCKET_COUNT + 1),
    shadowOrder: new Uint32Array(shadowLength),
  };
}

/**
 * 地とラベルの画像を枠の寸法と devicePixelRatio に合わせて作り直す。
 * 呼び出し側は寸法・dpr の変化を比較してからだけ呼ぶ（Requirement 5.6）。
 */
function rebuildImages(scene: Scene, colors: PanelColors, width: number, height: number, dpr: number): void {
  scene.imageWidth = width;
  scene.imageHeight = height;
  scene.dpr = dpr;
  scene.ground = colors.ground === null ? null : buildGroundImage(width, height, colors.ground.low, colors.ground.high);
  scene.labelImages = buildLabelImages(scene.labels, dpr, colors.label);
}

/**
 * 1 フレームを描く: 地 → 床 → 重みが正の縦面（塗り・格子・縁・影）→ 点 → ラベル（#4 spec §6.7）。
 *
 * 描画対象は canvas のバッキングストアで、投影は CSS ピクセルで行うため、
 * devicePixelRatio ぶんの拡大は変換行列で吸収する。
 *
 * `scene`・`buffers` は呼び出し側が持ち回る作業領域で、内容はこの関数が上書きする。
 * この関数の中では新しいオブジェクト・配列・関数・文字列を作らない（spec.md §7 7.7、#4 spec Requirement 9.3）。
 */
function render(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  view: { width: number; height: number },
  cloud: Cloud,
  orbit: Orbit,
  colors: PanelColors,
  palettes: Palettes,
  shadows: ShadowPalettes,
  terrainPhase: number,
  scene: Scene,
  buffers: CloudBuffers,
): void {
  const scaleX = canvas.width / view.width;
  const scaleY = canvas.height / view.height;
  ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);
  // 地は不透明な画像で枠全体を覆うので clearRect は要らない。画像を作れなかったときだけべた塗りで退避する（Requirement 5.5・5.7）。
  if (scene.ground === null) {
    ctx.clearRect(0, 0, view.width, view.height);
    ctx.fillStyle = colors.groundFallback;
    ctx.fillRect(0, 0, view.width, view.height);
  } else {
    ctx.drawImage(scene.ground, 0, 0, view.width, view.height);
  }

  const yaw = orbit.yaw;
  const pitch = orbit.pitch;
  const points = cloud.points;

  // 影のバケット順は面によらない（構造と色の値だけで決まる）ので、1 フレームに 1 度だけ並べる（Requirement 4.8）。
  // 旧形式の payload では s・c が無いので 0 として読む（spec.md §7 4.3）。
  const shadowKeys = buffers.shadowKeys;
  const shadowCounts = buffers.shadowCounts;
  const shadowOrder = buffers.shadowOrder;
  const shadowLength = shadowOrder.length;
  shadowCounts.fill(0);
  for (let j = 0; j < shadowLength; j += 1) {
    const point = points[j * SHADOW_STRIDE];
    const structure = Math.min(STRUCTURE_COUNT - 1, Math.max(0, point.s ?? 0));
    const step = Math.min(SHADOW_STEPS - 1, Math.floor((point.c ?? 0) * SHADOW_STEPS));
    const key = structure * SHADOW_STEPS + step;
    shadowKeys[j] = key;
    shadowCounts[key + 1] += 1;
  }
  for (let key = 1; key <= SHADOW_BUCKET_COUNT; key += 1) {
    shadowCounts[key] += shadowCounts[key - 1];
  }
  for (let j = 0; j < shadowLength; j += 1) {
    const key = shadowKeys[j];
    shadowOrder[shadowCounts[key]] = j;
    shadowCounts[key] += 1;
  }

  // 面の重みは 1 フレームに 1 度だけ求め、面とラベルで同じ器を読む（Requirement 2.8）。
  const weights = wallWeights(yaw, scene.weights);
  // 床は重み 1（globalAlpha は前のフレームの出口で 1 に戻してある）。点群が空でも面は描く（Requirement 2.6）。
  drawPane(ctx, PANES.floor, view, yaw, pitch, points, colors, shadows, terrainPhase, scene, buffers);
  for (let k = 0; k < WALL_IDS.length; k += 1) {
    const w = weights[k];
    // 重み 0 の面は描かない。不透明度 0 と同じ結果なので飛びにならない（Requirement 2.1）。
    if (w > 0) {
      ctx.globalAlpha = w;
      drawPane(ctx, PANES[WALL_IDS[k]], view, yaw, pitch, points, colors, shadows, terrainPhase, scene, buffers);
      ctx.globalAlpha = 1;
    }
  }

  const projected = buffers.projected;
  const keys = buffers.keys;
  const counts = buffers.counts;
  const order = buffers.order;

  // 投影は一括で行い、三角関数の評価を 4 回に抑える（spec.md §5.3）。
  projectPoints(points, yaw, pitch, view, projected);
  const length = projected.length;

  // 第 1 段: 各点のバケット番号を求め、バケットごとの点数を数える（spec.md §6.4）。
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
  // 点の不透明度は帯ごとに色文字列へ焼き込んである（BAND_ALPHA）ため、点の描画では globalAlpha を触らない。
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

  // ラベルは点の後に描き、文字を点で隠さない。面ごとに重みの 3 乗を不透明度にし、隣の面の列を面より速く薄れさせる（#4 spec §6.2）。
  const images = scene.labelImages;
  if (images === null) {
    return;
  }
  const labels = scene.labels;
  const frame = scene.frame;
  const scratch = scene.labelScratch;
  const perWall = labels.length / WALL_IDS.length;
  for (let k = 0; k < WALL_IDS.length; k += 1) {
    const w = weights[k];
    if (w <= 0) {
      continue;
    }
    ctx.globalAlpha = w * w * w;
    for (let i = k * perWall; i < (k + 1) * perWall; i += 1) {
      const label = labels[i];
      labelFrame(label, yaw, pitch, view, scene.dpr, scratch, frame);
      // 鏡像（a < 0）・真横に近く潰れた文字（shrink < 0.35）・8 px 未満の文字は描かない（#4 spec §6.2 可読性の下限）。
      if (frame.a < 0 || frame.shrink < 0.35 || label.fontPx * scratch[0].scale < 8) {
        continue;
      }
      const image = images[i];
      // 基底の dpr 拡大に合成する。setTransform は基底を置換してしまうので使わない（Requirement 3.9）。
      ctx.save();
      ctx.transform(frame.a, frame.b, frame.c, frame.d, frame.e, frame.f);
      ctx.drawImage(image, 0, -image.height);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
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
    const colors = readColors(readToken);
    // 点のパレットと影の色の表もマウント時に 1 度だけ作る（spec.md §6.5、#4 spec §6.4）。
    const palettes = buildPalettes();
    const shadows = buildShadowPalettes(readToken);

    // 面の頂点・ラベルの微分の投影を受ける器と 20 個のラベル。effect の寿命で 1 度だけ作り、毎フレーム同じ器を渡す。
    const scene = createScene();
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
      // 地とラベルの画像は、枠の寸法（デバイス px）か devicePixelRatio が変わったときだけ作り直す（Requirement 5.6）。
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== scene.imageWidth || canvas.height !== scene.imageHeight || dpr !== scene.dpr) {
        rebuildImages(scene, colors, canvas.width, canvas.height, dpr);
      }
      const elapsedMs = nowMs - startMs;
      const terrainPhase = Math.floor(((elapsedMs % TERRAIN_CYCLE_MS) / TERRAIN_CYCLE_MS) * TERRAIN_PHASES);

      render(ctx, canvas, view, cloud, orbit, colors, palettes, shadows, terrainPhase, scene, buffers);
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
