import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GRID_DIVISIONS, GRID_STOPS, PANES, type Vec3, WALL_IDS, wallWeights } from './panes.ts';

function isCorner(p: Vec3): boolean {
  return Math.abs(p.x) === 1 && Math.abs(p.y) === 1 && Math.abs(p.z) === 1;
}

function add(a: Vec3, b: Vec3, k: number): Vec3 {
  return { x: a.x + b.x * k, y: a.y + b.y * k, z: a.z + b.z * k };
}

function includes(corners: readonly Vec3[], p: Vec3): boolean {
  return corners.some((c) => c.x === p.x && c.y === p.y && c.z === p.z);
}

describe('PANES', () => {
  it('縦 4 面と床の 5 面を持ち、corners がすべて単位立方体の頂点で、origin + along × 2 と origin + up × 2 を含む(Requirement 1.1)', () => {
    assert.deepEqual(Object.keys(PANES).sort(), ['floor', 'xNeg', 'xPos', 'zNeg', 'zPos']);
    for (const pane of Object.values(PANES)) {
      assert.equal(pane.corners.length, 4);
      for (const c of pane.corners) assert.ok(isCorner(c), `${pane.id}: ${JSON.stringify(c)}`);
      assert.ok(includes(pane.corners, add(pane.origin, pane.along, 2)));
      assert.ok(includes(pane.corners, add(pane.origin, pane.up, 2)));
      assert.ok(includes(pane.corners, add(add(pane.origin, pane.along, 2), pane.up, 2)));
      const dot = pane.along.x * pane.up.x + pane.along.y * pane.up.y + pane.along.z * pane.up.z;
      assert.equal(dot, 0);
    }
  });

  it('§6.1 の表と一致し、固定軸が面の位置に対応する(Requirement 1.1)', () => {
    assert.deepEqual(PANES.xNeg.origin, { x: -1, y: -1, z: 1 });
    assert.deepEqual(PANES.xNeg.along, { x: 0, y: 0, z: -1 });
    assert.deepEqual(PANES.xPos.origin, { x: 1, y: -1, z: -1 });
    assert.deepEqual(PANES.zNeg.along, { x: 1, y: 0, z: 0 });
    assert.deepEqual(PANES.zPos.along, { x: -1, y: 0, z: 0 });
    assert.deepEqual(PANES.floor.up, { x: 0, y: 0, z: 1 });
    for (const pane of Object.values(PANES)) {
      for (const c of pane.corners) assert.equal(c[pane.fixedAxis], pane.fixedValue);
    }
  });

  it('定数が GRID_DIVISIONS 3・GRID_STOPS [0, 2/3, 4/3, 2]・WALL_IDS の順を持つ(Requirement 1.7)', () => {
    assert.equal(GRID_DIVISIONS, 3);
    assert.equal(GRID_STOPS.length, 4);
    for (const [i, expected] of [0, 2 / 3, 4 / 3, 2].entries()) {
      assert.ok(Math.abs(GRID_STOPS[i] - expected) < 1e-9);
    }
    assert.deepEqual([...WALL_IDS], ['xNeg', 'xPos', 'zNeg', 'zPos']);
  });

  it('PANES の参照が毎回同じオブジェクトを返す(Requirement 1.6)', () => {
    assert.equal(PANES.xNeg, PANES.xNeg);
    assert.equal(PANES.xNeg.corners, PANES.xNeg.corners);
  });
});

describe('wallWeights', () => {
  it('WALL_IDS の順に max(0, -sin)・max(0, sin)・max(0, cos)・max(0, -cos) を書き、out と同一の参照を返す(Requirement 1.2)', () => {
    const out = new Float64Array(4);
    for (const yaw of [0, 0.3, 1.2, 2.5, 4, 5.9, -1, 10]) {
      const r = wallWeights(yaw, out);
      assert.equal(r, out);
      const s = Math.sin(yaw);
      const c = Math.cos(yaw);
      const expected = [Math.max(0, -s), Math.max(0, s), Math.max(0, c), Math.max(0, -c)];
      for (let i = 0; i < 4; i++) assert.ok(Math.abs(out[i] - expected[i]) < 1e-9, `yaw=${yaw} i=${i}`);
    }
  });

  it('1° 刻みで隣接する yaw の重みの差が 0.02 以下(Requirement 1.3)', () => {
    const prev = new Float64Array(4);
    const cur = new Float64Array(4);
    wallWeights(0, prev);
    const step = Math.PI / 180;
    for (let k = 1; k <= 360; k++) {
      wallWeights(k * step, cur);
      for (let i = 0; i < 4; i++) assert.ok(Math.abs(cur[i] - prev[i]) <= 0.02, `k=${k} i=${i}`);
      prev.set(cur);
    }
  });

  it('対向する面の重みの積が 0 で、各重みが 0〜1、正の面は高々 2 面(Requirement 1.4)', () => {
    const out = new Float64Array(4);
    for (let k = 0; k < 720; k++) {
      wallWeights((k * Math.PI) / 360, out);
      assert.equal(out[0] * out[1], 0);
      assert.equal(out[2] * out[3], 0);
      let positive = 0;
      for (let i = 0; i < 4; i++) {
        assert.ok(out[i] >= 0 && out[i] <= 1);
        if (out[i] > 0) positive++;
      }
      assert.ok(positive <= 2);
    }
  });

  it('yaw が NaN なら 0 として扱い、例外を投げない(Requirement 1.5)', () => {
    const out = new Float64Array(4);
    assert.doesNotThrow(() => wallWeights(Number.NaN, out));
    assert.deepEqual([...out], [0, 0, 1, 0]);
  });

  it('Math.sin・Math.cos を合わせて 2 回だけ評価し、同じ yaw に同じ値を書く(Requirement 1.6)', () => {
    const origSin = Math.sin;
    const origCos = Math.cos;
    let calls = 0;
    Math.sin = (x: number) => {
      calls++;
      return origSin(x);
    };
    Math.cos = (x: number) => {
      calls++;
      return origCos(x);
    };
    try {
      const a = new Float64Array(4);
      const b = new Float64Array(4);
      wallWeights(0.7, a);
      assert.equal(calls, 2);
      wallWeights(0.7, b);
      assert.deepEqual([...a], [...b]);
    } finally {
      Math.sin = origSin;
      Math.cos = origCos;
    }
  });
});
