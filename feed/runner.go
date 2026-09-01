package feed

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"time"
)

// 事前条件違反。
//
// 単一の error に束ねないのは、呼び出し側とテストが errors.Is で
// どの事前条件を破ったかを特定できるようにするため。
var (
	ErrNilEmitter         = errors.New("feed: Emitter は nil であってはならない")
	ErrNoSource           = errors.New("feed: Source は 1 個以上でなければならない")
	ErrEmptyEventName     = errors.New("feed: Source の EventName は空文字であってはならない")
	ErrDuplicateEventName = errors.New("feed: Source の EventName が重複している")
)

// minInterval は Source の待ち時間の下限。
const minInterval = time.Millisecond

// Runner は登録された Source を各自の間隔で回し、Emitter へ送る。
type Runner struct {
	emitter Emitter
	sources []Source
}

// NewRunner は Source を登録した Runner を作る。
//
// 事前条件は emitter が nil でないこと、sources が 1 個以上であること、
// 各 EventName() が空文字でなく互いに重複しないこと。
// 違反は起動時の静的な誤りだが、テストから検査できる形にするため
// panic ではなく nil の Runner と error で返す。
func NewRunner(emitter Emitter, sources ...Source) (*Runner, error) {
	if emitter == nil {
		return nil, ErrNilEmitter
	}
	if len(sources) == 0 {
		return nil, ErrNoSource
	}

	seen := make(map[string]struct{}, len(sources))
	for i, src := range sources {
		name := src.EventName()
		if name == "" {
			return nil, fmt.Errorf("%w: %d 番目の Source", ErrEmptyEventName, i)
		}
		if _, ok := seen[name]; ok {
			return nil, fmt.Errorf("%w: %q", ErrDuplicateEventName, name)
		}
		seen[name] = struct{}{}
	}

	// 呼び出し側が可変長引数へ渡したスライスを後から書き換えても影響しないよう複製する。
	return &Runner{emitter: emitter, sources: append([]Source(nil), sources...)}, nil
}

// Run は登録された Source を各自の間隔で回し、ctx がキャンセルされるまで送り続ける。
//
// Source ごとに独立したゴルーチンを割り当てるのは、ある Source の間隔が
// 他の Source の送信周期に影響しないようにするため。
//
// 事前条件は ctx が nil でないこと、同一の Runner に対して 2 回以上呼ばないこと。
// ctx.Done() が閉じた後、起動した全ゴルーチンの終了を待ってから戻る。
func (r *Runner) Run(ctx context.Context) {
	var wg sync.WaitGroup
	wg.Add(len(r.sources))
	for _, src := range r.sources {
		go func() {
			defer wg.Done()
			r.loop(ctx, src)
		}()
	}
	wg.Wait()
}

// loop は 1 つの Source を回す。
func (r *Runner) loop(ctx context.Context, src Source) {
	// タイマーは 1 本を Reset で使い回す。送信のたびに time.After を呼ぶと
	// 高頻度(最短 80 ms)の周期でタイマーを作り続けることになるため。
	timer := time.NewTimer(waitOf(src))
	defer timer.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-timer.C:
		}

		// select は両方が受信可能なとき無作為に選ぶため、待ち時間が尽きたのと
		// ほぼ同時にキャンセルされた場合に timer.C 側へ倒れうる。ここで
		// もう一度検査して、キャンセル後に Emit を新たに開始しないようにする。
		if ctx.Err() != nil {
			return
		}

		r.emitter.Emit(src.EventName(), src.Next())
		timer.Reset(waitOf(src))
	}
}

// waitOf は Source の次の待ち時間を返す。
//
// Interval() の事後条件は 1 ミリ秒以上だが、違反した Source を登録されても
// ビジーループに陥らないよう 1 ミリ秒で下限を切る。Runner は Source の実装を
// 選べないため、事後条件違反を検知して落とすより回り続ける方が害が小さい。
func waitOf(src Source) time.Duration {
	if d := src.Interval(); d > minInterval {
		return d
	}
	return minInterval
}
