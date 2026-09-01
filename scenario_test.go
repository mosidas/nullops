package main

import (
	"math/rand"
	"runtime"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

const (
	testMinHold = 15 * time.Second
	testMaxHold = 45 * time.Second
	// 遷移時刻の検出粒度。保持時間の下限より十分に細かくとる。
	testStep = 100 * time.Millisecond
)

var testBase = time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)

// testClock は注入する時刻を試験側から進めるためのクロック。
type testClock struct {
	t time.Time
}

func newTestClock() *testClock {
	return &testClock{t: testBase}
}

func (c *testClock) now() time.Time {
	return c.t
}

func (c *testClock) advance(d time.Duration) {
	c.t = c.t.Add(d)
}

func newTestRand() *rand.Rand {
	return rand.New(rand.NewSource(12))
}

// transition は検出したフェーズの切り替わりを表す。
type transition struct {
	phase Phase
	at    time.Time
}

// collectTransitions は clock を testStep 刻みで進めながら Current() を呼び、
// フェーズが切り替わった時刻を count 件集める。
func collectTransitions(t *testing.T, sc *scenario, clk *testClock, count int) []transition {
	t.Helper()

	prev := sc.Current()
	got := make([]transition, 0, count)
	maxSteps := (count + 1) * int((testMaxHold+testStep)/testStep)
	for i := 0; i < maxSteps && len(got) < count; i++ {
		clk.advance(testStep)
		cur := sc.Current()
		if cur != prev {
			got = append(got, transition{phase: cur, at: clk.now()})
			prev = cur
		}
	}
	if len(got) < count {
		t.Fatalf("遷移が %d 件に届かなかった: got %d 件", count, len(got))
	}
	return got
}

func TestNewScenarioStartsAtBuild(t *testing.T) {
	clk := newTestClock()
	sc := newScenario(testMinHold, testMaxHold, newTestRand(), clk.now)

	if got := sc.Current(); got != PhaseBuild {
		t.Fatalf("生成直後のフェーズが build でない: got %q", got)
	}

	// 保持時間の下限に達するまでは build のまま。
	clk.advance(testMinHold - time.Nanosecond)
	if got := sc.Current(); got != PhaseBuild {
		t.Errorf("保持時間の下限より前でフェーズが変わった: got %q", got)
	}
}

func TestScenarioAdvancesInOrder(t *testing.T) {
	clk := newTestClock()
	sc := newScenario(testMinHold, testMaxHold, newTestRand(), clk.now)

	got := collectTransitions(t, sc, clk, 5)
	want := []Phase{PhaseTest, PhaseDeploy, PhaseScan, PhaseBuild, PhaseTest}
	for i, tr := range got {
		if tr.phase != want[i] {
			t.Errorf("%d 番目の遷移先が一致しない: got %q, want %q", i, tr.phase, want[i])
		}
	}
}

func TestScenarioAdvancesMultipleStepsInOneCall(t *testing.T) {
	// 保持時間を固定して、飛ばした時間から進む段数を決定的に決める。
	const hold = testMinHold

	tests := []struct {
		name string
		skip time.Duration
		want Phase
	}{
		{name: "3 段分", skip: 3*hold + hold/2, want: PhaseScan},
		{name: "1 巡を超える 6 段分", skip: 6*hold + hold/2, want: PhaseDeploy},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			clk := newTestClock()
			sc := newScenario(hold, hold, newTestRand(), clk.now)

			clk.advance(tt.skip)
			if got := sc.Current(); got != tt.want {
				t.Errorf("経過した数だけ進んでいない: got %q, want %q", got, tt.want)
			}
		})
	}
}

func TestScenarioSkipMatchesStepwise(t *testing.T) {
	// 保持時間が可変でも、1 回で飛ばした結果と細かく刻んだ結果は一致する。
	const total = 4 * testMaxHold

	stepwiseClk := newTestClock()
	stepwise := newScenario(testMinHold, testMaxHold, newTestRand(), stepwiseClk.now)
	for elapsed := time.Duration(0); elapsed < total; elapsed += testStep {
		stepwiseClk.advance(testStep)
		stepwise.Current()
	}

	skipClk := newTestClock()
	skip := newScenario(testMinHold, testMaxHold, newTestRand(), skipClk.now)
	skipClk.advance(stepwiseClk.now().Sub(testBase))

	if got, want := skip.Current(), stepwise.Current(); got != want {
		t.Errorf("一度に飛ばした結果が刻んだ結果と一致しない: got %q, want %q", got, want)
	}
}

