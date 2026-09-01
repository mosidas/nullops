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
	Y float64 `json:"y"`
	Z float64 `json:"z"`
	W float64 `json:"w"` // 点の大小と明度に使う重み
}

// ScatterCloud は 1 フレーム分の点群。
type ScatterCloud struct {
	Seq uint64 `json:"seq"`
	// Points は点の集合。nil にならない(JSON 化して null にしないため)。
	Points []ScatterPoint `json:"points"`
}

// 不変条件の違反。
//
// 単一の error に束ねないのは、呼び出し側とテストが errors.Is で
// どの不変条件を破ったかを特定できるようにするため。
var (
	errScatterPointOutOfRange = errors.New("ScatterPoint の座標は各軸 -1.0〜1.0、W は 0.0〜1.0 でなければならない")
	errScatterPointNotFinite  = errors.New("ScatterPoint の値は有限でなければならない (NaN・Inf を含んではならない)")
)

// newScatterPoint は不変条件を満たす ScatterPoint だけを作る。
//
// 座標の切り詰め(生成器が漂わせた点を単位立方体へ収める)は生成器側の責務であり、
// ここでは検査だけを行う(spec.md §6.1)。切り詰めをここへ寄せると、
// 生成器の漂わせ方の不具合が黙って握り潰される。
func newScatterPoint(x, y, z, w float64) (ScatterPoint, error) {
	// 有限性を先に見るのは、NaN が比較でつねに false を返し、
	// 範囲検査をすり抜けるため。
	for _, v := range [4]float64{x, y, z, w} {
		if math.IsNaN(v) || math.IsInf(v, 0) {
			return ScatterPoint{}, errScatterPointNotFinite
		}
	}

	for _, v := range [3]float64{x, y, z} {
		if v < -1.0 || v > 1.0 {
			return ScatterPoint{}, errScatterPointOutOfRange
		}
	}
	if w < 0.0 || w > 1.0 {
		return ScatterPoint{}, errScatterPointOutOfRange
	}

	return ScatterPoint{X: x, Y: y, Z: z, W: w}, nil
}
