/**
 * 3D 散布図のパネル(縦 4 面 + 床)の幾何と、縦面の「奥向きの度合い」(重み)。
 * 描画コンポーネントから切り出した純粋なモジュール(spec §5.2・§6.1)。
 * DOM・React に依存しないのは `node --test` で幾何と重みを検証するため。
 */

export type Vec3 = { x: number; y: number; z: number };
export type WallId = 'xNeg' | 'xPos' | 'zNeg' | 'zPos';
export type PaneId = WallId | 'floor';

/** 面の幾何。origin + along × s + up × t(s, t ∈ [0, 2])が面上の点。corners は origin から along・up の順に回る 4 頂点。 */
export type Pane = {
  id: PaneId;
  origin: Vec3;
  along: Vec3;
  up: Vec3;
  corners: readonly [Vec3, Vec3, Vec3, Vec3];
  /** 影の投影で固定する座標軸と値。xNeg なら axis 'x'・value -1。 */
  fixedAxis: 'x' | 'y' | 'z';
  fixedValue: -1 | 1;
};

function v(x: number, y: number, z: number): Vec3 {
  return { x, y, z };
}

function pane(id: PaneId, origin: Vec3, along: Vec3, up: Vec3, fixedAxis: 'x' | 'y' | 'z', fixedValue: -1 | 1): Pane {
  const corners: [Vec3, Vec3, Vec3, Vec3] = [
    origin,
    v(origin.x + along.x * 2, origin.y + along.y * 2, origin.z + along.z * 2),
    v(origin.x + along.x * 2 + up.x * 2, origin.y + along.y * 2 + up.y * 2, origin.z + along.z * 2 + up.z * 2),
    v(origin.x + up.x * 2, origin.y + up.y * 2, origin.z + up.z * 2),
  ];
  return { id, origin, along, up, corners, fixedAxis, fixedValue };
}

const UP_Y = v(0, 1, 0);

// 縦 4 面の along は面の内側から見て左→右(along = 外向き法線 × up)。
// 重みが正の面に貼った文字がどの視点でも鏡像にならないための向き(spec §6.1 不変条件)。
export const PANES: Readonly<Record<PaneId, Pane>> = {
  xNeg: pane('xNeg', v(-1, -1, 1), v(0, 0, -1), UP_Y, 'x', -1),
  xPos: pane('xPos', v(1, -1, -1), v(0, 0, 1), UP_Y, 'x', 1),
  zNeg: pane('zNeg', v(-1, -1, -1), v(1, 0, 0), UP_Y, 'z', -1),
  zPos: pane('zPos', v(1, -1, 1), v(-1, 0, 0), UP_Y, 'z', 1),
  floor: pane('floor', v(-1, -1, -1), v(1, 0, 0), v(0, 0, 1), 'y', -1),
};

/** 縦 4 面の固定の並び。wallWeights の out の添字と対応する。 */
export const WALL_IDS: readonly [WallId, WallId, WallId, WallId] = ['xNeg', 'xPos', 'zNeg', 'zPos'];

export const GRID_DIVISIONS = 3;

/** 面上の格子線の端点(縁 2 本を含む 2 方向 × (GRID_DIVISIONS + 1) 本)を、pane の s・t の値の並びとして返す。 */
export const GRID_STOPS: readonly number[] = [0, 2 / 3, 4 / 3, 2];

/**
 * 縦 4 面の重み(0〜1)を WALL_IDS の順で out に書く。重み = max(0, −(法線の回転後 z 成分))。
 * 離散的に面を選ばず連続量で決めるのは、自動回転の下で面が入れ替わる瞬間に画が飛ばないようにするため(spec §3 前提 2)。
 */
export function wallWeights(yaw: number, out: Float64Array): Float64Array {
  const y = Number.isNaN(yaw) ? 0 : yaw;
  const s = Math.sin(y);
  const c = Math.cos(y);
  out[0] = s < 0 ? -s : 0;
  out[1] = s > 0 ? s : 0;
  out[2] = c > 0 ? c : 0;
  out[3] = c < 0 ? -c : 0;
  return out;
}
