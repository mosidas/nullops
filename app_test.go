package main

import (
	"context"
	"encoding/json"
	"sync"
	"testing"
	"time"

	"nullops/feed"
)

// recordingEmitter は送出を記録する擬似 Emitter。Wails ランタイムを起動せずに検査する。
type recordingEmitter struct {
	mu    sync.Mutex
	calls []recordedEmit
}

type recordedEmit struct {
	eventName string
	payload   any
}

func (e *recordingEmitter) Emit(eventName string, payload any) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.calls = append(e.calls, recordedEmit{eventName: eventName, payload: payload})
}

func (e *recordingEmitter) snapshot() []recordedEmit {
	e.mu.Lock()
	defer e.mu.Unlock()
	return append([]recordedEmit(nil), e.calls...)
}

// newTestApp は Emitter を差し替えた App を返す。
func newTestApp() (*App, *recordingEmitter) {
	em := &recordingEmitter{}
	a := NewApp()
	a.newEmitter = func(context.Context) feed.Emitter { return em }
	return a, em
}

// waitFor は cond が真になるまで待つ。
func waitFor(t *testing.T, timeout time.Duration, desc string, cond func() bool) {
	t.Helper()

	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if cond() {
			return
		}
		time.Sleep(time.Millisecond)
	}
	t.Fatalf("%s が %v 以内に成立しなかった", desc, timeout)
}

// stopApp は startup で開始した駆動を止め、終了を待つ。
func stopApp(t *testing.T, a *App) {
	t.Helper()

	a.cancel()
	select {
	case <-a.done:
	case <-time.After(2 * time.Second):
		t.Fatalf("Run が停止しなかった")
	}
}

func TestStartupEmitsLogLines(t *testing.T) {
	a, em := newTestApp()
	a.startup(context.Background())
	defer stopApp(t, a)

	// 送出間隔の上限は 400 ms。3 件そろうまで余裕をもって待つ。
	//
	// ログ以外の送出元（scatter・commits・graph）が同じ Runner に同居するため、
	// 全イベントを走査すると他のイベントが混ざる。ログの送出だけに絞って検査する。
	logEmits := func() []recordedEmit {
		var got []recordedEmit
		for _, c := range em.snapshot() {
			if c.eventName == logEventName {
				got = append(got, c)
			}
		}
		return got
	}
	waitFor(t, 5*time.Second, "3 件のログ送出", func() bool { return len(logEmits()) >= 3 })

	for i, c := range logEmits() {
		lines, ok := c.payload.([]LogLine)
		if !ok {
			t.Fatalf("%d 番目の payload が []LogLine でない: got %T", i, c.payload)
		}
		if len(lines) != 1 {
			t.Fatalf("%d 番目の payload の長さが 1 でない: got %d", i, len(lines))
		}
		if want := uint64(i + 1); lines[0].Seq != want {
			t.Errorf("%d 番目の Seq が一致しない: got %d, want %d", i, lines[0].Seq, want)
		}
	}
}

func TestStartupUsesCancelableContext(t *testing.T) {
	// Wails の ctx はキャンセルされないため、Run には自前の context を渡す。
	a, em := newTestApp()
	a.startup(context.Background())

	waitFor(t, 5*time.Second, "送出の開始", func() bool { return len(em.snapshot()) >= 1 })
	stopApp(t, a)

	after := len(em.snapshot())
	time.Sleep(500 * time.Millisecond)
	if got := len(em.snapshot()); got != after {
		t.Errorf("停止後に送出が増えた: got %d 件, want %d 件", got, after)
	}
}

func TestStartupKeepsWailsContext(t *testing.T) {
	type ctxKey struct{}
	want := context.WithValue(context.Background(), ctxKey{}, "wails")

	a, _ := newTestApp()
	a.startup(want)
	defer stopApp(t, a)

	if a.ctx != want {
		t.Errorf("Wails の ctx を保持していない: got %v, want %v", a.ctx, want)
	}
}

func TestShutdownStopsFeed(t *testing.T) {
	a, em := newTestApp()
	a.startup(context.Background())

	waitFor(t, 5*time.Second, "送出の開始", func() bool { return len(em.snapshot()) >= 1 })

	started := time.Now()
	a.shutdown(context.Background())
	elapsed := time.Since(started)

	// Run が素直に復帰する分岐。待機の上限まで粘らない。
	if elapsed >= shutdownGrace {
		t.Errorf("Run の復帰を待ちすぎている: got %v, want %v 未満", elapsed, shutdownGrace)
	}

	select {
	case <-a.done:
	default:
		t.Errorf("shutdown の復帰時点で Run が終わっていない")
	}

	after := len(em.snapshot())
	time.Sleep(500 * time.Millisecond)
	if got := len(em.snapshot()); got != after {
		t.Errorf("shutdown の後に送出が増えた: got %d 件, want %d 件", got, after)
	}
}

