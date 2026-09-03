package main

import (
	"math"
	"math/rand"
	"sync"
	"time"
)

// graphEventName は依存グラフフィードのイベント名。
const graphEventName = "nullops:graph"

// graphInterval は依存グラフの送出間隔。
//
// 漂いの滑らかさはフロントエンドの補間に任せ、Go 側の送出は毎秒 1 回に抑える
// (spec.md §7 受け入れ基準 12.2)。
const graphInterval = 1000 * time.Millisecond

// graphNodeCount はノードの数。増減させない(spec.md §3 前提 3)。
//
// ノードを増減させると錨の配置が毎回変わり、図が落ち着かない。
// 完了条件が求める「増減」はエッジと健康状態の変化で満たす。
const graphNodeCount = 10

// graphAnchorRadius は錨を置く円環の半径。
//
// 単位正方形の内側に収め、ドリフトの揺らぎを足しても壁へ貼り付かない値。
// 円環に置くのはエッジが中央を横切って読める図になるためであり、
// 力学モデルを実装しないための手口である(spec.md §3 前提 4)。
const graphAnchorRadius = 0.72

// ノードの漂わせ方のパラメータ。unit #2 の drift / clampUnit をそのまま使う。
//
// 引き戻しを弱く、揺らぎを小さく置くのは、円環の並びを保ったまま
// 微かに動いて見える状態を作るため。
const (
	graphNodePull   = 0.10
	graphNodeJitter = 0.012
)

// 負荷と流量の漂わせ方のパラメータ。
//
// 座標より大きく揺らすのは、円の大きさと線の太さの変化が画面で読み取れる
// 幅を持つようにするため。
const (
	graphLoadPull    = 0.08
	graphLoadJitter  = 0.05
	graphFlowPull    = 0.10
	graphFlowJitter  = 0.06
	graphFlowAnchor  = 0.55
	graphFlowInitial = 0.5
)

// graphHealthChance は 1 フレームで 1 ノードの健康状態が遷移する確率。
//
// 1000 フレームのあいだに必ず何度か起きる一方、毎秒 1 回の送出で
// 目が追える頻度に収まる大きさ(10 ノードで期待 0.15 回/フレーム)。
const graphHealthChance = 0.015

// graphEdgeToggleChance は 1 フレームで 1 本の揺らぎエッジが付け外しされる確率。
//
// 100 フレームのあいだにエッジの本数が変わることを保証する大きさにする
// (spec.md §7 受け入れ基準 6.2)。
const graphEdgeToggleChance = 0.06

// graphNodeIDs は画面へ出すノード名。英語のまま置く(CLAUDE.md 言語規約)。
//
// 並びが錨の順序を決める。この配列を Next で変えない(受け入れ基準 6.5)。
var graphNodeIDs = [graphNodeCount]string{
	"api-gateway",
	"auth",
	"ingest",
	"queue",
	"worker",
	"store",
	"cache",
	"search",
	"metrics",
	"notify",
}

// graphCoreEdges は基幹エッジ。つねに Edges に含める(受け入れ基準 6.4)。
//
// 円環の隣接 10 本と弦 2 本から成る。全ノードが 1 つの連結成分に留まるため、
// 揺らぎエッジがどう外れてもグラフが断片化して図が読めなくなることがない。
var graphCoreEdges = []graphEdgeSpec{
	{0, 1}, {1, 2}, {2, 3}, {3, 4}, {4, 5},
	{5, 6}, {6, 7}, {7, 8}, {8, 9}, {9, 0},
	{0, 5}, {2, 7},
}

// graphOptionalEdges は揺らぎエッジの候補。確率で付け外しされる。
//
// 基幹エッジと重複しない組だけを並べる。重複させると同じ (From, To) が
// 2 本現れて DependencyGraph の不変条件を破る(受け入れ基準 5.5)。
var graphOptionalEdges = []graphEdgeSpec{
	{0, 3}, {1, 6}, {2, 8}, {3, 9},
	{4, 9}, {5, 1}, {6, 2}, {8, 4},
}

