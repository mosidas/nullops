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
const graphNodeCount = 36

// graphMinNodeDistance は同一クラスタ内(ローカルハブを除く)の錨どうしが
// 最低限保つべき距離(spec.md §6.6 手順 4)。
const graphMinNodeDistance = 0.05

// graphMaxAnchorRetries は最小距離を満たす角度を引き直す最大回数。
// 力学モデルの反復と違い、試行回数に上限を持たせる(spec.md §3 前提 2)。
const graphMaxAnchorRetries = 20

// graphCluster はノードの錨をまとめる塊 1 つ分の配置パラメータ(spec.md §6.6)。
type graphCluster struct {
	startIndex     int     // クラスタの先頭ノードの添字。この添字がローカルハブ
	count          int     // クラスタに属するノード数
	centerRadius   float64 // クラスタ中心の原点からの距離
	centerAngleDeg float64 // クラスタ中心の角度(度)
	spread         float64 // クラスタ中心からの錨の広がり半径
}

// graphClusters は 4 つのクラスタの配置定義(spec.md §6.6 の表)。
//
// 中心の角度を等間隔にしないのは、クラスタの並び自体が等角配置に見えると
// 本 unit が解消しようとしている見た目が塊の単位で再現されてしまうため。
var graphClusters = [4]graphCluster{
	{startIndex: 0, count: 14, centerRadius: 0.10, centerAngleDeg: 0, spread: 0.32},
	{startIndex: 14, count: 8, centerRadius: 0.55, centerAngleDeg: 150, spread: 0.16},
	{startIndex: 22, count: 7, centerRadius: 0.68, centerAngleDeg: 260, spread: 0.14},
	{startIndex: 29, count: 7, centerRadius: 0.82, centerAngleDeg: 40, spread: 0.12},
}

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
// 目が追える頻度に収まる大きさ(36 ノードで期待 0.15 回/フレーム。
// 旧: 10 ノードで 0.015。ノード数が 3.6 倍になったため、点滅の見た目の
// 頻度を据え置く比率で下げた。spec.md §7 受け入れ基準 5.8 は下限のみを
// 定めており、この値でも 1000 フレームに 1 回以上は確実に起きる)。
const graphHealthChance = 0.015 * 10.0 / 36.0

// graphEdgeToggleChance は 1 フレームで 1 本の揺らぎエッジが付け外しされる確率。
//
// 100 フレームのあいだにエッジの本数が変わることを保証する大きさにする
// (spec.md §7 受け入れ基準 6.2)。
const graphEdgeToggleChance = 0.06

// graphNodeIDs は画面へ出すノード名。英語のまま置く(CLAUDE.md 言語規約)。
//
// 並びが錨の順序を決める。この配列を Next で変えない(受け入れ基準 6.5)。
// 添字 0〜13 は hub クラスタ、14〜21 はクラスタ 1、22〜28 はクラスタ 2、
// 29〜35 はクラスタ 3(graphClusters の startIndex と対応)。
// 各クラスタの先頭(添字 0 相当)がローカルハブ。
var graphNodeIDs = [graphNodeCount]string{
	// クラスタ 0(hub、14 個。既存 10 個 + 4 個)
	"api-gateway", "auth", "ingest", "queue", "worker",
	"store", "cache", "search", "metrics", "notify",
	"router", "config", "session", "webhook",
	// クラスタ 1(8 個)
	"billing", "email", "scheduler", "analytics",
	"reporting", "invoicing", "ledger", "payments",
	// クラスタ 2(7 個)
	"media", "thumbnail", "transcoder", "upload",
	"cdn-edge", "encoder", "playlist",
	// クラスタ 3(7 個)
	"audit", "backup", "archive", "retention",
	"compliance", "snapshot", "replication",
}

// buildCoreEdges は基幹エッジ(クラスタ内スポーク + バックボーン)を組み立てる。
//
// クラスタごとの先頭ノード(startIndex)をローカルハブとし、同クラスタの
// 他の全ノードからハブへ 1 本ずつ張る(スポーク)。加えて hub クラスタ以外の
// ローカルハブから hub クラスタのローカルハブへ 1 本ずつ張る(バックボーン)。
// 36 ノードの全域木になり、常に連結を保つ(spec.md §6.6)。
func buildCoreEdges() []graphEdgeSpec {
	edges := make([]graphEdgeSpec, 0, 35)
	for _, c := range graphClusters {
		hub := c.startIndex
		for i := 1; i < c.count; i++ {
			edges = append(edges, graphEdgeSpec{from: c.startIndex + i, to: hub})
		}
	}
	hub0 := graphClusters[0].startIndex
	for _, c := range graphClusters[1:] {
		edges = append(edges, graphEdgeSpec{from: c.startIndex, to: hub0})
	}
	return edges
}

// graphCoreEdges は基幹エッジ。つねに Edges に含める(受け入れ基準 4.1・5.9)。
//
// クラスタ構造(graphClusters)からのみ導かれ、乱数に依存しない。
var graphCoreEdges = buildCoreEdges()

// graphOptionalEdgeCount は揺らぎエッジの候補本数(spec.md §6.6)。
const graphOptionalEdgeCount = 36

