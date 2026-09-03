package main

import (
	"errors"
	"math"
	"testing"
)

// 受け入れ基準 2.1: Values の長さは metricSeriesCount にちょうど等しい。
func TestNewMetricPointKeepsValueCount(t *testing.T) {
	got, err := newMetricPoint(1, []float64{0.0, 0.5, 1.0})
	if err != nil {
		t.Fatalf("newMetricPoint が失敗した: %v", err)
	}
	if len(got.Values) != metricSeriesCount {
		t.Errorf("Values の長さ = %d, 期待 %d", len(got.Values), metricSeriesCount)
	}
	if got.Seq != 1 {
		t.Errorf("Seq = %d, 期待 1", got.Seq)
	}
}

// 受け入れ基準 2.2・2.3・2.4: 不変条件の違反は errors.Is で識別できる error になる。
func TestNewMetricPointRejectsInvalid(t *testing.T) {
	tests := []struct {
		name   string
		seq    uint64
		values []float64
		want   error
	}{
		{"Seq が 0", 0, []float64{0.1, 0.2, 0.3}, errMetricSeqZero},
		{"値が少ない", 1, []float64{0.1, 0.2}, errMetricValueCount},
		{"値が多い", 1, []float64{0.1, 0.2, 0.3, 0.4}, errMetricValueCount},
		{"nil", 1, nil, errMetricValueCount},
		{"負の値", 1, []float64{-0.1, 0.2, 0.3}, errMetricValueRange},
		{"1.0 超", 1, []float64{0.1, 1.1, 0.3}, errMetricValueRange},
		{"NaN", 1, []float64{0.1, math.NaN(), 0.3}, errMetricValueNotFinite},
		{"正の無限大", 1, []float64{0.1, 0.2, math.Inf(1)}, errMetricValueNotFinite},
		{"負の無限大", 1, []float64{math.Inf(-1), 0.2, 0.3}, errMetricValueNotFinite},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := newMetricPoint(tt.seq, tt.values)
			if !errors.Is(err, tt.want) {
				t.Errorf("err = %v, 期待 %v", err, tt.want)
			}
		})
	}
}

// 受け入れ基準 2.5: 渡されたスライスを複製し、生成後の書き換えが波及しない。
func TestNewMetricPointCopiesValues(t *testing.T) {
	values := []float64{0.1, 0.2, 0.3}
	got, err := newMetricPoint(1, values)
	if err != nil {
		t.Fatalf("newMetricPoint が失敗した: %v", err)
	}

	values[0] = 0.9
	if got.Values[0] != 0.1 {
		t.Errorf("生成後の書き換えが波及した: Values[0] = %v, 期待 0.1", got.Values[0])
	}
}

// 受け入れ基準 4.1・4.4: Value と Display の範囲、および Zone が Value から一意に決まる。
func TestNewGaugeReadingDerivesDisplayAndZone(t *testing.T) {
	tests := []struct {
		value       float64
		wantZone    string
		wantDisplay float64
	}{
		{0.0, ZoneNominal, 0.0},
		{0.59, ZoneNominal, 59.0},
		{zoneElevatedFrom, ZoneElevated, 60.0},
		{0.84, ZoneElevated, 84.0},
		{zoneCriticalFrom, ZoneCritical, 85.0},
		{1.0, ZoneCritical, 100.0},
	}
	for _, tt := range tests {
		got, err := newGaugeReading(1, tt.value, "utilization")
		if err != nil {
			t.Fatalf("value=%v で newGaugeReading が失敗した: %v", tt.value, err)
		}
		if got.Zone != tt.wantZone {
			t.Errorf("value=%v の Zone = %q, 期待 %q", tt.value, got.Zone, tt.wantZone)
		}
		// 浮動小数の積であり厳密一致を求めない。
		if math.Abs(got.Display-tt.wantDisplay) > 1e-9 {
			t.Errorf("value=%v の Display = %v, 期待 %v", tt.value, got.Display, tt.wantDisplay)
		}
		if got.Display < 0.0 || got.Display > gaugeDisplayMax {
			t.Errorf("value=%v の Display が範囲外: %v", tt.value, got.Display)
		}
		if !gaugeZoneValid(got.Zone) {
			t.Errorf("value=%v の Zone が定義済みの 3 値でない: %q", tt.value, got.Zone)
		}
	}
}

// 受け入れ基準 4.4: 同じ Value につねに同じ Zone を返す。
func TestGaugeZoneForIsDeterministic(t *testing.T) {
	for i := range 101 {
		value := float64(i) / 100.0
		first := gaugeZoneFor(value)
		for range 3 {
			if got := gaugeZoneFor(value); got != first {
				t.Fatalf("value=%v の Zone が呼び出しで変化した: %q → %q", value, first, got)
			}
		}
	}
}

// 受け入れ基準 4.2・4.3: 不変条件の違反は errors.Is で識別できる error になる。
func TestNewGaugeReadingRejectsInvalid(t *testing.T) {
	tests := []struct {
		name  string
		seq   uint64
		value float64
		label string
		want  error
	}{
		{"Seq が 0", 0, 0.5, "utilization", errMetricSeqZero},
		{"負の値", 1, -0.01, "utilization", errMetricValueRange},
		{"1.0 超", 1, 1.01, "utilization", errMetricValueRange},
		{"NaN", 1, math.NaN(), "utilization", errMetricValueNotFinite},
		{"無限大", 1, math.Inf(1), "utilization", errMetricValueNotFinite},
		{"空のラベル", 1, 0.5, "", errMetricLabelEmpty},
		{"改行を含むラベル", 1, 0.5, "utili\nzation", errMetricLabelNewline},
		{"復帰を含むラベル", 1, 0.5, "utili\rzation", errMetricLabelNewline},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := newGaugeReading(tt.seq, tt.value, tt.label)
			if !errors.Is(err, tt.want) {
				t.Errorf("err = %v, 期待 %v", err, tt.want)
			}
		})
	}
}

// 受け入れ基準 2.6: ID・Unit の空文字と改行を弾く。
func TestNewMetricSeriesMetaRejectsInvalid(t *testing.T) {
	tests := []struct {
		name    string
		id      string
		unit    string
		display float64
		want    error
	}{
		{"空の ID", "", "req/s", 1.0, errMetricLabelEmpty},
		{"改行を含む ID", "through\nput", "req/s", 1.0, errMetricLabelNewline},
		{"空の Unit", "throughput", "", 1.0, errMetricLabelEmpty},
		{"改行を含む Unit", "throughput", "req\n/s", 1.0, errMetricLabelNewline},
		{"NaN の Display", "throughput", "req/s", math.NaN(), errMetricValueNotFinite},
		{"無限大の Display", "throughput", "req/s", math.Inf(-1), errMetricValueNotFinite},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := newMetricSeriesMeta(tt.id, tt.unit, tt.display)
			if !errors.Is(err, tt.want) {
				t.Errorf("err = %v, 期待 %v", err, tt.want)
			}
		})
	}
}

// Display は正規化前の値であり範囲を定めない(大きい値も通す)。
func TestNewMetricSeriesMetaAcceptsUnnormalizedDisplay(t *testing.T) {
	got, err := newMetricSeriesMeta("throughput", "req/s", 1420.5)
	if err != nil {
		t.Fatalf("newMetricSeriesMeta が失敗した: %v", err)
	}
	if got.Display != 1420.5 {
		t.Errorf("Display = %v, 期待 1420.5", got.Display)
	}
}
