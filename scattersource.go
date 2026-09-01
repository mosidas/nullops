package main

import (
	"math/rand"
	"sync"
	"time"
)

// scatterEventName は点群フィードのイベント名。
const scatterEventName = "nullops:scatter"

// scatterInterval は点群の送出間隔。
//
// 回転の滑らかさをフロントエンドの requestAnimationFrame に任せるため、
// Go 側の送出は毎秒 1 回に抑える(spec.md §7 Requirement 10.3)。
const scatterInterval = 1000 * time.Millisecond

// scatterClusterCount は点群を構成するクラスタの数(spec.md §6.4)。
const scatterClusterCount = 3

// 点の漂わせ方のパラメータ。
//
// 点は所属クラスタの中心へ scatterPointPull の割合だけ引き戻され、
// 標準偏差 scatterPointJitter の乱歩を受ける。独立な乱歩だけにすると
// 点が拡散して立方体の壁に貼り付き、クラスタの塊が消えるため
// (spec.md §6.4)。定常状態の広がりは jitter/sqrt(2*pull) に落ち着く。
const (
	scatterPointPull   = 0.08
	scatterPointJitter = 0.02
)

// クラスタ中心の漂わせ方のパラメータ。
//
// 中心はクラスタごとの固定の錨(anchor)の周りを漂う。錨を持たせず
// 中心そのものを乱歩させると 1000 フレームの間に中心どうしが寄って
// 点群全体の標準偏差が縮み、受け入れ基準 3.2 を破る。
const (
	scatterCenterPull   = 0.05
	scatterCenterJitter = 0.01
	// scatterAnchorSpan は錨を置く範囲。点の広がり(定常でおよそ 0.05)を
	// 足しても単位立方体からはみ出さない値にする。
	scatterAnchorSpan = 0.55
)

// scatterCluster は 1 つのクラスタの錨と現在の中心。
type scatterCluster struct {
	anchorX, anchorY, anchorZ float64
	x, y, z                   float64
}

// scatterPointState は 1 点の現在の座標と所属クラスタ。
type scatterPointState struct {
	x, y, z float64
	w       float64 // 重み。点ごとに固定で、大小と明度の差を作る
	cluster int
}

// scatterSource は擬似的な 3 次元の点群をフレーム単位で生成する feed.Source の実装。
//
// feed パッケージを import しないのは、feed から見て利用側である main が
// インターフェースを満たすだけでよく、import すると依存が逆向きになるため
// (logSource と同じ扱い)。
type scatterSource struct {
	mu  sync.Mutex
	seq uint64

	clusters []scatterCluster
	points   []scatterPointState

	// last は最後に生成した点群。Snapshot はこの複製を返す。
	last ScatterCloud

	rnd *rand.Rand
}

// newScatterSource は点群の生成器を作る。
//
// 事前条件は pointCount が 1 以上、rnd が nil でないこと。
// 違反は呼び出し側の誤りであり、戻り値に error 経路を持たないため panic する。
// rnd は scatterSource 専用のインスタンスを渡す。*rand.Rand は並行安全でなく、
// 他の生成器と共有すると互いの mutex では保護されない。
func newScatterSource(pointCount int, rnd *rand.Rand) *scatterSource {
	if pointCount < 1 {
		panic("newScatterSource の pointCount は 1 以上でなければならない")
	}
	if rnd == nil {
		panic("newScatterSource の rnd は nil であってはならない")
	}

	clusters := make([]scatterCluster, scatterClusterCount)
	for i := range clusters {
		x := symmetricUniform(rnd, scatterAnchorSpan)
		y := symmetricUniform(rnd, scatterAnchorSpan)
		z := symmetricUniform(rnd, scatterAnchorSpan)
		clusters[i] = scatterCluster{anchorX: x, anchorY: y, anchorZ: z, x: x, y: y, z: z}
	}

	points := make([]scatterPointState, pointCount)
	for i := range points {
		c := clusters[i%scatterClusterCount]
		points[i] = scatterPointState{
			// 初期位置を定常状態と同じ広がりで置く。0 から始めると初回フレームの
			// 標準偏差が定常より小さく、受け入れ基準 3.2 の基準側が歪む。
			x:       clampUnit(c.x + rnd.NormFloat64()*scatterStationarySpread),
			y:       clampUnit(c.y + rnd.NormFloat64()*scatterStationarySpread),
			z:       clampUnit(c.z + rnd.NormFloat64()*scatterStationarySpread),
			w:       0.35 + rnd.Float64()*0.65,
			cluster: i % scatterClusterCount,
		}
	}

	return &scatterSource{
		clusters: clusters,
		points:   points,
		last:     ScatterCloud{Points: []ScatterPoint{}},
		rnd:      rnd,
	}
}

