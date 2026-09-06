import type { Vec3 } from './panes.ts';

/** 投影の結果。`depth` は大きいほど手前。 */
export type Projected = { sx: number; sy: number; scale: number; depth: number };

/** 点群 1 フレームぶんの投影結果。長さ capacity の typed array を持つ器。 */
export type ProjectedCloud = { sx: Float32Array; sy: Float32Array; depth: Float32Array; length: number };

/**
 * ピッチ(X 軸まわりの固定の回転角)。点群を斜め上から見た画にする。
 *
 * 符号と向きの対応: 正の値で床(y = -1)を上から見下ろす(奥の辺 z = -1 が画面で上に来る)。
 * 負にすると床を下から見上げる向きになり、床のパネルと格子を描くと参考画像と逆になる(spec.md §6.8)。
 * 0 にすると Y 軸まわりの回転だけになり、回っても厚みが読み取れず平面に見える。
 */
export const SCATTER_PITCH = 0.42;

/**
 * カメラまでの距離。透視投影の `scale = f / (f - z')` の f。
 *
 * モデル座標の Z' は -1〜1 に収まるため f を 1 より十分大きく取り、
 * 分母が 0 に近づかないようにする(scale が発散しない)。
 */
const FOCAL = 3.2;

/** 描画領域の短辺に対する点群の広がり。1.0 にすると枠の縁に点が触れる。ラベルの画像の寸法にも使うため export する(spec.md §5.3)。 */
export const FILL = 0.78;

/**
 * モデル座標の 1 点を、回転と透視投影を経てキャンバス座標へ落とす。
 *
 * 純関数であり、同じ引数につねに同じ値を `out` に書く(spec.md §5.3)。
 * 戻り値を新しく作らず `out` を上書きして返すのは、毎フレーム点数ぶんのオブジェクトを
 * 生成して GC を誘発しないため(CLAUDE.md「再描画のたびに新しいオブジェクトを作らない」)。
 * 第 1 引数を `Vec3` にしているのは、点群の `ScatterPoint` と軸線の端点を同じ関数で投影するため。
 */
export function projectPoint(
  p: Vec3,
  yaw: number,
  pitch: number,
  view: { width: number; height: number },
  out: Projected,
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

  // キャンバスの Y 軸は下向きなので、モデルの Y を反転して上向きに見せる。
  out.sx = view.width / 2 + x1 * scale * radius;
  out.sy = view.height / 2 - y2 * scale * radius;
  out.scale = scale;
  out.depth = z2;
  return out;
}

/** 点群の投影結果を受ける器を作る。描画の外(effect)で 1 度だけ呼ぶ。 */
export function createProjectedCloud(capacity: number): ProjectedCloud {
  return {
    sx: new Float32Array(capacity),
    sy: new Float32Array(capacity),
    depth: new Float32Array(capacity),
    length: 0,
  };
}

/**
 * 点群を一括で投影し、`out` の typed array へ書く。
 *
 * `projectPoint` と同じ変換だが、三角関数は先頭で 4 回だけ評価する(spec.md §5.3)。
 * 点ごとに `projectPoint` を呼ぶと三角関数が点数 × 4 回になるため、点群ではこちらを使う。
 * `scale` は点の大きさを帯で決めるため書かない(§6.4)。
 */
export function projectPoints(
  points: readonly Vec3[],
  yaw: number,
  pitch: number,
  view: { width: number; height: number },
  out: ProjectedCloud,
): void {
  const cosYaw = Math.cos(yaw);
  const sinYaw = Math.sin(yaw);
  const cosPitch = Math.cos(pitch);
  const sinPitch = Math.sin(pitch);
  const halfWidth = view.width / 2;
  const halfHeight = view.height / 2;
  const radius = Math.min(halfWidth, halfHeight) * FILL;

  const capacity = out.sx.length;
  let length = points.length;
  if (length > capacity) {
    // 容量不足はプログラマの誤りだが、画面を止めないよう書ける範囲だけ書く(spec.md §5.3)。
    console.error('projectPoints: 器の容量が点数に足りない', capacity, length);
    length = capacity;
  }

  for (let i = 0; i < length; i += 1) {
    const p = points[i];
    const x1 = p.x * cosYaw + p.z * sinYaw;
    const z1 = -p.x * sinYaw + p.z * cosYaw;
    const y2 = p.y * cosPitch - z1 * sinPitch;
    const z2 = p.y * sinPitch + z1 * cosPitch;
    const scale = FOCAL / (FOCAL - z2);
    out.sx[i] = halfWidth + x1 * scale * radius;
    out.sy[i] = halfHeight - y2 * scale * radius;
    out.depth[i] = z2;
  }
  out.length = length;
}

/**
 * 点群を `axis` の座標を `value` に固定した面へ直交投影してから、`projectPoints` と同じ変換で `out` に書く。
 * `stride` 個おきに 1 点を採る(影の間引き。spec.md §5.4)。
 *
 * `projectPoints` を呼び直さず同じ式を書いているのは、点を面へ落とす置き換えを点ごとに
 * 分岐せずに済ませるため(`axis` の判定をループの外で 3 つの係数に畳む)。
 * 三角関数は先頭で 4 回だけ評価する(Requirement 4.4)。
 */
export function projectPointsOnto(
  points: readonly Vec3[],
  axis: 'x' | 'y' | 'z',
  value: -1 | 1,
  stride: number,
  yaw: number,
  pitch: number,
  view: { width: number; height: number },
  out: ProjectedCloud,
): void {
  // 不正な stride は 1 として扱い、画面を止めない(Requirement 4.2)。
  const step = Number.isInteger(stride) && stride >= 1 ? stride : 1;
  // 固定する成分だけ係数を 0 にし、その軸の値を value で置く。
  const keepX = axis === 'x' ? 0 : 1;
  const keepY = axis === 'y' ? 0 : 1;
  const keepZ = axis === 'z' ? 0 : 1;
  const fixedX = axis === 'x' ? value : 0;
  const fixedY = axis === 'y' ? value : 0;
  const fixedZ = axis === 'z' ? value : 0;

  const cosYaw = Math.cos(yaw);
  const sinYaw = Math.sin(yaw);
  const cosPitch = Math.cos(pitch);
  const sinPitch = Math.sin(pitch);
  const halfWidth = view.width / 2;
  const halfHeight = view.height / 2;
  const radius = Math.min(halfWidth, halfHeight) * FILL;

  const capacity = out.sx.length;
  let length = Math.ceil(points.length / step);
  if (length > capacity) {
    // 容量不足はプログラマの誤りだが、画面を止めないよう書ける範囲だけ書く(Requirement 4.3)。
    console.error('projectPointsOnto: 器の容量が点数に足りない', capacity, length);
    length = capacity;
  }

  for (let j = 0; j < length; j += 1) {
    const p = points[j * step];
    const x = p.x * keepX + fixedX;
    const y = p.y * keepY + fixedY;
    const z = p.z * keepZ + fixedZ;
    const x1 = x * cosYaw + z * sinYaw;
    const z1 = -x * sinYaw + z * cosYaw;
    const y2 = y * cosPitch - z1 * sinPitch;
    const z2 = y * sinPitch + z1 * cosPitch;
    const scale = FOCAL / (FOCAL - z2);
    out.sx[j] = halfWidth + x1 * scale * radius;
    out.sy[j] = halfHeight - y2 * scale * radius;
    out.depth[j] = z2;
  }
  out.length = length;
}
