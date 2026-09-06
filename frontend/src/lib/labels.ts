/**
 * 3D 散布図の縦軸ラベル(目盛り 4 個 + 軸名 1 個)の定義と、面に沿って貼るためのアフィン変換。
 * 描画コンポーネントから切り出した純粋なモジュール(spec §5.3・§6.2)。
 * DOM・React に依存しないのは `node --test` で変換の係数を検証するため。
 */

import { PANES, type PaneId, type Vec3, type WallId } from './panes.ts';
import { FILL, type Projected, projectPoint } from './project.ts';

/** 縦軸の値域。点群の座標系(-1〜1)からの固定の写像で、Go 側から送らない(spec §3 前提 4)。 */
export const ELEVATION_RANGE: readonly [number, number] = [-0.1, 2.08];
export const TICK_COUNT = 4;
export const AXIS_NAME = 'Elevation';

/** ラベルの錨を面の縦の辺から外側へ離す距離(モデル座標)。文字が縁の線に触れないための余白。 */
const LABEL_GAP = 0.06;
const TICK_FONT_PX = 13;
const NAME_FONT_PX = 14;
/** 投影の微分を取る刻み。小さすぎると float の丸めで方向が荒れ、大きすぎると透視の歪みが混じる。 */
const EPSILON = 0.01;

/** range を count − 1 等分した値。両端を含む昇順。 */
export function tickValues(range: readonly [number, number], count: number): number[] {
  const values: number[] = [];
  const step = (range[1] - range[0]) / (count - 1);
  for (let k = 0; k < count; k += 1) values.push(range[0] + k * step);
  return values;
}

/** 小数第 2 位までの文字列(toFixed(2))。負の 0 は "0.00" にする。 */
export function formatTick(value: number): string {
  const text = value.toFixed(2);
  // 丸めで 0 になった負の値は "-0.00" になるため、符号を落とす。
  return text === '-0.00' ? '0.00' : text;
}

export type LabelKind = 'tick' | 'name';
export type Label = {
  kind: LabelKind;
  text: string;
  fontPx: number;
  pane: PaneId;
  anchor: Vec3;
  along: Vec3;
  up: Vec3;
};

/**
 * 縦軸のラベル(目盛り 4 個 + 軸名 1 個)を、wall の side 側の縦の辺に沿って作る。
 * マウント時に縦 4 面ぶんを 1 度 out へ書く(毎フレームは呼ばない。Requirement 3.10)。
 */
export function elevationLabels(wall: WallId, side: 'left' | 'right', out: Label[]): Label[] {
  const pane = PANES[wall];
  // side は along に対する左右。錨は辺から面に沿って外側へ LABEL_GAP 離す(spec §5.3)。
  const s = side === 'left' ? -LABEL_GAP : 2 + LABEL_GAP;
  const x = pane.origin.x + pane.along.x * s;
  const z = pane.origin.z + pane.along.z * s;
  out.length = 0;
  const values = tickValues(ELEVATION_RANGE, TICK_COUNT);
  for (let k = 0; k < values.length; k += 1) {
    out.push({
      kind: 'tick',
      text: formatTick(values[k]),
      fontPx: TICK_FONT_PX,
      pane: wall,
      anchor: { x, y: -1 + (2 * k) / (TICK_COUNT - 1), z },
      along: pane.along,
      up: pane.up,
    });
  }
  out.push({
    kind: 'name',
    text: AXIS_NAME,
    fontPx: NAME_FONT_PX,
    pane: wall,
    anchor: { x, y: 0, z },
    along: pane.along,
    up: pane.up,
  });
  return out;
}

export type LabelFrame = { a: number; b: number; c: number; d: number; e: number; f: number; shrink: number };

// 微分用に錨からずらした点の器。毎フレーム 20 個のラベルで呼ぶため、呼び出しごとに Vec3 を作らない。
const OFFSET: Vec3 = { x: 0, y: 0, z: 0 };

/**
 * ラベルの錨における面の 2 方向の投影の微分から、基底の変換(dpr の拡大)に合成するアフィン変換を作る。
 *
 * 描画側は `save` → `transform(a, b, c, d, e, f)` → `drawImage(image, 0, -image.height)` → `restore` で使う。
 * 画像は高さ `fontPx × dpr` px で焼くため、係数は画像 1 px あたり(`k = scale / dpr`)に換算する(spec §5.3)。
 */
export function labelFrame(
  label: Label,
  yaw: number,
  pitch: number,
  view: { width: number; height: number },
  dpr: number,
  scratch: [Projected, Projected, Projected],
  out: LabelFrame,
): LabelFrame {
  const y = Number.isNaN(yaw) ? 0 : yaw;
  const p = Number.isNaN(pitch) ? 0 : pitch;
  const anchor = label.anchor;
  const origin = projectPoint(anchor, y, p, view, scratch[0]);

  OFFSET.x = anchor.x + label.along.x * EPSILON;
  OFFSET.y = anchor.y + label.along.y * EPSILON;
  OFFSET.z = anchor.z + label.along.z * EPSILON;
  const alongEnd = projectPoint(OFFSET, y, p, view, scratch[1]);

  OFFSET.x = anchor.x + label.up.x * EPSILON;
  OFFSET.y = anchor.y + label.up.y * EPSILON;
  OFFSET.z = anchor.z + label.up.z * EPSILON;
  const upEnd = projectPoint(OFFSET, y, p, view, scratch[2]);

  // モデル座標 1 単位あたりのスクリーン CSS px。
  const ax = (alongEnd.sx - origin.sx) / EPSILON;
  const ay = (alongEnd.sy - origin.sy) / EPSILON;
  const ux = (upEnd.sx - origin.sx) / EPSILON;
  const uy = (upEnd.sy - origin.sy) / EPSILON;
  const alongLen = Math.hypot(ax, ay);
  const upLen = Math.hypot(ux, uy);
  const k = origin.scale / dpr;

  if (alongLen === 0 || upLen === 0) {
    // 方向が潰れたラベルは描けないので係数を 0 にし、描画側は shrink の下限で描かない。
    out.a = 0;
    out.b = 0;
    out.c = 0;
    out.d = 0;
  } else {
    out.a = (ax / alongLen) * k;
    out.b = (ay / alongLen) * k;
    // canvas の y 軸は下向きで、画像は基線から上(負の y)へ描くため up を反転する。
    out.c = (-ux / upLen) * k;
    out.d = (-uy / upLen) * k;
  }
  out.e = origin.sx;
  out.f = origin.sy;

  const radius = (Math.min(view.width, view.height) / 2) * FILL;
  out.shrink = alongLen / (origin.scale * radius);
  return out;
}
