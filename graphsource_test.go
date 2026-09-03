package main

import (
	"math/rand"
	"sync"
	"testing"
	"time"
)

// newTestGraphSource は種を固定した生成器を作る。テストを再現可能にするため。
func newTestGraphSource(t *testing.T) *graphSource {
	t.Helper()
	return newGraphSource(rand.New(rand.NewSource(1)))
}

// nextGraph は Next の戻り値を DependencyGraph として取り出す。
func nextGraph(t *testing.T, s *graphSource) DependencyGraph {
	t.Helper()
	g, ok := s.Next().(DependencyGraph)
	if !ok {
		t.Fatalf("Next の戻り値が DependencyGraph でない")
	}
	return g
}

// 受け入れ基準 4.1: EventName はつねに "nullops:graph"。
func TestGraphSourceEventName(t *testing.T) {
	s := newTestGraphSource(t)
	for range 3 {
		if got := s.EventName(); got != "nullops:graph" {
			t.Fatalf("EventName が期待と異なる: %q", got)
		}
		s.Next()
	}
}

// 受け入れ基準 4.2・12.2: Interval はつねに 1000 ミリ秒(毎秒 1 回以下)。
func TestGraphSourceInterval(t *testing.T) {
	s := newTestGraphSource(t)
	for range 3 {
		got := s.Interval()
		if got != time.Second {
			t.Fatalf("Interval が期待と異なる: %v", got)
		}
		s.Next()
	}
}

// 受け入れ基準 4.3・4.4: Nodes の長さが graphNodeCount で、Seq が 1 ずつ増える。
func TestGraphSourceNextLengthAndSeq(t *testing.T) {
	s := newTestGraphSource(t)
	for i := uint64(1); i <= 10; i++ {
		g := nextGraph(t, s)
		if len(g.Nodes) != graphNodeCount {
			t.Fatalf("Nodes の長さが期待と異なる: %d", len(g.Nodes))
		}
		if g.Seq != i {
			t.Fatalf("%d 回目の Seq が期待と異なる: %d", i, g.Seq)
		}
	}
}

// 受け入れ基準 4.5: rnd が nil の newGraphSource は panic する。
func TestNewGraphSourcePanicsOnNilRand(t *testing.T) {
	defer func() {
		if recover() == nil {
			t.Fatalf("panic しなかった")
		}
	}()
	newGraphSource(nil)
}

// 受け入れ基準 4.6: Next と Snapshot の並行呼び出しでデータ競合を起こさない。
//
// go test -race で走らせたときに意味を持つ。
func TestGraphSourceConcurrentAccess(t *testing.T) {
	s := newTestGraphSource(t)

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
				s.Snapshot()
			}
		}()
	}
	wg.Wait()
}

