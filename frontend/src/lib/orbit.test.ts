import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  advanceOrbit,
  beginDrag,
  createOrbit,
  DRAG_RAD_PER_PX,
  dragBy,
  endDrag,
  MAX_FRAME_MS,
  type Orbit,
  PITCH_LIMIT,
  RETURN_MS,
  YAW_RATE_RAD_PER_SEC,
} from './orbit.ts';
import { SCATTER_PITCH } from './project.ts';

/** ドラッグ中の視点を作る補助。`dyPx` でピッチをずらしてから返す。 */
function draggedOrbit(dyPx: number): Orbit {
  const orbit = createOrbit();
  beginDrag(orbit);
  dragBy(orbit, 0, dyPx);
  return orbit;
}

describe('createOrbit(初期値)', () => {
  it('auto・yaw 0・pitch SCATTER_PITCH・復帰完了で始まる(Requirement 1.3・8.1)', () => {
    const orbit = createOrbit();
    assert.equal(orbit.mode, 'auto');
    assert.equal(orbit.yaw, 0);
    assert.equal(orbit.pitch, SCATTER_PITCH);
    assert.ok(orbit.returnElapsedMs >= RETURN_MS);
  });
});

describe('advanceOrbit(自動回転)', () => {
  it('auto ではヨーが 0.24 × 秒 だけ増える(Requirement 2.1)', () => {
    const orbit = createOrbit();
    advanceOrbit(orbit, 50);
    assert.ok(Math.abs(orbit.yaw - 0.05 * YAW_RATE_RAD_PER_SEC) < 1e-12);
    assert.equal(orbit.pitch, SCATTER_PITCH);
  });

  it('elapsedMs を [0, MAX_FRAME_MS] に切り詰める(負 → 0・上限超 → 100・NaN → 0)', () => {
    const negative = createOrbit();
    advanceOrbit(negative, -30);
    assert.equal(negative.yaw, 0);

    const huge = createOrbit();
    advanceOrbit(huge, 5000);
    assert.ok(Math.abs(huge.yaw - (MAX_FRAME_MS / 1000) * YAW_RATE_RAD_PER_SEC) < 1e-12);

    const nan = createOrbit();
    advanceOrbit(nan, Number.NaN);
    assert.equal(nan.yaw, 0);
    advanceOrbit(nan, Number.POSITIVE_INFINITY);
    assert.equal(nan.yaw, 0);
  });

  it('drag 中はヨー・ピッチを変えない(Requirement 2.2・§6.1 不変条件)', () => {
    const orbit = draggedOrbit(20);
    const { yaw, pitch } = orbit;
    advanceOrbit(orbit, 100);
    assert.equal(orbit.yaw, yaw);
    assert.equal(orbit.pitch, pitch);
  });
});

describe('beginDrag / dragBy', () => {
  it('dragBy はヨーに dx × 0.01、ピッチに dy × 0.01 を足す(Requirement 2.1・2.2)', () => {
    const orbit = createOrbit();
    beginDrag(orbit);
    assert.equal(orbit.mode, 'drag');
    dragBy(orbit, 10, -5);
    assert.ok(Math.abs(orbit.yaw - 10 * DRAG_RAD_PER_PX) < 1e-12);
    assert.ok(Math.abs(orbit.pitch - (SCATTER_PITCH - 5 * DRAG_RAD_PER_PX)) < 1e-12);
  });

  it('ピッチを ±PITCH_LIMIT に切り詰め、超過しても反転しない(Requirement 2.3)', () => {
    const up = draggedOrbit(100000);
    assert.equal(up.pitch, PITCH_LIMIT);
    dragBy(up, 0, 1);
    assert.equal(up.pitch, PITCH_LIMIT);

    const down = draggedOrbit(-100000);
    assert.equal(down.pitch, -PITCH_LIMIT);
  });

  it('dx・dy の NaN・Infinity は 0 として扱う(§5.2 エラー)', () => {
    const orbit = createOrbit();
    beginDrag(orbit);
    dragBy(orbit, Number.NaN, Number.POSITIVE_INFINITY);
    assert.equal(orbit.yaw, 0);
    assert.equal(orbit.pitch, SCATTER_PITCH);
    dragBy(orbit, Number.NEGATIVE_INFINITY, Number.NaN);
    assert.equal(orbit.yaw, 0);
    assert.equal(orbit.pitch, SCATTER_PITCH);
  });

  it('auto 中の dragBy は無視する(Requirement 2.4)', () => {
    const orbit = createOrbit();
    dragBy(orbit, 100, 100);
    assert.equal(orbit.yaw, 0);
    assert.equal(orbit.pitch, SCATTER_PITCH);
  });

  it('復帰途中の beginDrag はその時点のピッチで止まる(Requirement 3.6)', () => {
    const orbit = draggedOrbit(50);
    endDrag(orbit);
    advanceOrbit(orbit, 100);
    advanceOrbit(orbit, 100);
    const midway = orbit.pitch;
    assert.notEqual(midway, SCATTER_PITCH);
    beginDrag(orbit);
    advanceOrbit(orbit, 100);
    assert.equal(orbit.pitch, midway);
  });
});

