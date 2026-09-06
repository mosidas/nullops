import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import type { Vec3 } from './axes.ts';
import { createProjectedCloud, type Projected, projectPoint, projectPoints, SCATTER_PITCH } from './project.ts';

const VIEW = { width: 640, height: 400 };

function emptyProjected(): Projected {
  return { sx: 0, sy: 0, scale: 0, depth: 0 };
}

/** 単位立方体の 8 頂点。 */
const CUBE_VERTICES: Vec3[] = [-1, 1].flatMap((x) => [-1, 1].flatMap((y) => [-1, 1].map((z) => ({ x, y, z }))));

/** 決定的な擬似乱数で単位立方体内の点を作る(テストの再現性のため Math.random を使わない)。 */
function samplePoints(count: number): Vec3[] {
  const points: Vec3[] = [];
  let seed = 12345;
  const next = (): number => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  for (let i = 0; i < count; i += 1) {
    points.push({ x: next() * 2 - 1, y: next() * 2 - 1, z: next() * 2 - 1 });
  }
  return points;
}

describe('projectPoint', () => {
  // 受け入れ基準 5.1: out を上書きして out と同一の参照を返す。
  it('渡した器を上書きして同じ参照を返す', () => {
    const out = emptyProjected();
    const returned = projectPoint({ x: 0.5, y: -0.25, z: 0.75 }, 0.3, SCATTER_PITCH, VIEW, out);
    assert.ok(Object.is(returned, out));
    assert.notEqual(out.sx, 0);
    assert.notEqual(out.sy, 0);
    assert.notEqual(out.scale, 0);
  });

  // 受け入れ基準 5.2: 同じ引数につねに同じ値を書く。
  it('同じ引数で同じ値を書く', () => {
    const p = { x: 0.3, y: 0.6, z: -0.2 };
    const a = projectPoint(p, 1.1, SCATTER_PITCH, VIEW, emptyProjected());
    const b = projectPoint(p, 1.1, SCATTER_PITCH, VIEW, emptyProjected());
    assert.deepEqual(a, b);
  });

  // 受け入れ基準 5.2: scale が 0 より大きい有限値、単位立方体の頂点で sx・sy が有限。
  it('単位立方体の 8 頂点で scale が正の有限値、sx・sy が有限', () => {
    const out = emptyProjected();
    for (const yaw of [0, 0.7, 1.5, 3.1, 4.7, 6.2]) {
      for (const v of CUBE_VERTICES) {
        projectPoint(v, yaw, SCATTER_PITCH, VIEW, out);
        assert.ok(Number.isFinite(out.scale) && out.scale > 0, `scale が正の有限値でない: ${out.scale}`);
        assert.ok(Number.isFinite(out.sx), `sx が有限でない: ${out.sx}`);
        assert.ok(Number.isFinite(out.sy), `sy が有限でない: ${out.sy}`);
      }
    }
  });

  // 受け入れ基準 5.2: 回転後の Z が大きい(手前の)点ほど scale が大きい。
  it('手前の点ほど scale が大きい', () => {
    // ヨー 0・ピッチ 0 なら回転後の Z はモデルの Z そのもの。
    const near = projectPoint({ x: 0, y: 0, z: 0.8 }, 0, 0, VIEW, emptyProjected());
    const far = projectPoint({ x: 0, y: 0, z: -0.8 }, 0, 0, VIEW, emptyProjected());
    assert.ok(near.depth > far.depth);
    assert.ok(near.scale > far.scale);
  });
});

describe('projectPoints', () => {
  const originalCos = Math.cos;
  const originalSin = Math.sin;
  afterEach(() => {
    Math.cos = originalCos;
    Math.sin = originalSin;
  });

  // 受け入れ基準 5.3: 各要素が projectPoint と 1e-3 以内で一致し、length が points.length。
  it('各要素が projectPoint と一致し length が点数になる', () => {
    const points = samplePoints(200);
    const out = createProjectedCloud(points.length);
    projectPoints(points, 0.9, SCATTER_PITCH, VIEW, out);
    assert.equal(out.length, points.length);
    const one = emptyProjected();
    for (let i = 0; i < points.length; i += 1) {
      projectPoint(points[i], 0.9, SCATTER_PITCH, VIEW, one);
      assert.ok(Math.abs(out.sx[i] - one.sx) <= 1e-3, `点 ${i} の sx が一致しない`);
      assert.ok(Math.abs(out.sy[i] - one.sy) <= 1e-3, `点 ${i} の sy が一致しない`);
      assert.ok(Math.abs(out.depth[i] - one.depth) <= 1e-3, `点 ${i} の depth が一致しない`);
    }
  });

  // 受け入れ基準 5.4: 容量不足は容量まで書き、例外を投げない。
  it('容量 2 に 3 点を渡すと length 2 で例外を投げない', () => {
    const out = createProjectedCloud(2);
    const originalError = console.error;
    let logged = 0;
    console.error = () => {
      logged += 1;
    };
    try {
      assert.doesNotThrow(() => projectPoints(samplePoints(3), 0.2, SCATTER_PITCH, VIEW, out));
    } finally {
      console.error = originalError;
    }
    assert.equal(out.length, 2);
    assert.equal(logged, 1);
  });

  // 受け入れ基準 5.5: Math.cos・Math.sin を合わせて 4 回だけ評価する。
  it('三角関数を合わせて 4 回だけ評価する', () => {
    let calls = 0;
    Math.cos = (x: number): number => {
      calls += 1;
      return originalCos(x);
    };
    Math.sin = (x: number): number => {
      calls += 1;
      return originalSin(x);
    };
    const points = samplePoints(500);
    projectPoints(points, 0.4, SCATTER_PITCH, VIEW, createProjectedCloud(points.length));
    assert.equal(calls, 4);
  });
});
