/**
 * 折れ線グラフとタコメータの配置をキャンバス座標へ写す純関数（spec.md §5.7・§5.8）。
 *
 * 描画コンポーネントから配置の計算を切り離すのは、unit #2 の project.ts・
 * unit #3 の depgraph.ts と同じ規律による。折れ線とタコメータを 1 ファイルへ
 * 置くのは、両者が同じ MetricFrame を読む対の部品であり、分けても共有する
 * 定数が増えるだけだからである（spec.md §8）。
 *
 * 本ファイルの関数はテストコードを持たない（spec.md §3 前提 12）。不変条件は
 * 早期 return と型で守り、寸法 0 の扱いは呼び出し側が描画へ進まないことで
 * 外側から押さえる。
 */

/** 描画領域の CSS ピクセルでの寸法。 */
type View = { width: number; height: number };

/** 折れ線の作図領域（軸と見出しの余白を除いた矩形）。 */
export type PlotArea = { left: number; top: number; width: number; height: number };

/**
 * 作図領域の余白（CSS ピクセル）。
 *
 * 上を厚くするのは系列の見出しを 1 行置くため、下を厚くするのは
 * 目盛りの文字を置くためである。
 */
const PLOT_PADDING_TOP = 26;
const PLOT_PADDING_BOTTOM = 12;
const PLOT_PADDING_LEFT = 8;
const PLOT_PADDING_RIGHT = 8;

/** 点と点の最小の横間隔（CSS ピクセル）。visiblePointCount がこれで枠内の点数を決める。 */
const PLOT_MIN_STEP = 2;

/**
 * 描画領域から作図領域を決める。
 *
 * width・height は 0 以上に丸める。余白の合計が枠の寸法を超えると負になり、
 * 負の幅で plotX を割ると座標が枠の外へ出るため。
 */
export function plotArea(view: View): PlotArea {
  return {
    left: PLOT_PADDING_LEFT,
    top: PLOT_PADDING_TOP,
    width: Math.max(0, view.width - PLOT_PADDING_LEFT - PLOT_PADDING_RIGHT),
    height: Math.max(0, view.height - PLOT_PADDING_TOP - PLOT_PADDING_BOTTOM),
  };
}

/**
 * 点の添字を横座標へ写す。添字 0 が最古で左端、count-1 が最新で右端。
 *
 * count が 1 のときに左端を返すのは、割る数が 0 になって NaN を画面へ
 * 出さないためである（spec.md §5.7 事後条件）。
 */
export function plotX(index: number, count: number, area: PlotArea): number {
  if (count <= 1) {
    return area.left;
  }
  return area.left + (area.width * index) / (count - 1);
}

/** 正規化値（0.0〜1.0）を縦座標へ写す。値が大きいほど上（受け入れ基準 8.2）。 */
export function plotY(value: number, area: PlotArea): number {
  return area.top + area.height * (1 - value);
}

/**
 * 作図領域に収まる点数を返す。つねに 1 以上の整数。
 *
 * 保持している点（最大 240 点）を全部描くと枠の幅によっては点が 1 画素未満の
 * 間隔で潰れる。新しい側からこの数だけ切り出して描く（受け入れ基準 8.4）。
 */
export function visiblePointCount(area: PlotArea): number {
  return Math.max(1, Math.floor(area.width / PLOT_MIN_STEP) + 1);
}

/** タコメータの文字盤の配置。角度はラジアンで、キャンバスの座標系（右が 0、下が正）に従う。 */
export type DialGeometry = {
  cx: number;
  cy: number;
  radius: number;
  startAngle: number;
  endAngle: number;
};

/**
 * 目盛りの開始角と終了角。
 *
 * 左下（135 度）から右下（45 度）へ時計回りに 270 度ぶん振る。真横より少し
 * 下から始めるのは、文字盤の下に数値とラベルを置く余地を残すためである。
 */
const DIAL_START_ANGLE = Math.PI * 0.75;
const DIAL_END_ANGLE = Math.PI * 2.25;

/** 文字盤が枠に対して占める割合と、下端に空ける余地の割合。 */
const DIAL_RADIUS_RATIO = 0.38;
const DIAL_CENTER_Y_RATIO = 0.46;

/**
 * 描画領域から文字盤の配置を決める。
 *
 * 半径は幅と高さの小さいほうから取り、正方形でない枠でも円がはみ出さない
 * ようにする。寸法が 0 の枠でも radius が負にならないよう 0 で頭打ちにする
 * （実際には呼び出し側が寸法 0 で描画へ進まない。受け入れ基準 9.8）。
 */
export function dialGeometry(view: View): DialGeometry {
  const radius = Math.max(0, Math.min(view.width, view.height) * DIAL_RADIUS_RATIO);
  return {
    cx: view.width / 2,
    cy: view.height * DIAL_CENTER_Y_RATIO,
    radius,
    startAngle: DIAL_START_ANGLE,
    endAngle: DIAL_END_ANGLE,
  };
}

/** 値（0.0〜1.0）を針の角度へ写す。0 で startAngle、1 で endAngle（受け入れ基準 9.2）。 */
export function dialAngle(value: number, dial: DialGeometry): number {
  return dial.startAngle + (dial.endAngle - dial.startAngle) * value;
}

/**
 * 現在値を目標値へ rate の比だけ近づける（受け入れ基準 9.3）。
 *
 * rate を 0〜1 に丸めるのは、範囲外の rate が行き過ぎ（current と target の
 * 外側）を生み、針が目標を通り越して振れるためである。
 */
export function approach(current: number, target: number, rate: number): number {
  const r = Math.min(1, Math.max(0, rate));
  return current + (target - current) * r;
}