describe('endDrag と復帰', () => {
  it('endDrag でヨーを保ち、次の advanceOrbit から待ち時間なしにヨーが進む(Requirement 3.1・3.2)', () => {
    const orbit = createOrbit();
    beginDrag(orbit);
    dragBy(orbit, 30, 0);
    const yawAtRelease = orbit.yaw;
    endDrag(orbit);
    assert.equal(orbit.mode, 'auto');
    assert.equal(orbit.yaw, yawAtRelease);
    advanceOrbit(orbit, 16);
    assert.ok(orbit.yaw > yawAtRelease);
  });

  it('累計 1500 ms 未満では始点と SCATTER_PITCH の間にあり単調に近づく(Requirement 3.3・3.4)', () => {
    const orbit = draggedOrbit(60);
    const from = orbit.pitch;
    endDrag(orbit);
    let prevDistance = Math.abs(orbit.pitch - SCATTER_PITCH);
    const lo = Math.min(from, SCATTER_PITCH);
    const hi = Math.max(from, SCATTER_PITCH);
    for (let total = 100; total < RETURN_MS; total += 100) {
      advanceOrbit(orbit, 100);
      assert.ok(orbit.pitch >= lo && orbit.pitch <= hi, `累計 ${total} ms で範囲外: ${orbit.pitch}`);
      const distance = Math.abs(orbit.pitch - SCATTER_PITCH);
      assert.ok(distance < prevDistance, `累計 ${total} ms で近づいていない`);
      prevDistance = distance;
    }
  });

  it('1500 ms 到達でちょうど SCATTER_PITCH になる(Requirement 3.5)', () => {
    const orbit = draggedOrbit(60);
    endDrag(orbit);
    for (let total = 0; total < RETURN_MS; total += 100) {
      advanceOrbit(orbit, 100);
    }
    assert.equal(orbit.pitch, SCATTER_PITCH);
    advanceOrbit(orbit, 100);
    assert.equal(orbit.pitch, SCATTER_PITCH);
  });

  it('ease-out(3 次)の 1 点を数値で照合する(t = 0.5 → 0.875)', () => {
    const orbit = draggedOrbit(60);
    const from = orbit.pitch;
    endDrag(orbit);
    // 100 ms を 7 回 + 50 ms で累計 750 ms = RETURN_MS / 2。
    for (let i = 0; i < 7; i += 1) {
      advanceOrbit(orbit, 100);
    }
    advanceOrbit(orbit, 50);
    const expected = from + (SCATTER_PITCH - from) * 0.875;
    assert.ok(Math.abs(orbit.pitch - expected) < 1e-12);
  });

  it('auto 中の endDrag は何もしない(冪等。Requirement 3.7)', () => {
    const orbit = draggedOrbit(60);
    endDrag(orbit);
    advanceOrbit(orbit, 100);
    const { pitch, returnElapsedMs, returnFrom } = orbit;
    endDrag(orbit);
    assert.equal(orbit.mode, 'auto');
    assert.equal(orbit.pitch, pitch);
    assert.equal(orbit.returnElapsedMs, returnElapsedMs);
    assert.equal(orbit.returnFrom, returnFrom);
  });
});

describe('不変条件', () => {
  it('全関数が引数の orbit をその場で更新し、戻り値を持たない(§5.2)', () => {
    const orbit = createOrbit();
    assert.equal(advanceOrbit(orbit, 16), undefined);
    assert.equal(beginDrag(orbit), undefined);
    assert.equal(dragBy(orbit, 1, 1), undefined);
    assert.equal(endDrag(orbit), undefined);
    assert.equal(orbit.mode, 'auto');
  });

  it('どの操作の後でも pitch は範囲内で yaw・pitch は有限値(§6.1)', () => {
    const orbit = createOrbit();
    beginDrag(orbit);
    dragBy(orbit, Number.POSITIVE_INFINITY, -1e9);
    endDrag(orbit);
    advanceOrbit(orbit, Number.NaN);
    advanceOrbit(orbit, 1e9);
    assert.ok(Number.isFinite(orbit.yaw));
    assert.ok(Number.isFinite(orbit.pitch));
    assert.ok(orbit.pitch >= -PITCH_LIMIT && orbit.pitch <= PITCH_LIMIT);
  });
});
