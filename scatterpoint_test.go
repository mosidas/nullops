package main

import (
	"encoding/json"
	"errors"
	"math"
	"testing"
)

// 受け入れ基準 2.1・2.2: 範囲内の引数は不変条件を満たす点になり、
// 座標は小数第 4 位、C は第 3 位に丸められる。
func TestNewScatterPointAcceptsInRange(t *testing.T) {
	cases := []struct {
		name    string
		x, y, z float64
		s       uint8
		c       float64
	}{
		{"原点", 0, 0, 0, 0, 0.5},
		{"下限", -1.0, -1.0, -1.0, 0, 0.0},
		{"上限", 1.0, 1.0, 1.0, 2, 1.0},
		{"丸めを要する値", 0.123456, -0.98765, 0.00005, 1, 0.1235},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			p, err := newScatterPoint(tc.x, tc.y, tc.z, tc.s, tc.c)
			if err != nil {
				t.Fatalf("error を返した: %v", err)
			}
			for axis, v := range map[string]float64{"X": p.X, "Y": p.Y, "Z": p.Z} {
				if v < -1.0 || v > 1.0 {
					t.Errorf("%s が範囲外である: %v", axis, v)
				}
				if got := math.Round(v*1e4) / 1e4; got != v {
					t.Errorf("%s が小数第 4 位に丸められていない: %v", axis, v)
				}
			}
			if p.C < 0.0 || p.C > 1.0 {
				t.Errorf("C が範囲外である: %v", p.C)
			}
			if got := math.Round(p.C*1e3) / 1e3; got != p.C {
				t.Errorf("C が小数第 3 位に丸められていない: %v", p.C)
			}
			if p.S > 2 {
				t.Errorf("S が 0・1・2 のいずれでもない: %d", p.S)
			}
			if p.S != tc.s {
				t.Errorf("S が引数と異なる: got %d want %d", p.S, tc.s)
			}
		})
	}
}

// 受け入れ基準 2.1・2.2: 丸めの結果が期待値に一致する(丸めが生成関数の責務であること)。
func TestNewScatterPointRoundsValues(t *testing.T) {
	p, err := newScatterPoint(0.123456, -0.98765, 0.00005, 0, 0.1235)
	if err != nil {
		t.Fatalf("error を返した: %v", err)
	}
	if p.X != 0.1235 || p.Y != -0.9877 || p.Z != 0.0001 {
		t.Errorf("座標の丸めが期待と異なる: got (%v, %v, %v) want (0.1235, -0.9877, 0.0001)", p.X, p.Y, p.Z)
	}
	if p.C != 0.124 {
		t.Errorf("C の丸めが期待と異なる: got %v want 0.124", p.C)
	}
}

// 受け入れ基準 2.3: 範囲外は errScatterPointOutOfRange を返し panic しない。
func TestNewScatterPointRejectsOutOfRange(t *testing.T) {
	cases := []struct {
		name    string
		x, y, z float64
		c       float64
	}{
		{"X が上限超過", 1.0001, 0, 0, 0.5},
		{"Y が下限未満", 0, -1.0001, 0, 0.5},
		{"Z が上限超過", 0, 0, 2.0, 0.5},
		{"丸めれば範囲内になる X", 1.00004, 0, 0, 0.5},
		{"C が負", 0, 0, 0, -0.0001},
		{"C が上限超過", 0, 0, 0, 1.0001},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := newScatterPoint(tc.x, tc.y, tc.z, 0, tc.c)
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
		name    string
		x, y, z float64
		c       float64
	}{
		{"X が NaN", nan, 0, 0, 0.5},
		{"Y が +Inf", 0, inf, 0, 0.5},
		{"Z が -Inf", 0, 0, ninf, 0.5},
		{"C が NaN", 0, 0, 0, nan},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := newScatterPoint(tc.x, tc.y, tc.z, 0, tc.c)
			if !errors.Is(err, errScatterPointNotFinite) {
				t.Fatalf("errScatterPointNotFinite を返さなかった: %v", err)
			}
		})
	}
}

// 受け入れ基準 2.5: S が 3 以上は errScatterPointUnknownStructure を返す。
func TestNewScatterPointRejectsUnknownStructure(t *testing.T) {
	for _, s := range []uint8{3, 4, 255} {
		_, err := newScatterPoint(0, 0, 0, s, 0.5)
		if !errors.Is(err, errScatterPointUnknownStructure) {
			t.Fatalf("S = %d で errScatterPointUnknownStructure を返さなかった: %v", s, err)
		}
	}
}

// 受け入れ基準 2.6: JSON のキーは x・y・z・s・c の 5 個だけ(w を出さない)。
func TestScatterPointMarshalsFiveKeys(t *testing.T) {
	p, err := newScatterPoint(0.5, -0.25, 0.125, 2, 0.75)
	if err != nil {
		t.Fatalf("error を返した: %v", err)
	}
	b, err := json.Marshal(p)
	if err != nil {
		t.Fatalf("JSON 化に失敗した: %v", err)
	}
	var m map[string]json.RawMessage
	if err := json.Unmarshal(b, &m); err != nil {
		t.Fatalf("JSON の読み戻しに失敗した: %v", err)
	}
	if len(m) != 5 {
		t.Fatalf("キーの数が 5 ではない: %d (%s)", len(m), b)
	}
	for _, k := range []string{"x", "y", "z", "s", "c"} {
		if _, ok := m[k]; !ok {
			t.Errorf("キー %q が無い: %s", k, b)
		}
	}
	if _, ok := m["w"]; ok {
		t.Errorf("廃止した w が出ている: %s", b)
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
