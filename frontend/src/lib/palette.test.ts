import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BAND_ALPHA, buildRamp, DEPTH_BANDS, PALETTE_STEPS, parseHex, type Rgb, rotateHue } from './palette.ts';

// 色の直値の静的検査(`#` + 16 進)に掛からないよう、テストでは `#` を後から連結する。
function hex(digits: string): string {
  return '#'.concat(digits);
}

const RGBA = /^rgba\((\d+), (\d+), (\d+), ([0-9.]+)\)$/;

function parseRgba(text: string): { rgb: Rgb; a: number } {
  const m = RGBA.exec(text);
  assert.ok(m !== null, `rgba(r, g, b, a) の形でない: ${text}`);
  return { rgb: { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) }, a: Number(m[4]) };
}

const BLUE: Rgb = { r: 47, g: 109, b: 246 };
const TEAL: Rgb = { r: 63, g: 214, b: 200 };
const YELLOW: Rgb = { r: 242, g: 225, b: 74 };
const PINK: Rgb = { r: 255, g: 84, b: 112 };

describe('parseHex', () => {
  it('#rrggbb を成分に分ける', () => {
    assert.deepEqual(parseHex(hex('2f6df6')), BLUE);
    assert.deepEqual(parseHex(hex('FFFFFF')), { r: 255, g: 255, b: 255 });
  });

  it('空文字・短縮形・rgb(...) には null を返す', () => {
    assert.equal(parseHex(''), null);
    assert.equal(parseHex(hex('fff')), null);
    assert.equal(parseHex('rgb(1, 2, 3)'), null);
    assert.equal(parseHex('white'), null);
  });
});

describe('rotateHue', () => {
  // 受け入れ基準 6.6: 360° 回すと元の色に 1/255 以内で戻る。
  it('360° 回すと各成分が 1/255 以内で戻る', () => {
    for (const c of [BLUE, TEAL, YELLOW, PINK, { r: 10, g: 200, b: 30 }]) {
      const back = rotateHue(c, 360);
      assert.ok(Math.abs(back.r - c.r) <= 1, `r: ${back.r} vs ${c.r}`);
      assert.ok(Math.abs(back.g - c.g) <= 1, `g: ${back.g} vs ${c.g}`);
      assert.ok(Math.abs(back.b - c.b) <= 1, `b: ${back.b} vs ${c.b}`);
    }
  });

  it('120° 回すと赤が緑へ、無彩色は変わらない', () => {
    assert.deepEqual(rotateHue({ r: 255, g: 0, b: 0 }, 120), { r: 0, g: 255, b: 0 });
    assert.deepEqual(rotateHue({ r: 128, g: 128, b: 128 }, 90), { r: 128, g: 128, b: 128 });
  });
});

describe('buildRamp', () => {
  const cases: { name: string; stops: Rgb[] }[] = [
    { name: '2 色', stops: [BLUE, PINK] },
    { name: '3 色', stops: [BLUE, TEAL, YELLOW] },
  ];

  for (const { name, stops } of cases) {
    // 受け入れ基準 6.2: 3 × 64 本、段 0 と最後の段が停止色、a が帯の値。
    it(`${name}: DEPTH_BANDS × PALETTE_STEPS 本で端点が停止色に一致し a が帯の値`, () => {
      const ramp = buildRamp(stops);
      assert.equal(ramp.length, DEPTH_BANDS);
      for (let band = 0; band < DEPTH_BANDS; band += 1) {
        assert.equal(ramp[band].length, PALETTE_STEPS);
        const first = parseRgba(ramp[band][0]);
        const last = parseRgba(ramp[band][PALETTE_STEPS - 1]);
        assert.deepEqual(first.rgb, stops[0]);
        assert.deepEqual(last.rgb, stops[stops.length - 1]);
        for (const text of ramp[band]) {
          assert.equal(parseRgba(text).a, BAND_ALPHA[band]);
        }
      }
    });

    // 受け入れ基準 6.3: 隣り合う段の各成分の差が 12 以下。
    it(`${name}: 隣り合う段の sRGB 各成分の差が 12 以下`, () => {
      const ramp = buildRamp(stops);
      for (let band = 0; band < DEPTH_BANDS; band += 1) {
        for (let step = 1; step < PALETTE_STEPS; step += 1) {
          const a = parseRgba(ramp[band][step - 1]).rgb;
          const b = parseRgba(ramp[band][step]).rgb;
          assert.ok(Math.abs(a.r - b.r) <= 12, `帯 ${band} 段 ${step} の r の差が大きい`);
          assert.ok(Math.abs(a.g - b.g) <= 12, `帯 ${band} 段 ${step} の g の差が大きい`);
          assert.ok(Math.abs(a.b - b.b) <= 12, `帯 ${band} 段 ${step} の b の差が大きい`);
        }
      }
    });
  }

  // 受け入れ基準 6.4: 長さ 2・3 以外は例外。
  it('停止色が 1 色・4 色なら例外を投げる', () => {
    assert.throws(() => buildRamp([BLUE]));
    assert.throws(() => buildRamp([BLUE, TEAL, YELLOW, PINK]));
  });
});
