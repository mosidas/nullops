package main

import (
	"errors"
	"math"
	"strings"
)

// ノードの健康状態。フロントエンドは色の対応表の鍵としてこの文字列を読む。
//
// 独自の型を足さないのは、Go 側で得るものが無いため(spec.md §6.3)。
// 定数と graphHealthValid による検査で不変条件は同じく保てる。
// 画面へ出す値であり英語のまま置く(CLAUDE.md 言語規約)。
const (
	HealthOK   = "ok"
	HealthWarn = "warn"
	HealthDown = "down"
)

// GraphNode は依存グラフの 1 ノード。座標はモデル座標(単位正方形)。
//
// 公開フィールドは Wails のバインディングで JSON 化するために必要だが、
// 値の生成は newGraphNode に限る。
type GraphNode struct {
	ID     string  `json:"id"`     // 画面へ出す英語のサービス名。グラフ内で一意
	X      float64 `json:"x"`      // -1.0〜1.0
	Y      float64 `json:"y"`      // -1.0〜1.0
	Load   float64 `json:"load"`   // 0.0〜1.0。円の大きさに使う
	Health string  `json:"health"` // HealthOK / HealthWarn / HealthDown
}

// GraphEdge はノード間の依存。From から To への向きを持つ。
type GraphEdge struct {
	From string  `json:"from"`
	To   string  `json:"to"`
	Flow float64 `json:"flow"` // 0.0〜1.0。線の太さと明度に使う
}

// DependencyGraph は 1 フレーム分の擬似依存関係。
//
// 値の運搬に徹する。ノードの漂わせ方・健康状態の遷移・エッジの増減は
// graphSource の責務(spec.md §6.5)。
type DependencyGraph struct {
	Seq uint64 `json:"seq"`
	// Nodes・Edges は nil にならない(JSON 化して null にしないため)。
	Nodes []GraphNode `json:"nodes"`
	Edges []GraphEdge `json:"edges"`
}

// 不変条件の違反。
//
// 単一の error に束ねないのは、呼び出し側とテストが errors.Is で
// どの不変条件を破ったかを特定できるようにするため。
var (
	errGraphNodeIDEmpty     = errors.New("GraphNode の ID は 1 文字以上で改行文字 (U+000A・U+000D) を含んではならない")
	errGraphValueOutOfRange = errors.New("グラフの座標は -1.0〜1.0、Load と Flow は 0.0〜1.0 でなければならない")
	errGraphValueNotFinite  = errors.New("グラフの数値は有限でなければならない (NaN・Inf を許さない)")
	errGraphHealthUnknown   = errors.New("GraphNode の Health は ok / warn / down のいずれかでなければならない")
	errGraphEdgeEndpoints   = errors.New("GraphEdge の From と To は 1 文字以上で互いに異なっていなければならない")
)

// newGraphNode は不変条件を満たす GraphNode だけを作る。
//
// 座標の漂わせ方と健康状態の遷移は graphSource の責務であり、
// ここでは検査だけを行う(spec.md §6.3)。
func newGraphNode(id string, x, y, load float64, health string) (GraphNode, error) {
	if id == "" || strings.ContainsAny(id, "\n\r") {
		return GraphNode{}, errGraphNodeIDEmpty
	}
	// 有限性を範囲より先に見る。NaN はどの比較にも false を返すため、
	// 範囲検査を先に置くと NaN がすり抜ける。
	if err := checkFinite(x, y, load); err != nil {
		return GraphNode{}, err
	}
	if x < -1.0 || x > 1.0 || y < -1.0 || y > 1.0 {
		return GraphNode{}, errGraphValueOutOfRange
	}
	if load < 0.0 || load > 1.0 {
		return GraphNode{}, errGraphValueOutOfRange
	}
	if !graphHealthValid(health) {
		return GraphNode{}, errGraphHealthUnknown
	}

	return GraphNode{ID: id, X: x, Y: y, Load: load, Health: health}, nil
}

// newGraphEdge は不変条件を満たす GraphEdge だけを作る。
//
// 端点が Nodes に実在するかは 1 本の辺だけでは判断できないため、
// DependencyGraph を組み立てる graphSource の責務とする(spec.md §6.4)。
func newGraphEdge(from, to string, flow float64) (GraphEdge, error) {
	if from == "" || to == "" || from == to {
		return GraphEdge{}, errGraphEdgeEndpoints
	}
	if err := checkFinite(flow); err != nil {
		return GraphEdge{}, err
	}
	if flow < 0.0 || flow > 1.0 {
		return GraphEdge{}, errGraphValueOutOfRange
	}

	return GraphEdge{From: from, To: to, Flow: flow}, nil
}

// graphHealthValid は health が定義済みの 3 値のいずれかかを返す。
func graphHealthValid(health string) bool {
	switch health {
	case HealthOK, HealthWarn, HealthDown:
		return true
	default:
		return false
	}
}

// checkFinite は値がすべて有限かを検査する。
func checkFinite(values ...float64) error {
	for _, v := range values {
		if math.IsNaN(v) || math.IsInf(v, 0) {
			return errGraphValueNotFinite
		}
	}
	return nil
}
