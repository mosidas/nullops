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

// 受け入れ基準 2.5: 1000 回連続で呼んでも全点が単位立方体に収まる。
func TestScatterSourceKeepsPointsInUnitCube(t *testing.T) {
	s := newTestScatterSource(t, 256)

	for frame := range 1000 {
		cloud := s.Next().(ScatterCloud)
		for i, p := range cloud.Points {
			for axis, v := range map[string]float64{"X": p.X, "Y": p.Y, "Z": p.Z} {
				if v < -1.0 || v > 1.0 || math.IsNaN(v) {
					t.Fatalf("フレーム %d の点 %d の %s が範囲外である: %v", frame, i, axis, v)
				}
			}
			if p.W < 0.0 || p.W > 1.0 {
				t.Fatalf("フレーム %d の点 %d の W が範囲外である: %v", frame, i, p.W)
			}
		}
	}
}

// 受け入れ基準 3.1: 直前のフレームと少なくとも 1 点の座標が異なる。
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

// 受け入れ基準 3.2: 1000 回後の座標の標準偏差が初回の 0.5〜2.0 倍に留まる。
func TestScatterSourceSpreadStaysStable(t *testing.T) {
	s := newTestScatterSource(t, 256)

	first := coordStdDev(s.Next().(ScatterCloud))
	var last float64
	for range 1000 {
		last = coordStdDev(s.Next().(ScatterCloud))
	}

	if ratio := last / first; ratio < 0.5 || ratio > 2.0 {
		t.Fatalf("標準偏差の比が範囲外である: 初回 %v → 1000 回後 %v (比 %v)", first, last, ratio)
	}
}

// coordStdDev は点群の全座標(X・Y・Z を区別せず)の標準偏差を返す。
func coordStdDev(cloud ScatterCloud) float64 {
	values := make([]float64, 0, len(cloud.Points)*3)
	for _, p := range cloud.Points {
		values = append(values, p.X, p.Y, p.Z)
	}

	var sum float64
	for _, v := range values {
		sum += v
	}
	mean := sum / float64(len(values))

	var sq float64
	for _, v := range values {
		sq += (v - mean) * (v - mean)
	}
	return math.Sqrt(sq / float64(len(values)))
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

// 受け入れ基準 10.2: 画面へ供給する点数が 256 点以下である。
func TestScatterPointCountWithinBudget(t *testing.T) {
	if scatterPointCount > 256 {
		t.Fatalf("scatterPointCount が 256 を超えている: %d", scatterPointCount)
	}
}

// 受け入れ基準 10.3: 送出間隔が毎秒 1 回以下である。
func TestScatterIntervalWithinBudget(t *testing.T) {
	if scatterInterval < time.Second {
		t.Fatalf("scatterInterval が 1 秒未満である: %v", scatterInterval)
	}
}
