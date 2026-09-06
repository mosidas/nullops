package main

import (
	"math"
	"math/rand"
	"sync"
	"testing"
	"time"
)

// newTestScatterSource は種を固定した生成器を作る。テストを再現可能にするため。
func newTestScatterSource(t *testing.T, pointCount int) *scatterSource {
	t.Helper()
	return newScatterSource(pointCount, rand.New(rand.NewSource(1)))
}

// 受け入れ基準 1.1: EventName はつねに "nullops:scatter"。
func TestScatterSourceEventName(t *testing.T) {
	s := newTestScatterSource(t, 8)
	for range 3 {
		if got := s.EventName(); got != "nullops:scatter" {
			t.Fatalf("EventName が期待と異なる: %q", got)
		}
		s.Next()
	}
}

// 受け入れ基準 1.2: Interval はつねに 1000 ミリ秒。
func TestScatterSourceInterval(t *testing.T) {
	s := newTestScatterSource(t, 8)
	for range 3 {
		if got := s.Interval(); got != time.Second {
			t.Fatalf("Interval が期待と異なる: %v", got)
		}
		s.Next()
	}
}

// 受け入れ基準 1.3・1.4: Points の長さが点数に等しく、Seq が 1 ずつ増える。
func TestScatterSourceNextLengthAndSeq(t *testing.T) {
	const pointCount = 32
	s := newTestScatterSource(t, pointCount)

	for i := uint64(1); i <= 5; i++ {
		cloud, ok := s.Next().(ScatterCloud)
		if !ok {
			t.Fatalf("Next が ScatterCloud を返さなかった")
		}
		if len(cloud.Points) != pointCount {
			t.Fatalf("Points の長さが %d ではない: %d", pointCount, len(cloud.Points))
		}
		if cloud.Seq != i {
			t.Fatalf("Seq が %d ではない: %d", i, cloud.Seq)
		}
		var counts [scatterStructureCount]int
		for _, p := range cloud.Points {
			counts[p.S]++
		}
		if counts[1] != pointCount/6 || counts[2] != pointCount/6 {
			t.Fatalf("球・トーラスの配分が pointCount/6 ではない: 球 %d トーラス %d", counts[1], counts[2])
		}
		if counts[0] != pointCount-2*(pointCount/6) {
			t.Fatalf("地形の点数が残りに一致しない: %d", counts[0])
		}
	}
}

// 受け入れ基準 1.5: 事前条件違反は panic する。
func TestScatterSourcePreconditionPanics(t *testing.T) {
	cases := []struct {
		name       string
		pointCount int
		rnd        *rand.Rand
	}{
		{"pointCount が 0", 0, rand.New(rand.NewSource(1))},
		{"pointCount が負", -1, rand.New(rand.NewSource(1))},
		{"rnd が nil", 8, nil},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			defer func() {
				if recover() == nil {
					t.Fatal("panic しなかった")
				}
			}()
			newScatterSource(tc.pointCount, tc.rnd)
		})
	}
}

// 受け入れ基準 1.6: Next と Snapshot の並行呼び出しでデータ競合を起こさない。
// go test -race で検出する。
func TestScatterSourceConcurrentAccess(t *testing.T) {
	s := newTestScatterSource(t, 64)

	var wg sync.WaitGroup
	for range 4 {
		wg.Add(2)
		go func() {
			defer wg.Done()
			for range 50 {
				s.Next()
			}
		}()
		go func() {
			defer wg.Done()
			for range 50 {
				s.Snapshot()
			}
		}()
	}
	wg.Wait()
}

// 受け入れ基準 2.7: 1000 回連続で呼んでも全点が座標・S・C の範囲に収まる。
func TestScatterSourceKeepsPointsInUnitCube(t *testing.T) {
	s := newTestScatterSource(t, 600)

	for frame := range 1000 {
		cloud := s.Next().(ScatterCloud)
		for i, p := range cloud.Points {
			for axis, v := range map[string]float64{"X": p.X, "Y": p.Y, "Z": p.Z} {
				if v < -1.0 || v > 1.0 || math.IsNaN(v) {
					t.Fatalf("フレーム %d の点 %d の %s が範囲外である: %v", frame, i, axis, v)
				}
			}
			if p.S > 2 {
				t.Fatalf("フレーム %d の点 %d の S が 0・1・2 のいずれでもない: %d", frame, i, p.S)
			}
			if p.C < 0.0 || p.C > 1.0 {
				t.Fatalf("フレーム %d の点 %d の C が範囲外である: %v", frame, i, p.C)
			}
		}
	}
}

