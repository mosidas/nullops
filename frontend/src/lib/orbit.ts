import { SCATTER_PITCH } from './project.ts';

/** 視点の状態。`auto` は自動回転、`drag` はポインタで操作中。 */
export type OrbitMode = 'auto' | 'drag';

/**
 * 視点(spec.md §6.1)。
 *
 * `yaw` は 2π で正規化しない。cos/sin は周期関数であり、正規化しても画は変わらず、
 * 単調に増やすほうが継ぎ目の扱いが要らない。
 */
export type Orbit = {
  mode: OrbitMode;
  yaw: number;
  pitch: number;
  returnFrom: number;
  returnElapsedMs: number;
};

/** ヨーの角速度(ラジアン毎秒)。1 周におよそ 26 秒かかる速さ。 */
export const YAW_RATE_RAD_PER_SEC = 0.24;

/** 1 CSS ピクセルあたりの回転量(ラジアン)。 */
export const DRAG_RAD_PER_PX = 0.01;

/**
 * ピッチの可動範囲(絶対値、ラジアン)。
 *
 * π/2 ちょうどまで許すと真上・真下から見た瞬間に奥行きが消えて反転したように
 * 見えるため、わずかに手前で止める。
 */
export const PITCH_LIMIT = 1.45;

/** ドラッグを離してからピッチが既定値へ戻るまでの時間(ミリ秒)。 */
export const RETURN_MS = 1500;

/**
 * 1 フレームとして扱う経過時間の上限(ミリ秒)。
 *
 * ウィンドウの最小化などで requestAnimationFrame が止まると、復帰時の
 * 差分が数秒に達しうる。頭打ちにしないと点群がその分だけ一気に回る。
 */
export const MAX_FRAME_MS = 100;

/** NaN・Infinity を 0 とみなす。画面へ NaN を出さないための入口の防波堤(spec.md §5.2 エラー)。 */
function finiteOrZero(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

/** 初期状態の視点を作る。オブジェクトを作るのはこの関数だけ(spec.md §6.1 強制)。 */
export function createOrbit(): Orbit {
  return {
    mode: 'auto',
    yaw: 0,
    pitch: SCATTER_PITCH,
    returnFrom: SCATTER_PITCH,
    returnElapsedMs: RETURN_MS,
  };
}

/**
 * 経過時間ぶん視点を進める。`drag` の間は何もしない(操作中の値を保つ)。
 *
 * 復帰は ease-out(3 次)で補間する。線形だと戻り終わる瞬間に速度が
 * 段になって見えるため。
 */
export function advanceOrbit(orbit: Orbit, elapsedMs: number): void {
  if (orbit.mode === 'drag') {
    return;
  }
  const elapsed = Math.min(Math.max(finiteOrZero(elapsedMs), 0), MAX_FRAME_MS);
  orbit.yaw += (elapsed / 1000) * YAW_RATE_RAD_PER_SEC;

  if (orbit.returnElapsedMs >= RETURN_MS) {
    return;
  }
  orbit.returnElapsedMs += elapsed;
  if (orbit.returnElapsedMs >= RETURN_MS) {
    // 補間の端数で SCATTER_PITCH からわずかにずれた値で止まらないよう、ちょうどに揃える。
    orbit.returnElapsedMs = RETURN_MS;
    orbit.pitch = SCATTER_PITCH;
    return;
  }
  const t = orbit.returnElapsedMs / RETURN_MS;
  const eased = 1 - (1 - t) ** 3;
  orbit.pitch = orbit.returnFrom + (SCATTER_PITCH - orbit.returnFrom) * eased;
}

/** ドラッグを始める。復帰の途中ならその時点のピッチで止まる。 */
export function beginDrag(orbit: Orbit): void {
  orbit.mode = 'drag';
}

/** ポインタの移動量(CSS ピクセル)を回転へ変える。`auto` の間は無視する。 */
export function dragBy(orbit: Orbit, dxPx: number, dyPx: number): void {
  if (orbit.mode !== 'drag') {
    return;
  }
  orbit.yaw += finiteOrZero(dxPx) * DRAG_RAD_PER_PX;
  const pitch = orbit.pitch + finiteOrZero(dyPx) * DRAG_RAD_PER_PX;
  orbit.pitch = Math.min(Math.max(pitch, -PITCH_LIMIT), PITCH_LIMIT);
}

/**
 * ドラッグを終えて復帰を始める。`auto` の間は何もしない。
 *
 * 冪等にするのは、`pointerup` と `lostpointercapture` が続けて届いたときに
 * 復帰をやり直さないため(spec.md §5.2)。
 */
export function endDrag(orbit: Orbit): void {
  if (orbit.mode !== 'drag') {
    return;
  }
  orbit.mode = 'auto';
  orbit.returnFrom = orbit.pitch;
  orbit.returnElapsedMs = 0;
}
