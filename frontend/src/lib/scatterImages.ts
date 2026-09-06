/**
 * 3D 散布図の地(背景)とラベルの画像をオフスクリーン canvas に作る(spec §6.2「画像」・§6.5)。
 *
 * DOM(canvas)に依存するため `node --test` の対象外。描画コンポーネントから分けるのは、
 * 画像の生成(マウント時・寸法の変化時)と毎フレームの描画の責務を切り、`Scatter3DPanel.tsx` を
 * 描画の手順だけにするため。
 */

import type { Label } from './labels.ts';
import { buildNoise, NOISE_SIZE } from './noise.ts';
import type { Rgb } from './palette.ts';

/** 地のノイズの種。固定値なので起動のたびに同じ地になる(spec §6.5)。 */
const NOISE_SEED = 20260907;

/** ラベルの文字の不透明度(spec §6.2)。 */
const LABEL_ALPHA = 0.9;

/**
 * 参考の太字サンセリフ。等幅の `--font-mono` を使わないのは、数字の字幅が揃いすぎて
 * 参考の見え方から離れるため(spec §6.2)。
 */
const LABEL_FONT_FAMILY = 'ui-sans-serif, system-ui, sans-serif';

// 地のノイズは寸法によらない 48 × 48 の 1 表なので、モジュールの寿命で 1 度だけ作る。
const NOISE = buildNoise(NOISE_SIZE, NOISE_SEED);

/** 2D コンテキスト付きの canvas を作る。コンテキストを取得できなければ null(呼び出し側が退避する)。 */
function createCanvas(
  width: number,
  height: number,
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  return ctx === null ? null : { canvas, ctx };
}

/**
 * 枠の寸法(デバイス px)の地の画像を作る。
 *
 * ノイズの各値で `low`・`high` を線形補間した 48 × 48 の `ImageData` を、`imageSmoothingEnabled` の
 * 拡大で枠の寸法へ伸ばす(粒ではなく むら に見せるため。spec §6.5)。オフスクリーン canvas の
 * 2D コンテキストを取得できなければ `console.error` に記録して null を返す(Requirement 5.7)。
 */
export function buildGroundImage(width: number, height: number, low: Rgb, high: Rgb): HTMLCanvasElement | null {
  const small = createCanvas(NOISE_SIZE, NOISE_SIZE);
  const large = createCanvas(width, height);
  if (small === null || large === null) {
    console.error('地の画像のオフスクリーン canvas から 2D コンテキストを取得できない。べた塗りで退避する');
    return null;
  }
  const image = small.ctx.createImageData(NOISE_SIZE, NOISE_SIZE);
  const data = image.data;
  for (let i = 0; i < NOISE.length; i += 1) {
    const n = NOISE[i];
    const o = i * 4;
    data[o] = Math.round(low.r + (high.r - low.r) * n);
    data[o + 1] = Math.round(low.g + (high.g - low.g) * n);
    data[o + 2] = Math.round(low.b + (high.b - low.b) * n);
    data[o + 3] = 255;
  }
  small.ctx.putImageData(image, 0, 0);
  large.ctx.imageSmoothingEnabled = true;
  large.ctx.drawImage(small.canvas, 0, 0, width, height);
  return large.canvas;
}

/**
 * ラベルの文字を `dpr` 倍の解像度で 1 度だけ焼いた画像を、`labels` と同じ並びで返す。
 *
 * 画像の高さは `fontPx × dpr` px で固定し、描画側の `labelFrame` の係数(画像 1 px あたり)と
 * 対応させる(spec §5.3)。`fillText` を毎フレーム呼ばないための画像化(Requirement 3.8)。
 * 2D コンテキストを取得できなければ `console.error` に記録して null を返す(描画側はラベルを描かない)。
 */
export function buildLabelImages(labels: readonly Label[], dpr: number, color: string): HTMLCanvasElement[] | null {
  const images: HTMLCanvasElement[] = [];
  for (const label of labels) {
    const height = Math.ceil(label.fontPx * dpr);
    const font = `bold ${height}px ${LABEL_FONT_FAMILY}`;
    // 幅は文字を測ってから決める。寸法を書き換えると状態が消えるので、測定用と描画用で書体を 2 度設定する。
    const probe = createCanvas(1, 1);
    if (probe === null) {
      console.error('ラベルの画像のオフスクリーン canvas から 2D コンテキストを取得できない。ラベルを描かない');
      return null;
    }
    probe.ctx.font = font;
    const width = Math.max(1, Math.ceil(probe.ctx.measureText(label.text).width));
    probe.canvas.width = width;
    probe.canvas.height = height;
    probe.ctx.font = font;
    probe.ctx.fillStyle = color;
    probe.ctx.globalAlpha = LABEL_ALPHA;
    probe.ctx.textBaseline = 'bottom';
    probe.ctx.fillText(label.text, 0, height);
    images.push(probe.canvas);
  }
  return images;
}
