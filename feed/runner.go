package feed

import (
	"errors"
	"fmt"
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
