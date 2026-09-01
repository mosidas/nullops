/**
 * コミットグラフの行と列の配置を、モデル上の添字からキャンバス座標へ写す純関数群。
 *
 * 描画コンポーネントから分離するのは、配置の計算と Canvas への副作用を
 * 分けておく規律のため（spec.md §8。unit #2 の project.ts と同じ扱い）。
 * レーンの割り当てそのものは Go 側の責務であり、ここでは行わない（§3 前提 1）。
 */

/** 行の刻みと列の刻み。1 フレームぶんの配置をまとめて持つ。 */
export type CommitRowLayout = {
  rowHeight: number;
  laneStep: number;
  laneOriginX: number;
  textOriginX: number;
};

/** 行の高さ（CSS ピクセル）。等幅の 1 行が窮屈にならない下限として置く。 */
const ROW_HEIGHT = 16;

/** レーンどうしの横の間隔（CSS ピクセル）。点の直径より広く取る。 */
const LANE_STEP = 11;

/** 最初のレーンの中心を左端からどれだけ離すか（CSS ピクセル）。 */
const LANE_ORIGIN_X = 9;

/** レーンの列と文字の始まりのあいだの余白（CSS ピクセル）。 */
const TEXT_GAP = 10;

/**
 * 描画領域とレーン数から行と列の刻みを決める。
 *
 * 刻みを枠の寸法に比例させず定数にするのは、枠が縦に伸びたときに
 * 行を太らせるのではなく行数を増やすほうが、履歴として読めるため。
 * 幅にだけ追随させるのは、レーンの列が文字の領域を潰さないようにするため。
 */
export function commitRowLayout(view: { width: number; height: number }, laneCount: number): CommitRowLayout {
  const lanes = Math.max(1, laneCount);
  // レーンの列に使ってよい幅は枠の 4 割まで。狭い枠でレーンが増えても
  // ブランチ名と要約の領域が消えないようにする。
  const maxLaneWidth = Math.max(LANE_STEP, view.width * 0.4);
  const laneStep = Math.min(LANE_STEP, maxLaneWidth / lanes);
  const laneOriginX = Math.min(LANE_ORIGIN_X, view.width / 2);

  return {
    rowHeight: ROW_HEIGHT,
    laneStep,
    laneOriginX,
    textOriginX: laneOriginX + laneStep * (lanes - 1) + TEXT_GAP,
  };
}

/**
 * 行の添字（0 が最新・上端）を y 座標へ写す。
 *
 * 行の中心を返すのは、点も文字のベースラインもこの位置を基準に置くため。
 */
export function commitRowY(index: number, layout: CommitRowLayout): number {
  return layout.rowHeight * (index + 0.5);
}

/** レーン番号を x 座標へ写す。0（主線）が最も左になる。 */
export function commitLaneX(lane: number, layout: CommitRowLayout): number {
  return layout.laneOriginX + layout.laneStep * lane;
}

/**
 * 枠に収まる行数を返す。
 *
 * 1 以上に切り上げるのは、枠が行の高さより低いときに 0 件を返して
 * 図が完全に消えるのを防ぐため。実際に描くかどうか（寸法が 0 のとき）は
 * 呼び出し側が判断する。
 */
export function visibleCommitCount(view: { width: number; height: number }, layout: CommitRowLayout): number {
  return Math.max(1, Math.floor(view.height / layout.rowHeight));
}
