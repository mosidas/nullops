package main

import (
	"encoding/json"
	"errors"
	"math"
	"testing"
)

// 受け入れ基準 2.1・2.2: 範囲内の引数は不変条件を満たす点になる。
func TestNewScatterPointAcceptsInRange(t *testing.T) {
	cases := []struct {
		name       string
		x, y, z, w float64
	}{
		{"原点", 0, 0, 0, 0.5},
		{"下限", -1.0, -1.0, -1.0, 0.0},
		{"上限", 1.0, 1.0, 1.0, 1.0},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			p, err := newScatterPoint(tc.x, tc.y, tc.z, tc.w)
			if err != nil {
				t.Fatalf("error を返した: %v", err)
			}
			for axis, v := range map[string]float64{"X": p.X, "Y": p.Y, "Z": p.Z} {
				if v < -1.0 || v > 1.0 {
					t.Errorf("%s が範囲外である: %v", axis, v)
				}
			}
			if p.W < 0.0 || p.W > 1.0 {
				t.Errorf("W が範囲外である: %v", p.W)
			}
		})
	}
}

// 受け入れ基準 2.3: 範囲外は errScatterPointOutOfRange を返し panic しない。
func TestNewScatterPointRejectsOutOfRange(t *testing.T) {
	cases := []struct {
		name       string
		x, y, z, w float64
	}{
		{"X が上限超過", 1.0001, 0, 0, 0.5},
		{"Y が下限未満", 0, -1.0001, 0, 0.5},
		{"Z が上限超過", 0, 0, 2.0, 0.5},
		{"W が負", 0, 0, 0, -0.0001},
		{"W が上限超過", 0, 0, 0, 1.0001},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := newScatterPoint(tc.x, tc.y, tc.z, tc.w)
			if !errors.Is(err, errScatterPointOutOfRange) {
				t.Fatalf("errScatterPointOutOfRange を返さなかった: %v", err)
			}
		})
	}
}

// 受け入れ基準 2.4: NaN・無限大は errScatterPointNotFinite を返す。
func TestNewScatterPointRejectsNotFinite(t *testing.T) {
	nan := math.NaN()
	inf := math.Inf(1)
	ninf := math.Inf(-1)

	cases := []struct {
		name       string
		x, y, z, w float64
	}{
		{"X が NaN", nan, 0, 0, 0.5},
		{"Y が +Inf", 0, inf, 0, 0.5},
		{"Z が -Inf", 0, 0, ninf, 0.5},
		{"W が NaN", 0, 0, 0, nan},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := newScatterPoint(tc.x, tc.y, tc.z, tc.w)
			if !errors.Is(err, errScatterPointNotFinite) {
				t.Fatalf("errScatterPointNotFinite を返さなかった: %v", err)
			}
		})
	}
}

// 受け入れ基準 6.2(§6.2 不変条件): 空でない Points は JSON で配列になり null にならない。
func TestScatterCloudMarshalsPointsAsArray(t *testing.T) {
	b, err := json.Marshal(ScatterCloud{Seq: 0, Points: []ScatterPoint{}})
	if err != nil {
		t.Fatalf("JSON 化に失敗した: %v", err)
	}
	if got, want := string(b), `{"seq":0,"points":[]}`; got != want {
		t.Fatalf("JSON が期待と異なる:\n got: %s\nwant: %s", got, want)
	}
}
