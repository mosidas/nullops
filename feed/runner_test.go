package feed

import (
	"sync"
	"testing"
	"time"
)

// fakeEmitter は送信を記録する擬似 Emitter。Wails ランタイムを起動せずに検査する。
type fakeEmitter struct {
	mu    sync.Mutex
	calls []emitCall
}

type emitCall struct {
	eventName string
	payload   any
}

func (e *fakeEmitter) Emit(eventName string, payload any) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.calls = append(e.calls, emitCall{eventName: eventName, payload: payload})
}

// snapshot は記録した送信のコピーを返す。
func (e *fakeEmitter) snapshot() []emitCall {
	e.mu.Lock()
	defer e.mu.Unlock()
	return append([]emitCall(nil), e.calls...)
}

// countOf はイベント名ごとの送信回数を返す。
func (e *fakeEmitter) countOf(eventName string) int {
	n := 0
	for _, c := range e.snapshot() {
		if c.eventName == eventName {
			n++
		}
	}
	return n
}

// fakeSource は固定の間隔と連番の値を返す擬似 Source。
type fakeSource struct {
	eventName string
	interval  time.Duration

	mu sync.Mutex
	n  int
}

func newFakeSource(eventName string, interval time.Duration) *fakeSource {
	return &fakeSource{eventName: eventName, interval: interval}
}

func (s *fakeSource) EventName() string { return s.eventName }

func (s *fakeSource) Interval() time.Duration { return s.interval }

func (s *fakeSource) Next() any {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.n++
	return s.n
}

// nextCount は Next が呼ばれた回数を返す。
func (s *fakeSource) nextCount() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.n
}

func TestFakesSatisfyInterfaces(t *testing.T) {
	// Wails ランタイム無しで feed のテストが成立することを、
	// 擬似実装がインターフェースを満たす形で示す。
	var _ Emitter = (*fakeEmitter)(nil)
	var _ Source = (*fakeSource)(nil)

	em := &fakeEmitter{}
	src := newFakeSource("test:event", time.Millisecond)

	em.Emit(src.EventName(), src.Next())

	got := em.snapshot()
	if len(got) != 1 {
		t.Fatalf("記録件数が一致しない: got %d, want 1", len(got))
	}
	if got[0].eventName != "test:event" {
		t.Errorf("イベント名が一致しない: got %q, want %q", got[0].eventName, "test:event")
	}
	if got[0].payload != 1 {
		t.Errorf("payload が一致しない: got %v, want 1", got[0].payload)
	}
	if src.nextCount() != 1 {
		t.Errorf("Next の呼び出し回数が一致しない: got %d, want 1", src.nextCount())
	}
}
