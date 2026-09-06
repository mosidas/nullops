package main

import (
	"errors"
	"math"
)

// ScatterPoint は 3D 散布図の 1 点。座標は回転前のモデル座標。
//
// 公開フィールドは Wails のバインディングで JSON 化するために必要だが、
// 値の生成は newScatterPoint に限る。
type ScatterPoint struct {
	X float64 `json:"x"`
	Y float64 `json:"y"` // 高さ。地形の色値の元になる
	Z float64 `json:"z"`
	S uint8   `json:"s"` // 構造の識別子。0 = 地形、1 = 球、2 = トーラス
	C float64 `json:"c"` // カラーマップ用の値。0.0〜1.0
}

// ScatterCloud は 1 フレーム分の点群。
type ScatterCloud struct {
	Seq uint64 `json:"seq"`
	// Points は点の集合。nil にならない(JSON 化して null にしないため)。
	Points []ScatterPoint `json:"points"`
}

// 構造の識別子の上限(排他)。S はこれ未満でなければならない。
const scatterStructureCount = 3

// 不変条件の違反。
//
// 単一の error に束ねないのは、呼び出し側とテストが errors.Is で
// どの不変条件を破ったかを特定できるようにするため。
var (
	errScatterPointOutOfRange       = errors.New("ScatterPoint の座標は各軸 -1.0〜1.0、C は 0.0〜1.0 でなければならない")
	errScatterPointNotFinite        = errors.New("ScatterPoint の値は有限でなければならない (NaN・Inf を含んではならない)")
	errScatterPointUnknownStructure = errors.New("ScatterPoint の S は 0・1・2 のいずれかでなければならない")
)

// newScatterPoint は不変条件を満たす ScatterPoint だけを作る。
//
// 座標の切り詰め(生成器が置いた点を単位立方体へ収める)は生成器側の責務であり、
// ここでは丸めと検査だけを行う(spec.md §6.1)。切り詰めをここへ寄せると、
// 生成器の不具合が黙って握り潰される。
//
// 丸めは JSON の桁数を抑えるために行う(座標は小数第 4 位、C は第 3 位)。
// 範囲検査を丸めの前に置くのは、1.00004 のような値が丸めで 1.0 に化けて
// 検査をすり抜けるのを防ぐため。
func newScatterPoint(x, y, z float64, s uint8, c float64) (ScatterPoint, error) {
	// 有限性を先に見るのは、NaN が比較でつねに false を返し、
	// 範囲検査をすり抜けるため。
	for _, v := range [4]float64{x, y, z, c} {
		if math.IsNaN(v) || math.IsInf(v, 0) {
			return ScatterPoint{}, errScatterPointNotFinite
		}
	}

	for _, v := range [3]float64{x, y, z} {
		if v < -1.0 || v > 1.0 {
			return ScatterPoint{}, errScatterPointOutOfRange
		}
	}
	if c < 0.0 || c > 1.0 {
		return ScatterPoint{}, errScatterPointOutOfRange
	}
	if s >= scatterStructureCount {
		return ScatterPoint{}, errScatterPointUnknownStructure
	}

	return ScatterPoint{
		X: roundTo(x, 1e4),
		Y: roundTo(y, 1e4),
		Z: roundTo(z, 1e4),
		S: s,
		C: roundTo(c, 1e3),
	}, nil
}

// roundTo は v を 1/unit の粒度に丸める。範囲内の値は丸めても範囲を出ない
// (端点 ±1.0 と 0.0・1.0 は不動点)。
func roundTo(v, unit float64) float64 {
	return math.Round(v*unit) / unit
}
