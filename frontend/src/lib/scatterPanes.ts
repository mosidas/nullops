/**
 * 3D 散布図のパネル(床と縦 4 面)の描画手順と、その材料(色・影の表・器)。
 *
 * `Scatter3DPanel.tsx` から「面 1 枚の描画手順」の責務を切り出したモジュール。DOM には依存せず、
 * Canvas の型だけを使う。トークンの解決は `TokenReader` として呼び出し側から受け取る
 * (getComputedStyle をここに置かないため)。
 */

import type { main } from '../../wailsjs/go/models';
import { elevationLabels, type Label, type LabelFrame } from './labels';
import { buildShadowRamp, parseHex, type Rgb, rotateHue, TERRAIN_PHASES, toColorString } from './palette';
import { GRID_STOPS, type Pane, WALL_IDS } from './panes';
import { type Projected, type ProjectedCloud, projectPoint, projectPointsOnto } from './project';

/** @theme のトークンを解決する関数の形。`fallback` はトークンが空のときに返す値。 */
export type TokenReader = (name: string, fallback: string) => string;

/** 影の描画に使う作業領域(`drawPane` が読む部分だけ)。`render` が 1 フレームに 1 度バケット順に並べてある。 */
export type ShadowBuffers = {
  shadow: ProjectedCloud;
  shadowCounts: Uint32Array;
  shadowOrder: Uint32Array;
};

/** 影の間引き（点の半分）と色の段数。#4 spec §6.4。段を粗くするのは面ごとの fillStyle の設定を 24 回以下に抑えるため。 */
export const SHADOW_STRIDE = 2;
export const SHADOW_STEPS = 8;
const SHADOW_ALPHA = 0.22;
/** 影のバケットの総数（構造 × 段。24）。 */
export const SHADOW_BUCKET_COUNT = 3 * SHADOW_STEPS;

/** パネルの塗り・格子・縁の不透明度（重み 1 のときの値。#4 spec §6.3）。色ではなく数値として置く。 */
const PANE_FILL_ALPHA = 0.06;
const PANE_GRID_ALPHA = 0.16;
const PANE_EDGE_ALPHA = 0.45;

/** 格子線と縁の線幅（CSS ピクセル。#4 spec Requirement 2.4）。 */
const LINE_WIDTH = 1;

/** 構造の数（地形・球・トーラス。`ScatterPoint.s` の取りうる値の数。spec.md §6.1）。 */
export const STRUCTURE_COUNT = 3;

/** 地形の位相 1 つあたりの色相の回転角（度）。36 位相で 1 周する（spec.md §6.5）。 */
export const TERRAIN_HUE_STEP_DEGREES = 360 / TERRAIN_PHASES;

/**
 * トークンの解決に失敗したときの退避先（spec.md §7 9.2、#4 spec §6.6）。
 *
 * 16 進の直値を置かないのは、色の正本を globals.css の @theme に一本化する
 * 規律のため（spec.md §7 9.1）。地を transparent にすると Panel 側の
 * 背景がそのまま透けるので、退避しても画は破綻しない。
 */
const FALLBACK_GROUND_COLOR = 'transparent';
// パネルの退避先を gray にするのは、点の退避色 white と区別がつくようにするため。
const FALLBACK_PANE_COLOR = 'gray';
const FALLBACK_LABEL_COLOR = 'white';

/** 停止色のトークン名。並びは低 → 高（spec.md §6.5）。 */
export const TERRAIN_STOP_TOKENS: readonly string[] = [
  '--color-scatter-terrain-low',
  '--color-scatter-terrain-mid',
  '--color-scatter-terrain-high',
];
export const SPHERE_STOP_TOKENS: readonly string[] = ['--color-scatter-sphere-low', '--color-scatter-sphere-high'];
export const TORUS_STOP_TOKENS: readonly string[] = ['--color-scatter-torus-low', '--color-scatter-torus-high'];

/**
 * 描画に使う色。マウント時に 1 度だけ解決する。
 *
 * `ground` は地のトークン 2 色（画像の材料。どちらかが欠ければ null で地は `groundFallback` のべた塗り）、
 * `groundFallback` は地の画像を作れないときのべた塗りの色（#4 spec §5.1 エラー）。
 * `fill`・`grid`・`edge` は `--color-scatter-pane` に不透明度を焼き込んだ文字列（重み 1 のときの値）。
 */
export type PanelColors = {
  ground: { low: Rgb; high: Rgb } | null;
  groundFallback: string;
  fill: string;
  grid: string;
  edge: string;
  label: string;
};

/** 影の色の表（構造 × 8 段）。地形は位相ごとに 1 表（#4 spec §6.4）。 */
export type ShadowPalettes = { terrain: string[][]; sphere: string[]; torus: string[] };