func TestScenarioHoldsWithinRange(t *testing.T) {
	clk := newTestClock()
	sc := newScenario(testMinHold, testMaxHold, newTestRand(), clk.now)

	got := collectTransitions(t, sc, clk, 6)

	prev := testBase
	holds := make([]time.Duration, 0, len(got))
	for _, tr := range got {
		holds = append(holds, tr.at.Sub(prev))
		prev = tr.at
	}

	// 検出は testStep 刻みのため、真の保持時間との差は testStep 未満。
	for i, hold := range holds {
		if hold <= testMinHold-testStep || hold >= testMaxHold+testStep {
			t.Errorf("%d 番目の保持時間が範囲外: got %v, want [%v, %v]", i, hold, testMinHold, testMaxHold)
		}
	}

	redrawn := false
	for _, hold := range holds[1:] {
		if absDuration(hold-holds[0]) > 2*testStep {
			redrawn = true
			break
		}
	}
	if !redrawn {
		t.Errorf("切り替えのたびに保持時間を引き直していない: got %v", holds)
	}
}

func TestScenarioDeterministicWithSameSeed(t *testing.T) {
	transitionsOf := func() []transition {
		clk := newTestClock()
		sc := newScenario(testMinHold, testMaxHold, newTestRand(), clk.now)
		return collectTransitions(t, sc, clk, 5)
	}

	first := transitionsOf()
	second := transitionsOf()
	for i := range first {
		if first[i] != second[i] {
			t.Errorf("同じ seed で遷移が一致しない: %d 番目 got %+v, want %+v", i, second[i], first[i])
		}
	}
}

func TestScenarioCurrentIsConcurrencySafe(t *testing.T) {
	// 呼び出しごとに時刻が進むクロック。遷移と乱数の引き直しを並行に起こす。
	var ticks int64
	now := func() time.Time {
		return testBase.Add(time.Duration(atomic.AddInt64(&ticks, 1)) * time.Second)
	}
	sc := newScenario(testMinHold, testMaxHold, newTestRand(), now)

	const goroutines = 8
	const calls = 200
	var wg sync.WaitGroup
	wg.Add(goroutines)
	for range goroutines {
		go func() {
			defer wg.Done()
			for range calls {
				if got := sc.Current(); !got.valid() {
					t.Errorf("定義済みでない Phase を返した: got %q", got)
					return
				}
			}
		}()
	}
	wg.Wait()
}

func TestScenarioStartsNoGoroutine(t *testing.T) {
	before := runtime.NumGoroutine()

	clk := newTestClock()
	sc := newScenario(testMinHold, testMaxHold, newTestRand(), clk.now)
	collectTransitions(t, sc, clk, 4)

	if after := runtime.NumGoroutine(); after > before {
		t.Errorf("ゴルーチンが増えた: got %d, want %d 以下", after, before)
	}
}

func TestNewScenarioPreconditionViolation(t *testing.T) {
	clk := newTestClock()
	tests := []struct {
		name    string
		minHold time.Duration
		maxHold time.Duration
		rnd     *rand.Rand
		now     func() time.Time
	}{
		{name: "minHold が 0", minHold: 0, maxHold: testMaxHold, rnd: newTestRand(), now: clk.now},
		{name: "minHold が負", minHold: -time.Second, maxHold: testMaxHold, rnd: newTestRand(), now: clk.now},
		{name: "maxHold が minHold 未満", minHold: testMaxHold, maxHold: testMinHold, rnd: newTestRand(), now: clk.now},
		{name: "rnd が nil", minHold: testMinHold, maxHold: testMaxHold, rnd: nil, now: clk.now},
		{name: "now が nil", minHold: testMinHold, maxHold: testMaxHold, rnd: newTestRand(), now: nil},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			defer func() {
				if recover() == nil {
					t.Errorf("事前条件違反なのに panic しなかった")
				}
			}()
			newScenario(tt.minHold, tt.maxHold, tt.rnd, tt.now)
		})
	}
}

func TestNewScenarioAcceptsEqualBounds(t *testing.T) {
	clk := newTestClock()
	sc := newScenario(testMinHold, testMinHold, newTestRand(), clk.now)

	got := collectTransitions(t, sc, clk, 3)
	prev := testBase
	for i, tr := range got {
		hold := tr.at.Sub(prev)
		if hold <= testMinHold-testStep || hold >= testMinHold+testStep {
			t.Errorf("%d 番目の保持時間が minHold と一致しない: got %v, want %v", i, hold, testMinHold)
		}
		prev = tr.at
	}
}

func absDuration(d time.Duration) time.Duration {
	if d < 0 {
		return -d
	}
	return d
}
