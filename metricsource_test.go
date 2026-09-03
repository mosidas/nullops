package main

import (
	"math"
	"math/rand"
	"sync"
	"testing"
	"time"
)

// newTestMetricSource は種を固定した生成器を作る。
//
// 種を固定するのは、値の時間変化に関する受け入れ基準(Requirement 3・4.7)を
// 再現可能にするため。複数の種で回す検査は seed を引数で変える。
func newTestMetricSource(t *testing.T, capacity int, seed int64) *metricSource {
	t.Helper()
	return newMetricSource(capacity, rand.New(rand.NewSource(seed)))
}

// 受け入れ基準 1.1・1.2: イベント名と送出間隔はつねに同じ値。
func TestMetricSourceEventNameAndInterval(t *testing.T) {
	s := newTestMetricSource(t, 8, 1)
	for range 3 {
		if got := s.EventName(); got != metricEventName {
			t.Errorf("EventName() = %q, 期待 %q", got, metricEventName)
		}
		if got := s.Interval(); got != 500*time.Millisecond {
			t.Errorf("Interval() = %v, 期待 500ms", got)
		}
		s.Next()
	}
}

// 受け入れ基準 1.3・1.4・3.4・4.6: 戻り値の型と Seq の連番、Series と Values の対応。
func TestMetricSourceNextReturnsFrameWithIncrementingSeq(t *testing.T) {
	s := newTestMetricSource(t, 8, 2)
	for i := uint64(1); i <= 5; i++ {
		v := s.Next()
		frame, ok := v.(MetricFrame)
		if !ok {
			t.Fatalf("Next() の戻り値の型 = %T, 期待 MetricFrame", v)
		}
		if frame.Point.Seq != i {
			t.Errorf("Point.Seq = %d, 期待 %d", frame.Point.Seq, i)
		}
		if frame.Gauge.Seq != frame.Point.Seq {
			t.Errorf("Gauge.Seq = %d, Point.Seq = %d(一致していない)", frame.Gauge.Seq, frame.Point.Seq)
		}
		if len(frame.Series) != len(frame.Point.Values) {
			t.Errorf("Series の長さ = %d, Point.Values の長さ = %d", len(frame.Series), len(frame.Point.Values))
		}
	}
}

// 受け入れ基準 1.5: 事前条件違反は panic する。
func TestNewMetricSourcePanicsOnInvalidArguments(t *testing.T) {
	tests := []struct {
		name     string
		capacity int
		rnd      *rand.Rand
	}{
		{"capacity が 0", 0, rand.New(rand.NewSource(1))},
		{"capacity が負", -1, rand.New(rand.NewSource(1))},
		{"rnd が nil", 8, nil},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			defer func() {
				if recover() == nil {
					t.Error("panic しなかった")
				}
			}()
			newMetricSource(tt.capacity, tt.rnd)
		})
	}
}

// 受け入れ基準 1.6: Next と Snapshot の並行呼び出しでデータ競合を起こさない。
func TestMetricSourceConcurrentNextAndSnapshot(t *testing.T) {
	s := newTestMetricSource(t, 16, 3)

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
				h := s.Snapshot()
				if h.Points == nil || h.Series == nil {
					t.Error("Snapshot が nil のスライスを返した")
					return
				}
			}
		}()
	}
	wg.Wait()
}

// 受け入れ基準 1.7・1.8: 保持件数の上限と、古い順・内部と別配列で返すこと。
func TestMetricSourceSnapshotKeepsCapacityAndOrder(t *testing.T) {
	const capacity = 5
	s := newTestMetricSource(t, capacity, 4)
	for range capacity * 3 {
		s.Next()
	}

	got := s.Snapshot()
	if len(got.Points) != capacity {
		t.Fatalf("Points の件数 = %d, 期待 %d", len(got.Points), capacity)
	}
	for i := 1; i < len(got.Points); i++ {
		if got.Points[i].Seq <= got.Points[i-1].Seq {
			t.Errorf("Seq が昇順でない: [%d]=%d, [%d]=%d", i-1, got.Points[i-1].Seq, i, got.Points[i].Seq)
		}
	}
	// 最新の Seq は呼び出した回数に等しい。
	if last := got.Points[len(got.Points)-1].Seq; last != capacity*3 {
		t.Errorf("最新の Seq = %d, 期待 %d", last, capacity*3)
	}

	// 内部と別の配列であること(受け入れ基準 1.8・5.5)。
	got.Points[0].Seq = 9999
	got.Points[0].Values[0] = 42.0
	again := s.Snapshot()
	if again.Points[0].Seq == 9999 {
		t.Error("Snapshot の戻り値への代入が内部の保持点へ波及した (Seq)")
	}
	if again.Points[0].Values[0] == 42.0 {
		t.Error("Snapshot の戻り値への代入が内部の保持点へ波及した (Values)")
	}
}

// 受け入れ基準 5.2: Next を 1 度も呼んでいない時点の Snapshot。
func TestMetricSourceSnapshotBeforeFirstNext(t *testing.T) {
	s := newTestMetricSource(t, 8, 5)
	got := s.Snapshot()

	if got.Points == nil || len(got.Points) != 0 {
		t.Errorf("Points = %v, 期待 長さ 0 の非 nil", got.Points)
	}
	if got.Series == nil {
		t.Fatal("Series が nil")
	}
	if len(got.Series) != metricSeriesCount {
		t.Errorf("Series の長さ = %d, 期待 %d", len(got.Series), metricSeriesCount)
	}
	if got.Gauge.Seq != 0 {
		t.Errorf("Gauge.Seq = %d, 期待 0", got.Gauge.Seq)
	}
}

