package main

import (
	"context"
	"math/rand"
	"time"

	"nullops/feed"
)

// 擬似的な作業フェーズの保持時間の範囲。
const (
	appMinHold = 15 * time.Second
	appMaxHold = 45 * time.Second
)

// appLogCapacity は保持するログ行の上限。
const appLogCapacity = 500

// shutdownGrace は終了時に Run の復帰を待つ上限。
const shutdownGrace = time.Second

// App はアプリのライフサイクルを持ち、Wails のバインディング対象になる。
type App struct {
	ctx    context.Context    // Wails の ctx。EventsEmit に渡す
	cancel context.CancelFunc // 自前の ctx を止める
	done   chan struct{}      // Runner の終了を待つ

	logs    *logSource
	scatter *scatterSource

	// newEmitter は送信先の Emitter を作る。
	//
	// Wails ランタイムを起動せずにテストできるようにするための接合点であり、
	// 既定は runtime.EventsEmit へ委譲する実装。
	newEmitter func(ctx context.Context) feed.Emitter
}

// NewApp は App を作る。
func NewApp() *App {
	return &App{newEmitter: newWailsEmitter}
}

// startup はアプリの起動時に呼ばれ、擬似データの生成と送出を開始する。
//
// Run に渡す context を引数の ctx から派生させず context.Background() から作るのは、
// Wails v2.13.0 が OnStartup へ渡す context がキャンセルされないため。
// この ctx を待つゴルーチンはウィンドウを閉じても止まらない。
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx

	// scenario・logSource・scatterSource は別々の mutex で自身を守るため、*rand.Rand を共有しない。
	sc := newScenario(appMinHold, appMaxHold, newSeededRand(), time.Now)
	a.logs = newLogSource(appLogCapacity, newSeededRand(), sc)
	a.scatter = newScatterSource(scatterPointCount, newSeededRand())

	runner, err := feed.NewRunner(a.newEmitter(ctx), a.logs, a.scatter)
	if err != nil {
		// 事前条件はこの呼び出し位置で静的に満たされる。到達はプログラマの誤り。
		panic("feed.NewRunner の事前条件を満たしていない: " + err.Error())
	}

	runCtx, cancel := context.WithCancel(context.Background())
	a.cancel = cancel
	a.done = make(chan struct{})
	go func() {
		defer close(a.done)
		runner.Run(runCtx)
	}()
}

// newSeededRand は生成器ごとに独立した *rand.Rand を作る。
//
// 種は math/rand のグローバル生成器（Go 1.20 以降は自動で種が入る）から取る。
// 画面に出る擬似データの見え方が起動ごとに変わればよく、暗号強度は要らない。
//
// math/rand/v2 を使わないのは、Wails v2.13.0 の bindings 生成が
// `internal error: package "math/rand/v2" without types was imported` で
// 失敗し、wails build が通らないため（wails generate module では再現しない）。
func newSeededRand() *rand.Rand {
	return rand.New(rand.NewSource(rand.Int63()))
}

// domReady is called after front-end resources have been loaded
func (a App) domReady(ctx context.Context) {
	// Add your action here
}

// beforeClose is called when the application is about to quit,
// either by clicking the window close button or calling runtime.Quit.
// Returning true will cause the application to continue, false will continue shutdown as normal.
func (a *App) beforeClose(ctx context.Context) (prevent bool) {
	return false
}

// shutdown はアプリの終了時に呼ばれ、擬似データの送出を止める。
//
// 自前の context をキャンセルし、Run の復帰を最大 shutdownGrace だけ待つ。
// 待機に上限を設けるのは、生成器の不具合でウィンドウが閉じなくなる事態を避けるため。
// 打ち切っても送出が残らないのは、Runner がキャンセル後に Emit を新たに
// 開始しないと保証しているためである(spec.md §5.3)。
func (a *App) shutdown(ctx context.Context) {
	if a.cancel == nil {
		// startup を経ずに呼ばれた場合。止めるものが無い。
		return
	}

	a.cancel()
	select {
	case <-a.done:
	case <-time.After(shutdownGrace):
	}
}

// Snapshot は呼び出し時点のダッシュボードの内容を返す。
//
// 呼び出しによって logSource と scenario の状態は変化しない(spec.md §5.4)。
// startup を経ずに呼ばれても error にせず空のスナップショットを返す。
// バインディングは事前条件を持たない(いつ・何回呼んでもよい)ためである。
// 生成器ごとに nil を個別に見るのは、テストが片方だけを差し替えて呼ぶため。
func (a *App) Snapshot() DashboardSnapshot {
	snapshot := DashboardSnapshot{
		Log:     []LogLine{},
		Scatter: ScatterCloud{Points: []ScatterPoint{}},
	}
	if a.logs != nil {
		snapshot.Log = a.logs.Snapshot()
	}
	if a.scatter != nil {
		snapshot.Scatter = a.scatter.Snapshot()
	}
	return snapshot
}
