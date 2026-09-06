import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  AXIS_NAME,
  ELEVATION_RANGE,
  elevationLabels,
  formatTick,
  type Label,
  type LabelFrame,
  labelFrame,
  TICK_COUNT,
  tickValues,
} from './labels.ts';
import { PANES, type Vec3, WALL_IDS, wallWeights } from './panes.ts';
import { FILL, type Projected, SCATTER_PITCH } from './project.ts';

const VIEW = { width: 640, height: 480 };

function projected(): Projected {
  return { sx: 0, sy: 0, scale: 0, depth: 0 };
}

function scratch(): [Projected, Projected, Projected] {
  return [projected(), projected(), projected()];
}

function frame(): LabelFrame {
  return { a: 0, b: 0, c: 0, d: 0, e: 0, f: 0, shrink: 0 };
}

/** projectPoint と独立に、spec §5.3 の式でモデル座標を CSS px に落とす(FOCAL = 3.2)。 */
function manualProject(p: Vec3, yaw: number, pitch: number): { sx: number; sy: number; scale: number } {
  const x1 = p.x * Math.cos(yaw) + p.z * Math.sin(yaw);
  const z1 = -p.x * Math.sin(yaw) + p.z * Math.cos(yaw);
  const y2 = p.y * Math.cos(pitch) - z1 * Math.sin(pitch);
  const z2 = p.y * Math.sin(pitch) + z1 * Math.cos(pitch);
  const scale = 3.2 / (3.2 - z2);
  const radius = (Math.min(VIEW.width, VIEW.height) / 2) * FILL;
  return { sx: VIEW.width / 2 + x1 * scale * radius, sy: VIEW.height / 2 - y2 * scale * radius, scale };
}

function near(actual: number, expected: number, tol: number, message: string): void {
  assert.ok(Math.abs(actual - expected) <= tol, `${message}: ${actual} vs ${expected}`);
}

describe('tickValues / formatTick', () => {
  it('[-0.10, 2.08] を 3 等分した 4 値を昇順で返す(Requirement 3.1)', () => {
    const values = tickValues(ELEVATION_RANGE, TICK_COUNT);
    assert.equal(values.length, 4);
    for (let k = 0; k < 4; k += 1) near(values[k], -0.1 + (k * 2.18) / 3, 1e-9, `k=${k}`);
    for (let k = 1; k < 4; k += 1) assert.ok(values[k] > values[k - 1]);
  });

  it('小数第 2 位で書き、負の 0 を出さない(Requirement 3.2)', () => {
    assert.deepEqual(tickValues(ELEVATION_RANGE, TICK_COUNT).map(formatTick), ['-0.10', '0.63', '1.35', '2.08']);
    assert.equal(formatTick(-0.001), '0.00');
  });
});

describe('elevationLabels', () => {
  it('面ごとに目盛り 4 個と軸名 1 個の計 5 個を作る(Requirement 3.3)', () => {
    for (const wall of WALL_IDS) {
      const out = elevationLabels(wall, 'right', []);
      assert.equal(out.length, 5);
      assert.deepEqual(
        out.map((l) => l.kind),
        ['tick', 'tick', 'tick', 'tick', 'name'],
      );
      assert.deepEqual(
        out.map((l) => l.text),
        ['-0.10', '0.63', '1.35', '2.08', AXIS_NAME],
      );
      for (const l of out) assert.equal(l.pane, wall);
    }
  });

  it('錨は side 側の縦の辺から外側へ 0.06 離れ、目盛りは y = -1 + 2k/3、軸名は y = 0 に置く(spec §5.3)', () => {
    const pane = PANES.zNeg;
    const right = elevationLabels('zNeg', 'right', []);
    const left = elevationLabels('zNeg', 'left', []);
    for (let k = 0; k < 4; k += 1) {
      near(right[k].anchor.x, pane.origin.x + pane.along.x * 2.06, 1e-12, 'right x');
      near(left[k].anchor.x, pane.origin.x - pane.along.x * 0.06, 1e-12, 'left x');
      near(right[k].anchor.y, -1 + (2 * k) / 3, 1e-12, 'y');
      assert.equal(right[k].anchor.z, pane.origin.z);
    }
    assert.equal(right[4].anchor.y, 0);
    assert.equal(right[0].fontPx, 13);
    assert.equal(right[4].fontPx, 14);
    assert.equal(right[0].along, pane.along);
    assert.equal(right[0].up, pane.up);
  });

  it('out を空にしてから書き、同じ配列を返す', () => {
    const out: Label[] = [];
    elevationLabels('xNeg', 'right', out);
    const again = elevationLabels('xPos', 'right', out);
    assert.equal(again, out);
    assert.equal(out.length, 5);
    assert.equal(out[0].pane, 'xPos');
  });
});

