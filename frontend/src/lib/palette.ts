/** カラーマップの段数。 */
export const PALETTE_STEPS = 64;
/** 地形の色相の位相数(10° 刻みで 1 周)。 */
export const TERRAIN_PHASES = 36;
/** 地形の色相が 1 周する時間。 */
export const TERRAIN_CYCLE_MS = 360_000;
/** 奥行きの帯の数(奥・中・手前)。 */
export const DEPTH_BANDS = 3;
/** 帯ごとの不透明度(奥・中・手前)。 */
export const BAND_ALPHA: readonly number[] = [0.45, 0.7, 1.0];

/** sRGB の 0〜255 の整数。 */
export type Rgb = { r: number; g: number; b: number };

const HEX_RRGGBB = /^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/;

/**
 * `#rrggbb` を成分に分ける。短縮形や `rgb(...)` は受けない。
 *
 * トークンの値は `globals.css` で `#rrggbb` に揃えているため、それ以外は設定の誤りとして
 * `null` を返し、呼び出し側が退避色へ切り替えられるようにする(spec.md §6.5)。
 */
export function parseHex(color: string): Rgb | null {
  const m = HEX_RRGGBB.exec(color);
  if (m === null) {
    return null;
  }
  return { r: Number.parseInt(m[1], 16), g: Number.parseInt(m[2], 16), b: Number.parseInt(m[3], 16) };
}

/** 色相環上の 1 成分を HSL から求める補助。`t` は 0〜1 に正規化した色相のずれ。 */
function hueToChannel(p: number, q: number, t: number): number {
  let h = t;
  if (h < 0) {
    h += 1;
  }
  if (h > 1) {
    h -= 1;
  }
  if (h < 1 / 6) {
    return p + (q - p) * 6 * h;
  }
  if (h < 1 / 2) {
    return q;
  }
  if (h < 2 / 3) {
    return p + (q - p) * (2 / 3 - h) * 6;
  }
  return p;
}

/**
 * 色相を `degrees` だけ回す(彩度・明度は保つ)。
 *
 * 地形の色を時間で回すために使う(spec.md §8)。マウント時に 36 位相ぶんを作るだけなので、
 * 速度より読みやすさを優先して RGB → HSL → RGB を素直に書いている。
 */
export function rotateHue(color: Rgb, degrees: number): Rgb {
  const r = color.r / 255;
  const g = color.g / 255;
  const b = color.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) {
    // 無彩色は色相を持たないため、回しても変わらない。
    return { r: color.r, g: color.g, b: color.b };
  }
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) {
    h = (g - b) / d + (g < b ? 6 : 0);
  } else if (max === g) {
    h = (b - r) / d + 2;
  } else {
    h = (r - g) / d + 4;
  }
  h /= 6;

  h = (((h + degrees / 360) % 1) + 1) % 1;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return {
    r: Math.round(hueToChannel(p, q, h + 1 / 3) * 255),
    g: Math.round(hueToChannel(p, q, h) * 255),
    b: Math.round(hueToChannel(p, q, h - 1 / 3) * 255),
  };
}

/** 2 色の間を `t`(0〜1)で線形補間して整数に丸める。 */
function mix(from: Rgb, to: Rgb, t: number): Rgb {
  return {
    r: Math.round(from.r + (to.r - from.r) * t),
    g: Math.round(from.g + (to.g - from.g) * t),
    b: Math.round(from.b + (to.b - from.b) * t),
  };
}

/** 段 `step` の色を `steps` 段の中で停止色から求める。2 色なら steps−1 区間、3 色なら半分ずつの 2 区間。 */
function colorAtStep(stops: readonly Rgb[], step: number, steps: number): Rgb {
  if (stops.length === 2) {
    return mix(stops[0], stops[1], step / (steps - 1));
  }
  const half = Math.floor(steps / 2);
  if (step < half) {
    return mix(stops[0], stops[1], step / half);
  }
  return mix(stops[1], stops[2], (step - half) / (steps - half - 1));
}

/**
 * 不透明度を焼き込んだ色文字列を作る。
 *
 * 色文字列のテンプレートをこの 1 箇所に閉じ込めるのは、色の直値が `.ts` に散らない規律を
 * 静的検査(テンプレートの出現が palette.ts の 1 箇所)で確かめられるようにするため(spec.md §6.4)。
 * パネルの塗り・格子・縁の色(不透明度を焼き込んだ 1 本の文字列)もこの関数で作る(#4 spec §6.3)。
 */
export function toColorString(c: Rgb, alpha: number): string {
  return `rgba(${c.r}, ${c.g}, ${c.b}, ${alpha})`;
}

function assertStops(name: string, stops: readonly Rgb[]): void {
  if (stops.length !== 2 && stops.length !== 3) {
    throw new Error(`${name}: 停止色は 2 色または 3 色でなければならない(${stops.length} 色)`);
  }
}

/**
 * 停止色(2 色または 3 色)を PALETTE_STEPS 段に補間し、帯ごとの不透明度を焼き込んだ色文字列を返す。
 * 戻り値は [band][step] の 2 次元配列(長さ DEPTH_BANDS × PALETTE_STEPS)。
 *
 * 不透明度を文字列に焼き込むのは、描画で `globalAlpha` を帯ごとに切り替えずに済ませ、
 * `fillStyle` の設定回数をバケット数で抑えるため(spec.md §6.4)。
 * `rgba` 形式の文字列はこのモジュールの `rgba` だけが作り、色の直値が `.ts` に散らないようにする(Requirement 6.1)。
 */
export function buildRamp(stops: readonly Rgb[]): string[][] {
  assertStops('buildRamp', stops);
  const ramp: string[][] = [];
  for (let band = 0; band < DEPTH_BANDS; band += 1) {
    ramp.push(buildShadowRamp(stops, PALETTE_STEPS, BAND_ALPHA[band]));
  }
  return ramp;
}

/**
 * 停止色(2 色または 3 色)を `steps` 段に補間し、`alpha` を焼き込んだ色文字列を返す。
 *
 * 影の色の表(構造 × 8 段)を作るために使う(spec.md §6.4)。段数を引数にしているのは、
 * 影は点より段を粗くして `fillStyle` の設定回数を面ごと 24 回以下に抑えるため(Requirement 4.5)。
 * `buildRamp` もこの関数で帯ごとの行を作り、色文字列のテンプレートを共有する。
 */
export function buildShadowRamp(stops: readonly Rgb[], steps: number, alpha: number): string[] {
  assertStops('buildShadowRamp', stops);
  if (!Number.isInteger(steps) || steps < 2) {
    throw new Error(`buildShadowRamp: 段数は 2 以上の整数でなければならない(${steps})`);
  }
  const row: string[] = [];
  for (let step = 0; step < steps; step += 1) {
    row.push(toColorString(colorAtStep(stops, step, steps), alpha));
  }
  return row;
}