// 受け入れ基準 5.5・5.6・6.4・6.5: 1000 回連続で生成しても
// グラフの不変条件・基幹エッジの存在・ノード集合の不変を保つ。
func TestGraphSourceInvariantsOverManyFrames(t *testing.T) {
	const frames = 1000
	s := newTestGraphSource(t)

	wantIDs := make([]string, graphNodeCount)
	for i := range wantIDs {
		wantIDs[i] = graphNodeIDs[i]
	}

	for f := range frames {
		g := nextGraph(t, s)

		ids := make(map[string]struct{}, len(g.Nodes))
		for i, n := range g.Nodes {
			// 6.5: ノードの集合(ID の並び)が変わらない。
			if n.ID != wantIDs[i] {
				t.Fatalf("フレーム %d: ノードの並びが変わった: %q", f, n.ID)
			}
			// 5.6: 座標と負荷が範囲内。
			if n.X < -1.0 || n.X > 1.0 || n.Y < -1.0 || n.Y > 1.0 {
				t.Fatalf("フレーム %d: 座標が範囲外: (%v, %v)", f, n.X, n.Y)
			}
			if n.Load < 0.0 || n.Load > 1.0 {
				t.Fatalf("フレーム %d: Load が範囲外: %v", f, n.Load)
			}
			if !graphHealthValid(n.Health) {
				t.Fatalf("フレーム %d: Health が未定義: %q", f, n.Health)
			}
			// 5.5: ID が重複しない。
			if _, dup := ids[n.ID]; dup {
				t.Fatalf("フレーム %d: ID が重複した: %q", f, n.ID)
			}
			ids[n.ID] = struct{}{}
		}

		type pair struct{ from, to string }
		seenEdges := make(map[pair]struct{}, len(g.Edges))
		for _, e := range g.Edges {
			// 5.5: 端点が Nodes に実在する。
			if _, ok := ids[e.From]; !ok {
				t.Fatalf("フレーム %d: エッジの始点が Nodes に無い: %q", f, e.From)
			}
			if _, ok := ids[e.To]; !ok {
				t.Fatalf("フレーム %d: エッジの終点が Nodes に無い: %q", f, e.To)
			}
			// 5.5: 同じ (From, To) が 2 本以上現れない。
			p := pair{e.From, e.To}
			if _, dup := seenEdges[p]; dup {
				t.Fatalf("フレーム %d: エッジが重複した: %v", f, p)
			}
			seenEdges[p] = struct{}{}
			// 5.6: Flow が範囲内。
			if e.Flow < 0.0 || e.Flow > 1.0 {
				t.Fatalf("フレーム %d: Flow が範囲外: %v", f, e.Flow)
			}
		}

		// 6.4: 基幹エッジはつねに含まれる。
		for _, spec := range graphCoreEdges {
			p := pair{graphNodeIDs[spec.from], graphNodeIDs[spec.to]}
			if _, ok := seenEdges[p]; !ok {
				t.Fatalf("フレーム %d: 基幹エッジが欠けた: %v", f, p)
			}
		}
	}
}

// 受け入れ基準 6.1: 毎フレーム少なくとも 1 つのノードの座標が変わる。
func TestGraphSourceNodesMoveEveryFrame(t *testing.T) {
	s := newTestGraphSource(t)
	prev := nextGraph(t, s)

	for f := range 200 {
		cur := nextGraph(t, s)
		moved := false
		for i := range cur.Nodes {
			if cur.Nodes[i].X != prev.Nodes[i].X || cur.Nodes[i].Y != prev.Nodes[i].Y {
				moved = true
				break
			}
		}
		if !moved {
			t.Fatalf("フレーム %d: どのノードも動かなかった", f)
		}
		prev = cur
	}
}

// 受け入れ基準 6.2: 100 回のあいだにエッジの本数が変わるフレームが 1 回以上ある。
func TestGraphSourceEdgeCountChanges(t *testing.T) {
	s := newTestGraphSource(t)
	prev := len(nextGraph(t, s).Edges)
	changed := false
	for range 99 {
		got := len(nextGraph(t, s).Edges)
		if got != prev {
			changed = true
		}
		prev = got
	}
	if !changed {
		t.Fatalf("100 フレームのあいだにエッジの本数が変わらなかった")
	}
}

// 受け入れ基準 6.3: 1000 回のあいだにいずれかのノードの Health が変わる。
//
// 遷移が ok → warn → down / ok の順を守っていることも併せて見る。
func TestGraphSourceHealthChanges(t *testing.T) {
	s := newTestGraphSource(t)
	prev := nextGraph(t, s)
	changed := false

	for f := range 999 {
		cur := nextGraph(t, s)
		for i := range cur.Nodes {
			before, after := prev.Nodes[i].Health, cur.Nodes[i].Health
			if before == after {
				continue
			}
			changed = true
			// ok と down を直接行き来させない(spec.md §6.6)。
			if (before == HealthOK && after == HealthDown) || (before == HealthDown && after == HealthOK) {
				t.Fatalf("フレーム %d: 段階を飛ばして遷移した: %q → %q", f, before, after)
			}
		}
		prev = cur
	}

	if !changed {
		t.Fatalf("1000 フレームのあいだに Health が 1 度も変わらなかった")
	}
}

