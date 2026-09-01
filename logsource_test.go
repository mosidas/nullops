package main

import (
	"math/rand"
	"sync"
	"testing"
	"time"
	"unicode"
)

// newTestLogSource は固定 seed の生成器を作る。scenario は build のまま止まる。
func newTestLogSource(t *testing.T, capacity int) *logSource {
	t.Helper()

	clk := newTestClock()
	sc := newScenario(testMinHold, testMaxHold, newTestRand(), clk.now)
	return newLogSource(capacity, rand.New(rand.NewSource(34)), sc)
}

// nextLine は Next() の戻り値が長さ 1 の []LogLine であることを確かめて 1 行を取り出す。
func nextLine(t *testing.T, s *logSource) LogLine {
	t.Helper()

	got := s.Next()
	lines, ok := got.([]LogLine)
	if !ok {
		t.Fatalf("Next の戻り値が []LogLine でない: got %T", got)
	}
	if len(lines) != 1 {
		t.Fatalf("Next の戻り値の長さが 1 でない: got %d", len(lines))
	}
	return lines[0]
}

func TestLogSourceEventNameIsStable(t *testing.T) {
	s := newTestLogSource(t, 10)

	const want = "nullops:log"
	for range 3 {
		if got := s.EventName(); got != want {
			t.Fatalf("EventName が一致しない: got %q, want %q", got, want)
		}
	}
}

func TestLogSourceIntervalWithinRange(t *testing.T) {
	s := newTestLogSource(t, 10)

	seen := make(map[time.Duration]bool)
	for range 200 {
		got := s.Interval()
		if got < 80*time.Millisecond || got > 400*time.Millisecond {
			t.Fatalf("Interval が範囲外: got %v, want [80ms, 400ms]", got)
		}
		seen[got] = true
	}
	if len(seen) < 2 {
		t.Errorf("Interval が固定値になっている: got %v", seen)
	}
}

func TestLogSourceSeqStartsAtOneAndIncrements(t *testing.T) {
	s := newTestLogSource(t, 10)

	for i := uint64(1); i <= 20; i++ {
		if got := nextLine(t, s).Seq; got != i {
			t.Fatalf("Seq が 1 から 1 ずつ増えていない: got %d, want %d", got, i)
		}
	}
}

func TestLogSourceLineSatisfiesInvariants(t *testing.T) {
	s := newTestLogSource(t, 10)

	for range 200 {
		line := nextLine(t, s)
		if _, err := newLogLine(line.Seq, line.AtMs, line.Tool, line.Phase, line.Level, line.Text); err != nil {
			t.Fatalf("生成した行が不変条件を満たさない: %+v: %v", line, err)
		}
	}
}

func TestLogSourceUsesCurrentPhase(t *testing.T) {
	// 保持時間を固定し、フェーズの切り替えを試験側から起こす。
	const hold = testMinHold

	clk := newTestClock()
	sc := newScenario(hold, hold, newTestRand(), clk.now)
	s := newLogSource(10, rand.New(rand.NewSource(34)), sc)

	want := []Phase{PhaseBuild, PhaseTest, PhaseDeploy, PhaseScan, PhaseBuild}
	for i, phase := range want {
		if got := nextLine(t, s).Phase; got != phase {
			t.Fatalf("%d 番目の行のフェーズが scenario と一致しない: got %q, want %q", i, got, phase)
		}
		clk.advance(hold)
	}
}

func TestLogSourceNextUsesPhaseCandidates(t *testing.T) {
	const hold = testMinHold

	clk := newTestClock()
	sc := newScenario(hold, hold, newTestRand(), clk.now)
	s := newLogSource(10, rand.New(rand.NewSource(56)), sc)

	// 4 フェーズを 1 巡し、どの行もその時点のフェーズの候補集合から来ていることを確かめる。
	for range 4 {
		for range 20 {
			line := nextLine(t, s)
			if !inCandidates(logCandidates[line.Phase], line) {
				t.Fatalf("フェーズ %q の候補集合に無い行を生成した: %+v", line.Phase, line)
			}
		}
		clk.advance(hold)
	}
}

func inCandidates(candidates []logCandidate, line LogLine) bool {
	for _, c := range candidates {
		if c.tool == line.Tool && c.level == line.Level && c.text == line.Text {
			return true
		}
	}
	return false
}

func TestLogCandidatesSatisfyLogLineInvariants(t *testing.T) {
	phases := []Phase{PhaseBuild, PhaseTest, PhaseDeploy, PhaseScan}
	for _, phase := range phases {
		candidates, ok := logCandidates[phase]
		if !ok || len(candidates) == 0 {
			t.Fatalf("フェーズ %q の候補集合が無い", phase)
		}
		for i, c := range candidates {
			// Seq は logSource が採番するため、ここでは 1 を置いて残りの不変条件を検査する。
			if _, err := newLogLine(1, 0, c.tool, phase, c.level, c.text); err != nil {
				t.Errorf("フェーズ %q の候補 %d が不変条件を破る: %+v: %v", phase, i, c, err)
			}
			if r, ok := asciiOnly(c.text); !ok {
				t.Errorf("フェーズ %q の候補 %d の Text が ASCII でない: %q に %q", phase, i, c.text, string(r))
			}
			if r, ok := asciiOnly(c.tool); !ok {
				t.Errorf("フェーズ %q の候補 %d の Tool が ASCII でない: %q に %q", phase, i, c.tool, string(r))
			}
		}
	}
}

