/**
 * 3D 散布図の地(背景)に使う値ノイズ。DOM に依存しない純粋なモジュール(spec §5.5・§6.5)。
 * 粗い格子の乱数を滑らかに補間するため、隣り合う画素の差が小さく粒に見えない。
 */

export const NOISE_SIZE = 48;

/** 格子 1 マスの画素数。大きいほど低周波になる。隣接差の上限 0.25 に対し、滑らかな補間の最大傾き 1.5 / 8 で余裕を持つ。 */
const CELL_PX = 8;

/** 整数座標と seed から 0 以上 1 未満の決定的な値を作る。組み込みの乱数を使わないのは同じ seed で同じ画にするため。 */
function hash(seed: number, ix: number, iy: number): number {
  let h = Math.imul(seed | 0, 0x9e3779b1) ^ Math.imul(ix + 1, 0x85ebca6b) ^ Math.imul(iy + 1, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

/** size × size の値ノイズ(0〜1)を決定的に作る。seed が同じなら同じ配列。上下左右の端は循環する。 */
export function buildNoise(size: number, seed: number): Float32Array {
  if (!Number.isInteger(size) || size < 2) {
    throw new Error(`buildNoise: size は 2 以上の整数でなければならない: ${size}`);
  }
  // 格子の数を整数にして端で循環させる(継ぎ目が出ない)。
  const cells = Math.max(2, Math.round(size / CELL_PX));
  const cellPx = size / cells;
  const out = new Float32Array(size * size);
  for (let j = 0; j < size; j += 1) {
    const v = j / cellPx;
    const y0 = Math.floor(v);
    const ty = smoothstep(v - y0);
    const y1 = (y0 + 1) % cells;
    for (let i = 0; i < size; i += 1) {
      const u = i / cellPx;
      const x0 = Math.floor(u);
      const tx = smoothstep(u - x0);
      const x1 = (x0 + 1) % cells;
      const top = hash(seed, x0, y0) + (hash(seed, x1, y0) - hash(seed, x0, y0)) * tx;
      const bottom = hash(seed, x0, y1) + (hash(seed, x1, y1) - hash(seed, x0, y1)) * tx;
      out[j * size + i] = top + (bottom - top) * ty;
    }
  }
  return out;
}
