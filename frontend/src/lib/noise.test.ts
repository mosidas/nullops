import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildNoise, NOISE_SIZE } from './noise.ts';

const SEEDS = [20260907, 1, 42, 999983];

describe('buildNoise', () => {
  it('48 × 48 で長さ 2304 の Float32Array を返し、値が 0 以上 1 以下(Requirement 5.1)', () => {
    assert.equal(NOISE_SIZE, 48);
    const noise = buildNoise(48, 20260907);
    assert.ok(noise instanceof Float32Array);
    assert.equal(noise.length, 2304);
    for (const n of noise) assert.ok(n >= 0 && n <= 1, `${n}`);
  });

  it('同じ seed で同じ配列を返し、seed が違えば配列が違う(Requirement 5.2)', () => {
    assert.deepEqual(buildNoise(48, 7), buildNoise(48, 7));
    assert.notDeepEqual(buildNoise(48, 7), buildNoise(48, 8));
  });

  it('上下左右の隣接差が 0.25 以下(端は循環)で、最大と最小の差が 0.3 以上(Requirement 5.3)', () => {
    const size = 48;
    for (const seed of SEEDS) {
      const noise = buildNoise(size, seed);
      let lo = 1;
      let hi = 0;
      for (let j = 0; j < size; j += 1) {
        for (let i = 0; i < size; i += 1) {
          const n = noise[j * size + i];
          lo = Math.min(lo, n);
          hi = Math.max(hi, n);
          const right = noise[j * size + ((i + 1) % size)];
          const below = noise[((j + 1) % size) * size + i];
          assert.ok(Math.abs(n - right) <= 0.25, `seed=${seed} (${i},${j}) 右 ${Math.abs(n - right)}`);
          assert.ok(Math.abs(n - below) <= 0.25, `seed=${seed} (${i},${j}) 下 ${Math.abs(n - below)}`);
        }
      }
      assert.ok(hi - lo >= 0.3, `seed=${seed} range=${hi - lo}`);
    }
  });

  it('size が 2 未満または非整数なら例外を投げる(Requirement 5.4)', () => {
    for (const size of [1, 0, -4, 2.5, Number.NaN]) {
      assert.throws(() => buildNoise(size, 1), `size=${size}`);
    }
    assert.doesNotThrow(() => buildNoise(2, 1));
  });
});