// graphEdgeSpec はエッジの端点をノードの添字で表す。
//
// ID の文字列でなく添字で持つのは、ノード集合が固定であり(前提 3)、
// 端点が Nodes に実在することを構造として保証できるため。
type graphEdgeSpec struct {
	from, to int
}

// graphNodeState は 1 ノードの錨と現在の状態。
type graphNodeState struct {
	id               string
	anchorX, anchorY float64
	x, y             float64
	load             float64
	loadAnchor       float64 // 負荷が引き戻される先。ノードごとに固定
	health           string
}

// graphEdgeState は 1 エッジの現在の状態。
type graphEdgeState struct {
	spec   graphEdgeSpec
	core   bool // 基幹エッジ。active を落とさない
	active bool
	flow   float64
}

// graphSource は擬似的な依存関係をフレーム単位で生成する feed.Source の実装。
//
// feed パッケージを import しないのは、feed から見て利用側である main が
// インターフェースを満たすだけでよく、import すると依存が逆向きになるため
// (logSource・scatterSource と同じ扱い)。
type graphSource struct {
	mu  sync.Mutex
	seq uint64

	nodes []graphNodeState
	edges []graphEdgeState

	// last は最後に生成したグラフ。Snapshot はこの複製を返す。
	last DependencyGraph

	rnd *rand.Rand
}

// newGraphSource は依存グラフの生成器を作る。
//
// 事前条件は rnd が nil でないこと。違反は呼び出し側の誤りであり、
// 戻り値に error 経路を持たないため panic する。
// rnd は graphSource 専用のインスタンスを渡す。*rand.Rand は並行安全でなく、
// 他の生成器と共有すると互いの mutex では保護されない。
//
// ノード数を引数で受けないのは、ノード集合を固定とするため(spec.md §5.2)。
func newGraphSource(rnd *rand.Rand) *graphSource {
	if rnd == nil {
		panic("newGraphSource の rnd は nil であってはならない")
	}

	nodes := make([]graphNodeState, graphNodeCount)
	for i := range nodes {
		angle := 2 * math.Pi * float64(i) / graphNodeCount
		ax := graphAnchorRadius * math.Cos(angle)
		ay := graphAnchorRadius * math.Sin(angle)
		nodes[i] = graphNodeState{
			id:         graphNodeIDs[i],
			anchorX:    ax,
			anchorY:    ay,
			x:          ax,
			y:          ay,
			load:       0.2 + rnd.Float64()*0.6,
			loadAnchor: 0.2 + rnd.Float64()*0.6,
			health:     HealthOK,
		}
	}

	edges := make([]graphEdgeState, 0, len(graphCoreEdges)+len(graphOptionalEdges))
	for _, spec := range graphCoreEdges {
		edges = append(edges, graphEdgeState{spec: spec, core: true, active: true, flow: graphFlowInitial})
	}
	for _, spec := range graphOptionalEdges {
		// 半数ほどを最初から張っておく。全部外した状態から始めると、
		// 起動直後の図が基幹エッジだけの単調な円環に見える。
		edges = append(edges, graphEdgeState{
			spec:   spec,
			active: rnd.Float64() < 0.5,
			flow:   graphFlowInitial,
		})
	}

	s := &graphSource{nodes: nodes, edges: edges, rnd: rnd}
	// Next を 1 度も呼んでいない時点でもノードの揃ったグラフを返せるようにする。
	// App.Snapshot が startup の直後(最初の送出より前)に呼ばれても
	// Nodes の長さが graphNodeCount であることを保証するため
	// (spec.md §7 受け入れ基準 7.4)。Seq は 0 のまま。
	s.last = s.build(0)
	return s
}

// EventName はフロントエンドへ送るイベント名を返す。プロセスの生存期間中つねに同じ値。
func (s *graphSource) EventName() string { return graphEventName }

// Interval は次の送出までの待ち時間を返す。つねに graphInterval。
func (s *graphSource) Interval() time.Duration { return graphInterval }