func TestShutdownGivesUpWaiting(t *testing.T) {
	// 復帰しない Run を模す。done を閉じないことで待機の打ち切りを検査する。
	a := NewApp()
	a.done = make(chan struct{})
	a.cancel = func() {}

	started := time.Now()
	a.shutdown(context.Background())
	elapsed := time.Since(started)

	if elapsed < shutdownGrace {
		t.Errorf("待機の上限より早く戻った: got %v, want %v 以上", elapsed, shutdownGrace)
	}
	if elapsed > 2*shutdownGrace {
		t.Errorf("待機を打ち切っていない: got %v, want %v 以下", elapsed, 2*shutdownGrace)
	}
}

func TestShutdownWithoutStartup(t *testing.T) {
	// OnStartup を経ずに呼ばれても止まらない（nil の done を待ち続けない）。
	a := NewApp()

	done := make(chan struct{})
	go func() {
		defer close(done)
		a.shutdown(context.Background())
	}()

	select {
	case <-done:
	case <-time.After(2 * shutdownGrace):
		t.Fatalf("startup を経ていない shutdown が戻らない")
	}
}

// 4.3: Snapshot は 0 件でも null にならず、呼び出しで状態を変えない。

func TestSnapshotEmptyMarshalsToEmptyArray(t *testing.T) {
	a, _ := newTestApp()
	a.logs = newLogSource(4, newSeededRand(), newScenario(time.Second, time.Second, newSeededRand(), time.Now))

	b, err := json.Marshal(a.Snapshot())
	if err != nil {
		t.Fatalf("json.Marshal が失敗した: %v", err)
	}
	want := `{"log":[],"scatter":{"seq":0,"points":[]},"commits":[],"graph":{"seq":0,"nodes":[],"edges":[]}}`
	if got := string(b); got != want {
		t.Errorf("0 件のスナップショットの JSON = %s, 期待 %s", got, want)
	}
}

func TestSnapshotWithoutStartupIsEmpty(t *testing.T) {
	// バインディングは事前条件を持たないため、startup 前の呼び出しでも落ちてはならない。
	a := NewApp()

	got := a.Snapshot()
	if got.Log == nil {
		t.Fatal("startup 前の Snapshot().Log が nil。空配列でなければならない")
	}
	if len(got.Log) != 0 {
		t.Errorf("startup 前の Snapshot().Log の件数 = %d, 期待 0", len(got.Log))
	}
	// 受け入れ基準 4.2。
	if got.Scatter.Points == nil {
		t.Fatal("startup 前の Snapshot().Scatter.Points が nil。空配列でなければならない")
	}
	if len(got.Scatter.Points) != 0 {
		t.Errorf("startup 前の Snapshot().Scatter.Points の件数 = %d, 期待 0", len(got.Scatter.Points))
	}
	if got.Scatter.Seq != 0 {
		t.Errorf("startup 前の Snapshot().Scatter.Seq = %d, 期待 0", got.Scatter.Seq)
	}
}

// 受け入れ基準 4.1・4.4: startup の後の Snapshot は点数ぶんの点を持つ。
func TestSnapshotAfterStartupHasScatterPoints(t *testing.T) {
	a, _ := newTestApp()
	a.scatter = newScatterSource(scatterPointCount, newSeededRand())
	a.scatter.Next()

	got := a.Snapshot()
	if got.Scatter.Points == nil {
		t.Fatal("Snapshot().Scatter.Points が nil")
	}
	if len(got.Scatter.Points) != scatterPointCount {
		t.Errorf("Snapshot().Scatter.Points の件数 = %d, 期待 %d", len(got.Scatter.Points), scatterPointCount)
	}
}

// 受け入れ基準 4.3: Snapshot は scatterSource の Seq と座標を変えない。
func TestSnapshotDoesNotAdvanceScatter(t *testing.T) {
	a, _ := newTestApp()
	a.scatter = newScatterSource(16, newSeededRand())
	a.scatter.Next()

	before := a.Snapshot().Scatter
	for range 3 {
		a.Snapshot()
	}
	after := a.Snapshot().Scatter

	if before.Seq != after.Seq {
		t.Errorf("Snapshot が Scatter.Seq を進めた: %d → %d", before.Seq, after.Seq)
	}
	for i := range before.Points {
		if before.Points[i] != after.Points[i] {
			t.Fatalf("Snapshot が点 %d を動かした: %+v → %+v", i, before.Points[i], after.Points[i])
		}
	}
}

