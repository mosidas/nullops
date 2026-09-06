// Vec3 の定義元は panes.ts へ移した(unit #4 spec §5.2)。本ファイルは 5.1 で削除するまで既存の import を保つための再 export だけ残す。
export type { Vec3 } from './panes.ts';

import type { Vec3 } from './panes.ts';

/** 軸線 1 本。`axis` は X・Y・Z の 3 軸、`edge` は単位立方体の稜線。 */
export type Segment = { from: Vec3; to: Vec3; kind: 'axis' | 'edge' };

/**
 * 軸線の幾何。実行時に生成せずモジュール定数として持つのは、毎フレーム
 * `projectPoint` へそのまま渡してオブジェクトを作らないため(Requirement 9.4)。
 *
 * 稜線 12 本は「X 方向 4 本・Y 方向 4 本・Z 方向 4 本」の順に並べる。
 * 各方向で残り 2 軸の符号 (-,-)・(-,+)・(+,-)・(+,+) を総当たりすると 4 本になる。
 */
export const AXIS_SEGMENTS: readonly Segment[] = [
  { from: { x: -1, y: 0, z: 0 }, to: { x: 1, y: 0, z: 0 }, kind: 'axis' },
  { from: { x: 0, y: -1, z: 0 }, to: { x: 0, y: 1, z: 0 }, kind: 'axis' },
  { from: { x: 0, y: 0, z: -1 }, to: { x: 0, y: 0, z: 1 }, kind: 'axis' },
  // X 方向の稜線
  { from: { x: -1, y: -1, z: -1 }, to: { x: 1, y: -1, z: -1 }, kind: 'edge' },
  { from: { x: -1, y: -1, z: 1 }, to: { x: 1, y: -1, z: 1 }, kind: 'edge' },
  { from: { x: -1, y: 1, z: -1 }, to: { x: 1, y: 1, z: -1 }, kind: 'edge' },
  { from: { x: -1, y: 1, z: 1 }, to: { x: 1, y: 1, z: 1 }, kind: 'edge' },
  // Y 方向の稜線
  { from: { x: -1, y: -1, z: -1 }, to: { x: -1, y: 1, z: -1 }, kind: 'edge' },
  { from: { x: -1, y: -1, z: 1 }, to: { x: -1, y: 1, z: 1 }, kind: 'edge' },
  { from: { x: 1, y: -1, z: -1 }, to: { x: 1, y: 1, z: -1 }, kind: 'edge' },
  { from: { x: 1, y: -1, z: 1 }, to: { x: 1, y: 1, z: 1 }, kind: 'edge' },
  // Z 方向の稜線
  { from: { x: -1, y: -1, z: -1 }, to: { x: -1, y: -1, z: 1 }, kind: 'edge' },
  { from: { x: -1, y: 1, z: -1 }, to: { x: -1, y: 1, z: 1 }, kind: 'edge' },
  { from: { x: 1, y: -1, z: -1 }, to: { x: 1, y: -1, z: 1 }, kind: 'edge' },
  { from: { x: 1, y: 1, z: -1 }, to: { x: 1, y: 1, z: 1 }, kind: 'edge' },
];