// buildOptionalEdgeCandidates は基幹エッジと重複しない全ての組を列挙する。
//
// クラスタ内の非隣接ペアとクラスタ間のペアが混在する(spec.md §6.6)。
// 重複させると同じ (From, To) が 2 本現れて DependencyGraph の
// 不変条件を破る(受け入れ基準 5.5)ため、基幹エッジの組を除く。
func buildOptionalEdgeCandidates(core []graphEdgeSpec) []graphEdgeSpec {
	coreSet := make(map[[2]int]bool, len(core))
	for _, e := range core {
		a, b := e.from, e.to
		if a > b {
			a, b = b, a
		}
		coreSet[[2]int{a, b}] = true
	}

	candidates := make([]graphEdgeSpec, 0, graphNodeCount*graphNodeCount/2)
	for i := 0; i < graphNodeCount; i++ {
		for j := i + 1; j < graphNodeCount; j++ {
			if coreSet[[2]int{i, j}] {
				continue
			}
			candidates = append(candidates, graphEdgeSpec{from: i, to: j})
		}
	}
	return candidates
}

// graphOptionalEdgeCandidates は揺らぎエッジの候補プール。乱数に依存しない
// (どの組が候補になりうるかは構造だけで決まる)。newGraphSource がこの中から
// graphOptionalEdgeCount 本を rnd で重複なく選ぶ。
var graphOptionalEdgeCandidates = buildOptionalEdgeCandidates(graphCoreEdges)

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

	anchorX, anchorY := computeAnchors(rnd)

	nodes := make([]graphNodeState, graphNodeCount)
	for i := range nodes {
		nodes[i] = graphNodeState{
			id:         graphNodeIDs[i],
			anchorX:    anchorX[i],
			anchorY:    anchorY[i],
			x:          anchorX[i],
			y:          anchorY[i],
			load:       0.2 + rnd.Float64()*0.6,
			loadAnchor: 0.2 + rnd.Float64()*0.6,
			health:     HealthOK,
		}
	}

	optionalSpecs := selectOptionalEdges(rnd, graphOptionalEdgeCandidates, graphOptionalEdgeCount)

	edges := make([]graphEdgeState, 0, len(graphCoreEdges)+len(optionalSpecs))
	for _, spec := range graphCoreEdges {
		edges = append(edges, graphEdgeState{spec: spec, core: true, active: true, flow: graphFlowInitial})
	}
	for _, spec := range optionalSpecs {
		// 半数ほどを最初から張っておく。全部外した状態から始めると、
		// 起動直後の図が基幹エッジだけの単調な図に見える。
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

// computeAnchors は spec.md §6.6 手順 1〜5 に従いクラスタベースの錨を算出する。
//
// newGraphSource の初期化からのみ呼ぶ(Next の呼び出し経路には置かない。
// 受け入れ基準 2.4)。クラスタごとにローカルハブ(先頭ノード)をクラスタ中心
// (オフセット半径 0)に置き、非ハブは graphNodeIDs の配列順の順位で
// オフセット半径を決め、角度は rnd で一様に選ぶ。同一クラスタ内(ハブを除く)
// の既確定の錨と近すぎる(graphMinNodeDistance 未満)なら最大
// graphMaxAnchorRetries 回まで角度を引き直す。
func computeAnchors(rnd *rand.Rand) (ax, ay []float64) {
	ax = make([]float64, graphNodeCount)
	ay = make([]float64, graphNodeCount)

	for _, c := range graphClusters {
		centerAngleRad := c.centerAngleDeg * math.Pi / 180
		cx := c.centerRadius * math.Cos(centerAngleRad)
		cy := c.centerRadius * math.Sin(centerAngleRad)

		hub := c.startIndex
		ax[hub] = clampUnit(cx)
		ay[hub] = clampUnit(cy)

		placed := make([][2]float64, 0, c.count-1)
		for i := 1; i < c.count; i++ {
			idx := c.startIndex + i
			rank := i - 1
			offsetRadius := c.spread * float64(rank+1) / float64(c.count)

			var ox, oy float64
			for attempt := 0; attempt < graphMaxAnchorRetries; attempt++ {
				angle := rnd.Float64() * 2 * math.Pi
				ox = cx + offsetRadius*math.Cos(angle)
				oy = cy + offsetRadius*math.Sin(angle)

				tooClose := false
				for _, p := range placed {
					if math.Hypot(ox-p[0], oy-p[1]) < graphMinNodeDistance {
						tooClose = true
						break
					}
				}
				if !tooClose {
					break
				}
			}

			ax[idx] = clampUnit(ox)
			ay[idx] = clampUnit(oy)
			placed = append(placed, [2]float64{ax[idx], ay[idx]})
		}
	}

	return ax, ay
}

// selectOptionalEdges は候補プールから重複なく n 本を rnd で選ぶ。
func selectOptionalEdges(rnd *rand.Rand, candidates []graphEdgeSpec, n int) []graphEdgeSpec {
	perm := rnd.Perm(len(candidates))
	selected := make([]graphEdgeSpec, n)
	for i := 0; i < n; i++ {
		selected[i] = candidates[perm[i]]
	}
	return selected
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
