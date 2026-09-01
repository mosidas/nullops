package main

import (
	"errors"
	"strings"
)

// Level はログ行の重大度を表す。
type Level string

// 定義済みの重大度。
const (
	LevelInfo  Level = "info"
	LevelWarn  Level = "warn"
	LevelError Level = "error"
	LevelDebug Level = "debug"
)

func (l Level) valid() bool {
	switch l {
	case LevelInfo, LevelWarn, LevelError, LevelDebug:
		return true
	default:
		return false
	}
}

// Phase は擬似的な作業フェーズを表す。
type Phase string

// 定義済みの作業フェーズ。
const (
	PhaseBuild  Phase = "build"
	PhaseTest   Phase = "test"
	PhaseDeploy Phase = "deploy"
	PhaseScan   Phase = "scan"
)

func (p Phase) valid() bool {
	switch p {
	case PhaseBuild, PhaseTest, PhaseDeploy, PhaseScan:
		return true
	default:
		return false
	}
}

// LogLine は画面へ流す擬似ログの 1 行を表す。
//
// 公開フィールドは Wails のバインディングで JSON 化するために必要だが、
// 値の生成は newLogLine に限る。
type LogLine struct {
	Seq   uint64 `json:"seq"`
	AtMs  int64  `json:"atMs"`
	Tool  string `json:"tool"`
	Phase Phase  `json:"phase"`
	Level Level  `json:"level"`
	Text  string `json:"text"`
}

// 不変条件の違反。
//
// 単一の error に束ねないのは、呼び出し側とテストが errors.Is で
// どの不変条件を破ったかを特定できるようにするため。
var (
	errLogLineSeqZero      = errors.New("LogLine の Seq は 1 以上でなければならない")
	errLogLineToolEmpty    = errors.New("LogLine の Tool は 1 文字以上でなければならない")
	errLogLineTextEmpty    = errors.New("LogLine の Text は 1 文字以上でなければならない")
	errLogLineTextNewline  = errors.New("LogLine の Text は改行文字 (U+000A・U+000D) を含んではならない")
	errLogLineLevelUnknown = errors.New("LogLine の Level が定義済みの値でない")
	errLogLinePhaseUnknown = errors.New("LogLine の Phase が定義済みの値でない")
)

// newLogLine は不変条件を満たす LogLine だけを作る。
//
// 違反があれば値を返さずゼロ値と error を返す。
//
// AtMs を time.Time でなく Unix ミリ秒で受けるのは、JSON 化したときに
// 文字列となりフロントエンドで再パースが要るのを避けるため。
func newLogLine(seq uint64, atMs int64, tool string, phase Phase, level Level, text string) (LogLine, error) {
	if seq == 0 {
		return LogLine{}, errLogLineSeqZero
	}
	if tool == "" {
		return LogLine{}, errLogLineToolEmpty
	}
	if !phase.valid() {
		return LogLine{}, errLogLinePhaseUnknown
	}
	if !level.valid() {
		return LogLine{}, errLogLineLevelUnknown
	}
	if text == "" {
		return LogLine{}, errLogLineTextEmpty
	}
	if strings.ContainsAny(text, "\n\r") {
		return LogLine{}, errLogLineTextNewline
	}

	return LogLine{
		Seq:   seq,
		AtMs:  atMs,
		Tool:  tool,
		Phase: phase,
		Level: level,
		Text:  text,
	}, nil
}
