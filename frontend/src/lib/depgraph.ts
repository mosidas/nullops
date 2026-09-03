/**
 * 依存グラフのモデル座標をキャンバス座標へ写す純関数群。
 *
 * 描画コンポーネントから分離するのは、配置の計算と Canvas への副作用を
 * 分けておく規律のため（spec.md §8）。ノードの座標そのものは Go 側が
 * 生成し、ここでは写像だけを行う（§3 前提 1）。
 */

/** キャンバス上のノードの中心と半径。 */
export type NodePlacement = { cx: number; cy: number; radius: number };

/**
 * 描画領域の短辺のうち、単位正方形（各軸 -1〜1）の半分に割り当てる比。
 *
 * 1.0 にすると座標 ±1 のノードが枠の縁に接し、円とラベルが切れる。
 * ノードの半径とラベルのぶんを残す値にする。
 */
const FIT_RATIO = 0.42;

/** ノードの半径の下限と、負荷 1.0 で足される幅（いずれも描画領域の短辺に対する比）。 */
const RADIUS_BASE_RATIO = 0.022;
const RADIUS_LOAD_RATIO = 0.032;

/** ノードの半径の下限（CSS ピクセル）。小さい枠でも円が消えないようにする。 */
const MIN_RADIUS = 1.5;

/**
 * モデル座標（各軸 -1〜1）と負荷を、キャンバス上の中心座標と半径へ写す。
 *
 * y を反転させるのは、モデル座標が上向きを正とするのに対して
 * Canvas の y 軸が下向きを正であるため。
 */
export function placeNode(x: number, y: number, load: number, view: { width: number; height: number }): NodePlacement {
  const short = Math.min(view.width, view.height);
  const scale = short * FIT_RATIO;

  return {
    cx: view.width / 2 + x * scale,
    cy: view.height / 2 - y * scale,
    // 負荷が大きいノードほど大きくする（spec.md §7 受け入れ基準 10.2）。
    // 下限を置くのは、負荷 0 のノードが点にならず円として読めるようにするため。
    radius: Math.max(short * (RADIUS_BASE_RATIO + RADIUS_LOAD_RATIO * load), MIN_RADIUS),
  };
}

/**
 * 2 値を比 t で混ぜる。t が 0 なら a、1 なら b をそのまま返す。
 *
 * 端点を条件分岐で返すのは、a + (b - a) * t が t = 1 でも浮動小数の
 * 丸めにより b と厳密には一致しないため（受け入れ基準 10.3 は一致を求める）。
 */
export function lerp(a: number, b: number, t: number): number {
  if (t <= 0) {
    return a;
  }
  if (t >= 1) {
    return b;
  }
  return a + (b - a) * t;
}