// 受け入れ基準 3.5: 直前のフレームと少なくとも 1 点の座標または C が異なる。
func TestScatterSourcePointsMoveEachFrame(t *testing.T) {
	s := newTestScatterSource(t, 64)
	prev := s.Next().(ScatterCloud)

	for frame := range 20 {
		cur := s.Next().(ScatterCloud)
		moved := false
		for i := range cur.Points {
			if cur.Points[i] != prev.Points[i] {
				moved = true
				break
			}
		}
		if !moved {
			t.Fatalf("フレーム %d でどの点も動かなかった", frame)
		}
		prev = cur
	}
}

// 受け入れ基準 3.1〜3.4・3.6・3.7: 各点が所属する構造の幾何に載り、地形の形は固定で高さだけが位相で変わる。
//
// 位相は Next ごとに 1 段進み、生成は進める前の位相で行う(spec.md §5.1)。
// したがって Seq 番目の点群の位相は (Seq − 1) mod 120 段である。
func phaseOfSeq(seq uint64) float64 {
	return float64((seq-1)%scatterPhaseSteps) * scatterPhaseStep
}

func TestScatterSourceTerrain(t *testing.T) {
	const pointCount = 600
	s := newTestScatterSource(t, pointCount)
	first := s.Next().(ScatterCloud)

	t.Run("3.1 高さ場に載り床と天井の間にある", func(t *testing.T) {
		phase := phaseOfSeq(first.Seq)
		for i, p := range first.Points {
			if p.S != 0 {
				continue
			}
			h := terrainHeight(s.peaks[:], p.X, p.Z, phase)
			if math.Abs(p.Y-h) > 1e-4 {
				t.Fatalf("点 %d の高さが高さ場と食い違う: y=%v h=%v", i, p.Y, h)
			}
			if p.Y < terrainFloor || p.Y > terrainTop {
				t.Fatalf("点 %d の高さが [%v, %v] の外にある: %v", i, terrainFloor, terrainTop, p.Y)
			}
		}
	})

	t.Run("3.7 C が高さの正規化に一致する", func(t *testing.T) {
		for i, p := range first.Points {
			if p.S != 0 {
				continue
			}
			want := (p.Y - terrainFloor) / (terrainTop - terrainFloor)
			if math.Abs(p.C-want) > 1e-3 {
				t.Fatalf("点 %d の C が期待と異なる: got %v want %v", i, p.C, want)
			}
		}
	})

	var frames []ScatterCloud
	for range 120 {
		frames = append(frames, s.Next().(ScatterCloud))
	}

	t.Run("3.4 100 回の Next で (x, z) が変わらない", func(t *testing.T) {
		for f := range 100 {
			for i, p := range frames[f].Points {
				if p.S != 0 {
					continue
				}
				if p.X != first.Points[i].X || p.Z != first.Points[i].Z {
					t.Fatalf("フレーム %d の点 %d の (x, z) が初回と異なる: (%v, %v) → (%v, %v)",
						f+2, i, first.Points[i].X, first.Points[i].Z, p.X, p.Z)
				}
			}
		}
	})

	t.Run("3.6 121 回目の高さが 1 回目に戻る", func(t *testing.T) {
		last := frames[119]
		if last.Seq != 121 {
			t.Fatalf("Seq が 121 ではない: %d", last.Seq)
		}
		for i, p := range last.Points {
			if p.S != 0 {
				continue
			}
			if math.Abs(p.Y-first.Points[i].Y) > 1e-4 {
				t.Fatalf("点 %d の高さが 1 回目へ戻らない: %v → %v", i, first.Points[i].Y, p.Y)
			}
		}
	})
}

func TestScatterSourceSphere(t *testing.T) {
	s := newTestScatterSource(t, 600)
	for range 7 {
		cloud := s.Next().(ScatterCloud)
		t.Run("3.2 中心からの距離が半径に等しい", func(t *testing.T) {
			for i, p := range cloud.Points {
				if p.S != 1 {
					continue
				}
				d := math.Sqrt(sq(p.X-sphereCX) + sq(p.Y-sphereCY) + sq(p.Z-sphereCZ))
				if math.Abs(d-sphereRadius) > 2e-4 {
					t.Fatalf("点 %d の中心からの距離が半径と食い違う: %v", i, d)
				}
			}
		})
		t.Run("3.7 C が緯度に一致する", func(t *testing.T) {
			for i, p := range cloud.Points {
				if p.S != 1 {
					continue
				}
				want := (p.Y - sphereCY + sphereRadius) / (2 * sphereRadius)
				if math.Abs(p.C-want) > 1e-3 {
					t.Fatalf("点 %d の C が期待と異なる: got %v want %v", i, p.C, want)
				}
			}
		})
	}
}

