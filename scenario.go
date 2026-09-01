package main

import (
	"math/rand/v2"
	"sync"
	"time"
)

// scenario は擬似的な作業フェーズの巡回を保持する。
//
// フェーズを進める専用のゴルーチンは持たない。専用のゴルーチンを立てると
// アプリ終了時の停止待ち合わせの対象から外れるため、Current の中で
// 経過を検査して遅延で進める。
type scenario struct {
	mu       sync.Mutex
	phase    Phase
	holdEnds time.Time // 現在のフェーズを保つ期限

	minHold time.Duration
	maxHold time.Duration
	rnd     *rand.Rand
	now     func() time.Time
}

// newScenario は build から始まる scenario を作る。
//
// 事前条件は 0 < minHold <= maxHold、rnd と now が nil でないこと。
// 違反は呼び出し側の誤りであり、戻り値に error 経路を持たないため panic する。
// rnd は scenario 専用のインスタンスを渡す。*rand.Rand は並行安全でなく、
// 他の利用者と共有すると scenario の mutex では保護しきれない。
func newScenario(minHold, maxHold time.Duration, rnd *rand.Rand, now func() time.Time) *scenario {
	if minHold <= 0 {
		panic("newScenario の minHold は正の値でなければならない")
	}
	if maxHold < minHold {
		panic("newScenario の maxHold は minHold 以上でなければならない")
	}
	if rnd == nil {
		panic("newScenario の rnd は nil であってはならない")
	}
	if now == nil {
		panic("newScenario の now は nil であってはならない")
	}

	s := &scenario{
		phase:   PhaseBuild,
		minHold: minHold,
		maxHold: maxHold,
		rnd:     rnd,
		now:     now,
	}
	s.holdEnds = now().Add(s.randomHold())
	return s
}

// Current は現在のフェーズを返す。
//
// 呼び出し時点で現在のフェーズの保持時間が経過していれば、
// build → test → deploy → scan → build の順に進めてから返す。
// 複数のゴルーチンから安全に呼べる。
func (s *scenario) Current() Phase {
	s.mu.Lock()
	defer s.mu.Unlock()

	if !s.now().Before(s.holdEnds) {
		s.advance()
	}
	return s.phase
}

// advance はフェーズを 1 段進め、次の保持時間を引き直す。呼び出し側で mu を保持すること。
//
// 期限を now() ではなく直前の期限に積み上げるのは、経過した保持時間の数だけ
// 進める場合に、進めた回数と経過時間がずれないようにするため。
func (s *scenario) advance() {
	s.phase = nextPhase(s.phase)
	s.holdEnds = s.holdEnds.Add(s.randomHold())
}

// randomHold は [minHold, maxHold] の一様乱数を返す。呼び出し側で mu を保持すること。
func (s *scenario) randomHold() time.Duration {
	// 上限を含む閉区間にするため、半開区間の幅へ 1 を足す。
	return s.minHold + time.Duration(s.rnd.Int64N(int64(s.maxHold-s.minHold)+1))
}

// nextPhase は巡回順の次のフェーズを返す。
//
// 未定義の値にも定義済みのフェーズを返すのは、Current がつねに
// 定義済みの Phase を返すという不変条件を全域で保つため。
func nextPhase(p Phase) Phase {
	switch p {
	case PhaseBuild:
		return PhaseTest
	case PhaseTest:
		return PhaseDeploy
	case PhaseDeploy:
		return PhaseScan
	case PhaseScan:
		return PhaseBuild
	default:
		return PhaseBuild
	}
}
