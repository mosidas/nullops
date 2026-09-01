package feed

import (
	"errors"
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

func TestNewRunnerAcceptsValidArguments(t *testing.T) {
	r, err := NewRunner(&fakeEmitter{}, newFakeSource("a", time.Millisecond), newFakeSource("b", time.Millisecond))
	if err != nil {
		t.Fatalf("事前条件を満たすのに error を返した: %v", err)
	}
	if r == nil {
		t.Fatalf("事前条件を満たすのに nil の Runner を返した")
	}
}

func TestNewRunnerPreconditionViolation(t *testing.T) {
	tests := []struct {
		name    string
		emitter Emitter
		sources []Source
		want    error
	}{
		{
			name:    "Emitter が nil",
			emitter: nil,
			sources: []Source{newFakeSource("a", time.Millisecond)},
			want:    ErrNilEmitter,
		},
		{
			name:    "Source が 0 個",
			emitter: &fakeEmitter{},
			sources: nil,
			want:    ErrNoSource,
		},
		{
			name:    "EventName が空文字",
			emitter: &fakeEmitter{},
			sources: []Source{newFakeSource("", time.Millisecond)},
			want:    ErrEmptyEventName,
		},
		{
			name:    "EventName が重複",
			emitter: &fakeEmitter{},
			sources: []Source{newFakeSource("a", time.Millisecond), newFakeSource("a", time.Millisecond)},
			want:    ErrDuplicateEventName,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// 事前条件違反で panic しないこと（検査は error で返す）。
			defer func() {
				if v := recover(); v != nil {
					t.Fatalf("事前条件違反で panic した: %v", v)
				}
			}()

			r, err := NewRunner(tt.emitter, tt.sources...)
			if r != nil {
				t.Errorf("事前条件違反なのに非 nil の Runner を返した")
			}
			if !errors.Is(err, tt.want) {
				t.Errorf("error が一致しない: got %v, want %v", err, tt.want)
			}
		})
	}
}

func TestNewRunnerCopiesSources(t *testing.T) {
	sources := []Source{newFakeSource("a", time.Millisecond)}
	r, err := NewRunner(&fakeEmitter{}, sources...)
	if err != nil {
		t.Fatalf("NewRunner が error を返した: %v", err)
	}

	sources[0] = newFakeSource("mutated", time.Millisecond)
	if got := r.sources[0].EventName(); got != "a" {
		t.Errorf("呼び出し側の書き換えが Runner へ波及した: got %q, want %q", got, "a")
	}
}
