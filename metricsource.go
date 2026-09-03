package main

import (
	"math/rand"
	"sync"
	"time"
)

// metricEventName はメトリクスフィードのイベント名。
const metricEventName = "nullops:metric"

// metricInterval はメトリクスの送出間隔。
//
// 折れ線の点が増える速さと針の目標値が変わる速さを兼ねる。滑らかさは
// フロントエンドの requestAnimationFrame 側の補間に任せ、Go 側の送出は
// 毎秒 2 回に抑える(spec.md §7 受け入れ基準 11.6)。
const metricInterval = 500 * time.Millisecond

// 擬似システムの負荷(pressure)の漂わせ方。
//
// 引き戻しを極端に弱く、揺らぎを大きく置くのは、数百フレームをかけて
// 静穏と過負荷のあいだを往復させるため。3 系列と針はこの 1 つの値に
// 連動し、折れ線が下がるのに針が上がるといった矛盾を作らない
// (spec.md §3 前提 1・前提 4)。定常状態の広がりは jitter/sqrt(2*pull) で
// およそ 0.25 になり、metricPressureAnchor の上下へ十分振れる。
const (
	metricPressureAnchor = 0.55
	metricPressurePull   = 0.02
	metricPressureJitter = 0.05
)

// 系列ごとの正規化値の漂わせ方。
//
// pressure から決まる目標へ metricSeriesPull の割合で追いつき、
// 系列ごとの小さな揺らぎを足す。追従を速めに置くのは、pressure の往復が
// 3 本の線の上下として画面から読み取れるようにするため。
const (
	metricSeriesPull   = 0.25
	metricSeriesJitter = 0.03
)

// metricSeriesSpec は 1 系列の固定の性質。
//
// bias は pressure が中庸(0.5)のときの正規化値、gain は pressure への
// 感度。base・span は正規化値から画面へ出す値へ戻す係数
// (Display = base + norm*span)。
type metricSeriesSpec struct {
	id   string
	unit string
	bias float64
	gain float64
	base float64
	span float64
}

// metricSeriesSpecs は折れ線に重ねる 3 系列。README「スループット・レイテンシ等の
// 時系列」に対応させる(spec.md §6.6)。
//
// 画面へ出す文字列であり英語のまま置く(CLAUDE.md 言語規約)。
// gain をすべて正にするのは、負荷が上がればスループットもレイテンシも
// エラー率も上がるという 1 つの物語に沿わせるため。
var metricSeriesSpecs = [metricSeriesCount]metricSeriesSpec{
	{id: "throughput", unit: "req/s", bias: 0.50, gain: 0.80, base: 200, span: 2200},
	{id: "latency", unit: "ms", bias: 0.40, gain: 0.70, base: 8, span: 240},
	{id: "errors", unit: "%", bias: 0.20, gain: 0.60, base: 0, span: 12},
}

// gaugeWeights は針の位置を 3 系列の正規化値から作るときの重み。
//
// 並びは metricSeriesSpecs と同じ。合計を 1.0 にすることで、各系列が
// 0.0〜1.0 なら重み付き和も 0.0〜1.0 に収まり、切り詰めが働くのは
// 浮動小数の誤差の分だけになる。throughput を最も重くするのは、
// 使用率が処理量に最も連動するという擬似的な物語による。
var gaugeWeights = [metricSeriesCount]float64{0.45, 0.35, 0.20}

// gaugeLabel は文字盤へ出すラベル。画面へ出す文字列であり英語のまま置く。
const gaugeLabel = "utilization"

// metricSeriesState は 1 系列の現在の正規化値。仕様は metricSeriesSpecs が持つ。
type metricSeriesState struct {
	norm float64
}

// metricSource は擬似的な時系列とタコメータの読みを生成する feed.Source の実装。
//
// feed パッケージを import しないのは、feed から見て利用側である main が
// インターフェースを満たすだけでよく、import すると依存が逆向きになるため
// (logSource と同じ扱い)。
//
// 折れ線とタコメータを 1 つの生成器にまとめるのは、両者が同じ擬似システムの
// 稼働状況を別の見せ方で描くパネルであり、値を独立に生成すると画面に矛盾が
// 出るため(spec.md §3 前提 1)。
type metricSource struct {
	mu  sync.Mutex
	seq uint64

	pressure float64
	series   [metricSeriesCount]metricSeriesState

	// 保持する点のリングバッファ。長さ capacity の固定長で確保し、
	// 先頭を捨てる形(buf = buf[1:])にしないのは、下地の配列が伸び続けるため
	// (logSource と同じ)。
	buf      []MetricPoint
	start    int
	count    int
	capacity int

	// lastGauge は最後に生成したゲージの読み。Snapshot はこれを返す。
	// lastSeries は最後に生成した系列の見出し。Display がフレームごとに変わる。
	lastGauge  GaugeReading
	lastSeries []MetricSeriesMeta

	rnd *rand.Rand
}

// newMetricSource はメトリクスの生成器を作る。
//
// 事前条件は capacity が 1 以上、rnd が nil でないこと。
// 違反は呼び出し側の誤りであり、戻り値に error 経路を持たないため panic する。
// rnd は metricSource 専用のインスタンスを渡す。*rand.Rand は並行安全でなく、
// 他の生成器と共有すると互いの mutex では保護されない。
func newMetricSource(capacity int, rnd *rand.Rand) *metricSource {
	if capacity < 1 {
		panic("newMetricSource の capacity は 1 以上でなければならない")
	}
	if rnd == nil {
		panic("newMetricSource の rnd は nil であってはならない")
	}

	s := &metricSource{
		pressure: metricPressureAnchor,
		buf:      make([]MetricPoint, capacity),
		capacity: capacity,
		rnd:      rnd,
	}
	for i := range s.series {
		s.series[i].norm = clampZeroOne(metricSeriesSpecs[i].bias)
	}
	// Next を 1 度も呼んでいない時点でも系列の揃った見出しを返せるようにする。
	// Seq は 0 のままとし、ゲージの読みは空(Seq が 0)に保つ
	// (spec.md §7 受け入れ基準 5.2)。
	s.lastSeries = s.buildSeries()
	return s
}

