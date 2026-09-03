package main

import (
	"errors"
	"strings"
)

// metricSeriesCount は折れ線グラフに重ねる系列の本数。
//
// MetricPoint.Values の長さと MetricFrame.Series の長さがこの値に一致する
// ことを不変条件とする(spec.md §6.1)。
const metricSeriesCount = 3

// タコメータの目盛りの帯。フロントエンドは色の対応表の鍵としてこの文字列を読む。
//
// 独自の型を足さないのは、Go 側で得るものが無いため(spec.md §6.2)。
// 画面へ出す値であり英語のまま置く(CLAUDE.md 言語規約)。
const (
	ZoneNominal  = "nominal"
	ZoneElevated = "elevated"
	ZoneCritical = "critical"
)

// ゾーンの境界。gaugeZoneFor が Value からゾーンを一意に決めるための唯一の正本。
const (
	zoneElevatedFrom = 0.6
	zoneCriticalFrom = 0.85
)

// gaugeDisplayMax は画面へ出す使用率の上限(パーセント表記)。
const gaugeDisplayMax = 100.0

// MetricPoint は 1 時点の全系列の測定値。折れ線グラフの縦 1 本ぶん。
//
// 公開フィールドは Wails のバインディングで JSON 化するために必要だが、
// 値の生成は newMetricPoint に限る。
type MetricPoint struct {
	Seq uint64 `json:"seq"`
	// Values は metricSeriesIDs と同じ並びの正規化値(各 0.0〜1.0)。
	// 単位の異なる系列を 1 枚に重ねるため、正規化は Go 側で行う(spec.md §3 前提 3)。
	Values []float64 `json:"values"`
}

// GaugeReading はタコメータの 1 回分の読み。
//
// Value は針の位置、Display は画面へ出す値であり、Zone は Value から導出する。
type GaugeReading struct {
	Seq     uint64  `json:"seq"`
	Value   float64 `json:"value"`   // 0.0〜1.0。針の位置
	Display float64 `json:"display"` // 0.0〜100.0。画面へ出す使用率
	Zone    string  `json:"zone"`    // ZoneNominal / ZoneElevated / ZoneCritical
	Label   string  `json:"label"`   // 画面へ出す英語のラベル
}

// MetricSeriesMeta は折れ線の 1 系列の見出し。値そのものは MetricPoint.Values が持つ。
//
// 正規化値だけでは画面に読める値を出せないため、単位と現在値を見出しに同居させる
// (spec.md §6.3)。Display はフレームごとに変わる。
type MetricSeriesMeta struct {
	ID      string  `json:"id"`      // 画面へ出す英語のラベル。系列内で一意
	Unit    string  `json:"unit"`    // 画面へ出す英語の単位
	Display float64 `json:"display"` // 正規化前の現在値
}

// MetricFrame は 1 回の送出で運ぶ、折れ線の新しい 1 点とタコメータの読みの組。
//
// 2 パネルを 1 つの生成器・1 つのイベントへまとめるのは、同じ擬似システムの
// 稼働状況を別の見せ方で描くパネルであり、値を独立に生成すると画面に矛盾が
// 出るため(spec.md §3 前提 1)。
type MetricFrame struct {
	// Series は Point.Values と同じ並び。nil にならない。
	Series []MetricSeriesMeta `json:"series"`
	Point  MetricPoint        `json:"point"`
	Gauge  GaugeReading       `json:"gauge"`
}

// MetricHistory は起動直後の初期表示に返す時系列の履歴と、最新のゲージの読み。
type MetricHistory struct {
	// Series・Points は nil にならない(JSON 化して null にしないため)。
	Series []MetricSeriesMeta `json:"series"`
	Points []MetricPoint      `json:"points"` // 古い順
	Gauge  GaugeReading       `json:"gauge"`
}

// 不変条件の違反。
//
// 単一の error に束ねないのは、呼び出し側とテストが errors.Is で
// どの不変条件を破ったかを特定できるようにするため。
var (
	errMetricSeqZero        = errors.New("メトリクスの Seq は 1 以上でなければならない")
	errMetricValueCount     = errors.New("MetricPoint の Values の長さは metricSeriesCount と一致しなければならない")
	errMetricValueRange     = errors.New("メトリクスの正規化値は 0.0〜1.0 でなければならない")
	errMetricValueNotFinite = errors.New("メトリクスの数値は有限でなければならない (NaN・Inf を許さない)")
	errMetricLabelEmpty     = errors.New("メトリクスのラベルは 1 文字以上でなければならない")
	errMetricLabelNewline   = errors.New("メトリクスのラベルは改行文字 (U+000A・U+000D) を含んではならない")
)

