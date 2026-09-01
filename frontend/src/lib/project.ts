import type { main } from '../../wailsjs/go/models';

/** 投影の結果。`depth` は大きいほど手前。 */
export type Projected = { sx: number; sy: number; scale: number; depth: number };

/**
 * ピッチ(X 軸まわりの固定の回転角)。点群を斜め上から見た画にする。
 *
 * 0 にすると Y 軸まわりの回転だけになり、回っても厚みが読み取れず平面に見える。
 */
export const SCATTER_PITCH = -0.42;

/**
 * カメラまでの距離。透視投影の `scale = f / (f - z')` の f。
 *
 * モデル座標の Z' は -1〜1 に収まるため f を 1 より十分大きく取り、
 * 分母が 0 に近づかないようにする(scale が発散しない)。
 */
const FOCAL = 3.2;

/** 描画領域の短辺に対する点群の広がり。1.0 にすると枠の縁に点が触れる。 */
const FILL = 0.78;

/**
 * モデル座標の 1 点を、回転と透視投影を経てキャンバス座標へ落とす。
 *
 * 純関数であり、同じ引数につねに同じ値を返す(spec.md §5.6)。
 * 描画コンポーネントから切り出しているのは、擬似データの生成と描画を分ける
 * という CLAUDE.md の規約に倣い、座標変換だけを単独で確かめられるようにするため。
 */
export function projectPoint(
  p: main.ScatterPoint,
  yaw: number,
  pitch: number,
  view: { width: number; height: number },
): Projected {
  // ヨー(Y 軸まわり)。X と Z が回り、Y は変わらない。
  const cosYaw = Math.cos(yaw);
  const sinYaw = Math.sin(yaw);
  const x1 = p.x * cosYaw + p.z * sinYaw;
  const z1 = -p.x * sinYaw + p.z * cosYaw;

  // ピッチ(X 軸まわり)。Y と Z が回る。
  const cosPitch = Math.cos(pitch);
  const sinPitch = Math.sin(pitch);
  const y2 = p.y * cosPitch - z1 * sinPitch;
  const z2 = p.y * sinPitch + z1 * cosPitch;

  const scale = FOCAL / (FOCAL - z2);

  // 短辺を基準にするのは、枠が横長でも縦長でも点群を内側へ収めるため。
  const radius = (Math.min(view.width, view.height) / 2) * FILL;

  return {
    // キャンバスの Y 軸は下向きなので、モデルの Y を反転して上向きに見せる。
    sx: view.width / 2 + x1 * scale * radius,
    sy: view.height / 2 - y2 * scale * radius,
    scale,
    depth: z2,
  };
}