// 受け入れ基準 4.6・5.5: Snapshot は内部状態を変えず、内部と別の配列を返す。
func TestGraphSourceSnapshotIsolation(t *testing.T) {
	s := newTestGraphSource(t)
	for range 5 {
		s.Next()
	}

	before := s.Snapshot()
	if before.Seq != 5 {
		t.Fatalf("Snapshot の Seq が期待と異なる: %d", before.Seq)
	}

	// 返した配列を書き換えても次の Snapshot へ波及しない。
	before.Nodes[0].ID = "書き換え"
	if len(before.Edges) > 0 {
		before.Edges[0].From = "書き換え"
	}

	after := s.Snapshot()
	if after.Nodes[0].ID != graphNodeIDs[0] {
		t.Fatalf("Snapshot が内部の配列を共有している: %q", after.Nodes[0].ID)
	}
	// Snapshot の呼び出しで Seq が進んでいない。
	if after.Seq != 5 {
		t.Fatalf("Snapshot が内部状態を変えた: Seq=%d", after.Seq)
	}
}

// 受け入れ基準 7.4: Next を 1 度も呼んでいなくても Nodes が揃っている。
//
// App.Snapshot が startup の直後(最初の送出より前)に呼ばれる場合に効く。
func TestGraphSourceInitialSnapshot(t *testing.T) {
	s := newTestGraphSource(t)
	got := s.Snapshot()
	if got.Seq != 0 {
		t.Fatalf("初期の Seq が 0 でない: %d", got.Seq)
	}
	if len(got.Nodes) != graphNodeCount {
		t.Fatalf("初期の Nodes の長さが期待と異なる: %d", len(got.Nodes))
	}
	if got.Edges == nil {
		t.Fatalf("初期の Edges が nil である")
	}
	if len(got.Edges) < len(graphCoreEdges) {
		t.Fatalf("初期の Edges が基幹エッジを含んでいない: %d 本", len(got.Edges))
	}
}

// 受け入れ基準 5.5・5.6・6.4: 種を変えても不変条件が保たれる。
//
// 上のテストは種 1 の 1 本の履歴しか見ない。規則が特定の乱数列にだけ
// 依存していないことを、複数の種で確かめる。
func TestGraphSourceInvariantsAcrossSeeds(t *testing.T) {
	for seed := int64(1); seed <= 20; seed++ {
		s := newGraphSource(rand.New(rand.NewSource(seed)))
		for range 200 {
			g, ok := s.Next().(DependencyGraph)
			if !ok {
				t.Fatalf("seed %d: Next の戻り値が DependencyGraph でない", seed)
			}
			if len(g.Nodes) != graphNodeCount {
				t.Fatalf("seed %d: Nodes の長さが期待と異なる: %d", seed, len(g.Nodes))
			}
			if len(g.Edges) < len(graphCoreEdges) {
				t.Fatalf("seed %d: 基幹エッジより少ない: %d 本", seed, len(g.Edges))
			}
			for _, n := range g.Nodes {
				if n.X < -1.0 || n.X > 1.0 || n.Y < -1.0 || n.Y > 1.0 || n.Load < 0.0 || n.Load > 1.0 {
					t.Fatalf("seed %d: 値が範囲外: %+v", seed, n)
				}
			}
		}
	}
}

// 受け入れ基準 12.3: 1 フレームの対象数が固定の上限に収まる。
//
// ノードは graphNodeCount、エッジは基幹と揺らぎの候補の合計を超えない。
func TestGraphSourceBoundedSize(t *testing.T) {
	s := newTestGraphSource(t)
	maxEdges := len(graphCoreEdges) + len(graphOptionalEdges)
	for range 500 {
		g := nextGraph(t, s)
		if len(g.Nodes) != graphNodeCount {
			t.Fatalf("Nodes の長さが固定でない: %d", len(g.Nodes))
		}
		if len(g.Edges) > maxEdges {
			t.Fatalf("Edges が上限を超えた: %d > %d", len(g.Edges), maxEdges)
		}
	}
}
