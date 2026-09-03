package main

import (
	"errors"
	"math"
	"testing"
)

// 受け入れ基準 5.1: 範囲内の値からはノードが作れ、値がそのまま入る。
func TestNewGraphNodeAcceptsValidValues(t *testing.T) {
	tests := map[string]struct {
		x, y, load float64
		health     string
	}{
		"中央・負荷 0": {x: 0, y: 0, load: 0, health: HealthOK},
		"下限":      {x: -1.0, y: -1.0, load: 0.0, health: HealthWarn},
		"上限":      {x: 1.0, y: 1.0, load: 1.0, health: HealthDown},
		"中間":      {x: 0.25, y: -0.75, load: 0.5, health: HealthOK},
	}
	for name, tt := range tests {
		t.Run(name, func(t *testing.T) {
			got, err := newGraphNode("api-gateway", tt.x, tt.y, tt.load, tt.health)
			if err != nil {
				t.Fatalf("error を返した: %v", err)
			}
			if got.X != tt.x || got.Y != tt.y || got.Load != tt.load || got.Health != tt.health {
				t.Fatalf("値が保たれていない: %+v", got)
			}
			if got.ID != "api-gateway" {
				t.Fatalf("ID が保たれていない: %q", got.ID)
			}
		})
	}
}

// 受け入れ基準 5.2・5.3: 不変条件の違反を errors.Is で識別できる形で返す。
func TestNewGraphNodeRejectsInvalidValues(t *testing.T) {
	tests := map[string]struct {
		id         string
		x, y, load float64
		health     string
		want       error
	}{
		"ID が空":       {id: "", health: HealthOK, want: errGraphNodeIDEmpty},
		"ID に改行を含む":   {id: "api\ngateway", health: HealthOK, want: errGraphNodeIDEmpty},
		"X が下限を下回る":   {id: "n", x: -1.01, health: HealthOK, want: errGraphValueOutOfRange},
		"X が上限を上回る":   {id: "n", x: 1.01, health: HealthOK, want: errGraphValueOutOfRange},
		"Y が範囲外":      {id: "n", y: 2, health: HealthOK, want: errGraphValueOutOfRange},
		"Load が負":     {id: "n", load: -0.01, health: HealthOK, want: errGraphValueOutOfRange},
		"Load が 1 超":  {id: "n", load: 1.01, health: HealthOK, want: errGraphValueOutOfRange},
		"X が NaN":     {id: "n", x: math.NaN(), health: HealthOK, want: errGraphValueNotFinite},
		"Y が +Inf":    {id: "n", y: math.Inf(1), health: HealthOK, want: errGraphValueNotFinite},
		"Load が -Inf": {id: "n", load: math.Inf(-1), health: HealthOK, want: errGraphValueNotFinite},
		"Health が空":   {id: "n", health: "", want: errGraphHealthUnknown},
		"Health が未定義": {id: "n", health: "critical", want: errGraphHealthUnknown},
		"Health が大文字": {id: "n", health: "OK", want: errGraphHealthUnknown},
	}
	for name, tt := range tests {
		t.Run(name, func(t *testing.T) {
			_, err := newGraphNode(tt.id, tt.x, tt.y, tt.load, tt.health)
			if !errors.Is(err, tt.want) {
				t.Fatalf("期待した error でない: got %v, want %v", err, tt.want)
			}
		})
	}
}

// 受け入れ基準 5.4: 端点が不正な辺を作らせない。
func TestNewGraphEdge(t *testing.T) {
	tests := map[string]struct {
		from, to string
		flow     float64
		want     error // nil は成功を期待する
	}{
		"正常":          {from: "a", to: "b", flow: 0.5},
		"Flow が下限":    {from: "a", to: "b", flow: 0.0},
		"Flow が上限":    {from: "a", to: "b", flow: 1.0},
		"自己ループ":       {from: "a", to: "a", flow: 0.5, want: errGraphEdgeEndpoints},
		"From が空":     {from: "", to: "b", flow: 0.5, want: errGraphEdgeEndpoints},
		"To が空":       {from: "a", to: "", flow: 0.5, want: errGraphEdgeEndpoints},
		"Flow が負":     {from: "a", to: "b", flow: -0.01, want: errGraphValueOutOfRange},
		"Flow が 1 超":  {from: "a", to: "b", flow: 1.01, want: errGraphValueOutOfRange},
		"Flow が NaN":  {from: "a", to: "b", flow: math.NaN(), want: errGraphValueNotFinite},
		"Flow が +Inf": {from: "a", to: "b", flow: math.Inf(1), want: errGraphValueNotFinite},
	}
	for name, tt := range tests {
		t.Run(name, func(t *testing.T) {
			got, err := newGraphEdge(tt.from, tt.to, tt.flow)
			if tt.want == nil {
				if err != nil {
					t.Fatalf("error を返した: %v", err)
				}
				if got.From != tt.from || got.To != tt.to || got.Flow != tt.flow {
					t.Fatalf("値が保たれていない: %+v", got)
				}
				return
			}
			if !errors.Is(err, tt.want) {
				t.Fatalf("期待した error でない: got %v, want %v", err, tt.want)
			}
		})
	}
}

// 受け入れ基準 5.3: graphHealthValid が定義済みの 3 値だけを通す。
func TestGraphHealthValid(t *testing.T) {
	for _, h := range []string{HealthOK, HealthWarn, HealthDown} {
		if !graphHealthValid(h) {
			t.Fatalf("定義済みの値を拒んだ: %q", h)
		}
	}
	for _, h := range []string{"", "OK", "warning", "健全"} {
		if graphHealthValid(h) {
			t.Fatalf("未定義の値を通した: %q", h)
		}
	}
}