func TestScatterSourceTorus(t *testing.T) {
	s := newTestScatterSource(t, 600)
	for range 7 {
		cloud := s.Next().(ScatterCloud)
		phase := phaseOfSeq(cloud.Seq)
		t.Run("3.3 トーラス面からの距離が許容誤差内", func(t *testing.T) {
			for i, p := range cloud.Points {
				if p.S != 2 {
					continue
				}
				rho := math.Sqrt(sq(p.X-torusCX) + sq(p.Z-torusCZ))
				d := math.Sqrt(sq(rho-torusMajor) + sq(p.Y-torusCY))
				if math.Abs(d-torusMinor) > 2e-4 {
					t.Fatalf("点 %d のトーラス面からの距離が許容誤差を超える: %v", i, d-torusMinor)
				}
			}
		})
		t.Run("3.7 C が環に沿った角度と位相の和に一致する", func(t *testing.T) {
			for i, p := range cloud.Points {
				if p.S != 2 {
					continue
				}
				u := math.Atan2(p.Z-torusCZ, p.X-torusCX)
				want := math.Mod(u+phase+4*math.Pi, 2*math.Pi) / (2 * math.Pi)
				diff := math.Abs(p.C - want)
				if diff > 0.5 {
					diff = 1 - diff // 0 と 1 の境界は同一視する
				}
				if diff > 1e-3 {
					t.Fatalf("点 %d の C が期待と異なる: got %v want %v", i, p.C, want)
				}
			}
		})
	}
}

func sq(v float64) float64 { return v * v }

// 受け入れ基準 1.3: pointCount が 6 未満なら球・トーラスは 0 点で全点が地形になり、panic しない。
func TestScatterSourceSmallCount(t *testing.T) {
	s := newTestScatterSource(t, 5)
	cloud := s.Next().(ScatterCloud)
	if len(cloud.Points) != 5 {
		t.Fatalf("Points の長さが 5 ではない: %d", len(cloud.Points))
	}
	for i, p := range cloud.Points {
		if p.S != 0 {
			t.Fatalf("点 %d が地形ではない: S=%d", i, p.S)
		}
	}
}

// 受け入れ基準 4.3: Snapshot は内部状態(Seq・点の座標)を変化させない。
func TestScatterSourceSnapshotDoesNotMutate(t *testing.T) {
	s := newTestScatterSource(t, 16)
	s.Next()

	before := s.Snapshot()
	for range 3 {
		s.Snapshot()
	}
	after := s.Snapshot()

	if before.Seq != after.Seq {
		t.Fatalf("Snapshot が Seq を変えた: %d → %d", before.Seq, after.Seq)
	}
	for i := range before.Points {
		if before.Points[i] != after.Points[i] {
			t.Fatalf("Snapshot が点 %d を変えた: %+v → %+v", i, before.Points[i], after.Points[i])
		}
	}

	// 返したスライスへの書き込みが内部へ波及しないこと。
	before.Points[0] = ScatterPoint{}
	if s.Snapshot().Points[0] == (ScatterPoint{}) {
		t.Fatal("Snapshot の戻り値が内部の配列を共有している")
	}
}

// 受け入れ基準 4.2: Next を 1 度も呼んでいない生成器の Snapshot は Seq 0・長さ 0 の非 nil。
func TestScatterSourceSnapshotBeforeFirstNext(t *testing.T) {
	s := newTestScatterSource(t, 16)

	cloud := s.Snapshot()
	if cloud.Seq != 0 {
		t.Fatalf("Seq が 0 ではない: %d", cloud.Seq)
	}
	if cloud.Points == nil {
		t.Fatal("Points が nil である")
	}
	if len(cloud.Points) != 0 {
		t.Fatalf("Points の長さが 0 ではない: %d", len(cloud.Points))
	}
}

// 受け入れ基準 9.3: 画面へ供給する点数が下限と上限の範囲にある。
func TestScatterPointCountWithinBudget(t *testing.T) {
	if scatterPointCount < scatterPointCountMin || scatterPointCount > scatterPointCountMax {
		t.Fatalf("scatterPointCount が [%d, %d] の外にある: %d", scatterPointCountMin, scatterPointCountMax, scatterPointCount)
	}
}

// 受け入れ基準 10.3: 送出間隔が毎秒 1 回以下である。
func TestScatterIntervalWithinBudget(t *testing.T) {
	if scatterInterval < time.Second {
		t.Fatalf("scatterInterval が 1 秒未満である: %v", scatterInterval)
	}
}