func TestSnapshotReturnsAllLinesOldestFirst(t *testing.T) {
	a, _ := newTestApp()
	a.logs = newLogSource(8, newSeededRand(), newScenario(time.Second, time.Second, newSeededRand(), time.Now))
	for range 3 {
		a.logs.Next()
	}

	got := a.Snapshot().Log
	if len(got) != 3 {
		t.Fatalf("Snapshot().Log の件数 = %d, 期待 3", len(got))
	}
	for i, line := range got {
		if want := uint64(i + 1); line.Seq != want {
			t.Errorf("Snapshot().Log[%d].Seq = %d, 期待 %d(古い順)", i, line.Seq, want)
		}
	}
}

func TestSnapshotHasNoSideEffect(t *testing.T) {
	// フェーズを進めるには minHold 以上の経過が要る。now を固定して
	// 「時間が経っていないのに進んだ」場合だけを検出する。
	now := time.Now()
	sc := newScenario(time.Second, time.Second, newSeededRand(), func() time.Time { return now })

	a, _ := newTestApp()
	a.logs = newLogSource(8, newSeededRand(), sc)
	for range 3 {
		a.logs.Next()
	}

	before := a.Snapshot()
	phaseBefore := sc.Current()

	for range 5 {
		a.Snapshot()
	}

	after := a.Snapshot()
	if len(after.Log) != len(before.Log) {
		t.Errorf("連続呼び出し後の件数 = %d, 期待 %d(Snapshot は行を増やさない)", len(after.Log), len(before.Log))
	}
	if after.Log[len(after.Log)-1].Seq != before.Log[len(before.Log)-1].Seq {
		t.Errorf("連続呼び出しで Seq の最大値が %d から %d へ変化した",
			before.Log[len(before.Log)-1].Seq, after.Log[len(after.Log)-1].Seq)
	}
	if got := sc.Current(); got != phaseBefore {
		t.Errorf("連続呼び出しで scenario.Current() が %q から %q へ変化した", phaseBefore, got)
	}
}

func TestSnapshotIsCopy(t *testing.T) {
	a, _ := newTestApp()
	a.logs = newLogSource(8, newSeededRand(), newScenario(time.Second, time.Second, newSeededRand(), time.Now))
	a.logs.Next()

	got := a.Snapshot()
	got.Log[0].Text = "書き換え"

	if again := a.Snapshot(); again.Log[0].Text == "書き換え" {
		t.Error("戻り値への変更が内部へ波及した。Snapshot は別の配列を返さなければならない")
	}
}

func TestStartupIgnoresWailsContextCancel(t *testing.T) {
	// 受け入れ基準 7.1 の回帰止め。Run へ渡す context を引数の ctx から派生させると
	// このテストだけが落ちる（Wails の ctx はキャンセルされない前提が崩れても気付ける）。
	a, em := newTestApp()
	wailsCtx, cancelWails := context.WithCancel(context.Background())
	a.startup(wailsCtx)
	defer stopApp(t, a)

	waitFor(t, 5*time.Second, "送出の開始", func() bool { return len(em.snapshot()) >= 1 })

	cancelWails()
	before := len(em.snapshot())
	waitFor(t, 5*time.Second, "Wails の ctx のキャンセル後の送出", func() bool {
		return len(em.snapshot()) > before
	})
}

func TestStartupUsesSpecifiedParameters(t *testing.T) {
	// 受け入れ基準 2.3（保持 500 行）と 5.3（15 秒〜45 秒）の結線値を固定する。
	// logSource / scenario 自体のテストは小さい値で回すため、ここでしか守れない。
	if appLogCapacity != 500 {
		t.Errorf("保持上限が一致しない: got %d, want 500", appLogCapacity)
	}
	if appMinHold != 15*time.Second {
		t.Errorf("minHold が一致しない: got %v, want 15s", appMinHold)
	}
	if appMaxHold != 45*time.Second {
		t.Errorf("maxHold が一致しない: got %v, want 45s", appMaxHold)
	}
}