// scatterStationarySpread は点がクラスタ中心の周りに落ち着く広がり(標準偏差)。
const scatterStationarySpread = scatterPointJitter / 0.4 // jitter / sqrt(2*pull) の近似値

// EventName はフロントエンドへ送るイベント名を返す。プロセスの生存期間中つねに同じ値。
func (s *scatterSource) EventName() string { return scatterEventName }

// Interval は次の送出までの待ち時間を返す。つねに scatterInterval。
func (s *scatterSource) Interval() time.Duration { return scatterInterval }

// Next は 1 フレーム分の点群を返す。
//
// 座標の切り詰めはこの関数の責務であり、newScatterPoint へ渡す時点で
// 不変条件は満たされている。それでも error を握りつぶさず panic するのは、
// 漂わせ方を変えて不変条件が破れたときに気付けるようにするため
// (feed.Source は error 経路を持たない。logSource.Next と同じ規律)。
func (s *scatterSource) Next() any {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.advance()
	s.seq++

	out := make([]ScatterPoint, len(s.points))
	for i, p := range s.points {
		sp, err := newScatterPoint(p.x, p.y, p.z, p.w)
		if err != nil {
			panic("scatterSource が ScatterPoint の不変条件を破っている: " + err.Error())
		}
		out[i] = sp
	}

	s.last = ScatterCloud{Seq: s.seq, Points: out}
	return s.last
}

// advance はクラスタ中心と各点を 1 フレーム分だけ進める。呼び出し側で mu を保持すること。
func (s *scatterSource) advance() {
	for i := range s.clusters {
		c := &s.clusters[i]
		c.x = clampUnit(drift(s.rnd, c.x, c.anchorX, scatterCenterPull, scatterCenterJitter))
		c.y = clampUnit(drift(s.rnd, c.y, c.anchorY, scatterCenterPull, scatterCenterJitter))
		c.z = clampUnit(drift(s.rnd, c.z, c.anchorZ, scatterCenterPull, scatterCenterJitter))
	}

	for i := range s.points {
		p := &s.points[i]
		c := s.clusters[p.cluster]
		p.x = clampUnit(drift(s.rnd, p.x, c.x, scatterPointPull, scatterPointJitter))
		p.y = clampUnit(drift(s.rnd, p.y, c.y, scatterPointPull, scatterPointJitter))
		p.z = clampUnit(drift(s.rnd, p.z, c.z, scatterPointPull, scatterPointJitter))
	}
}

// Snapshot は最後に生成した点群の複製を返す。
//
// 内部状態を変化させない(spec.md §5.1)。1 度も Next を呼んでいない場合は
// Seq が 0・長さ 0 の非 nil スライスを持つ点群を返す。
func (s *scatterSource) Snapshot() ScatterCloud {
	s.mu.Lock()
	defer s.mu.Unlock()

	// 内部と別の配列を返す。呼び出し側の変更が次フレームの送出内容へ波及しないため。
	out := make([]ScatterPoint, len(s.last.Points))
	copy(out, s.last.Points)
	return ScatterCloud{Seq: s.last.Seq, Points: out}
}

// drift は現在値を目標へ pull の割合だけ引き戻し、標準偏差 jitter の乱歩を足す。
func drift(rnd *rand.Rand, current, target, pull, jitter float64) float64 {
	return current + (target-current)*pull + rnd.NormFloat64()*jitter
}

// clampUnit は値を単位立方体の範囲 [-1, 1] へ収める。
func clampUnit(v float64) float64 {
	if v < -1.0 {
		return -1.0
	}
	if v > 1.0 {
		return 1.0
	}
	return v
}

// symmetricUniform は [-span, span] の一様乱数を返す。
func symmetricUniform(rnd *rand.Rand, span float64) float64 {
	return (rnd.Float64()*2 - 1) * span
}

// scatterPointCount は画面へ供給する点の数。
//
// 1 枠の大きさで塊として見え、かつ 6 パネル同時稼働時の描画負荷を押さえられる値
// (spec.md §8)。点数を動かすと画面の情報量が揺れ、描画負荷の見積もりも動くため
// 固定とする(spec.md §3 前提 3)。
const scatterPointCount = 256