// asciiOnly は印字可能な ASCII だけで構成されるかを返し、違反していれば
// 最初に見つけた文字を添える。画面へ出す擬似ログは英語にする（CLAUDE.md 言語規約）。
func asciiOnly(s string) (rune, bool) {
	for _, r := range s {
		if r > unicode.MaxASCII || !unicode.IsPrint(r) {
			return r, false
		}
	}
	return 0, true
}

func TestLogCandidatesDifferPerPhase(t *testing.T) {
	owner := make(map[string]Phase)
	for _, phase := range []Phase{PhaseBuild, PhaseTest, PhaseDeploy, PhaseScan} {
		for _, c := range logCandidates[phase] {
			if prev, ok := owner[c.text]; ok {
				t.Errorf("Text %q がフェーズ %q と %q で重複している", c.text, prev, phase)
				continue
			}
			owner[c.text] = phase
		}
	}
}

func TestLogSourceIsConcurrencySafe(t *testing.T) {
	s := newTestLogSource(t, 10)

	const goroutines = 8
	const calls = 50

	var mu sync.Mutex
	seen := make(map[uint64]bool, goroutines*calls)

	var wg sync.WaitGroup
	wg.Add(goroutines)
	for range goroutines {
		go func() {
			defer wg.Done()
			for range calls {
				s.Interval()
				lines, ok := s.Next().([]LogLine)
				if !ok || len(lines) != 1 {
					t.Errorf("Next の戻り値が長さ 1 の []LogLine でない: %#v", lines)
					return
				}
				mu.Lock()
				if seen[lines[0].Seq] {
					t.Errorf("Seq が重複した: got %d", lines[0].Seq)
				}
				seen[lines[0].Seq] = true
				mu.Unlock()
			}
		}()
	}
	wg.Wait()

	for i := uint64(1); i <= goroutines*calls; i++ {
		if !seen[i] {
			t.Fatalf("Seq に欠番がある: %d", i)
		}
	}
}

func TestNewLogSourcePreconditionViolation(t *testing.T) {
	clk := newTestClock()
	sc := newScenario(testMinHold, testMaxHold, newTestRand(), clk.now)

	tests := []struct {
		name     string
		capacity int
		rnd      *rand.Rand
		sc       *scenario
	}{
		{name: "capacity が 0", capacity: 0, rnd: newTestRand(), sc: sc},
		{name: "capacity が負", capacity: -1, rnd: newTestRand(), sc: sc},
		{name: "rnd が nil", capacity: 1, rnd: nil, sc: sc},
		{name: "sc が nil", capacity: 1, rnd: newTestRand(), sc: nil},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			defer func() {
				if recover() == nil {
					t.Errorf("事前条件違反なのに panic しなかった")
				}
			}()
			newLogSource(tt.capacity, tt.rnd, tt.sc)
		})
	}
}

func TestLogSourceSnapshotIsEmptyBeforeNext(t *testing.T) {
	s := newTestLogSource(t, 5)

	got := s.Snapshot()
	if got == nil {
		t.Fatalf("Snapshot が nil を返した")
	}
	if len(got) != 0 {
		t.Errorf("Next を呼ぶ前の Snapshot が空でない: got %d 件", len(got))
	}
}

func TestLogSourceSnapshotKeepsInsertionOrder(t *testing.T) {
	const capacity = 5
	s := newTestLogSource(t, capacity)

	for range 3 {
		nextLine(t, s)
	}

	got := s.Snapshot()
	if len(got) != 3 {
		t.Fatalf("保持件数が一致しない: got %d, want 3", len(got))
	}
	for i, line := range got {
		if want := uint64(i + 1); line.Seq != want {
			t.Errorf("%d 番目の Seq が古い順に並んでいない: got %d, want %d", i, line.Seq, want)
		}
	}
}

func TestLogSourceDropsOldestBeyondCapacity(t *testing.T) {
	const capacity = 5
	s := newTestLogSource(t, capacity)

	// 上限をひと巡り以上超えて生成し、最古の行から捨てられることを確かめる。
	const generated = capacity*2 + 3
	for range generated {
		nextLine(t, s)
	}

	got := s.Snapshot()
	if len(got) != capacity {
		t.Fatalf("保持件数が上限を超えた: got %d, want %d", len(got), capacity)
	}
	for i, line := range got {
		if want := uint64(generated - capacity + i + 1); line.Seq != want {
			t.Errorf("%d 番目の Seq が一致しない: got %d, want %d", i, line.Seq, want)
		}
	}
}

func TestLogSourceSnapshotIsCopy(t *testing.T) {
	s := newTestLogSource(t, 5)
	for range 3 {
		nextLine(t, s)
	}

	first := s.Snapshot()
	first[0].Text = "mutated"
	first[0].Seq = 9999

	second := s.Snapshot()
	if second[0].Text == "mutated" || second[0].Seq == 9999 {
		t.Errorf("Snapshot の変更が内部へ波及した: got %+v", second[0])
	}
}

func TestLogSourceSnapshotIsConcurrencySafe(t *testing.T) {
	s := newTestLogSource(t, 8)

	var wg sync.WaitGroup
	wg.Add(2)
	go func() {
		defer wg.Done()
		for range 200 {
			nextLine(t, s)
		}
	}()
	go func() {
		defer wg.Done()
		for range 200 {
			for i, line := range s.Snapshot() {
				if i > 0 && line.Seq == 0 {
					t.Errorf("Snapshot が未初期化の行を返した: %+v", line)
					return
				}
			}
		}
	}()
	wg.Wait()
}
