package main

import (
	"context"
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
	waitFor(t, 5*time.Second, "3 件の送出", func() bool { return len(em.snapshot()) >= 3 })

	for i, c := range em.snapshot() {
		if c.eventName != logEventName {
			t.Fatalf("%d 番目のイベント名が一致しない: got %q, want %q", i, c.eventName, logEventName)
		}
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