// Next は 1 フレーム分の依存グラフを返す。
//
// 座標と値の切り詰めはこの関数の責務であり、newGraphNode へ渡す時点で
// 不変条件は満たされている。それでも error を握りつぶさず panic するのは、
// 漂わせ方や遷移の規則を変えて不変条件が破れたときに気付けるようにするため
// (feed.Source は error 経路を持たない。logSource.Next と同じ規律)。
func (s *graphSource) Next() any {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.advance()
	s.seq++
	s.last = s.build(s.seq)
	return s.last
}

// advance はノードとエッジを 1 フレーム分だけ進める。呼び出し側で mu を保持すること。
func (s *graphSource) advance() {
	for i := range s.nodes {
		n := &s.nodes[i]
		n.x = clampUnit(drift(s.rnd, n.x, n.anchorX, graphNodePull, graphNodeJitter))
		n.y = clampUnit(drift(s.rnd, n.y, n.anchorY, graphNodePull, graphNodeJitter))
		n.load = clampZeroOne(drift(s.rnd, n.load, n.loadAnchor, graphLoadPull, graphLoadJitter))
		if s.rnd.Float64() < graphHealthChance {
			n.health = s.nextHealth(n.health)
		}
	}

	for i := range s.edges {
		e := &s.edges[i]
		e.flow = clampZeroOne(drift(s.rnd, e.flow, graphFlowAnchor, graphFlowPull, graphFlowJitter))
		if !e.core && s.rnd.Float64() < graphEdgeToggleChance {
			e.active = !e.active
		}
	}
}

// nextHealth は健康状態を 1 段だけ遷移させる。呼び出し側で mu を保持すること。
//
// ok と down を直接行き来させないのは、段階を踏むほうが画面で読み取りやすい
// ためである(spec.md §6.6)。
func (s *graphSource) nextHealth(current string) string {
	switch current {
	case HealthOK:
		return HealthWarn
	case HealthWarn:
		// 悪化と回復を等確率にする。片方へ寄せると 1000 フレームのあいだに
		// 全ノードが同じ状態へ吸い込まれ、色の差が消える。
		if s.rnd.Float64() < 0.5 {
			return HealthDown
		}
		return HealthOK
	default:
		return HealthWarn
	}
}

// build は現在の内部状態から DependencyGraph を組み立てる。呼び出し側で mu を保持すること。
//
// 端点をノードの添字で持っているため、Edges の端点は必ず Nodes に実在する。
func (s *graphSource) build(seq uint64) DependencyGraph {
	nodes := make([]GraphNode, len(s.nodes))
	for i, n := range s.nodes {
		gn, err := newGraphNode(n.id, n.x, n.y, n.load, n.health)
		if err != nil {
			panic("graphSource が GraphNode の不変条件を破っている: " + err.Error())
		}
		nodes[i] = gn
	}

	edges := make([]GraphEdge, 0, len(s.edges))
	for _, e := range s.edges {
		if !e.core && !e.active {
			continue
		}
		ge, err := newGraphEdge(s.nodes[e.spec.from].id, s.nodes[e.spec.to].id, e.flow)
		if err != nil {
			panic("graphSource が GraphEdge の不変条件を破っている: " + err.Error())
		}
		edges = append(edges, ge)
	}

	return DependencyGraph{Seq: seq, Nodes: nodes, Edges: edges}
}

// Snapshot は最後に生成したグラフの複製を返す。
//
// 内部状態を変化させない(spec.md §5.2)。返すスライスは内部と別の配列であり、
// 呼び出し側の変更が次フレームの送出内容へ波及しない。
func (s *graphSource) Snapshot() DependencyGraph {
	s.mu.Lock()
	defer s.mu.Unlock()

	nodes := make([]GraphNode, len(s.last.Nodes))
	copy(nodes, s.last.Nodes)
	edges := make([]GraphEdge, len(s.last.Edges))
	copy(edges, s.last.Edges)
	return DependencyGraph{Seq: s.last.Seq, Nodes: nodes, Edges: edges}
}

// clampZeroOne は値を [0, 1] へ収める。
//
// clampUnit([-1, 1]) と別に持つのは、負荷と流量が負の値を取らないため。
func clampZeroOne(v float64) float64 {
	if v < 0.0 {
		return 0.0
	}
	if v > 1.0 {
		return 1.0
	}
	return v
}