// 受け入れ基準 5.3: Snapshot は内部状態を変化させない。
func TestMetricSourceSnapshotDoesNotAdvance(t *testing.T) {
	s := newTestMetricSource(t, 8, 6)
	for range 3 {
		s.Next()
	}

	before := s.Snapshot()
	for range 5 {
		s.Snapshot()
	}
	after := s.Snapshot()

	if len(before.Points) != len(after.Points) {
		t.Fatalf("Snapshot の呼び出しで件数が変わった: %d → %d", len(before.Points), len(after.Points))
	}
	for i := range before.Points {
		if before.Points[i].Seq != after.Points[i].Seq {
			t.Errorf("[%d] の Seq が変わった: %d → %d", i, before.Points[i].Seq, after.Points[i].Seq)
		}
		for j := range before.Points[i].Values {
			if before.Points[i].Values[j] != after.Points[i].Values[j] {
				t.Errorf("[%d][%d] の値が変わった: %v → %v", i, j, before.Points[i].Values[j], after.Points[i].Values[j])
			}
		}
	}
	if before.Gauge != after.Gauge {
		t.Errorf("Gauge が変わった: %+v → %+v", before.Gauge, after.Gauge)
	}
}

// 受け入れ基準 3.1・3.3・3.5・4.5: 1000 フレームを通しての不変条件。
//
// 種を変えて複数回回すのは、1 つの種でだけ成り立つ性質を通さないため。
func TestMetricSourceKeepsInvariantsOverManyFrames(t *testing.T) {
	for _, seed := range []int64{1, 7, 42, 1234, 99999} {
		s := newTestMetricSource(t, 32, seed)

		var wantIDs []string
		for range 1000 {
			frame := s.Next().(MetricFrame)

			for i, v := range frame.Point.Values {
				if math.IsNaN(v) || math.IsInf(v, 0) || v < 0.0 || v > 1.0 {
					t.Fatalf("seed=%d: Values[%d] が範囲外: %v", seed, i, v)
				}
			}
			if v := frame.Gauge.Value; v < 0.0 || v > 1.0 {
				t.Fatalf("seed=%d: Gauge.Value が範囲外: %v", seed, v)
			}
			if !gaugeZoneValid(frame.Gauge.Zone) {
				t.Fatalf("seed=%d: Gauge.Zone が定義済みの 3 値でない: %q", seed, frame.Gauge.Zone)
			}
			for _, m := range frame.Series {
				if math.IsNaN(m.Display) || math.IsInf(m.Display, 0) {
					t.Fatalf("seed=%d: Series %q の Display が有限でない: %v", seed, m.ID, m.Display)
				}
			}

			ids := make([]string, len(frame.Series))
			for i, m := range frame.Series {
				ids[i] = m.ID
			}
			if wantIDs == nil {
				wantIDs = ids
				continue
			}
			if len(ids) != len(wantIDs) {
				t.Fatalf("seed=%d: 系列の数が変わった: %d → %d", seed, len(wantIDs), len(ids))
			}
			for i := range ids {
				if ids[i] != wantIDs[i] {
					t.Fatalf("seed=%d: 系列の並びが変わった: %v → %v", seed, wantIDs, ids)
				}
			}
		}
	}
}

// 受け入れ基準 3.2: 100 フレームのあいだに各系列が 1 回以上変化する。
func TestMetricSourceSeriesChangeWithin100Frames(t *testing.T) {
	for _, seed := range []int64{1, 7, 42, 1234, 99999} {
		s := newTestMetricSource(t, 128, seed)

		prev := s.Next().(MetricFrame).Point.Values
		changed := make([]bool, metricSeriesCount)
		for range 99 {
			cur := s.Next().(MetricFrame).Point.Values
			for i := range cur {
				if cur[i] != prev[i] {
					changed[i] = true
				}
			}
			prev = cur
		}
		for i, c := range changed {
			if !c {
				t.Errorf("seed=%d: 系列 %q が 100 フレームのあいだ変化しなかった", seed, metricSeriesSpecs[i].id)
			}
		}
	}
}

// 受け入れ基準 4.7: 1000 フレームのあいだにゾーンが 1 回以上変化する。
func TestMetricSourceGaugeZoneChangesWithin1000Frames(t *testing.T) {
	for _, seed := range []int64{1, 7, 42, 1234, 99999} {
		s := newTestMetricSource(t, 32, seed)

		first := s.Next().(MetricFrame).Gauge.Zone
		changed := false
		for range 999 {
			if s.Next().(MetricFrame).Gauge.Zone != first {
				changed = true
				break
			}
		}
		if !changed {
			t.Errorf("seed=%d: 1000 フレームのあいだ Gauge.Zone が %q のまま変化しなかった", seed, first)
		}
	}
}

// 送出したフレームの Series は Snapshot が返す配列と下地を共有しない。
func TestMetricSourceFrameSeriesIsIndependent(t *testing.T) {
	s := newTestMetricSource(t, 8, 8)
	frame := s.Next().(MetricFrame)

	frame.Series[0].ID = "tampered"
	if got := s.Snapshot().Series[0].ID; got == "tampered" {
		t.Error("Next が返した Series への代入が内部の見出しへ波及した")
	}
}