/**
 * 面とラベルの描画で使い回す器。effect の寿命で 1 度だけ作る（#4 spec §8「描画順と器」）。
 *
 * `weights` は縦 4 面の重み（WALL_IDS の順）、`corners` は面の頂点 4 個の投影、`labelScratch` は
 * `labelFrame` の微分用 3 個、`frame` はラベルの変換の係数。`labels` は縦 4 面 × 5 個 = 20 個の
 * ラベルで、`labelImages` はそれと同じ並びの画像（作れなければ null でラベルを描かない）。
 * `ground` は枠の寸法の地の画像（作れなければ null でべた塗り）。`imageWidth`・`imageHeight`・`dpr` は
 * 画像を作ったときの寸法で、変化の検知（作り直し）にだけ使う（Requirement 5.6）。
 */
export type Scene = {
  weights: Float64Array;
  corners: [Projected, Projected, Projected, Projected];
  labelScratch: [Projected, Projected, Projected];
  frame: LabelFrame;
  labels: Label[];
  labelImages: HTMLCanvasElement[] | null;
  ground: HTMLCanvasElement | null;
  imageWidth: number;
  imageHeight: number;
  dpr: number;
};

/**
 * 停止色のトークンをまとめて解決する。1 つでも欠けるか `#rrggbb` でなければ null。
 *
 * 部分的に解決して補間すると意図しない色になるため、構造ごとにまとめて退避する（spec.md §6.5）。
 */