// EventName はフロントエンドへ送るイベント名を返す。プロセスの生存期間中つねに同じ値。
func (s *metricSource) EventName() string { return metricEventName }

// Interval は次の送出までの待ち時間を返す。つねに metricInterval。
func (s *metricSource) Interval() time.Duration { return metricInterval }

// Next は 1 フレーム分のメトリクスを返す。
//
// 値の切り詰めはこの関数の責務であり、生成関数へ渡す時点で不変条件は
// 満たされている。それでも error を握りつぶさず panic するのは、
// 漂わせ方を変えて不変条件が破れたときに気付けるようにするため
// (feed.Source は error 経路を持たない。logSource.Next と同じ規律)。
func (s *metricSource) Next() any {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.advance()
	s.seq++

	values := make([]float64, metricSeriesCount)
	for i := range s.series {
		values[i] = s.series[i].norm
	}
	point, err := newMetricPoint(s.seq, values)
	if err != nil {
		panic("metricSource が MetricPoint の不変条件を破っている: " + err.Error())
	}

	gauge, err := newGaugeReading(s.seq, s.gaugeValue(), gaugeLabel)
	if err != nil {
		panic("metricSource が GaugeReading の不変条件を破っている: " + err.Error())
	}

	s.append(point)
	s.lastGauge = gauge
	s.lastSeries = s.buildSeries()

	// 呼び出し側へ渡す見出しは内部と別の配列にする。Snapshot が返す配列と
	// 下地を共有させないため。
	series := make([]MetricSeriesMeta, len(s.lastSeries))
	copy(series, s.lastSeries)
	return MetricFrame{Series: series, Point: point, Gauge: gauge}
}

// advance は負荷と各系列を 1 フレーム分だけ進める。呼び出し側で mu を保持すること。
func (s *metricSource) advance() {
	s.pressure = clampZeroOne(drift(s.rnd, s.pressure, metricPressureAnchor, metricPressurePull, metricPressureJitter))
	for i := range s.series {
		spec := metricSeriesSpecs[i]
		target := clampZeroOne(spec.bias + spec.gain*(s.pressure-0.5))
		s.series[i].norm = clampZeroOne(drift(s.rnd, s.series[i].norm, target, metricSeriesPull, metricSeriesJitter))
	}
}

// gaugeValue は現在の 3 系列から針の位置を作る。呼び出し側で mu を保持すること。
//
// 重みの合計が 1.0 であり各系列が 0.0〜1.0 のため和も範囲に収まるが、
// 浮動小数の誤差で境界をわずかに超えうるので切り詰める。
func (s *metricSource) gaugeValue() float64 {
	sum := 0.0
	for i := range s.series {
		sum += gaugeWeights[i] * s.series[i].norm
	}
	return clampZeroOne(sum)
}

// buildSeries は現在の正規化値から系列の見出しを作る。呼び出し側で mu を保持すること。
func (s *metricSource) buildSeries() []MetricSeriesMeta {
	out := make([]MetricSeriesMeta, metricSeriesCount)
	for i := range s.series {
		spec := metricSeriesSpecs[i]
		meta, err := newMetricSeriesMeta(spec.id, spec.unit, spec.base+s.series[i].norm*spec.span)
		if err != nil {
			panic("metricSource が MetricSeriesMeta の不変条件を破っている: " + err.Error())
		}
		out[i] = meta
	}
	return out
}

// append は点をリングバッファへ足す。呼び出し側で mu を保持すること。
func (s *metricSource) append(p MetricPoint) {
	if s.count == s.capacity {
		s.buf[s.start] = p
		s.start = (s.start + 1) % s.capacity
		return
	}
	s.buf[(s.start+s.count)%s.capacity] = p
	s.count++
}

// Snapshot は保持している点を古い順に、最新のゲージの読みとともに返す。
//
// 内部状態を変化させない(spec.md §5.1)。1 度も Next を呼んでいない場合は
// 長さ 0 の非 nil スライスと Seq が 0 のゲージの読みを返す。
func (s *metricSource) Snapshot() MetricHistory {
	s.mu.Lock()
	defer s.mu.Unlock()

	// 内部と別の配列を返す。呼び出し側の変更が次フレームの送出内容へ
	// 波及しないため(spec.md §7 受け入れ基準 5.5)。
	// Values まで複製するのは、構造体の複製だけではスライスの下地を共有し、
	// 呼び出し側の points[i].Values[j] への代入が内部の保持点へ波及するため。
	points := make([]MetricPoint, s.count)
	for i := range points {
		src := s.buf[(s.start+i)%s.capacity]
		values := make([]float64, len(src.Values))
		copy(values, src.Values)
		points[i] = MetricPoint{Seq: src.Seq, Values: values}
	}
	series := make([]MetricSeriesMeta, len(s.lastSeries))
	copy(series, s.lastSeries)

	return MetricHistory{Series: series, Points: points, Gauge: s.lastGauge}
}