// 受け入れ基準 7.1・7.2: startup を経ない Snapshot も nil を返さず、
// Commits が 0 件・Graph が Seq 0 の空グラフになる。
func TestSnapshotWithoutStartupHasEmptyGraphPanels(t *testing.T) {
	a := NewApp()

	got := a.Snapshot()
	if got.Commits == nil {
		t.Fatal("startup 前の Snapshot().Commits が nil。空配列でなければならない")
	}
	if len(got.Commits) != 0 {
		t.Errorf("startup 前の Snapshot().Commits の件数 = %d, 期待 0", len(got.Commits))
	}
	if got.Graph.Nodes == nil || got.Graph.Edges == nil {
		t.Fatal("startup 前の Snapshot().Graph の Nodes / Edges が nil。空配列でなければならない")
	}
	if len(got.Graph.Nodes) != 0 || len(got.Graph.Edges) != 0 {
		t.Errorf("startup 前の Snapshot().Graph の件数 = (%d, %d), 期待 (0, 0)",
			len(got.Graph.Nodes), len(got.Graph.Edges))
	}
	if got.Graph.Seq != 0 {
		t.Errorf("startup 前の Snapshot().Graph.Seq = %d, 期待 0", got.Graph.Seq)
	}
}

// 受け入れ基準 7.4: startup の後の Snapshot はノードの揃ったグラフを返す。
func TestSnapshotAfterStartupHasGraphNodes(t *testing.T) {
	a, _ := newTestApp()
	a.graph = newGraphSource(newSeededRand())

	got := a.Snapshot()
	if len(got.Graph.Nodes) != graphNodeCount {
		t.Errorf("Snapshot().Graph.Nodes の件数 = %d, 期待 %d", len(got.Graph.Nodes), graphNodeCount)
	}
	if len(got.Graph.Edges) < len(graphCoreEdges) {
		t.Errorf("Snapshot().Graph.Edges の本数 = %d, 基幹エッジ %d 本を下回る",
			len(got.Graph.Edges), len(graphCoreEdges))
	}
}

// 受け入れ基準 7.3: Snapshot は commitSource と graphSource の内部状態を変えない。
func TestSnapshotDoesNotAdvanceGraphPanels(t *testing.T) {
	a, _ := newTestApp()
	a.commits = newCommitSource(appCommitCapacity, newSeededRand())
	a.graph = newGraphSource(newSeededRand())
	for range 3 {
		a.commits.Next()
		a.graph.Next()
	}

	before := a.Snapshot()
	for range 5 {
		a.Snapshot()
	}
	after := a.Snapshot()

	if len(before.Commits) != len(after.Commits) {
		t.Errorf("Snapshot がコミットの件数を変えた: %d → %d", len(before.Commits), len(after.Commits))
	}
	if before.Graph.Seq != after.Graph.Seq {
		t.Errorf("Snapshot が Graph.Seq を進めた: %d → %d", before.Graph.Seq, after.Graph.Seq)
	}
	for i := range before.Graph.Nodes {
		if before.Graph.Nodes[i] != after.Graph.Nodes[i] {
			t.Fatalf("Snapshot がノード %d を動かした: %+v → %+v", i, before.Graph.Nodes[i], after.Graph.Nodes[i])
		}
	}
}

// 受け入れ基準 7.1: Snapshot が返すコミットは古い順で、内部と別の配列である。
func TestSnapshotCommitsAreOldestFirstCopy(t *testing.T) {
	a, _ := newTestApp()
	a.commits = newCommitSource(appCommitCapacity, newSeededRand())
	for range 4 {
		a.commits.Next()
	}

	got := a.Snapshot().Commits
	if len(got) != 4 {
		t.Fatalf("Snapshot().Commits の件数 = %d, 期待 4", len(got))
	}
	for i, c := range got {
		if c.Seq != uint64(i+1) {
			t.Errorf("Snapshot().Commits[%d].Seq = %d, 期待 %d(古い順)", i, c.Seq, i+1)
		}
	}

	got[0].Summary = "書き換え"
	if again := a.Snapshot().Commits; again[0].Summary == "書き換え" {
		t.Error("Snapshot が内部の配列を共有している")
	}
}

// 受け入れ基準 12.1: 生成器の結線値を固定する。
//
// commitSource / graphSource 自体のテストは小さい値で回すため、ここでしか守れない。
func TestStartupUsesSpecifiedGraphPanelParameters(t *testing.T) {
	if appCommitCapacity != 120 {
		t.Errorf("コミットの保持上限が一致しない: got %d, want 120", appCommitCapacity)
	}
	if graphNodeCount != 10 {
		t.Errorf("ノード数が一致しない: got %d, want 10", graphNodeCount)
	}
}