export function readStops(readToken: TokenReader, names: readonly string[]): Rgb[] | null {
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

/** 影の全段を退避色で埋めた表。停止色の退避（`fallbackRamp`）と同じ色を使う（#4 spec §6.6）。 */
function fallbackShadowRamp(): string[] {
  return new Array<string>(SHADOW_STEPS).fill('white');
}

/**
 * 影の色の表を作る。マウント時に 1 度だけ呼ぶ（#4 spec §6.4）。
 *
 * 点のパレット（64 段 × 3 帯）を流用すると面ごとの fillStyle の切り替えが 3 面で 1,728 回になるため、
 * 8 段・帯なしの表を別に持つ（#4 spec §8）。停止色は点と同じトークンから読む。
 */
export function buildShadowPalettes(readToken: TokenReader): ShadowPalettes {
  const terrainStops = readStops(readToken, TERRAIN_STOP_TOKENS);
  const terrain: string[][] = [];
  for (let phase = 0; phase < TERRAIN_PHASES; phase += 1) {
    if (terrainStops === null) {
      terrain.push(fallbackShadowRamp());
    } else {
      const degrees = TERRAIN_HUE_STEP_DEGREES * phase;
      terrain.push(
        buildShadowRamp(
          terrainStops.map((stop) => rotateHue(stop, degrees)),
          SHADOW_STEPS,
          SHADOW_ALPHA,
        ),
      );
    }
  }
  const sphereStops = readStops(readToken, SPHERE_STOP_TOKENS);
  const torusStops = readStops(readToken, TORUS_STOP_TOKENS);
  return {
    terrain,
    sphere: sphereStops === null ? fallbackShadowRamp() : buildShadowRamp(sphereStops, SHADOW_STEPS, SHADOW_ALPHA),
    torus: torusStops === null ? fallbackShadowRamp() : buildShadowRamp(torusStops, SHADOW_STEPS, SHADOW_ALPHA),
  };
}

/**
 * 地・パネル・ラベルの色を解決する。マウント時に 1 度だけ呼ぶ（#4 spec §6.6）。
 *
 * パネルの 3 色は同じトークンに不透明度だけ変えて焼き込む。重みごとに文字列を作らず、
 * 面ごとの不透明度は `globalAlpha` で与える（#4 spec §8）。
 */
export function readColors(readToken: TokenReader): PanelColors {
  const low = parseHex(readToken('--color-scatter-bg-low', ''));
  const high = parseHex(readToken('--color-scatter-bg-high', ''));
  const pane = parseHex(readToken('--color-scatter-pane', ''));
  const label = readToken('--color-scatter-label', '');
  if (low === null || high === null) {
    console.error('3D 散布図の地の色トークンを解決できない。透明で退避する');
  }
  if (pane === null) {
    console.error('3D 散布図のパネルの色トークンを解決できない。退避色で描く');
  }
  if (parseHex(label) === null) {
    console.error('3D 散布図のラベルの色トークンを解決できない。退避色で描く');
  }
  return {
    ground: low === null || high === null ? null : { low, high },
    // 画像を作れないときのべた塗り。トークン自体が欠けていれば透明（#4 spec §5.1 エラー）。
    groundFallback: low === null ? FALLBACK_GROUND_COLOR : readToken('--color-scatter-bg-low', FALLBACK_GROUND_COLOR),
    fill: pane === null ? FALLBACK_PANE_COLOR : toColorString(pane, PANE_FILL_ALPHA),
    grid: pane === null ? FALLBACK_PANE_COLOR : toColorString(pane, PANE_GRID_ALPHA),
    edge: pane === null ? FALLBACK_PANE_COLOR : toColorString(pane, PANE_EDGE_ALPHA),
    label: parseHex(label) === null ? FALLBACK_LABEL_COLOR : label,
  };
}

/** 投影の器を作る。effect の寿命で 1 度だけ呼ぶ。 */
function createProjected(): Projected {
  return { sx: 0, sy: 0, scale: 0, depth: 0 };
}

/** 面とラベルの器を作る。ラベルは縦 4 面の右の辺に 5 個ずつ（#4 spec §6.2）。画像は寸法が決まってから作る。 */
export function createScene(): Scene {
  const labels: Label[] = [];
  const perWall: Label[] = [];
  for (let k = 0; k < WALL_IDS.length; k += 1) {
    elevationLabels(WALL_IDS[k], 'right', perWall);
    for (let i = 0; i < perWall.length; i += 1) {
      labels.push(perWall[i]);
    }
  }
  return {
    weights: new Float64Array(WALL_IDS.length),
    corners: [createProjected(), createProjected(), createProjected(), createProjected()],
    labelScratch: [createProjected(), createProjected(), createProjected()],
    frame: { a: 0, b: 0, c: 0, d: 0, e: 0, f: 0, shrink: 0 },
    labels,
    labelImages: null,
    ground: null,
    imageWidth: 0,
    imageHeight: 0,
    dpr: 0,
  };
}

/**
 * 1 面を描く: 塗り → 格子 → 縁 → 影（#4 spec §6.7）。`globalAlpha` は呼び出し側が面の重みに設定してある。
 *
 * 格子線の端点は頂点 4 個の投影から線形補間する。透視では厳密に直線上に乗らないが、
 * 誤差は 1 px の線幅に対し 1〜3 px で見分けがつかず、面ごとの投影を頂点の 4 回に抑えられる（#4 spec §6.3）。
 */
export function drawPane(
  ctx: CanvasRenderingContext2D,
  pane: Pane,
  view: { width: number; height: number },
  yaw: number,
  pitch: number,
  points: readonly main.ScatterPoint[],
  colors: PanelColors,
  shadows: ShadowPalettes,
  terrainPhase: number,
  scene: Scene,
  buffers: ShadowBuffers,
): void {
  const c = scene.corners;
  for (let i = 0; i < 4; i += 1) {
    projectPoint(pane.corners[i], yaw, pitch, view, c[i]);
  }
  ctx.fillStyle = colors.fill;
  ctx.beginPath();
  ctx.moveTo(c[0].sx, c[0].sy);
  ctx.lineTo(c[1].sx, c[1].sy);
  ctx.lineTo(c[2].sx, c[2].sy);
  ctx.lineTo(c[3].sx, c[3].sy);
  ctx.closePath();
  ctx.fill();

  ctx.lineWidth = LINE_WIDTH;
  ctx.strokeStyle = colors.grid;
  ctx.beginPath();
  // 頂点は origin → along → along + up → up の順（panes.ts）。c0→c1・c3→c2 が along、c0→c3・c1→c2 が up。
  for (let g = 1; g < GRID_STOPS.length - 1; g += 1) {
    const t = GRID_STOPS[g] / 2;
    ctx.moveTo(c[0].sx + (c[3].sx - c[0].sx) * t, c[0].sy + (c[3].sy - c[0].sy) * t);
    ctx.lineTo(c[1].sx + (c[2].sx - c[1].sx) * t, c[1].sy + (c[2].sy - c[1].sy) * t);
    ctx.moveTo(c[0].sx + (c[1].sx - c[0].sx) * t, c[0].sy + (c[1].sy - c[0].sy) * t);
    ctx.lineTo(c[3].sx + (c[2].sx - c[3].sx) * t, c[3].sy + (c[2].sy - c[3].sy) * t);
  }
  ctx.stroke();

  ctx.strokeStyle = colors.edge;
  ctx.beginPath();
  ctx.moveTo(c[0].sx, c[0].sy);
  ctx.lineTo(c[1].sx, c[1].sy);
  ctx.lineTo(c[2].sx, c[2].sy);
  ctx.lineTo(c[3].sx, c[3].sy);
  ctx.closePath();
  ctx.stroke();

  // 影。バケット順の配列は render が 1 フレームに 1 度作ったものを全面で使い回す（Requirement 4.8）。
  const shadow = buffers.shadow;
  projectPointsOnto(points, pane.fixedAxis, pane.fixedValue, SHADOW_STRIDE, yaw, pitch, view, shadow);
  const counts = buffers.shadowCounts;
  const order = buffers.shadowOrder;
  const terrain = shadows.terrain[terrainPhase];
  let start = 0;
  for (let key = 0; key < SHADOW_BUCKET_COUNT; key += 1) {
    const end = counts[key];
    if (end === start) {
      continue;
    }
    const structure = Math.floor(key / SHADOW_STEPS);
    const table = structure === 0 ? terrain : structure === 1 ? shadows.sphere : shadows.torus;
    ctx.fillStyle = table[key % SHADOW_STEPS];
    for (let j = start; j < end; j += 1) {
      const index = order[j];
      ctx.fillRect(shadow.sx[index], shadow.sy[index], 1, 1);
    }
    start = end;
  }
}
