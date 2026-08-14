package main

// Level はログ行の重大度を表す。
type Level string

// 定義済みの重大度。
const (
	LevelInfo  Level = "info"
	LevelWarn  Level = "warn"
	LevelError Level = "error"
	LevelDebug Level = "debug"
)

// Phase は擬似的な作業フェーズを表す。
type Phase string

// 定義済みの作業フェーズ。
const (
	PhaseBuild  Phase = "build"
	PhaseTest   Phase = "test"
	PhaseDeploy Phase = "deploy"
	PhaseScan   Phase = "scan"
)

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

// newLogLine は不変条件を満たす LogLine だけを作る。
//
// AtMs を time.Time でなく Unix ミリ秒で受けるのは、JSON 化したときに
// 文字列となりフロントエンドで再パースが要るのを避けるため。
func newLogLine(seq uint64, atMs int64, tool string, phase Phase, level Level, text string) (LogLine, error) {
	return LogLine{
		Seq:   seq,
		AtMs:  atMs,
		Tool:  tool,
		Phase: phase,
		Level: level,
		Text:  text,
	}, nil
}
