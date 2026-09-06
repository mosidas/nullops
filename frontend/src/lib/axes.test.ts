import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AXIS_SEGMENTS, type Segment, type Vec3 } from './axes.ts';

/** 線分を向きに依らない文字列にする(重複の検出用)。 */
function keyOf(segment: Segment): string {
  const a = `${segment.from.x},${segment.from.y},${segment.from.z}`;
  const b = `${segment.to.x},${segment.to.y},${segment.to.z}`;
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function isCorner(p: Vec3): boolean {
  return Math.abs(p.x) === 1 && Math.abs(p.y) === 1 && Math.abs(p.z) === 1;
}

describe('AXIS_SEGMENTS', () => {
  it('axis 3 本・edge 12 本、合わせて 15 本を持つ(Requirement 4.1)', () => {
    assert.equal(AXIS_SEGMENTS.length, 15);
    assert.equal(AXIS_SEGMENTS.filter((s) => s.kind === 'axis').length, 3);
    assert.equal(AXIS_SEGMENTS.filter((s) => s.kind === 'edge').length, 12);
  });

  it('すべての端点の座標が -1 以上 1 以下にある(Requirement 4.2)', () => {
    for (const { from, to } of AXIS_SEGMENTS) {
      for (const p of [from, to]) {
        for (const v of [p.x, p.y, p.z]) {
          assert.ok(v >= -1 && v <= 1, `範囲外の座標: ${v}`);
        }
      }
    }
  });

  it('axis の 3 本が §6.2 の端点を持つ', () => {
    const axes = AXIS_SEGMENTS.filter((s) => s.kind === 'axis')
      .map(keyOf)
      .sort();
    assert.deepEqual(axes, ['-1,0,0|1,0,0', '0,-1,0|0,1,0', '0,0,-1|0,0,1'].sort());
  });

  it('edge の端点はすべて ±1 の組(単位立方体の頂点)で、1 軸だけが異なる', () => {
    for (const { from, to, kind } of AXIS_SEGMENTS) {
      if (kind !== 'edge') {
        continue;
      }
      assert.ok(isCorner(from) && isCorner(to));
      const differing = [from.x !== to.x, from.y !== to.y, from.z !== to.z].filter(Boolean).length;
      assert.equal(differing, 1);
    }
  });

  it('15 本に重複が無い', () => {
    const keys = new Set(AXIS_SEGMENTS.map(keyOf));
    assert.equal(keys.size, 15);
  });
});