// newMetricPoint は不変条件を満たす MetricPoint だけを作る。
//
// 値の揺らし方と正規化は metricSource の責務であり、ここでは検査だけを行う。
func newMetricPoint(seq uint64, values []float64) (MetricPoint, error) {
	if seq == 0 {
		return MetricPoint{}, errMetricSeqZero
	}
	if len(values) != metricSeriesCount {
		return MetricPoint{}, errMetricValueCount
	}
	for _, v := range values {
		// 有限性を範囲より先に見る。NaN はどの比較にも false を返すため、
		// 範囲検査を先に置くと NaN がすり抜ける。
		if err := checkMetricFinite(v); err != nil {
			return MetricPoint{}, err
		}
		if v < 0.0 || v > 1.0 {
			return MetricPoint{}, errMetricValueRange
		}
	}

	// 呼び出し側のスライスを取り込まず複製する。生成後に外から書き換えられて
	// 不変条件が崩れるのを防ぐため(Commit.Parents と同じ)。
	out := make([]float64, len(values))
	copy(out, values)
	return MetricPoint{Seq: seq, Values: out}, nil
}

// newGaugeReading は不変条件を満たす GaugeReading だけを作る。
//
// Display と Zone を引数に取らないのは、いずれも value から一意に決まるため。
// 引数で受けると同じ事実の正本が 2 つになり、食い違いを作れてしまう(spec.md §6.2)。
func newGaugeReading(seq uint64, value float64, label string) (GaugeReading, error) {
	if seq == 0 {
		return GaugeReading{}, errMetricSeqZero
	}
	if err := checkMetricFinite(value); err != nil {
		return GaugeReading{}, err
	}
	if value < 0.0 || value > 1.0 {
		return GaugeReading{}, errMetricValueRange
	}
	if err := checkMetricLabel(label); err != nil {
		return GaugeReading{}, err
	}

	return GaugeReading{
		Seq:     seq,
		Value:   value,
		Display: value * gaugeDisplayMax,
		Zone:    gaugeZoneFor(value),
		Label:   label,
	}, nil
}

// newMetricSeriesMeta は不変条件を満たす MetricSeriesMeta だけを作る。
func newMetricSeriesMeta(id, unit string, display float64) (MetricSeriesMeta, error) {
	if err := checkMetricLabel(id); err != nil {
		return MetricSeriesMeta{}, err
	}
	if err := checkMetricLabel(unit); err != nil {
		return MetricSeriesMeta{}, err
	}
	// Display は正規化前の値であり範囲を定めない。有限性だけを見る。
	if err := checkMetricFinite(display); err != nil {
		return MetricSeriesMeta{}, err
	}

	return MetricSeriesMeta{ID: id, Unit: unit, Display: display}, nil
}

// gaugeZoneFor は針の位置からゾーンを決める。同じ value につねに同じゾーンを返す。
func gaugeZoneFor(value float64) string {
	switch {
	case value >= zoneCriticalFrom:
		return ZoneCritical
	case value >= zoneElevatedFrom:
		return ZoneElevated
	default:
		return ZoneNominal
	}
}

// gaugeZoneValid は zone が定義済みの 3 値のいずれかかを返す。
func gaugeZoneValid(zone string) bool {
	switch zone {
	case ZoneNominal, ZoneElevated, ZoneCritical:
		return true
	default:
		return false
	}
}

// checkMetricLabel は画面へ出す文字列の不変条件を検査する。
func checkMetricLabel(label string) error {
	if label == "" {
		return errMetricLabelEmpty
	}
	if strings.ContainsAny(label, "\n\r") {
		return errMetricLabelNewline
	}
	return nil
}

// checkMetricFinite は値が有限かを検査する。
//
// checkFinite(graphnode.go)と分けるのは、返す error を
// errMetricValueNotFinite にして呼び出し側が errors.Is で
// メトリクス由来の違反だと特定できるようにするため。
func checkMetricFinite(v float64) error {
	if err := checkFinite(v); err != nil {
		return errMetricValueNotFinite
	}
	return nil
}