describe('labelFrame', () => {
  const eps = 0.01;

  it('a・b は along の微分の単位ベクトル × k、c・d は up の微分の単位ベクトルの符号反転 × k(Requirement 3.4)', () => {
    const [label] = elevationLabels('zNeg', 'right', []);
    const out = labelFrame(label, 0, SCATTER_PITCH, VIEW, 1, scratch(), frame());
    const o = manualProject(label.anchor, 0, SCATTER_PITCH);
    const a = manualProject({ x: label.anchor.x + eps, y: label.anchor.y, z: label.anchor.z }, 0, SCATTER_PITCH);
    const u = manualProject({ x: label.anchor.x, y: label.anchor.y + eps, z: label.anchor.z }, 0, SCATTER_PITCH);
    const ax = (a.sx - o.sx) / eps;
    const ay = (a.sy - o.sy) / eps;
    const ux = (u.sx - o.sx) / eps;
    const uy = (u.sy - o.sy) / eps;
    const la = Math.hypot(ax, ay);
    const lu = Math.hypot(ux, uy);
    near(out.a, (ax / la) * o.scale, 1e-6, 'a');
    near(out.b, (ay / la) * o.scale, 1e-6, 'b');
    near(out.c, (-ux / lu) * o.scale, 1e-6, 'c');
    near(out.d, (-uy / lu) * o.scale, 1e-6, 'd');
  });

  it('e・f は錨の投影の sx・sy(Requirement 3.11)、shrink は |along の微分| / (scale × radius)(Requirement 3.12)', () => {
    const labels = elevationLabels('xPos', 'right', []);
    for (const label of labels) {
      const out = labelFrame(label, 0.7, SCATTER_PITCH, VIEW, 2, scratch(), frame());
      const o = manualProject(label.anchor, 0.7, SCATTER_PITCH);
      near(out.e, o.sx, 1e-9, 'e');
      near(out.f, o.sy, 1e-9, 'f');
      const a = manualProject(
        { x: label.anchor.x + label.along.x * eps, y: label.anchor.y, z: label.anchor.z + label.along.z * eps },
        0.7,
        SCATTER_PITCH,
      );
      const la = Math.hypot((a.sx - o.sx) / eps, (a.sy - o.sy) / eps);
      const radius = (Math.min(VIEW.width, VIEW.height) / 2) * FILL;
      near(out.shrink, la / (o.scale * radius), 1e-6, 'shrink');
    }
  });

  it('画像の高さ (0, fontPx × dpr) を (a, b, c, d) で写した長さが fontPx × scale になる。dpr = 1 と 2 の両方(Requirement 3.13)', () => {
    const labels = elevationLabels('zPos', 'right', []);
    for (const dpr of [1, 2]) {
      for (const label of labels) {
        const out = labelFrame(label, 2.4, SCATTER_PITCH, VIEW, dpr, scratch(), frame());
        const o = manualProject(label.anchor, 2.4, SCATTER_PITCH);
        const h = label.fontPx * dpr;
        const len = Math.hypot(out.c * h, out.d * h);
        near(len, label.fontPx * o.scale, 1e-6, `dpr=${dpr}`);
      }
    }
  });

  it('yaw を 1° 刻みで 1 周したとき、重みが正の面のラベルはすべて a ≥ 0(Requirement 3.5)', () => {
    const perWall = WALL_IDS.map((wall) => elevationLabels(wall, 'right', []));
    const weights = new Float64Array(4);
    const s = scratch();
    const out = frame();
    // 既定ピッチの反転(4.1)前後のどちらでも成り立つことを確かめる。
    for (const pitch of [-0.42, 0.42]) {
      for (let deg = 0; deg <= 360; deg += 1) {
        const yaw = (deg * Math.PI) / 180;
        wallWeights(yaw, weights);
        for (let w = 0; w < 4; w += 1) {
          if (weights[w] <= 0) continue;
          for (const label of perWall[w]) {
            labelFrame(label, yaw, pitch, VIEW, 1, s, out);
            assert.ok(out.a >= 0, `${WALL_IDS[w]} deg=${deg} pitch=${pitch} a=${out.a}`);
          }
        }
      }
    }
  });

  it('yaw を変えると a〜f の少なくとも 1 つが変わる(Requirement 3.6)', () => {
    const [label] = elevationLabels('zNeg', 'right', []);
    const at0 = labelFrame(label, 0, SCATTER_PITCH, VIEW, 1, scratch(), frame());
    const at5 = labelFrame(label, 0.5, SCATTER_PITCH, VIEW, 1, scratch(), frame());
    const changed = (['a', 'b', 'c', 'd', 'e', 'f'] as const).some((key) => at0[key] !== at5[key]);
    assert.ok(changed);
  });

  it('同じ引数につねに同じ値を書き、out と scratch をそのまま使う(Requirement 3.14)', () => {
    const [label] = elevationLabels('xNeg', 'right', []);
    const s = scratch();
    const out = frame();
    const first = labelFrame(label, 1.1, SCATTER_PITCH, VIEW, 2, s, out);
    assert.equal(first, out);
    const snapshot = { ...out };
    const [s0, s1, s2] = s;
    labelFrame(label, 1.1, SCATTER_PITCH, VIEW, 2, s, out);
    assert.deepEqual(out, snapshot);
    assert.equal(s[0], s0);
    assert.equal(s[1], s1);
    assert.equal(s[2], s2);
  });

  it('yaw・pitch が NaN のときは 0 とみなす(spec §5.3 エラー)', () => {
    const [label] = elevationLabels('zNeg', 'right', []);
    const nan = labelFrame(label, Number.NaN, Number.NaN, VIEW, 1, scratch(), frame());
    const zero = labelFrame(label, 0, 0, VIEW, 1, scratch(), frame());
    assert.deepEqual(nan, zero);
  });

  it('重み 0 の面(手前を向く面)では a が負になりうる。描画側はこれを描かない(Requirement 3.5 後段の前提)', () => {
    // zNeg は yaw = π で手前を向き(重み 0)、文字が鏡像になる向きに投影される。
    const [label] = elevationLabels('zNeg', 'right', []);
    const out = labelFrame(label, Math.PI, SCATTER_PITCH, VIEW, 1, scratch(), frame());
    assert.ok(out.a < 0);
  });
});
